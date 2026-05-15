'use client'

/**
 * ShiftMyCalendar — Rシフト風 個人シフト提出カレンダー
 *
 * 既存の ScheduleSubmitForm（リスト形式）を置き換える
 * カレンダーグリッドUI。タップで日ごとに編集→保存。
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { syncSheets } from '@/lib/syncSheets'
import { ChevronLeft, ChevronRight, Check, X, Clock, AlertCircle } from 'lucide-react'

// ─── 型定義 ───────────────────────────────────────────

type DayData = {
  work_status: '' | '稼働' | '休日'
  work_time_start: string
  work_time_end: string
  status: 'submitted' | 'approved' | 'rejected' | ''
}

const DEFAULT_DAY: DayData = {
  work_status: '',
  work_time_start: '',
  work_time_end: '',
  status: '',
}

// ─── 時刻オプション（9:00〜22:00, 30分刻み）──────────

const TIMES: string[] = []
for (let h = 9; h <= 22; h++) {
  TIMES.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) TIMES.push(`${String(h).padStart(2, '0')}:30`)
}

// ─── カラーマップ ─────────────────────────────────────

const statusColors = {
  approved: { bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-400', label: '承認済み', dot: '#10B981' },
  submitted: { bg: 'bg-blue-500',   text: 'text-white', border: 'border-blue-400',   label: '提出済み', dot: '#3B82F6' },
  rejected:  { bg: 'bg-red-400',    text: 'text-white', border: 'border-red-300',    label: '却下',     dot: '#EF4444' },
}

// ─── ユーティリティ ────────────────────────────────────

function buildYM(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function firstDowOf(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay()
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

// ─── 日セルの編集モーダル ─────────────────────────────

function DayEditSheet({
  dateStr,
  day,
  dow,
  data,
  onSave,
  onClose,
}: {
  dateStr: string
  day: number
  dow: number
  data: DayData
  onSave: (dateStr: string, d: DayData) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<DayData>({ ...data })
  const isApproved = data.status === 'approved'

  function handleWorkStatus(v: '稼働' | '休日') {
    setLocal(prev => ({
      ...prev,
      work_status: v,
      work_time_start: v === '休日' ? '' : (prev.work_time_start || '09:00'),
      work_time_end:   v === '休日' ? '' : (prev.work_time_end   || '18:00'),
    }))
  }

  const canSave = local.work_status !== ''
    && (local.work_status === '休日' || (local.work_time_start && local.work_time_end))

  const dowLabel = DOW_JA[dow]
  const isWeekend = dow === 0 || dow === 6

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center">
      {/* バックドロップ */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* シート */}
      <div className="relative z-10 w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <p className={`text-xs font-bold ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-slate-400'}`}>
              {DOW_JA[dow]}曜日
            </p>
            <p className="text-2xl font-black text-slate-800">{dateStr.replace('-', '年').replace('-', '月')}日</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {isApproved && (
          <div className="mx-5 mb-3 px-4 py-2 bg-emerald-50 rounded-xl flex items-center gap-2 text-sm text-emerald-700">
            <Check className="w-4 h-4" />
            承認済みのため編集できません
          </div>
        )}

        <div className="px-5 pb-6 space-y-4">
          {/* 稼働/休日 */}
          <div>
            <p className="text-xs font-bold text-slate-400 mb-2">種別</p>
            <div className="grid grid-cols-2 gap-2">
              {(['稼働', '休日'] as const).map(s => (
                <button
                  key={s}
                  disabled={isApproved}
                  onClick={() => handleWorkStatus(s)}
                  className={`py-3 rounded-2xl font-bold text-sm transition-all ${
                    local.work_status === s
                      ? s === '稼働'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                        : 'bg-slate-400 text-white shadow-md shadow-slate-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  } ${isApproved ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {s === '稼働' ? '🏃 稼働' : '🏖️ 休日'}
                </button>
              ))}
            </div>
          </div>

          {/* 時刻（稼働の場合のみ） */}
          {local.work_status === '稼働' && (
            <div>
              <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />勤務時間
              </p>
              <div className="flex items-center gap-2">
                <select
                  disabled={isApproved}
                  value={local.work_time_start}
                  onChange={e => setLocal(prev => ({ ...prev, work_time_start: e.target.value }))}
                  className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:border-blue-400 focus:outline-none"
                >
                  <option value="">開始</option>
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-slate-300 font-bold">—</span>
                <select
                  disabled={isApproved}
                  value={local.work_time_end}
                  onChange={e => setLocal(prev => ({ ...prev, work_time_end: e.target.value }))}
                  className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 bg-white focus:border-blue-400 focus:outline-none"
                >
                  <option value="">終了</option>
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* 保存ボタン */}
          {!isApproved && (
            <button
              disabled={!canSave}
              onClick={() => { onSave(dateStr, local); onClose() }}
              className={`w-full py-3.5 rounded-2xl font-black text-sm transition-all ${
                canSave
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 active:scale-95'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
              }`}
            >
              確定する
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── メインコンポーネント ────────────────────────────────

type Props = {
  repId: string
  repName: string
  initialYearMonth?: string
}

export default function ShiftMyCalendar({ repId, repName, initialYearMonth }: Props) {
  const today = new Date()
  const [year, setYear] = useState(() => {
    if (initialYearMonth) return parseInt(initialYearMonth.split('-')[0])
    return today.getFullYear()
  })
  const [month, setMonth] = useState(() => {
    if (initialYearMonth) return parseInt(initialYearMonth.split('-')[1])
    return today.getMonth() + 1
  })

  const [schedules, setSchedules] = useState<Record<string, DayData>>({})
  const [dirty, setDirty] = useState<Record<string, boolean>>({}) // 変更されたセル
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [editDay, setEditDay] = useState<{ dateStr: string; day: number; dow: number } | null>(null)

  const yearMonth = buildYM(year, month)
  const totalDays = daysInMonth(year, month)
  const firstDow = firstDowOf(year, month)

  // カレンダーセル生成（前の月の空白 + 日数）
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  // ─── データ読み込み ──────────────────────────────────

  const loadSchedules = useCallback(async () => {
    const lastDay = totalDays
    const { data } = await supabase
      .from('work_schedules')
      .select('*')
      .eq('sales_rep_id', repId)
      .gte('schedule_date', `${yearMonth}-01`)
      .lte('schedule_date', `${yearMonth}-${String(lastDay).padStart(2, '0')}`)

    const map: Record<string, DayData> = {}
    data?.forEach(r => {
      map[r.schedule_date] = {
        work_status: r.work_status || '',
        work_time_start: r.work_time_start || '',
        work_time_end: r.work_time_end || '',
        status: r.status || 'submitted',
      }
    })
    setSchedules(map)
    setDirty({})
  }, [repId, yearMonth, totalDays])

  useEffect(() => { loadSchedules() }, [loadSchedules])

  // ─── 月移動 ─────────────────────────────────────────

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth() + 1)
  }

  // ─── 1日の更新 ──────────────────────────────────────

  function handleDayUpdate(dateStr: string, d: DayData) {
    setSchedules(prev => ({ ...prev, [dateStr]: { ...d, status: 'submitted' } }))
    setDirty(prev => ({ ...prev, [dateStr]: true }))
    setSaved(false)
  }

  // ─── 一括保存 ────────────────────────────────────────

  async function handleSaveAll() {
    setSaving(true)
    setError('')
    try {
      const rows = Object.entries(schedules).map(([dateStr, d]) => ({
        sales_rep_id: repId,
        schedule_date: dateStr,
        work_status: d.work_status || '休日',
        work_time_start: d.work_status === '稼働' ? (d.work_time_start || '') : '',
        work_time_end: d.work_status === '稼働' ? (d.work_time_end || '') : '',
        status: 'submitted',
        updated_at: new Date().toISOString(),
      }))

      const { error: upsertErr } = await supabase
        .from('work_schedules')
        .upsert(rows, { onConflict: 'sales_rep_id,schedule_date' })

      if (upsertErr) throw new Error(upsertErr.message)

      // monthly_plans.plan_working_days を更新（計画稼働日数に連動）
      const workingCount = rows.filter(r => r.work_status === '稼働').length
      const { data: existingPlan } = await supabase
        .from('monthly_plans')
        .select('plan_cases')
        .eq('sales_rep_id', repId)
        .eq('year_month', yearMonth)
        .maybeSingle()

      await supabase.from('monthly_plans').upsert({
        sales_rep_id: repId,
        year_month: yearMonth,
        plan_cases: existingPlan?.plan_cases ?? 0,
        plan_working_days: workingCount,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'sales_rep_id,year_month' })

      syncSheets()

      setDirty({})
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // ─── 統計 ────────────────────────────────────────────

  const workingDays = Object.values(schedules).filter(d => d.work_status === '稼働').length
  const holidayDays = Object.values(schedules).filter(d => d.work_status === '休日').length
  const submittedDays = Object.keys(schedules).length
  const dirtyCount = Object.values(dirty).filter(Boolean).length
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1

  // ─── レンダー ─────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto select-none">

      {/* 月ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 active:scale-90 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="text-xl font-black text-slate-800">
            {year}年{month}月
          </div>
          {!isCurrentMonth && (
            <button
              onClick={goToday}
              className="text-xs text-blue-500 font-bold mt-0.5 hover:underline"
            >
              今月に戻る
            </button>
          )}
        </div>

        <button
          onClick={nextMonth}
          className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 active:scale-90 transition-all"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 統計バー */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-blue-50 rounded-2xl p-3 text-center">
          <div className="text-2xl font-black text-blue-600">{workingDays}</div>
          <div className="text-[10px] font-bold text-blue-400 mt-0.5">稼働日</div>
        </div>
        <div className="bg-slate-50 rounded-2xl p-3 text-center">
          <div className="text-2xl font-black text-slate-400">{holidayDays}</div>
          <div className="text-[10px] font-bold text-slate-400 mt-0.5">休日</div>
        </div>
        <div className="bg-slate-50 rounded-2xl p-3 text-center">
          <div className="text-2xl font-black text-slate-500">{totalDays - submittedDays}</div>
          <div className="text-[10px] font-bold text-slate-400 mt-0.5">未提出</div>
        </div>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 mb-1">
        {DOW_JA.map((d, i) => (
          <div key={d} className={`text-center text-xs font-bold py-1 ${
            i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'
          }`}>{d}</div>
        ))}
      </div>

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} />

          const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`
          const data = schedules[dateStr] || DEFAULT_DAY
          const dow = (firstDow + day - 1) % 7
          const isToday = isCurrentMonth && day === today.getDate()
          const isDirty = dirty[dateStr]
          const isWorking = data.work_status === '稼働'
          const isOff = data.work_status === '休日'
          const sc = data.status && statusColors[data.status as keyof typeof statusColors]
          const isWeekend = dow === 0 || dow === 6

          return (
            <button
              key={day}
              onClick={() => setEditDay({ dateStr, day, dow })}
              className={`rounded-2xl p-1.5 min-h-[72px] flex flex-col items-center relative transition-all active:scale-95 ${
                isWorking
                  ? `bg-blue-600 shadow-md shadow-blue-200`
                  : isOff
                  ? 'bg-slate-100'
                  : isWeekend
                  ? 'bg-red-50/60 border border-dashed border-red-100'
                  : 'bg-white border border-dashed border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* 日付番号 */}
              <div className={`text-xs font-black mb-0.5 w-6 h-6 flex items-center justify-center rounded-full ${
                isToday
                  ? 'bg-orange-400 text-white'
                  : isWorking
                  ? 'text-white'
                  : dow === 0
                  ? 'text-red-400'
                  : dow === 6
                  ? 'text-blue-400'
                  : 'text-slate-600'
              }`}>
                {day}
              </div>

              {/* シフトブロック */}
              {isWorking ? (
                <div className="flex flex-col items-center gap-0.5 w-full">
                  {data.work_time_start && data.work_time_end ? (
                    <>
                      <div className="text-[9px] font-bold text-white/90 leading-none">{data.work_time_start.slice(0, 5)}</div>
                      <div className="w-0.5 h-2 bg-white/50 rounded-full" />
                      <div className="text-[9px] font-bold text-white/90 leading-none">{data.work_time_end.slice(0, 5)}</div>
                    </>
                  ) : (
                    <div className="text-[9px] text-white/80 font-bold">稼働</div>
                  )}
                </div>
              ) : isOff ? (
                <div className="text-[10px] font-bold text-slate-400">休</div>
              ) : (
                <div className="text-[10px] text-slate-300">—</div>
              )}

              {/* ステータスドット */}
              {sc && (
                <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                  data.status === 'approved' ? 'bg-emerald-400' :
                  data.status === 'rejected' ? 'bg-red-400' : 'hidden'
                }`} />
              )}

              {/* 変更済みドット */}
              {isDirty && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-400" />
              )}
            </button>
          )
        })}
      </div>

      {/* 凡例 */}
      <div className="flex gap-3 mt-4 flex-wrap justify-center text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-lg bg-blue-600" />
          <span>稼働</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-lg bg-slate-100" />
          <span>休日</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-lg border-2 border-dashed border-slate-200" />
          <span>未提出</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <span>未保存</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>承認済み</span>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-red-50 rounded-xl text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 保存ボタン */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={handleSaveAll}
          disabled={saving || dirtyCount === 0}
          className={`flex-1 py-4 rounded-2xl font-black text-sm transition-all ${
            dirtyCount > 0 && !saving
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 active:scale-95'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
          }`}
        >
          {saving ? '保存中...' : saved ? '✓ 保存しました' : dirtyCount > 0 ? `${dirtyCount}日分を保存する` : 'シフトを保存する'}
        </button>
      </div>

      <p className="text-center text-[11px] text-slate-400 mt-2">
        日付をタップして稼働/休日を設定してください
      </p>

      {/* 日別編集シート */}
      {editDay && (
        <DayEditSheet
          dateStr={editDay.dateStr}
          day={editDay.day}
          dow={editDay.dow}
          data={schedules[editDay.dateStr] || DEFAULT_DAY}
          onSave={handleDayUpdate}
          onClose={() => setEditDay(null)}
        />
      )}
    </div>
  )
}
