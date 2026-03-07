'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase, DailyRecord, MonthlyPlan } from '@/lib/supabase'
import { getDaysArray } from '@/lib/dateUtils'
import { calcProgress } from '@/lib/calcUtils'

const WORK_STATUSES = ['稼働', '休日', '同行', '有休', '研修', '出張']
const HOURS = [3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10]

type Props = { repId: string; repName: string; yearMonth: string }

export default function SheetView({ repId, repName, yearMonth }: Props) {
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [records, setRecords] = useState<Record<string, DailyRecord>>({})
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const repIdRef = useRef(repId)
  const yearMonthRef = useRef(yearMonth)
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const localRef = useRef<Record<string, DailyRecord>>({})

  const days = getDaysArray(yearMonth)

  useEffect(() => {
    repIdRef.current = repId
    yearMonthRef.current = yearMonth
    Object.values(timerRef.current).forEach(clearTimeout)
    timerRef.current = {}
    localRef.current = {}
    setRecords({})
    setPlan(null)
    setStatusMsg('')
    setErrorMsg('')
    load()
  }, [repId, yearMonth])

  async function load() {
    const rid = repIdRef.current
    const ym = yearMonthRef.current
    const [y, m] = ym.split('-')

    const [{ data: planData }, { data: recData }] = await Promise.all([
      supabase.from('monthly_plans').select('*')
        .eq('sales_rep_id', rid).eq('year_month', ym).single(),
      supabase.from('daily_records').select('*')
        .eq('sales_rep_id', rid)
        .gte('record_date', `${y}-${m}-01`)
        .lte('record_date', `${y}-${m}-31`)
    ])

    if (repIdRef.current !== rid) return

    setPlan(planData || { id:'', sales_rep_id:rid, year_month:ym, plan_cases:0, plan_working_days:0, updated_at:'' })

    const map: Record<string, DailyRecord> = {}
    recData?.forEach(r => { map[r.record_date] = r })
    localRef.current = map
    setRecords({ ...map })
  }

  function getRow(dateStr: string): DailyRecord {
    return localRef.current[dateStr] || {
      id: '', sales_rep_id: repId, record_date: dateStr,
      acquired_cases: 0, work_status: '', attendance_status: '',
      working_hours: 0, visits: 0, net_meetings: 0,
      owner_meetings: 0, negotiations: 0, acquisitions: 0, updated_at: ''
    }
  }

  function handleChange(dateStr: string, field: keyof DailyRecord, raw: string) {
    const isNum = ['working_hours','visits','net_meetings','owner_meetings','negotiations','acquisitions','acquired_cases'].includes(field)
    const value = isNum ? (parseFloat(raw) || 0) : raw

    const updated = { ...getRow(dateStr), [field]: value }
    localRef.current[dateStr] = updated
    setRecords(prev => ({ ...prev, [dateStr]: updated }))
    setErrorMsg('')
    setStatusMsg('保存中...')

    if (timerRef.current[dateStr]) clearTimeout(timerRef.current[dateStr])
    timerRef.current[dateStr] = setTimeout(() => flushRow(dateStr), 600)
  }

  async function flushRow(dateStr: string) {
    const rid = repIdRef.current
    const row = localRef.current[dateStr]
    if (!row) return

    const payload = {
      sales_rep_id: rid,
      record_date: dateStr,
      work_status: row.work_status || '',
      attendance_status: row.attendance_status || '',
      working_hours: Number(row.working_hours) || 0,
      visits: Number(row.visits) || 0,
      net_meetings: Number(row.net_meetings) || 0,
      owner_meetings: Number(row.owner_meetings) || 0,
      negotiations: Number(row.negotiations) || 0,
      acquisitions: Number(row.acquisitions) || 0,
      acquired_cases: Number(row.acquired_cases) || 0,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('daily_records')
      .upsert(payload, { onConflict: 'sales_rep_id,record_date' })
      .select()
      .single()

    if (error) {
      setErrorMsg(`保存エラー: ${error.message} (code: ${error.code})`)
      setStatusMsg('')
      return
    }
    if (data) {
      localRef.current[dateStr] = data
      setRecords(prev => ({ ...prev, [dateStr]: data }))
    }
    setStatusMsg('✓ 保存しました')
    setTimeout(() => setStatusMsg(''), 2000)
  }

  async function updatePlan(field: 'plan_cases' | 'plan_working_days', value: number) {
    const newPlan = { ...(plan||{}), sales_rep_id: repId, year_month: yearMonth, [field]: value } as MonthlyPlan
    setPlan(newPlan)
    setStatusMsg('保存中...')
    const { error } = await supabase.from('monthly_plans')
      .upsert({ ...newPlan, updated_at: new Date().toISOString() }, { onConflict: 'sales_rep_id,year_month' })
    if (error) { setErrorMsg(`計画保存エラー: ${error.message}`); return }
    setStatusMsg('✓ 保存しました')
    setTimeout(() => setStatusMsg(''), 2000)
  }

  const allRecs = days.map(d => records[d.dateStr] || getRow(d.dateStr))
  const workingRecs = allRecs.filter(r => r.attendance_status === '稼働' || r.work_status === '稼働')
  const totals = {
    workingDays:   workingRecs.length,
    workingHours:  allRecs.reduce((s,r) => s+(Number(r.working_hours)||0), 0),
    visits:        allRecs.reduce((s,r) => s+(Number(r.visits)||0), 0),
    netMeetings:   allRecs.reduce((s,r) => s+(Number(r.net_meetings)||0), 0),
    ownerMeetings: allRecs.reduce((s,r) => s+(Number(r.owner_meetings)||0), 0),
    negotiations:  allRecs.reduce((s,r) => s+(Number(r.negotiations)||0), 0),
    acquisitions:  allRecs.reduce((s,r) => s+(Number(r.acquisitions)||0), 0),
  }

  let cumAcq = 0

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-xs">
        <span className="font-bold text-gray-700">{repName}</span>
        {statusMsg && <span className={statusMsg.startsWith('✓') ? 'text-green-600' : 'text-blue-500'}>{statusMsg}</span>}
      </div>
      {errorMsg && (
        <div className="mb-2 p-2 bg-red-100 border border-red-400 rounded text-xs text-red-700 font-bold">
          ⚠️ {errorMsg}
          <div className="mt-1 font-normal text-red-600">
            Supabaseダッシュボードで「SQL Editor」から下記を実行してください:<br/>
            <code className="bg-red-50 px-1">DROP POLICY IF EXISTS "Allow all" ON daily_records; CREATE POLICY "Allow all" ON daily_records FOR ALL USING (true) WITH CHECK (true);</code>
          </div>
        </div>
      )}

      <div className="table-scroll bg-white rounded shadow">
        <table className="sheet-table">
          <thead>
            <tr>
              <th colSpan={2} className="header-yellow">自動反映<br/><span className="text-xs font-normal">入力禁止</span></th>
              <th className="header-pink">①<br/><small>月初入力</small></th>
              <th className="header-yellow" colSpan={2}>①②<br/><small>入力禁止</small></th>
              <th className="header-pink">②<br/><small>月初入力</small></th>
              <th className="header-red">③</th>
              <th className="header-red">④</th>
              <th colSpan={5} className="header-red" style={{borderLeft:'2px solid #333'}}><div className="text-xs">1日</div></th>
              <th className="bg-gray-100">使用</th>
            </tr>
            <tr className="sticky-header">
              <th className="bg-gray-200">日付</th>
              <th className="bg-gray-200">曜日</th>
              <th className="header-pink" style={{minWidth:50}}>計画<br/>件数</th>
              <th className="header-yellow" style={{minWidth:50}}>獲得<br/>件数</th>
              <th className="header-yellow" style={{minWidth:40}}>進捗</th>
              <th className="header-blue" style={{minWidth:50}}>計画<br/>稼働</th>
              <th className="header-red" style={{minWidth:60}}>出勤<br/>状態</th>
              <th className="header-red" style={{minWidth:50}}>稼働<br/>時間</th>
              <th className="header-red" style={{minWidth:50,borderLeft:'2px solid #333'}}>訪問</th>
              <th className="header-red" style={{minWidth:50}}>ネット<br/>対面</th>
              <th className="header-red" style={{minWidth:50}}>主権<br/>対面</th>
              <th className="header-red" style={{minWidth:40}}>商談</th>
              <th className="header-red" style={{minWidth:40}}>獲得</th>
              <th className="bg-gray-100" style={{minWidth:30}}></th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, idx) => {
              const rec = records[d.dateStr] || getRow(d.dateStr)
              const isWorking = rec.attendance_status === '稼働' || rec.work_status === '稼働'
              if (isWorking) cumAcq += Number(rec.acquisitions) || 0
              const progress = calcProgress(idx, days.length, plan?.plan_cases || 0, cumAcq)
              const weekend = d.dow === 0 || d.dow === 6
              const rowCls = d.dow === 0 ? 'row-sunday' : d.dow === 6 ? 'row-saturday' : 'row-weekday'

              return (
                <tr key={d.dateStr} className={rowCls}>
                  <td className={`font-medium ${d.dow===0?'text-red-600':d.dow===6?'text-blue-600':''}`}>{d.day}</td>
                  <td className={d.dow===0?'text-red-600':d.dow===6?'text-blue-600':''}>{d.dowJa}</td>
                  <td className="bg-pink-50 text-xs">
                    {plan?.plan_cases && plan?.plan_working_days ? (plan.plan_cases/plan.plan_working_days).toFixed(2) : ''}
                  </td>
                  <td className="bg-yellow-50">{Number(rec.acquisitions) > 0 ? rec.acquisitions : weekend ? '•' : ''}</td>
                  <td className={progress>0?'progress-positive':progress<0?'progress-negative':'progress-zero'}>
                    {isWorking ? progress : ''}
                  </td>
                  <td className="bg-blue-50">
                    <select value={rec.work_status||''} onChange={e => handleChange(d.dateStr,'work_status',e.target.value)}
                      className="text-xs w-full bg-transparent border-none outline-none cursor-pointer" style={{minWidth:48}}>
                      <option value="">•</option>
                      {WORK_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{background:'#4472c4',color:'white'}}>
                    <select value={rec.attendance_status||''} onChange={e => handleChange(d.dateStr,'attendance_status',e.target.value)}
                      className="text-xs w-full border-none outline-none cursor-pointer bg-transparent text-white" style={{minWidth:48}}>
                      <option value="">•</option>
                      {WORK_STATUSES.map(s=><option key={s} value={s} style={{color:'#000',background:'white'}}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{background:'#4472c4',color:'white'}}>
                    <select value={rec.working_hours||''} onChange={e => handleChange(d.dateStr,'working_hours',e.target.value)}
                      className="text-xs w-full border-none outline-none cursor-pointer bg-transparent text-white">
                      <option value="">-</option>
                      {HOURS.map(h=><option key={h} value={h} style={{color:'#000',background:'white'}}>{h}</option>)}
                    </select>
                  </td>
                  <td style={{borderLeft:'2px solid #333'}}>
                    <input type="number" min={0} value={rec.visits||''} placeholder="0"
                      onChange={e => handleChange(d.dateStr,'visits',e.target.value)} />
                  </td>
                  <td>
                    <input type="number" min={0} value={rec.net_meetings||''} placeholder="0"
                      onChange={e => handleChange(d.dateStr,'net_meetings',e.target.value)} />
                  </td>
                  <td>
                    <input type="number" min={0} value={rec.owner_meetings||''} placeholder="0"
                      onChange={e => handleChange(d.dateStr,'owner_meetings',e.target.value)} />
                  </td>
                  <td>
                    <input type="number" min={0} value={rec.negotiations||''} placeholder="0"
                      onChange={e => handleChange(d.dateStr,'negotiations',e.target.value)} />
                  </td>
                  <td>
                    <input type="number" min={0} value={rec.acquisitions||''} placeholder="0"
                      onChange={e => handleChange(d.dateStr,'acquisitions',e.target.value)} />
                  </td>
                  <td className="bg-gray-50"></td>
                </tr>
              )
            })}
            <tr style={{background:'#e8e8e8',fontWeight:700}}>
              <td colSpan={2}>TTL</td>
              <td>{plan?.plan_cases||0}</td>
              <td>{totals.acquisitions}</td>
              <td className={totals.acquisitions-(plan?.plan_cases||0)>=0?'progress-positive':'progress-negative'}>
                {totals.acquisitions-(plan?.plan_cases||0)}
              </td>
              <td>{plan?.plan_working_days||0}</td>
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

        <div className="mt-4 p-3 bg-white border border-gray-200 rounded">
          <div className="text-xs font-bold text-red-600 mb-2">月初入力（①②）</div>
          <div className="flex gap-4 items-center flex-wrap">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-red-600 font-bold">月間計画件数</span>
              <input type="number" min={0} value={plan?.plan_cases||''}
                onChange={e => updatePlan('plan_cases', parseInt(e.target.value)||0)}
                className="border border-gray-300 rounded px-2 py-1 w-16 text-center" />
              件
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-red-600 font-bold">月間計画稼働日数</span>
              <input type="number" min={0} value={plan?.plan_working_days||''}
                onChange={e => updatePlan('plan_working_days', parseInt(e.target.value)||0)}
                className="border border-gray-300 rounded px-2 py-1 w-16 text-center" />
              日
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
