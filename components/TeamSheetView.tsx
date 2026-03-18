'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep, Team, DailyRecord } from '@/lib/supabase'
import { round1 } from '@/lib/calcUtils'

type Props = { yearMonth: string; teams: Team[] }

type RawRepData = {
  rep: SalesRep
  records: DailyRecord[]
  planCases: number
  planWorkingDays: number
  schedWorkingDays: string[]
}

type RepRow = {
  rep: SalesRep
  planCases: number
  planWorkDays: number
  acquisitions: number
  forecastAcquisitions: number
  achievementRate: number
  forecastRate: number
  productivity: number
  actualWorkingDays: number
  remainingWorkingDays: number
}

function getWeeks(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const weeks: { label: string; start: string; end: string; days: number }[] = []
  let day = 1, wNum = 1
  while (day <= daysInMonth) {
    const end = Math.min(day + 6, daysInMonth)
    weeks.push({
      label: `第${wNum}週`,
      start: `${yearMonth}-${String(day).padStart(2, '0')}`,
      end: `${yearMonth}-${String(end).padStart(2, '0')}`,
      days: end - day + 1,
    })
    day += 7; wNum++
  }
  return weeks
}

function calcRepRow(raw: RawRepData, weekFilter?: { start: string; end: string; days: number }, monthDays?: number): RepRow {
  const today = new Date().toISOString().split('T')[0]
  const records = weekFilter
    ? raw.records.filter(r => r.record_date >= weekFilter.start && r.record_date <= weekFilter.end)
    : raw.records

  const acquisitions = records.reduce((s, r) => s + (r.acquisitions || 0), 0)
  const actualWorkingDays = records.filter(r => r.attendance_status === '稼働').length

  // Planned working days for this period
  let planWorkDays: number
  let planCases: number
  if (weekFilter && monthDays) {
    const ratio = weekFilter.days / monthDays
    planCases = raw.planCases * ratio
    // Use schedule days in this week if available
    const weekSchedDays = raw.schedWorkingDays.filter(d => d >= weekFilter.start && d <= weekFilter.end)
    planWorkDays = weekSchedDays.length > 0
      ? weekSchedDays.length
      : raw.planWorkingDays * ratio
    // Remaining = future schedule days in this week
    const remainingWorkingDays = weekSchedDays.filter(d => d >= today).length ||
      records.filter(r => r.record_date >= today && r.work_status === '稼働').length
    const productivity = actualWorkingDays > 0 ? acquisitions / actualWorkingDays : 0
    const forecastAcquisitions = acquisitions + productivity * remainingWorkingDays
    return {
      rep: raw.rep,
      planCases,
      planWorkDays,
      acquisitions,
      forecastAcquisitions,
      achievementRate: planCases > 0 ? acquisitions / planCases : 0,
      forecastRate: planCases > 0 ? forecastAcquisitions / planCases : 0,
      productivity,
      actualWorkingDays,
      remainingWorkingDays,
    }
  } else {
    planCases = raw.planCases
    planWorkDays = raw.planWorkingDays
    const futureSched = raw.schedWorkingDays.filter(d => d >= today)
    const remainingWorkingDays = futureSched.length > 0
      ? futureSched.length
      : raw.records.filter(r => r.record_date >= today && r.work_status === '稼働').length
    const productivity = actualWorkingDays > 0 ? acquisitions / actualWorkingDays : 0
    const forecastAcquisitions = acquisitions + productivity * remainingWorkingDays
    return {
      rep: raw.rep,
      planCases,
      planWorkDays,
      acquisitions,
      forecastAcquisitions,
      achievementRate: planCases > 0 ? acquisitions / planCases : 0,
      forecastRate: planCases > 0 ? forecastAcquisitions / planCases : 0,
      productivity,
      actualWorkingDays,
      remainingWorkingDays,
    }
  }
}

