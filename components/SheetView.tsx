'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, DailyRecord, MonthlyPlan } from '@/lib/supabase'
import { getDaysArray, isWeekend } from '@/lib/dateUtils'
import { calcProgress, pct, round1 } from '@/lib/calcUtils'

const WORK_STATUSES = ['稼働', '休日', '同行', '有休', '研修', '出張']

type Props = { repId: string; repName: string; yearMonth: string }

export default function SheetView({ repId, repName, yearMonth }: Props) {
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [records, setRecords] = useState<Record<string, DailyRecord>>({})
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string>('')
  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  const days = getDaysArray(yearMonth)

  useEffect(() => {
    loadData()
  }, [repId, yearMonth])

  async function loadData() {
    // Load plan
    const { data: planData } = await supabase
      .from('monthly_plans')
      .select('*')
      .eq('sales_rep_id', repId)
      .eq('year_month', yearMonth)
      .single()
    setPlan(planData || {
      id: '', sales_rep_id: repId, year_month: yearMonth,
      plan_cases: 0, plan_working_days: 0, updated_at: ''
    })

    // Load daily records
    const [y, m] = yearMonth.split('-')
    const startDate = `${y}-${m}-01`
    const endDate = `${y}-${m}-31`
    const { data: recData } = await supabase
      .from('daily_records')
      .select('*')
      .eq('sales_rep_id', repId)
      .gte('record_date', startDate)
      .lte('record_date', endDate)

    const map: Record<string, DailyRecord> = {}
    recData?.forEach(r => { map[r.record_date] = r })
    setRecords(map)
  }

  function getRecord(dateStr: string): DailyRecord {
    return records[dateStr] || {
      id: '', sales_rep_id: repId, record_date: dateStr,
      acquired_cases: 0, work_status: '', attendance_status: '',
      working_hours: 0, visits: 0, net_meetings: 0,
      owner_meetings: 0, negotiations: 0, acquisitions: 0, updated_at: ''
    }
  }

  function autoSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    saveTimer.current = setTimeout(async () => {
      setSaving(false)
      setLastSaved(new Date().toLocaleTimeString('ja-JP'))
    }, 500)
  }

  async function updateRecord(dateStr: string, field: keyof DailyRecord, value: string | number) {
    const existing = records[dateStr]
    const updated = { ...getRecord(dateStr), [field]: value, sales_rep_id: repId, record_date: dateStr }

    setRecords(prev => ({ ...prev, [dateStr]: updated as DailyRecord }))
    autoSave()

    if (existing?.id) {
      await supabase.from('daily_records').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('daily_records').upsert({
        ...updated, updated_at: new Date().toISOString()
      }, { onConflict: 'sales_rep_id,record_date' }).select().single()
      if (data) setRecords(prev => ({ ...prev, [dateStr]: data }))
    }
  }

  async function updatePlan(field: 'plan_cases' | 'plan_working_days', value: number) {
    const newPlan = { ...(plan || {}), sales_rep_id: repId, year_month: yearMonth, [field]: value }
    setPlan(newPlan as MonthlyPlan)
    autoSave()
    await supabase.from('monthly_plans').upsert({
      ...newPlan, updated_at: new Date().toISOString()
    }, { onConflict: 'sales_rep_id,year_month' })
  }

  // Calculate totals
  const allRecords = days.map(d => getRecord(d.dateStr))
  const workingRecords = allRecords.filter(r => r.attendance_status === '稼働' || r.work_status === '稼働')
  const totals = {
    planCases: plan?.plan_cases || 0,
    acquiredCases: days.reduce((s, d) => s + (getRecord(d.dateStr).acquired_cases || 0), 0),
    workingDays: workingRecords.length,
    workingHours: allRecords.reduce((s, r) => s + (r.working_hours || 0), 0),
    visits: allRecords.reduce((s, r) => s + (r.visits || 0), 0),
    netMeetings: allRecords.reduce((s, r) => s + (r.net_meetings || 0), 0),
    ownerMeetings: allRecords.reduce((s, r) => s + (r.owner_meetings || 0), 0),
    negotiations: allRecords.reduce((s, r) => s + (r.negotiations || 0), 0),
    acquisitions: allRecords.reduce((s, r) => s + (r.acquisitions || 0), 0),
  }

  // Cumulative acquisitions for progress
  let cumAcq = 0

  function rowClass(dow: number) {
    if (dow === 0) return 'row-sunday'
    if (dow === 6) return 'row-saturday'
    return 'row-weekday'
  }

  return (
    <div>
      {/* Status bar */}
      <div className="flex items-center gap-3 mb-2 text-xs text-gray-500">
        <span className="font-bold text-gray-700">{repName}</span>
        {saving && <span className="text-blue-500">保存中...</span>}
        {lastSaved && !saving && <span className="text-green-600">✓ {lastSaved} 保存</span>}
      </div>

      <div className="table-scroll bg-white rounded shadow">
        <table className="sheet-table">
          <thead>
            {/* Row 3: group headers */}
            <tr>
              <th colSpan={2} className="header-yellow">自動反映<br /><span className="text-xs font-normal">入力禁止</span></th>
              <th className="header-pink">①<br /><small>月初入力</small></th>
              <th className="header-yellow" colSpan={2}>①②<br /><small>入力禁止</small></th>
              <th className="header-pink">②<br /><small>月初入力</small></th>
              <th className="header-red">③</th>
              <th className="header-red">④</th>
              <th colSpan={5} className="header-red" style={{borderLeft:'2px solid #333'}}>
                <div className="text-xs">1日</div>
              </th>
              <th className="bg-gray-100">使用</th>
            </tr>
            {/* Row 5: column names */}
            <tr className="sticky-header">
              <th className="bg-gray-200">日付</th>
              <th className="bg-gray-200">曜日</th>
              <th className="header-pink" style={{minWidth:50}}>
                計画<br />件数
              </th>
              <th className="header-yellow" style={{minWidth:50}}>
                獲得<br />件数
              </th>
              <th className="header-yellow" style={{minWidth:40}}>
                進捗
              </th>
              <th className="header-blue" style={{minWidth:50}}>
                計画<br />稼働
              </th>
              <th className="header-red" style={{minWidth:60}}>
                出勤<br />状態
              </th>
              <th className="header-red" style={{minWidth:50}}>
                稼働<br />時間
              </th>
              <th className="header-red" style={{minWidth:50, borderLeft:'2px solid #333'}}>
                訪問
              </th>
              <th className="header-red" style={{minWidth:50}}>
                ネット<br />対面
              </th>
              <th className="header-red" style={{minWidth:50}}>
                主権<br />対面
              </th>
              <th className="header-red" style={{minWidth:40}}>
                商談
              </th>
              <th className="header-red" style={{minWidth:40}}>
                獲得
              </th>
              <th className="bg-gray-100" style={{minWidth:30}}></th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, idx) => {
              const rec = getRecord(d.dateStr)
              const isWorking = rec.attendance_status === '稼働' || rec.work_status === '稼働'
              if (isWorking) cumAcq += rec.acquisitions || 0
              const progress = calcProgress(idx, days.length, plan?.plan_cases || 0, cumAcq)
              const weekend = d.dow === 0 || d.dow === 6

              return (
                <tr key={d.dateStr} className={rowClass(d.dow)}>
                  {/* 日付 */}
                  <td className={`font-medium ${d.dow === 0 ? 'text-red-600' : d.dow === 6 ? 'text-blue-600' : ''}`}>
                    {d.day}
                  </td>
                  {/* 曜日 */}
                  <td className={d.dow === 0 ? 'text-red-600' : d.dow === 6 ? 'text-blue-600' : ''}>
                    {d.dowJa}
                  </td>
                  {/* 計画件数 (①月初入力 = 自動計算) */}
                  <td className="bg-pink-50 text-xs">
                    {plan?.plan_cases && plan?.plan_working_days
                      ? (plan.plan_cases / plan.plan_working_days).toFixed(2)
                      : ''}
                  </td>
                  {/* 獲得件数 (自動) */}
                  <td className="bg-yellow-50">
                    {rec.acquisitions > 0 ? rec.acquisitions : weekend ? '•' : ''}
                  </td>
                  {/* 進捗 */}
                  <td className={progress > 0 ? 'progress-positive' : progress < 0 ? 'progress-negative' : 'progress-zero'}>
                    {isWorking ? progress : ''}
                  </td>
                  {/* 計画稼働 */}
                  <td className="bg-blue-50">
                    <select
                      value={rec.work_status || ''}
                      onChange={e => updateRecord(d.dateStr, 'work_status', e.target.value)}
                      className="text-xs w-full bg-transparent border-none outline-none cursor-pointer"
                      style={{minWidth: 48}}
                    >
                      <option value="">•</option>
                      {WORK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  {/* 出勤状態 */}
                  <td style={{background:'#4472c4', color:'white'}}>
                    <select
                      value={rec.attendance_status || ''}
                      onChange={e => updateRecord(d.dateStr, 'attendance_status', e.target.value)}
                      className="text-xs w-full border-none outline-none cursor-pointer bg-transparent text-white"
                      style={{minWidth: 48}}
                    >
                      <option value="">•</option>
                      {WORK_STATUSES.map(s => <option key={s} value={s} style={{color:'#000',background:'white'}}>{s}</option>)}
                    </select>
                  </td>
                  {/* 稼働時間 */}
                  <td style={{background:'#4472c4', color:'white'}}>
                    <select
                      value={rec.working_hours || ''}
                      onChange={e => updateRecord(d.dateStr, 'working_hours', parseFloat(e.target.value) || 0)}
                      className="text-xs w-full border-none outline-none cursor-pointer bg-transparent text-white"
                    >
                      <option value="">-</option>
                      {[3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(h => (
                        <option key={h} value={h} style={{color:'#000',background:'white'}}>{h}</option>
                      ))}
                    </select>
                  </td>
                  {/* 訪問 */}
                  <td style={{borderLeft:'2px solid #333'}}>
                    <input
                      type="number" min={0}
                      value={rec.visits || ''}
                      onChange={e => updateRecord(d.dateStr, 'visits', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </td>
                  {/* ネット対面 */}
                  <td>
                    <input
                      type="number" min={0}
                      value={rec.net_meetings || ''}
                      onChange={e => updateRecord(d.dateStr, 'net_meetings', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </td>
                  {/* 主権対面 */}
                  <td>
                    <input
                      type="number" min={0}
                      value={rec.owner_meetings || ''}
                      onChange={e => updateRecord(d.dateStr, 'owner_meetings', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </td>
                  {/* 商談 */}
                  <td>
                    <input
                      type="number" min={0}
                      value={rec.negotiations || ''}
                      onChange={e => updateRecord(d.dateStr, 'negotiations', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </td>
                  {/* 獲得 */}
                  <td>
                    <input
                      type="number" min={0}
                      value={rec.acquisitions || ''}
                      onChange={e => updateRecord(d.dateStr, 'acquisitions', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </td>
                  <td className="bg-gray-50"></td>
                </tr>
              )
            })}
            {/* TTL row */}
            <tr style={{background:'#e8e8e8', fontWeight:700}}>
              <td colSpan={2}>TTL</td>
              <td>{plan?.plan_cases || 0}</td>
              <td>{totals.acquiredCases}</td>
              <td className={totals.acquiredCases - (plan?.plan_cases||0) >= 0 ? 'progress-positive' : 'progress-negative'}>
                {totals.acquisitions - (plan?.plan_cases || 0)}
              </td>
              <td>{totals.workingDays}</td>
              <td>{totals.workingDays}</td>
              <td>{totals.workingHours}</td>
              <td style={{borderLeft:'2px solid #333'}}>{totals.visits}</td>
              <td>{totals.netMeetings}</td>
              <td>{totals.ownerMeetings}</td>
              <td>{totals.negotiations}</td>
              <td>{totals.acquisitions}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        {/* Month initial input section */}
        <div className="mt-4 p-3 bg-white border border-gray-200 rounded">
          <div className="text-xs font-bold text-red-600 mb-2">月初入力（①②）</div>
          <div className="flex gap-4 items-center flex-wrap">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-red-600 font-bold">月間計画件数</span>
              <input
                type="number" min={0}
                value={plan?.plan_cases || ''}
                onChange={e => updatePlan('plan_cases', parseInt(e.target.value) || 0)}
                className="border border-gray-300 rounded px-2 py-1 w-16 text-center"
              />
              件
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-red-600 font-bold">月間計画稼働日数</span>
              <input
                type="number" min={0}
                value={plan?.plan_working_days || ''}
                onChange={e => updatePlan('plan_working_days', parseInt(e.target.value) || 0)}
                className="border border-gray-300 rounded px-2 py-1 w-16 text-center"
              />
              日
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
