'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getDaysArray } from '@/lib/dateUtils'

// 稼働・休日のみ（同行削除）
const WORK_STATUSES = ['稼働', '休日']

// 時刻選択肢（9:00〜21:00、30分刻み）
const TIMES: string[] = []
for (let h = 9; h <= 21; h++) {
  TIMES.push(`${String(h).padStart(2,'0')}:00`)
  if (h < 21) TIMES.push(`${String(h).padStart(2,'0')}:30`)
}

const LOCK_PASSWORD = 'Sota0707'

type Props = { repId: string; repName: string; yearMonth: string }

type DaySchedule = {
  work_status: string
  work_time_start: string
  work_time_end: string
}

const DEFAULT_DAY: DaySchedule = {
  work_status: '休日',
  work_time_start: '',
  work_time_end: '',
}

// 当月25日を超えているか判定
function isAfter25th(yearMonth: string): boolean {
  const today = new Date()
  const [y, m] = yearMonth.split('-').map(Number)
  // 対象月の前月の25日以降はロック（翌月分提出の場合：今月25日超）
  // シンプルに：今日が25日より大きい && 今月が yearMonth の前月
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayDay = today.getDate()

  // 対象が翌月 → 今月25日超えたらロック
  // 対象が今月 → 同様に今月25日超えたらロック
  const targetYear = y
  const targetMonth = m
  const currentMonth = todayYear * 12 + todayMonth
  const targetMonthNum = targetYear * 12 + targetMonth

  if (targetMonthNum > currentMonth) {
    // 翌月分：今月25日超えたらロック
    return todayDay > 25
  } else if (targetMonthNum === currentMonth) {
    // 今月分：今月25日超えたらロック
    return todayDay > 25
  }
  // 過去月は常にロック
  return true
}