export default function TeamSheetView({ yearMonth, teams }: Props) {
  const [rawData, setRawData] = useState<RawRepData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState<string | '__all__'>('__all__')
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [selectedWeek, setSelectedWeek] = useState(0)

  const weeks = getWeeks(yearMonth)
  const [y, m] = yearMonth.split('-').map(Number)
  const monthDays = new Date(y, m, 0).getDate()

  useEffect(() => {
    load()
    // Ensure selectedWeek is valid
    if (selectedWeek >= weeks.length) setSelectedWeek(0)
  }, [yearMonth])

  async function load() {
    setLoading(true)
    const [yStr, mStr] = yearMonth.split('-')
    const [{ data: reps }, { data: records }, { data: plans }, schedRes] = await Promise.all([
      supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
      supabase.from('daily_records').select('*')
        .gte('record_date', `${yStr}-${mStr}-01`)
        .lte('record_date', `${yStr}-${mStr}-31`),
      supabase.from('monthly_plans').select('*').eq('year_month', yearMonth),
      fetch(`/api/schedule?yearMonth=${yearMonth}`).then(r => r.json()).catch(() => null),
    ])
    if (!reps) { setLoading(false); return }
    const scheduleMap: Record<string, string[]> = schedRes?.schedule || {}
    const raw: RawRepData[] = reps.map(rep => ({
      rep,
      records: (records || []).filter(r => r.sales_rep_id === rep.id),
      planCases: (plans || []).find(p => p.sales_rep_id === rep.id)?.plan_cases || 0,
      planWorkingDays: (plans || []).find(p => p.sales_rep_id === rep.id)?.plan_working_days || 0,
      schedWorkingDays: scheduleMap[rep.name] || [],
    }))
    setRawData(raw)
    setLoading(false)
  }

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  // Filter by team
  const filteredRaw = selectedTeamId === '__all__'
    ? rawData
    : rawData.filter(d => d.rep.team_id === selectedTeamId)

  // Compute rows
  const weekFilter = viewMode === 'week' ? weeks[selectedWeek] : undefined
  const rows: RepRow[] = filteredRaw.map(raw =>
    calcRepRow(raw, weekFilter, weekFilter ? monthDays : undefined)
  )

  // Team totals
  const totalAcq = rows.reduce((s, r) => s + r.acquisitions, 0)
  const totalPlan = rows.reduce((s, r) => s + r.planCases, 0)
  const totalForecast = rows.reduce((s, r) => s + r.forecastAcquisitions, 0)
  const totalActualDays = rows.reduce((s, r) => s + r.actualWorkingDays, 0)
  const totalPlanDays = rows.reduce((s, r) => s + r.planWorkDays, 0)
  const totalRemaining = rows.reduce((s, r) => s + r.remainingWorkingDays, 0)
  const totalProductivity = totalActualDays > 0 ? totalAcq / totalActualDays : 0
  const totalAchRate = totalPlan > 0 ? totalAcq / totalPlan : 0
  const totalForecastRate = totalPlan > 0 ? totalForecast / totalPlan : 0

  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`
  const fmtNum = (v: number) => v % 1 === 0 ? String(Math.round(v)) : round1(v)

  const rateColor = (r: number) => r >= 1 ? 'text-emerald-600' : r >= 0.8 ? 'text-amber-600' : 'text-red-500'
  const forecastColor = (r: number) => r >= 1 ? 'bg-emerald-50' : r >= 0.8 ? 'bg-amber-50' : 'bg-red-50'

  const selectedTeam = teams.find(t => t.id === selectedTeamId)

  return (
    <div className="space-y-3">
      {/* Header: チーム現状/目標 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`rounded-xl px-4 py-2 text-white font-bold ${totalAcq >= totalPlan && totalPlan > 0 ? 'bg-emerald-500' : 'bg-slate-700'}`}>
          <span className="text-xs opacity-70">
            {selectedTeamId === '__all__' ? '全体' : (selectedTeam?.name ?? '')}
          </span>
          <div className="text-xl font-black leading-tight">
            {totalAcq}<span className="text-xs font-normal opacity-70 ml-0.5">件</span>
            <span className="text-sm font-normal opacity-60 mx-1">/</span>
            {fmtNum(totalPlan)}<span className="text-xs font-normal opacity-70 ml-0.5">件目標</span>
          </div>
          {totalPlan > 0 && (
            <div className="text-xs opacity-70">達成率 {fmtPct(totalAchRate)}</div>
          )}
        </div>

        {/* Team tabs */}
        <div className="flex gap-1 flex-wrap flex-1">
          <button
            onClick={() => setSelectedTeamId('__all__')}
            className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${
              selectedTeamId === '__all__' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }`}
          >全体</button>
          {teams.map(t => (
            <button key={t.id}
              onClick={() => setSelectedTeamId(t.id)}
              className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${
                selectedTeamId === t.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            >{t.name}</button>
          ))}
        </div>

        {/* Month/Week toggle */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setViewMode('month')}
            className={`text-xs px-4 py-1.5 rounded-lg font-bold transition-colors ${viewMode === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >月</button>
          <button
            onClick={() => setViewMode('week')}
            className={`text-xs px-4 py-1.5 rounded-lg font-bold transition-colors ${viewMode === 'week' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >週</button>
        </div>
      </div>

      {/* Week selector */}
      {viewMode === 'week' && (
        <div className="flex gap-1 flex-wrap">
          {weeks.map((w, i) => (
            <button key={i}
              onClick={() => setSelectedWeek(i)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${
                selectedWeek === i ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            >
              {w.label}
              <span className="opacity-60 ml-1 font-normal">
                ({w.start.slice(5).replace('-', '/')}〜{w.end.slice(5).replace('-', '/')})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="sheet-table min-w-[680px] w-full">
          <thead>
            <tr>
              <th className="bg-gray-200 text-left px-2 sticky left-0 z-10" style={{ minWidth: 80 }}>担当者</th>
              <th className="header-orange">目標件数</th>
              <th className="header-blue">現状件数</th>
              <th className="header-red">予実</th>
              <th className="header-red">達成率</th>
              <th className="header-green">生産性</th>
              <th className="bg-purple-100 text-purple-700 text-xs font-bold py-1 px-1 text-center">計画稼働</th>
              <th className="bg-purple-100 text-purple-700 text-xs font-bold py-1 px-1 text-center">実稼働</th>
              <th className="bg-purple-100 text-purple-700 text-xs font-bold py-1 px-1 text-center">残稼働</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasData = row.planCases > 0 || row.acquisitions > 0
              return (
                <tr key={row.rep.id} className={!hasData ? 'opacity-40' : ''}>
                  <td className="text-left px-2 font-medium bg-gray-50 whitespace-nowrap sticky left-0 z-10">
                    {row.rep.name}
                  </td>
                  <td>{fmtNum(row.planCases)}</td>
                  <td className="font-bold text-slate-800">{row.acquisitions}</td>
                  <td className={`font-bold ${rateColor(row.forecastRate)}`}>
                    {row.planCases > 0 ? fmtPct(row.forecastRate) : '—'}
                  </td>
                  <td className={`font-bold ${rateColor(row.achievementRate)}`}>
                    {row.planCases > 0 ? fmtPct(row.achievementRate) : '—'}
                  </td>
                  <td className="text-blue-700 font-bold">{round1(row.productivity)}</td>
                  <td className="text-purple-700">{fmtNum(row.planWorkDays)}</td>
                  <td className="text-purple-700">{row.actualWorkingDays}</td>
                  <td className="text-purple-700">{row.remainingWorkingDays}</td>
                </tr>
              )
            })}
            {/* Totals row */}
            <tr className={`border-t-2 border-slate-400 font-bold ${forecastColor(totalForecastRate)}`}>
              <td className="text-left px-2 bg-yellow-100 sticky left-0 z-10">合計</td>
              <td>{fmtNum(totalPlan)}</td>
              <td className="text-slate-800">{totalAcq}</td>
              <td className={rateColor(totalForecastRate)}>{totalPlan > 0 ? fmtPct(totalForecastRate) : '—'}</td>
              <td className={rateColor(totalAchRate)}>{totalPlan > 0 ? fmtPct(totalAchRate) : '—'}</td>
              <td className="text-blue-700">{round1(totalProductivity)}</td>
              <td className="text-purple-700">{fmtNum(totalPlanDays)}</td>
              <td className="text-purple-700">{totalActualDays}</td>
              <td className="text-purple-700">{totalRemaining}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
