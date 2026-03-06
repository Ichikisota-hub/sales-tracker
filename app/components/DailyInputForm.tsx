'use client'

import { useEffect, useState } from 'react'
import { supabase, DailyRecord, MonthlyPlan } from '@/lib/supabase'
import { getDaysArray } from '@/lib/dateUtils'

const WORK_STATUSES = ['稼働', '休日', '同行', '有休', '研修', '出張']
const HOURS = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

type Props = { repId: string; repName: string; yearMonth: string }

const COUNTERS = [
  { label: '訪問',      field: 'visits'        as keyof DailyRecord, plus: 'counter-btn-plus-blue' },
  { label: 'ネット対面', field: 'net_meetings'   as keyof DailyRecord, plus: 'counter-btn-plus-indigo' },
  { label: '主権対面',   field: 'owner_meetings' as keyof DailyRecord, plus: 'counter-btn-plus-purple' },
  { label: '商談',      field: 'negotiations'   as keyof DailyRecord, plus: 'counter-btn-plus-orange' },
  { label: '獲得',      field: 'acquisitions'   as keyof DailyRecord, plus: 'counter-btn-plus-green' },
]

export default function DailyInputForm({ repId, repName, yearMonth }: Props) {
  const days = getDaysArray(yearMonth)
  const today = new Date().toISOString().split('T')[0]
  const defaultDay = days.find(d => d.dateStr === today) || days[0]

  const [selectedDate, setSelectedDate] = useState(defaultDay.dateStr)
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [record, setRecord] = useState<Partial<DailyRecord>>({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadPlan() }, [repId, yearMonth])
  useEffect(() => { loadRecord() }, [repId, selectedDate])

  async function loadPlan() {
    const { data } = await supabase.from('monthly_plans').select('*')
      .eq('sales_rep_id', repId).eq('year_month', yearMonth).single()
    setPlan(data)
  }

  async function loadRecord() {
    setSaved(false)
    const { data } = await supabase.from('daily_records').select('*')
      .eq('sales_rep_id', repId).eq('record_date', selectedDate).single()
    setRecord(data || {
      work_status: '', attendance_status: '', working_hours: 0,
      visits: 0, net_meetings: 0, owner_meetings: 0, negotiations: 0, acquisitions: 0,
    })
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('daily_records').upsert({
      ...record, sales_rep_id: repId, record_date: selectedDate,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sales_rep_id,record_date' })
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
    setRecord(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  function increment(field: keyof DailyRecord) {
    setRecord(prev => ({ ...prev, [field]: ((prev[field] as number) || 0) + 1 }))
    setSaved(false)
  }

  function decrement(field: keyof DailyRecord) {
    setRecord(prev => ({ ...prev, [field]: Math.max(0, ((prev[field] as number) || 0) - 1) }))
    setSaved(false)
  }

  const selectedDay = days.find(d => d.dateStr === selectedDate)
  const isWorking = record.attendance_status === '稼働' || record.work_status === '稼働'
  const idx = days.findIndex(d => d.dateStr === selectedDate)

  return (
    <div>

      {/* ── 日付ナビ ── */}
      <div className="mobile-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-400">{repName}</span>
          {selectedDay && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              selectedDay.dow === 0 ? 'bg-red-100 text-red-600' :
              selectedDay.dow === 6 ? 'bg-blue-100 text-blue-600' :
              'bg-slate-100 text-slate-500'
            }`}>{selectedDay.dowJa}曜日</span>
          )}
        </div>
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => idx > 0 && setSelectedDate(days[idx - 1].dateStr)}>‹</button>
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="date-select"
          >
            {days.map(d => (
              <option key={d.dateStr} value={d.dateStr}>
                {d.day}日（{d.dowJa}）{d.dateStr === today ? '  ← 今日' : ''}
              </option>
            ))}
          </select>
          <button className="date-nav-btn" onClick={() => idx < days.length - 1 && setSelectedDate(days[idx + 1].dateStr)}>›</button>
        </div>
      </div>

      {/* ── 出勤状態 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label">出勤状態</div>
        <div className="status-grid">
          {WORK_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => { set('work_status', s); set('attendance_status', s) }}
              className={`status-btn ${
                record.attendance_status === s || record.work_status === s
                  ? 'status-btn-active' : 'status-btn-inactive'
              }`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* ── 稼働時間 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label">
          稼働時間
          {record.working_hours ? <span className="ml-2 text-blue-600 normal-case font-black">{record.working_hours}h</span> : null}
        </div>
        <div className="hour-grid">
          {HOURS.map(h => (
            <button
              key={h}
              onClick={() => set('working_hours', h)}
              className={`hour-btn ${record.working_hours === h ? 'hour-btn-active' : 'hour-btn-inactive'}`}
            >{h}h</button>
          ))}
        </div>
      </div>

      {/* ── 行動量 ── */}
      {isWorking && (
        <div className="mobile-card">
          <div className="mobile-card-label">行動量（本日）</div>
          {COUNTERS.map(({ label, field, plus }) => {
            const val = (record[field] as number) || 0
            return (
              <div key={field} className="counter-row">
                <span className="counter-label">{label}</span>
                <button className="counter-btn counter-btn-minus" onClick={() => decrement(field)}>−</button>
                <input
                  type="number" min={0}
                  value={val === 0 ? '' : val}
                  placeholder="0"
                  onChange={e => set(field, parseInt(e.target.value) || 0)}
                  className="counter-input"
                />
                <button className={`counter-btn ${plus}`} onClick={() => increment(field)}>＋</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 月初計画 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label" style={{color:'#dc2626'}}>月初計画入力</div>
        {[
          { label: '月間計画件数', field: 'plan_cases' as const, unit: '件' },
          { label: '月間計画稼働日数', field: 'plan_working_days' as const, unit: '日' },
        ].map(({ label, field, unit }) => (
          <div key={field} className="plan-row">
            <span className="text-sm font-semibold text-slate-700">{label}</span>
            <div className="plan-stepper">
              <button
                className="plan-stepper-btn"
                style={{background:'#f1f5f9', color:'#475569'}}
                onClick={() => updatePlan(field, Math.max(0, (plan?.[field] || 0) - 1))}
              >−</button>
              <input
                type="number" min={0}
                value={plan?.[field] || 0}
                onChange={e => updatePlan(field, parseInt(e.target.value) || 0)}
                className="plan-input"
              />
              <button
                className="plan-stepper-btn"
                style={{background:'#dc2626', color:'white'}}
                onClick={() => updatePlan(field, (plan?.[field] || 0) + 1)}
              >＋</button>
              <span className="text-sm text-slate-400 w-4">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── 保存ボタン（固定） ── */}
      <div className="save-bar">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`save-btn ${saved ? 'save-btn-saved' : saving ? 'save-btn-saving' : 'save-btn-default'}`}
        >
          {saved ? '✓ 保存しました！' : saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  )
}
