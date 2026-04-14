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
  // work_schedules: date -> work_status (例: '稼働' | '休日')
  workSchedules: Record<string, string>
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
  remainingWorkingDays: number  // work_schedulesの今日以降の稼働日数
}

function getWeeks(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  // JS: 0=日,1=月,2=火,3=水,4=木,5=金,6=土
  // 1日を含む週の水曜日を求める（1日から何日前か）
  const firstDow = new Date(y, m - 1, 1).getDay()
  const daysToWed = (firstDow - 3 + 7) % 7
  let wedDay = 1 - daysToWed // 負になる場合は前月

  const weeks: { label: string; start: string; end: string; days: number }[] = []
  let wNum = 1
  while (wedDay <= daysInMonth) {
    const monDay = wedDay + 5 // 水曜の5日後が月曜
    const clippedStart = Math.max(wedDay, 1)
    const clippedEnd = Math.min(monDay, daysInMonth)
    if (clippedEnd >= 1) {
      const startStr = `${yearMonth}-${String(clippedStart).padStart(2, '0')}`
      const endStr = `${yearMonth}-${String(clippedEnd).padStart(2, '0')}`
      let days = 0
      for (let d = clippedStart; d <= clippedEnd; d++) {
        if (new Date(y, m - 1, d).getDay() !== 2) days++ // 火曜(2)を除く
      }
      weeks.push({ label: `第${wNum}週`, start: startStr, end: endStr, days })
      wNum++
    }
    wedDay += 7
  }
  return weeks
}

