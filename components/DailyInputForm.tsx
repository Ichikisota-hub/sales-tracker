'use client'

import { useEffect, useState } from 'react'
import { supabase, DailyRecord, MonthlyPlan } from '@/lib/supabase'
import { getDaysArray, localToday } from '@/lib/dateUtils'
import { KANSAI_AREAS, PREF_LIST } from '@/lib/areas'

// 稼働・休日のみ（同行・有休・研修・出張は削除）
const WORK_STATUSES = ['稼働', '休日']

// 9:00〜21:00、30分刻み
const TIMES: string[] = []
for (let h = 9; h <= 21; h++) {
  TIMES.push(`${String(h).padStart(2,'0')}:00`)
  if (h < 21) TIMES.push(`${String(h).padStart(2,'0')}:30`)
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff > 0 ? Math.round(diff / 60 * 10) / 10 : 0
}

type Props = { repId: string; repName: string; yearMonth: string }

const COUNTERS = [
  { label: '訪問',       field: 'visits'         as keyof DailyRecord, plus: 'counter-btn-plus-blue' },
  { label: 'ネット対面', field: 'net_meetings'    as keyof DailyRecord, plus: 'counter-btn-plus-indigo' },
  { label: '主権対面',   field: 'owner_meetings'  as keyof DailyRecord, plus: 'counter-btn-plus-purple' },
  { label: '商談',       field: 'negotiations'    as keyof DailyRecord, plus: 'counter-btn-plus-orange' },
  { label: '獲得',       field: 'acquisitions'    as keyof DailyRecord, plus: 'counter-btn-plus-green' },
]

function draftKey(repId: string, dateStr: string) { return `draft__${repId}__${dateStr}` }
function loadDraft(repId: string, dateStr: string): Partial<DailyRecord> | null {
  try { const raw = localStorage.getItem(draftKey(repId, dateStr)); return raw ? JSON.parse(raw) : null }
  catch { return null }
}
function saveDraft(repId: string, dateStr: string, record: Partial<DailyRecord>) {
  try { localStorage.setItem(draftKey(repId, dateStr), JSON.stringify(record)) } catch {}
}
function clearDraft(repId: string, dateStr: string) {
  try { localStorage.removeItem(draftKey(repId, dateStr)) } catch {}
}