export default function ScheduleSubmitForm({ repId, repName, yearMonth }: Props) {
  const days = getDaysArray(yearMonth)
  const [schedules, setSchedules] = useState<Record<string, DaySchedule>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [validationError, setValidationError] = useState('')

  // パスワードロック
  const locked = isAfter25th(yearMonth)
  const [unlocked, setUnlocked] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const isEditable = !locked || unlocked

  useEffect(() => { loadSchedules() }, [repId, yearMonth])

  async function loadSchedules() {
    const [y, m] = yearMonth.split('-')
    const { data } = await supabase
      .from('work_schedules')
      .select('*')
      .eq('sales_rep_id', repId)
      .gte('schedule_date', `${y}-${m}-01`)
      .lte('schedule_date', `${y}-${m}-31`)

    const map: Record<string, DaySchedule> = {}
    days.forEach(d => { map[d.dateStr] = { ...DEFAULT_DAY } })
    data?.forEach(r => {
      map[r.schedule_date] = {
        work_status: r.work_status || '休日',
        work_time_start: r.work_time_start || '',
        work_time_end: r.work_time_end || '',
      }
    })
    setSchedules(map)
  }

  function setDayField(dateStr: string, field: keyof DaySchedule, value: string) {
    setSchedules(prev => ({
      ...prev,
      [dateStr]: { ...(prev[dateStr] || DEFAULT_DAY), [field]: value }
    }))
  }

  function bulkSetDow(dow: number, status: string) {
    setSchedules(prev => {
      const next = { ...prev }
      days.filter(d => d.dow === dow).forEach(d => {
        next[d.dateStr] = { ...(next[d.dateStr] || DEFAULT_DAY), work_status: status }
      })
      return next
    })
  }

  function tryUnlock() {
    if (passwordInput === LOCK_PASSWORD) {
      setUnlocked(true)
      setShowPasswordModal(false)
      setPasswordInput('')
      setPasswordError('')
    } else {
      setPasswordError('パスワードが違います')
    }
  }

  async function handleSave() {
    // 稼働日の時間チェック（必須）
    const missingTime = days.filter(d => {
      const s = schedules[d.dateStr]
      return s?.work_status === '稼働' && (!s.work_time_start || !s.work_time_end)
    })
    if (missingTime.length > 0) {
      setValidationError(`稼働日の時間を全て入力してください（${missingTime.map(d => d.dateStr.slice(5).replace('-','/')).join('、')}）`)
      return
    }
    setValidationError('')

    setSaving(true)
    setSaveError('')
    try {
      const rows = days.map(d => ({
        sales_rep_id: repId,
        schedule_date: d.dateStr,
        work_status: schedules[d.dateStr]?.work_status || '休日',
        updated_at: new Date().toISOString(),
      }))

      const { error: schedError } = await supabase
        .from('work_schedules')
        .upsert(rows, { onConflict: 'sales_rep_id,schedule_date' })

      if (schedError) {
        throw new Error(schedError.message || schedError.details || JSON.stringify(schedError))
      }

      // 時間帯を別途更新
      for (const d of days) {
        const s = schedules[d.dateStr]
        if (s?.work_status === '稼働' && s.work_time_start && s.work_time_end) {
          await supabase
            .from('work_schedules')
            .update({ work_time_start: s.work_time_start, work_time_end: s.work_time_end })
            .eq('sales_rep_id', repId)
            .eq('schedule_date', d.dateStr)
        }
      }

      const workingCount = rows.filter(r => r.work_status === '稼働').length

      const { data: existingPlan } = await supabase
        .from('monthly_plans')
        .select('plan_cases')
        .eq('sales_rep_id', repId)
        .eq('year_month', yearMonth)
        .single()

      const { error: planError } = await supabase.from('monthly_plans').upsert({
        sales_rep_id: repId,
        year_month: yearMonth,
        plan_cases: existingPlan?.plan_cases || 0,
        plan_working_days: workingCount,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'sales_rep_id,year_month' })

      if (planError) {
        throw new Error(planError.message || planError.details || JSON.stringify(planError))
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      let message = '不明なエラー'
      if (err instanceof Error) {
        message = err.message
      } else if (typeof err === 'object' && err !== null) {
        const e = err as Record<string, unknown>
        message = String(e.message || e.details || e.hint || JSON.stringify(err))
      } else {
        message = String(err)
      }
      setSaveError(`保存に失敗しました: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  const workingCount = days.filter(d => schedules[d.dateStr]?.work_status === '稼働').length

  const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']

  return (
    <div>
      {/* ── ヘッダー ── */}
      <div className="mobile-card" style={{background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)'}}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-blue-400 flex items-center justify-center text-white text-2xl font-black flex-shrink-0">
            {repName.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="text-sm text-blue-200 font-medium">シフト提出</div>
            <div className="text-2xl font-black text-white">{repName}</div>
            <div className="text-sm text-blue-200 mt-0.5">{yearMonth.replace('-', '年')}月</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-emerald-400">{workingCount}</div>
            <div className="text-sm text-blue-200">稼働予定日</div>
          </div>
        </div>
      </div>

      {/* ── ロック表示 ── */}
      {locked && !unlocked && (
        <div className="mx-0 mt-2 p-4 bg-amber-50 border border-amber-300 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-black text-amber-800">🔒 25日を過ぎたためロック中</div>
              <div className="text-sm text-amber-600 mt-1">変更するにはパスワードが必要です</div>
            </div>
            <button onClick={() => { setShowPasswordModal(true); setPasswordError(''); setPasswordInput('') }}
              className="bg-amber-500 text-white text-sm font-bold px-4 py-2 rounded-xl">
              解除
            </button>
          </div>
        </div>
      )}

      {/* ── パスワードモーダル ── */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-xl font-black text-slate-800 mb-2">🔑 パスワード入力</div>
            <div className="text-sm text-slate-500 mb-4">シフト変更にはパスワードが必要です</div>
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && tryUnlock()}
              placeholder="パスワードを入力"
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-lg mb-2 focus:outline-none focus:border-blue-400"
              autoFocus
            />
            {passwordError && (
              <div className="text-sm text-red-600 font-bold mb-3">⚠️ {passwordError}</div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowPasswordModal(false)}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold text-base">キャンセル</button>
              <button onClick={tryUnlock}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-base">確認</button>
            </div>
          </div>
        </div>
      )}

      {/* ── エラー表示 ── */}
      {saveError && (
        <div className="mx-0 mt-2 p-3 bg-red-50 border border-red-300 rounded-xl text-sm text-red-700 font-medium">
          ⚠️ {saveError}
        </div>
      )}
      {validationError && (
        <div className="mx-0 mt-2 p-3 bg-orange-50 border border-orange-300 rounded-xl text-sm text-orange-700 font-bold">
          ⚠️ {validationError}
        </div>
      )}

      {/* ── 一括設定 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label text-lg">⚡ 一括設定</div>
        <div className="text-sm text-slate-500 mb-3">曜日ごとに一括でステータスを設定できます</div>
        <div className="space-y-3">
          {[1,2,3,4,5,6,0].map(dow => (
            <div key={dow} className="flex items-center gap-3">
              <span className={`text-base font-black w-8 text-center ${dow===0?'text-red-500':dow===6?'text-blue-500':'text-slate-600'}`}>
                {DOW_LABELS[dow]}
              </span>
              <div className="flex gap-2">
                {WORK_STATUSES.map(s => (
                  <button key={s} onClick={() => isEditable && bulkSetDow(dow, s)}
                    disabled={!isEditable}
                    className={`text-sm px-4 py-2 rounded-xl font-bold transition-all disabled:opacity-50 ${
                      s === '稼働' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' :
                      'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >{s}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 日別設定 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label text-lg">📅 日別設定</div>
        <div className="space-y-3">
          {days.map(d => {
            const sched = schedules[d.dateStr] || DEFAULT_DAY
            const isWork = sched.work_status === '稼働'
            const missingTime = isWork && (!sched.work_time_start || !sched.work_time_end)

            return (
              <div key={d.dateStr}
                className={`rounded-2xl border-2 p-3 transition-all ${
                  isWork
                    ? missingTime ? 'border-orange-300 bg-orange-50' : 'border-emerald-300 bg-emerald-50'
                    : d.dow === 0 ? 'border-red-100 bg-red-50'
                    : d.dow === 6 ? 'border-blue-100 bg-blue-50/50'
                    : 'border-slate-100 bg-slate-50'
                }`}
              >
                {/* 日付 + ステータス */}
                <div className="flex items-center gap-2">
                  <div className={`text-base font-black w-20 flex-shrink-0 ${
                    d.dow === 0 ? 'text-red-500' : d.dow === 6 ? 'text-blue-500' : 'text-slate-700'
                  }`}>
                    {d.dateStr.slice(5).replace('-', '/')}（{d.dowJa}）
                  </div>
                  <div className="flex gap-2 flex-1">
                    {WORK_STATUSES.map(s => (
                      <button key={s}
                        onClick={() => isEditable && setDayField(d.dateStr, 'work_status', s)}
                        disabled={!isEditable}
                        className={`flex-1 py-2.5 rounded-xl text-base font-black transition-all disabled:opacity-50 ${
                          sched.work_status === s
                            ? s === '稼働' ? 'bg-emerald-500 text-white shadow' : 'bg-slate-400 text-white shadow'
                            : 'bg-white border-2 border-slate-200 text-slate-400'
                        }`}
                      >{s}</button>
                    ))}
                  </div>
                </div>

                {/* 稼働時のみ: 時間帯（必須） */}
                {isWork && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-sm font-bold text-slate-600">⏰ 時間帯</span>
                      <span className="text-xs text-red-500 font-bold">※必須</span>
                      {missingTime && <span className="text-xs text-orange-600 font-bold ml-1">未入力</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={sched.work_time_start}
                        onChange={e => isEditable && setDayField(d.dateStr, 'work_time_start', e.target.value)}
                        disabled={!isEditable}
                        className={`flex-1 text-base border-2 rounded-xl px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 ${
                          missingTime && !sched.work_time_start ? 'border-orange-400' : 'border-slate-200'
                        }`}
                      >
                        <option value="">開始時刻</option>
                        {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-base text-slate-400 font-bold flex-shrink-0">〜</span>
                      <select
                        value={sched.work_time_end}
                        onChange={e => isEditable && setDayField(d.dateStr, 'work_time_end', e.target.value)}
                        disabled={!isEditable}
                        className={`flex-1 text-base border-2 rounded-xl px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 ${
                          missingTime && !sched.work_time_end ? 'border-orange-400' : 'border-slate-200'
                        }`}
                      >
                        <option value="">終了時刻</option>
                        {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {sched.work_time_start && sched.work_time_end && (
                        <span className="text-sm font-black text-emerald-700 bg-emerald-100 rounded-xl px-2 py-2 whitespace-nowrap flex-shrink-0">
                          {sched.work_time_start}〜{sched.work_time_end}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 提出ボタン ── */}
      <div className="save-bar">
        <div className="text-center text-sm text-slate-500 mb-2">
          稼働予定日数: <span className="font-black text-emerald-600 text-xl">{workingCount}日</span>
          <span className="mx-2 text-slate-300">｜</span>
          提出すると「計画稼働」に反映されます
        </div>
        {!isEditable ? (
          <button onClick={() => { setShowPasswordModal(true); setPasswordError(''); setPasswordInput('') }}
            className="save-btn save-btn-default text-lg">
            🔒 ロック中 — タップして解除
          </button>
        ) : (
          <button onClick={handleSave} disabled={saving}
            className={`save-btn text-lg ${saved ? 'save-btn-saved' : saving ? 'save-btn-saving' : 'save-btn-default'}`}>
            {saved ? '✓ 提出しました！計画稼働に反映済み' : saving ? '提出中...' : '📋 シフトを提出する'}
          </button>
        )}
      </div>
    </div>
  )
}