// SheetViewと同じロジックで集計
function calcRepRow(
  raw: RawRepData,
  weekFilter?: { start: string; end: string; days: number },
  monthDays?: number
): RepRow {
  const today = new Date().toISOString().split('T')[0]

  const records = weekFilter
    ? raw.records.filter(r => r.record_date >= weekFilter.start && r.record_date <= weekFilter.end)
    : raw.records

  // 実稼働: SheetViewと同じ条件 (attendance_status OR work_status が '稼働')
  const acquisitions = records.reduce((s, r) => s + (Number(r.acquisitions) || 0), 0)
  const actualWorkingDays = records.filter(
    r => r.attendance_status === '稼働' || r.work_status === '稼働'
  ).length

  const productivity = actualWorkingDays > 0 ? acquisitions / actualWorkingDays : 0

  let planCases: number
  let planWorkDays: number
  let schedRemaining: number  // 着地予想の計算用（未来の予定稼働日）

  if (weekFilter && monthDays) {
    const ratio = weekFilter.days / monthDays
    planCases = raw.planCases * ratio

    // 計画稼働: work_schedulesのその週の稼働日数、なければ按分
    const weekSchedDates = Object.entries(raw.workSchedules)
      .filter(([d, s]) => d >= weekFilter.start && d <= weekFilter.end && s === '稼働')
      .map(([d]) => d)
    planWorkDays = weekSchedDates.length > 0
      ? weekSchedDates.length
      : raw.planWorkingDays * ratio

    // 週間稼働が1以下は0として扱う（生産性・着地予想を計算しない）
    schedRemaining = weekSchedDates.filter(d => d >= today).length
    if (actualWorkingDays <= 1) {
      return {
        rep: raw.rep,
        planCases,
        planWorkDays,
        acquisitions,
        forecastAcquisitions: acquisitions,
        achievementRate: planCases > 0 ? acquisitions / planCases : 0,
        forecastRate: planCases > 0 ? acquisitions / planCases : 0,
        productivity: 0,
        actualWorkingDays: 0,
        remainingWorkingDays: schedRemaining,
      }
    }
  } else {
    planCases = raw.planCases
    planWorkDays = raw.planWorkingDays

    // 残日計算: work_schedulesの未来の稼働日
    schedRemaining = Object.entries(raw.workSchedules)
      .filter(([d, s]) => d >= today && s === '稼働')
      .length
  }

  const forecastAcquisitions = acquisitions + productivity * schedRemaining
  const remainingWorkingDays = schedRemaining

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

export default function TeamSheetView({ yearMonth, teams }: Props) {
  const [rawData, setRawData] = useState<RawRepData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState<string | '__all__'>('__all__')
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [selectedWeek, setSelectedWeek] = useState(0)

  const weeks = getWeeks(yearMonth)
  const [yNum, mNum] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(yNum, mNum, 0).getDate()
  let monthDays = 0
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(yNum, mNum - 1, d).getDay() !== 2) monthDays++ // 火曜(2)を除く
  }

  useEffect(() => {
    load()
    if (selectedWeek >= weeks.length) setSelectedWeek(0)
  }, [yearMonth])

  async function load() {
    setLoading(true)
    const [yStr, mStr] = yearMonth.split('-')
    const lastDay = new Date(parseInt(yStr), parseInt(mStr), 0).getDate()
    const dateFrom = `${yStr}-${mStr}-01`
    const dateTo = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`

    const [{ data: reps }, { data: records }, { data: plans }, { data: schedules }] = await Promise.all([
      supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
      supabase.from('daily_records').select('*').gte('record_date', dateFrom).lte('record_date', dateTo),
      supabase.from('monthly_plans').select('*').eq('year_month', yearMonth),
      supabase.from('work_schedules').select('sales_rep_id,schedule_date,work_status')
        .gte('schedule_date', dateFrom).lte('schedule_date', dateTo),
    ])

    if (!reps) { setLoading(false); return }

    // work_schedules を rep_id → { date: status } に変換
    const schedMap: Record<string, Record<string, string>> = {}
    for (const s of schedules || []) {
      if (!schedMap[s.sales_rep_id]) schedMap[s.sales_rep_id] = {}
      schedMap[s.sales_rep_id][s.schedule_date] = s.work_status
    }

    const raw: RawRepData[] = reps.map(rep => ({
      rep,
      records: (records || []).filter(r => r.sales_rep_id === rep.id),
      planCases: (plans || []).find(p => p.sales_rep_id === rep.id)?.plan_cases || 0,
      planWorkingDays: (plans || []).find(p => p.sales_rep_id === rep.id)?.plan_working_days || 0,
      workSchedules: schedMap[rep.id] || {},
    }))

    setRawData(raw)
    setLoading(false)
  }

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  const filteredRaw = selectedTeamId === '__all__'
    ? rawData
    : rawData.filter(d => d.rep.team_id === selectedTeamId)

  const weekFilter = viewMode === 'week' ? weeks[selectedWeek] : undefined
  const rows: RepRow[] = filteredRaw.map(raw =>
    calcRepRow(raw, weekFilter, weekFilter ? monthDays : undefined)
  )

  const totalAcq = rows.reduce((s, r) => s + r.acquisitions, 0)
  const totalPlan = rows.reduce((s, r) => s + r.planCases, 0)
  const totalForecast = rows.reduce((s, r) => s + r.forecastAcquisitions, 0)
  const totalActualDays = rows.reduce((s, r) => s + r.actualWorkingDays, 0)
  const totalPlanDays = rows.reduce((s, r) => s + r.planWorkDays, 0)
  const totalRemaining = rows.reduce((s, r) => s + r.remainingWorkingDays, 0)
  const totalProductivity = totalActualDays > 0 ? totalAcq / totalActualDays : 0
  const totalAchRate = totalPlan > 0 ? totalAcq / totalPlan : 0
  const totalForecastRate = totalPlan > 0 ? totalForecast / totalPlan : 0

  const n = rows.length || 1
  const avgAcq = totalAcq / n
  const avgPlan = totalPlan / n
  const avgForecast = totalForecast / n
  const avgActualDays = totalActualDays / n
  const avgPlanDays = totalPlanDays / n
  const avgRemaining = totalRemaining / n
  const avgAchRate = totalAchRate
  const avgForecastRate = totalForecastRate

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
              <th className="header-red">着地予想</th>
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
                    {round1(row.forecastAcquisitions)}
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
              <td className={rateColor(totalForecastRate)}>{round1(totalForecast)}</td>
              <td className={rateColor(totalAchRate)}>{totalPlan > 0 ? fmtPct(totalAchRate) : '—'}</td>
              <td className="text-blue-700">{round1(totalProductivity)}</td>
              <td className="text-purple-700">{fmtNum(totalPlanDays)}</td>
              <td className="text-purple-700">{totalActualDays}</td>
              <td className="text-purple-700">{totalRemaining}</td>
            </tr>
            {/* Average row */}
            <tr className="border-t border-slate-300 bg-slate-50 text-slate-500">
              <td className="text-left px-2 font-bold bg-slate-100 sticky left-0 z-10">平均</td>
              <td>{round1(avgPlan)}</td>
              <td className="font-bold text-slate-700">{round1(avgAcq)}</td>
              <td className={rateColor(avgForecastRate)}>{round1(avgForecast)}</td>
              <td className={rateColor(avgAchRate)}>{totalPlan > 0 ? fmtPct(avgAchRate) : '—'}</td>
              <td className="text-blue-600">{round1(totalProductivity)}</td>
              <td className="text-purple-600">{round1(avgPlanDays)}</td>
              <td className="text-purple-600">{round1(avgActualDays)}</td>
              <td className="text-purple-600">{round1(avgRemaining)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