export default function DailyInputForm({ repId, repName, yearMonth }: Props) {
  const days = getDaysArray(yearMonth)
  const today = localToday()
  const defaultDay = days.find(d => d.dateStr === today) || days[0]

  const [selectedDate, setSelectedDate] = useState(defaultDay.dateStr)
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [record, setRecord] = useState<Partial<DailyRecord>>({})
  const [hasDraft, setHasDraft] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => { loadPlan() }, [repId, yearMonth])
  useEffect(() => { setSaved(false); loadRecord() }, [repId, selectedDate])

  async function loadPlan() {
    const { data } = await supabase.from('monthly_plans').select('*')
      .eq('sales_rep_id', repId).eq('year_month', yearMonth).single()
    setPlan(data)
  }

  async function loadRecord() {
    const { data } = await supabase.from('daily_records').select('*')
      .eq('sales_rep_id', repId).eq('record_date', selectedDate).single()
    const dbRecord: Partial<DailyRecord> = data || {
      work_status: '', attendance_status: '', working_hours: 0,
      work_time_start: '', work_time_end: '',
      visits: 0, net_meetings: 0, owner_meetings: 0, negotiations: 0, acquisitions: 0,
      area_pref: '', area_city: '',
    }
    const draft = loadDraft(repId, selectedDate)
    if (draft) { setRecord(draft); setHasDraft(true) }
    else { setRecord(dbRecord); setHasDraft(false) }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    const start = (record as any).work_time_start || ''
    const end = (record as any).work_time_end || ''
    const computedHours = calcHours(start, end)

    const payload: any = {
      ...record,
      working_hours: computedHours || record.working_hours || 0,
      sales_rep_id: repId,
      record_date: selectedDate,
      updated_at: new Date().toISOString(),
    }

    let { error } = await supabase
      .from('daily_records')
      .upsert(payload, { onConflict: 'sales_rep_id,record_date' })

    // カラム未作成の場合、該当フィールドを除いて再試行
    if (error?.code === '42703' || error?.message?.includes('schema cache')) {
      const { work_time_start, work_time_end, area_list, ...fallback } = payload
      const { error: e2 } = await supabase
        .from('daily_records')
        .upsert(fallback, { onConflict: 'sales_rep_id,record_date' })
      if (e2) {
        setSaveError(`保存失敗: ${e2.message}`)
        setSaving(false)
        return
      }
      setSaveError('⚠️ 一部未保存。Supabaseで以下を実行: ALTER TABLE daily_records ADD COLUMN IF NOT EXISTS work_time_start text DEFAULT \'\', ADD COLUMN IF NOT EXISTS work_time_end text DEFAULT \'\', ADD COLUMN IF NOT EXISTS area_list jsonb DEFAULT \'[]\';')
      error = null
    }

    if (error) {
      setSaveError(`保存失敗: ${error.message}`)
      setSaving(false)
      return
    }

    clearDraft(repId, selectedDate)
    setHasDraft(false)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function updatePlan(field: 'plan_cases' | 'plan_working_days', value: number) {
    const newPlan = { ...(plan || {}), sales_rep_id: repId, year_month: yearMonth, [field]: value }
    setPlan(newPlan as MonthlyPlan)
    await supabase.from('monthly_plans').upsert({ ...newPlan, updated_at: new Date().toISOString() },
      { onConflict: 'sales_rep_id,year_month' })
  }

  function set(field: keyof DailyRecord, value: string | number) {
    setRecord(prev => {
      const next = { ...prev, [field]: value }
      saveDraft(repId, selectedDate, next)
      setHasDraft(true)
      return next
    })
    setSaved(false)
  }

  function increment(field: keyof DailyRecord) {
    setRecord(prev => {
      const next = { ...prev, [field]: ((prev[field] as number) || 0) + 1 }
      saveDraft(repId, selectedDate, next)
      setHasDraft(true)
      return next
    })
    setSaved(false)
  }

  function decrement(field: keyof DailyRecord) {
    setRecord(prev => {
      const next = { ...prev, [field]: Math.max(0, ((prev[field] as number) || 0) - 1) }
      saveDraft(repId, selectedDate, next)
      setHasDraft(true)
      return next
    })
    setSaved(false)
  }

  const selectedDay = days.find(d => d.dateStr === selectedDate)
  const isWorking = record.attendance_status === '稼働'
  const idx = days.findIndex(d => d.dateStr === selectedDate)
  const isToday = selectedDate === today

  const acquisitions = (record.acquisitions as number) || 0
  const areaCount = isWorking ? Math.max(1, acquisitions) : 0

  // 表示するエリアリストを構築（保存済みリスト or レガシーフィールドから）
  const storedList = (record.area_list as { pref: string; city: string }[] | undefined) || []
  const areaList: { pref: string; city: string }[] = Array.from({ length: areaCount }, (_, i) => {
    if (storedList[i]) return storedList[i]
    if (i === 0) return { pref: (record as any).area_pref || '', city: (record as any).area_city || '' }
    return { pref: '', city: '' }
  })

  function setAreaItem(idx: number, pref: string, city: string) {
    const newList = areaList.map((a, i) => i === idx ? { pref, city } : a)
    // 足りない場合は空で補完
    while (newList.length <= idx) newList.push({ pref: '', city: '' })
    newList[idx] = { pref, city }
    setRecord(prev => {
      const next = {
        ...prev,
        area_list: newList,
        area_pref: newList[0]?.pref || '',
        area_city: newList[0]?.city || '',
      }
      saveDraft(repId, selectedDate, next as Partial<DailyRecord>)
      setHasDraft(true)
      return next as Partial<DailyRecord>
    })
    setSaved(false)
  }

  return (
    <div>
      {/* ── 担当者ヘッダー ── */}
      <div className="mobile-card" style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)'}}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-black flex-shrink-0">
            {repName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-400 font-medium">入力中の担当者</div>
            <div className="text-2xl font-black text-white truncate">{repName}</div>
          </div>
          {isToday && (
            <span className="text-sm font-bold bg-blue-500 text-white px-3 py-1 rounded-full flex-shrink-0">今日</span>
          )}
        </div>
      </div>

      {/* ── 日付ナビ ── */}
      <div className="mobile-card">
        <div className="flex items-center justify-between mb-2">
          {hasDraft && !saved && (
            <span className="text-sm font-bold text-amber-500">📝 未保存の入力あり</span>
          )}
          {!hasDraft && <span className="text-sm text-slate-300">　</span>}
          {selectedDay && (
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${
              selectedDay.dow === 0 ? 'bg-red-100 text-red-600' :
              selectedDay.dow === 6 ? 'bg-blue-100 text-blue-600' :
              'bg-slate-100 text-slate-500'
            }`}>{selectedDay.dowJa}曜日</span>
          )}
        </div>
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => idx > 0 && setSelectedDate(days[idx - 1].dateStr)}>‹</button>
          <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="date-select">
            {days.map(d => (
              <option key={d.dateStr} value={d.dateStr}>
                {d.day}日（{d.dowJa}）{d.dateStr === today ? '  ← 今日' : ''}
              </option>
            ))}
          </select>
          <button className="date-nav-btn" onClick={() => idx < days.length - 1 && setSelectedDate(days[idx + 1].dateStr)}>›</button>
        </div>
      </div>

      {/* ── 出勤状態（稼働・休日のみ） ── */}
      <div className="mobile-card">
        <div className="mobile-card-label text-lg">出勤状態</div>
        <div className="flex gap-3">
          {WORK_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => { set('work_status', s); set('attendance_status', s) }}
              className={`flex-1 py-4 rounded-2xl text-lg font-black transition-all ${
                record.attendance_status === s || record.work_status === s
                  ? s === '稼働'
                    ? 'bg-emerald-500 text-white shadow-lg scale-105'
                    : 'bg-slate-500 text-white shadow-lg scale-105'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* ── 稼働エリア（稼働時のみ） ── */}
      {isWorking && (
        <div className="mobile-card">
          <div className="mobile-card-label text-lg">
            📍 稼働エリア
            {acquisitions > 1 && (
              <span className="ml-2 text-sm font-bold text-blue-500 normal-case">獲得{acquisitions}件分</span>
            )}
          </div>
          <div className="space-y-3">
            {areaList.map((area, idx) => {
              const cityOptions = area.pref ? (KANSAI_AREAS[area.pref] || []) : []
              const prev = idx > 0 ? areaList[idx - 1] : null
              return (
                <div key={idx} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-black text-slate-600">
                      {acquisitions > 1 ? `獲得 ${idx + 1}件目` : '稼働エリア'}
                    </span>
                    {idx > 0 && prev && prev.pref && (
                      <button
                        onClick={() => setAreaItem(idx, prev.pref, prev.city)}
                        className="text-xs font-black px-3 py-1 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-all"
                      >同上</button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <div className="text-xs text-slate-500 mb-1 font-medium">都道府県</div>
                      <select
                        value={area.pref}
                        onChange={e => setAreaItem(idx, e.target.value, '')}
                        className="w-full border border-slate-200 rounded-xl px-2 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                      >
                        <option value="">選択</option>
                        {PREF_LIST.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-slate-500 mb-1 font-medium">市区町村・地区</div>
                      <select
                        value={area.city}
                        onChange={e => setAreaItem(idx, area.pref, e.target.value)}
                        disabled={!area.pref}
                        className="w-full border border-slate-200 rounded-xl px-2 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">選択</option>
                        {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  {area.pref && area.city && (
                    <div className="mt-2 text-xs font-bold text-blue-700 bg-blue-50 rounded-lg px-2 py-1.5">
                      📍 {area.pref} → {area.city}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 稼働時間 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label text-lg">
          稼働時間
          {(record as any).work_time_start && (record as any).work_time_end ? (
            <span className="ml-2 text-blue-600 normal-case font-black text-xl">
              {calcHours((record as any).work_time_start, (record as any).work_time_end)}h
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={(record as any).work_time_start || ''}
            onChange={e => set('work_time_start' as any, e.target.value)}
            className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">開始時刻</option>
            {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-base text-slate-400 font-bold flex-shrink-0">〜</span>
          <select
            value={(record as any).work_time_end || ''}
            onChange={e => set('work_time_end' as any, e.target.value)}
            className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">終了時刻</option>
            {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {(record as any).work_time_start && (record as any).work_time_end && (
          <div className="mt-2 text-sm font-bold text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
            ⏰ {(record as any).work_time_start}〜{(record as any).work_time_end}（{calcHours((record as any).work_time_start, (record as any).work_time_end)}時間）
          </div>
        )}
      </div>

      {/* ── 行動量 ── */}
      {isWorking && (
        <div className="mobile-card">
          <div className="mobile-card-label text-lg">行動量（本日）</div>
          {COUNTERS.map(({ label, field, plus }) => {
            const val = (record[field] as number) || 0
            return (
              <div key={field} className="counter-row">
                <span className="counter-label text-base font-bold">{label}</span>
                <button className="counter-btn counter-btn-minus text-lg" onClick={() => decrement(field)}>−</button>
                <input type="number" min={0} value={val === 0 ? '' : val} placeholder="0"
                  onChange={e => set(field, parseInt(e.target.value) || 0)} className="counter-input text-xl font-black" />
                <button className={`counter-btn ${plus} text-lg`} onClick={() => increment(field)}>＋</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 月初計画 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label text-lg" style={{color:'#dc2626'}}>月初計画入力</div>
        {[
          { label: '月間計画件数', field: 'plan_cases' as const, unit: '件' },
          { label: '月間計画稼働日数', field: 'plan_working_days' as const, unit: '日' },
        ].map(({ label, field, unit }) => (
          <div key={field} className="plan-row">
            <span className="text-base font-semibold text-slate-700">{label}</span>
            <div className="plan-stepper">
              <button className="plan-stepper-btn text-lg" style={{background:'#f1f5f9', color:'#475569'}}
                onClick={() => updatePlan(field, Math.max(0, (plan?.[field] || 0) - 1))}>−</button>
              <input type="number" min={0} value={plan?.[field] || 0}
                onChange={e => updatePlan(field, parseInt(e.target.value) || 0)} className="plan-input text-xl font-black" />
              <button className="plan-stepper-btn text-lg" style={{background:'#dc2626', color:'white'}}
                onClick={() => updatePlan(field, (plan?.[field] || 0) + 1)}>＋</button>
              <span className="text-base text-slate-400 w-4">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── 保存ボタン（固定） ── */}
      <div className="save-bar">
        {saveError && (
          <div className="mb-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            ⚠️ {saveError}
          </div>
        )}
        <button onClick={handleSave} disabled={saving}
          className={`save-btn text-lg ${saved ? 'save-btn-saved' : saving ? 'save-btn-saving' : 'save-btn-default'}`}>
          {saved ? '✓ 保存しました！' : saving ? '保存中...' : hasDraft ? '💾 保存する（未保存あり）' : '保存する'}
        </button>
      </div>
    </div>
  )
}
