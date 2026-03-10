'use client'

import { useEffect, useState } from 'react'
import { supabase, DailyRecord, MonthlyPlan } from '@/lib/supabase'
import { getDaysArray, localToday } from '@/lib/dateUtils'
import { KANSAI_AREAS, PREF_LIST } from '@/lib/areas'

// 稼働・休日のみ（同行・有休・研修・出張は削除）
const WORK_STATUSES = ['稼働', '休日']
const HOURS = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

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
      visits: 0, net_meetings: 0, owner_meetings: 0, negotiations: 0, acquisitions: 0,
      area_pref: '', area_city: '',
    }
    const draft = loadDraft(repId, selectedDate)
    if (draft) { setRecord(draft); setHasDraft(true) }
    else { setRecord(dbRecord); setHasDraft(false) }
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('daily_records').upsert({
      ...record, sales_rep_id: repId, record_date: selectedDate,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sales_rep_id,record_date' })
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

  const selectedPref = (record as any).area_pref || ''
  const selectedCity = (record as any).area_city || ''
  const cityList = selectedPref ? (KANSAI_AREAS[selectedPref] || []) : []

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
          <div className="mobile-card-label text-lg">📍 稼働エリア</div>
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-sm text-slate-500 mb-1 font-medium">都道府県</div>
              <select
                value={selectedPref}
                onChange={e => {
                  set('area_pref' as any, e.target.value)
                  set('area_city' as any, '')
                }}
                className="w-full border border-slate-200 rounded-xl px-3 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">選択してください</option>
                {PREF_LIST.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <div className="text-sm text-slate-500 mb-1 font-medium">市区町村・地区</div>
              <select
                value={selectedCity}
                onChange={e => set('area_city' as any, e.target.value)}
                disabled={!selectedPref}
                className="w-full border border-slate-200 rounded-xl px-3 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">選択してください</option>
                {cityList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {selectedPref && selectedCity && (
            <div className="mt-2 text-sm font-bold text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
              📍 {selectedPref} → {selectedCity}
            </div>
          )}
        </div>
      )}

      {/* ── 稼働時間 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label text-lg">
          稼働時間
          {record.working_hours ? <span className="ml-2 text-blue-600 normal-case font-black text-xl">{record.working_hours}h</span> : null}
        </div>
        <div className="hour-grid">
          {HOURS.map(h => (
            <button key={h} onClick={() => set('working_hours', h)}
              className={`hour-btn text-base font-bold ${record.working_hours === h ? 'hour-btn-active' : 'hour-btn-inactive'}`}
            >{h}h</button>
          ))}
        </div>
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
        <button onClick={handleSave} disabled={saving}
          className={`save-btn text-lg ${saved ? 'save-btn-saved' : saving ? 'save-btn-saving' : 'save-btn-default'}`}>
          {saved ? '✓ 保存しました！' : saving ? '保存中...' : hasDraft ? '💾 保存する（未保存あり）' : '保存する'}
        </button>
      </div>
    </div>
  )
}
