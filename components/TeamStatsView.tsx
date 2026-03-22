'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep, Team, DailyRecord } from '@/lib/supabase'
import { round1 } from '@/lib/calcUtils'

type Props = { yearMonth: string; teams: Team[] }

type RawRepData = {
  rep: SalesRep
  records: DailyRecord[]
  workSchedules: { date: string; work_status: string }[]
  planCases: number
}

// 曜日表示順: 月火水木金土日
const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // JS getDay() の値

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

export default function TeamStatsView({ yearMonth, teams }: Props) {
  const [rawData, setRawData] = useState<RawRepData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState<string | '__all__'>('__all__')
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [selectedWeek, setSelectedWeek] = useState(0)

  const weeks = getWeeks(yearMonth)
  const [, mStr] = yearMonth.split('-')
  const monthDays = new Date(Number(yearMonth.split('-')[0]), Number(mStr), 0).getDate()

  useEffect(() => {
    load()
    if (selectedWeek >= weeks.length) setSelectedWeek(0)
  }, [yearMonth])

  async function load() {
    setLoading(true)
    const [yStr, mStr] = yearMonth.split('-')
    const dateFrom = `${yStr}-${mStr}-01`
    const dateTo = `${yStr}-${mStr}-31`

    const [{ data: reps }, { data: records }, { data: schedules }, { data: plans }] = await Promise.all([
      supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
      supabase.from('daily_records').select('*').gte('record_date', dateFrom).lte('record_date', dateTo),
      supabase.from('work_schedules').select('sales_rep_id,schedule_date,work_status')
        .gte('schedule_date', dateFrom).lte('schedule_date', dateTo),
      supabase.from('monthly_plans').select('*').eq('year_month', yearMonth),
    ])

    if (!reps) { setLoading(false); return }

    const raw: RawRepData[] = reps.map(rep => {
      const plan = (plans || []).find(p => p.sales_rep_id === rep.id)
      return {
        rep,
        records: (records || []).filter(r => r.sales_rep_id === rep.id),
        workSchedules: (schedules || [])
          .filter(s => s.sales_rep_id === rep.id)
          .map(s => ({ date: s.schedule_date, work_status: s.work_status })),
        planCases: plan ? (Number(plan.plan_cases) || 0) : 0,
      }
    })

    setRawData(raw)
    setLoading(false)
  }

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  const filteredRaw = selectedTeamId === '__all__'
    ? rawData
    : rawData.filter(d => d.rep.team_id === selectedTeamId)

  const weekFilter = viewMode === 'week' ? weeks[selectedWeek] : undefined

  function filterRecords(records: DailyRecord[]) {
    if (!weekFilter) return records
    return records.filter(r => r.record_date >= weekFilter.start && r.record_date <= weekFilter.end)
  }

  function filterSchedules(schedules: { date: string; work_status: string }[]) {
    if (!weekFilter) return schedules
    return schedules.filter(s => s.date >= weekFilter.start && s.date <= weekFilter.end)
  }

  // ━━━ 週間サマリー（常に月全体） ━━━
  const weeklySummary = weeks.map(week => ({
    label: week.label,
    range: `${week.start.slice(5).replace('-', '/')}〜${week.end.slice(5).replace('-', '/')}`,
    acquisitions: filteredRaw
      .flatMap(d => d.records)
      .filter(r => r.record_date >= week.start && r.record_date <= week.end)
      .reduce((s, r) => s + (Number(r.acquisitions) || 0), 0),
  }))

  // ━━━ 上段テーブル: 担当者別集計 ━━━
  type RepStat = {
    rep: SalesRep
    visits: number
    netMeetings: number
    ownerMeetings: number
    negotiations: number
    acquisitions: number
    actualWorkingDays: number
    productivity: number
    planCases: number
    achievementRate: number  // acquisitions / planCases (0 if planCases=0)
    rank: number
  }

  const repStats: RepStat[] = filteredRaw.map(raw => {
    const records = filterRecords(raw.records)
    const visits = records.reduce((s, r) => s + (Number(r.visits) || 0), 0)
    const netMeetings = records.reduce((s, r) => s + (Number(r.net_meetings) || 0), 0)
    const ownerMeetings = records.reduce((s, r) => s + (Number(r.owner_meetings) || 0), 0)
    const negotiations = records.reduce((s, r) => s + (Number(r.negotiations) || 0), 0)
    const acquisitions = records.reduce((s, r) => s + (Number(r.acquisitions) || 0), 0)
    const actualWorkingDays = records.filter(
      r => r.attendance_status === '稼働' || r.work_status === '稼働'
    ).length
    const productivity = actualWorkingDays > 0 ? acquisitions / actualWorkingDays : 0

    // 目標件数: 週次モードは按分
    const planCases = weekFilter
      ? raw.planCases * (weekFilter.days / monthDays)
      : raw.planCases
    const achievementRate = planCases > 0 ? acquisitions / planCases : 0

    return { rep: raw.rep, visits, netMeetings, ownerMeetings, negotiations, acquisitions, actualWorkingDays, productivity, planCases, achievementRate, rank: 0 }
  })

  // 獲得件数の降順でランク付け
  const sorted = [...repStats].sort((a, b) => b.acquisitions - a.acquisitions)
  let rankCounter = 1
  sorted.forEach((s, i) => {
    if (i > 0 && s.acquisitions < sorted[i - 1].acquisitions) rankCounter = i + 1
    s.rank = rankCounter
  })
  repStats.forEach(s => {
    const ranked = sorted.find(r => r.rep.id === s.rep.id)
    if (ranked) s.rank = ranked.rank
  })

  const totalVisits = repStats.reduce((s, r) => s + r.visits, 0)
  const totalNetMeetings = repStats.reduce((s, r) => s + r.netMeetings, 0)
  const totalOwnerMeetings = repStats.reduce((s, r) => s + r.ownerMeetings, 0)
  const totalNegotiations = repStats.reduce((s, r) => s + r.negotiations, 0)
  const totalAcquisitions = repStats.reduce((s, r) => s + r.acquisitions, 0)
  const totalActualDays = repStats.reduce((s, r) => s + r.actualWorkingDays, 0)
  const totalProductivity = totalActualDays > 0 ? totalAcquisitions / totalActualDays : 0
  const totalPlanCases = repStats.reduce((s, r) => s + r.planCases, 0)
  const totalAchievementRate = totalPlanCases > 0 ? totalAcquisitions / totalPlanCases : 0

  // ━━━ 下段テーブル: 曜日別集計 ━━━
  type DayStats = {
    plannedWork: number
    actualWork: number
    visits: number
    netMeetings: number
    ownerMeetings: number
    negotiations: number
    acquisitions: number
  }

  const dayStats: Record<number, DayStats> = {}
  for (const dow of DAY_ORDER) {
    dayStats[dow] = { plannedWork: 0, actualWork: 0, visits: 0, netMeetings: 0, ownerMeetings: 0, negotiations: 0, acquisitions: 0 }
  }

  for (const raw of filteredRaw) {
    const records = filterRecords(raw.records)
    for (const r of records) {
      const localDate = new Date(r.record_date + 'T00:00:00')
      const dow = localDate.getDay()
      dayStats[dow].visits += Number(r.visits) || 0
      dayStats[dow].netMeetings += Number(r.net_meetings) || 0
      dayStats[dow].ownerMeetings += Number(r.owner_meetings) || 0
      dayStats[dow].negotiations += Number(r.negotiations) || 0
      dayStats[dow].acquisitions += Number(r.acquisitions) || 0
      if (r.attendance_status === '稼働' || r.work_status === '稼働') {
        dayStats[dow].actualWork++
      }
    }

    const schedules = filterSchedules(raw.workSchedules)
    for (const s of schedules) {
      if (s.work_status === '稼働') {
        const localDate = new Date(s.date + 'T00:00:00')
        const dow = localDate.getDay()
        dayStats[dow].plannedWork++
      }
    }
  }

  const totalPlannedWork = DAY_ORDER.reduce((s, dow) => s + dayStats[dow].plannedWork, 0)
  const totalActualWork = DAY_ORDER.reduce((s, dow) => s + dayStats[dow].actualWork, 0)
  const totalDayVisits = DAY_ORDER.reduce((s, dow) => s + dayStats[dow].visits, 0)
  const totalDayNet = DAY_ORDER.reduce((s, dow) => s + dayStats[dow].netMeetings, 0)
  const totalDayOwner = DAY_ORDER.reduce((s, dow) => s + dayStats[dow].ownerMeetings, 0)
  const totalDayNego = DAY_ORDER.reduce((s, dow) => s + dayStats[dow].negotiations, 0)
  const totalDayAcq = DAY_ORDER.reduce((s, dow) => s + dayStats[dow].acquisitions, 0)
  const totalDayProductivity = totalActualWork > 0 ? totalDayAcq / totalActualWork : 0

  const dash = <span className="text-slate-300">—</span>

  function achievementColor(rate: number) {
    if (rate >= 1) return 'text-emerald-600'
    if (rate >= 0.8) return 'text-amber-600'
    return 'text-red-500'
  }

  function fmtRate(rate: number) {
    return `${Math.round(rate * 100)}%`
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー: チームタブ + 月/週トグル */}
      <div className="flex items-center gap-3 flex-wrap">
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

      {/* 週選択 */}
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

      {/* 週間サマリー */}
      <div>
        <div className="text-xs font-bold text-slate-500 mb-2 px-1">週間獲得件数サマリー</div>
        <div className="flex gap-2 flex-wrap">
          {weeklySummary.map((w, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-center min-w-[100px] shadow-sm">
              <div className="text-xs font-bold text-slate-500">{w.label}</div>
              <div className="text-xs text-slate-400 mb-1">{w.range}</div>
              <div className="text-2xl font-bold text-slate-800">{w.acquisitions}</div>
              <div className="text-xs text-slate-400">件</div>
            </div>
          ))}
        </div>
      </div>

      {/* 上段テーブル: 担当者別集計 */}
      <div>
        <div className="text-xs font-bold text-slate-500 mb-1 px-1">担当者別集計</div>
        <div className="overflow-x-auto">
          <table className="sheet-table min-w-[680px] w-full">
            <thead>
              <tr>
                <th className="bg-gray-200 text-left px-2 sticky left-0 z-10" style={{ minWidth: 80 }}>担当者</th>
                <th className="header-orange border-l-[3px] border-l-slate-400">目標件数</th>
                <th className="header-orange">獲得件数</th>
                <th className="header-orange">達成率</th>
                <th className="header-blue border-l-[3px] border-l-slate-400">訪問数</th>
                <th className="header-blue">対面数</th>
                <th className="header-blue">主権対面</th>
                <th className="header-blue">商談数</th>
                <th className="header-green border-l-[3px] border-l-slate-400">生産性</th>
                <th className="bg-gray-100 text-gray-600 text-xs font-bold py-1 px-1 text-center border-l-[3px] border-l-slate-400">順位</th>
              </tr>
            </thead>
            <tbody>
              {repStats.map(row => (
                <tr key={row.rep.id} className={row.visits === 0 && row.acquisitions === 0 ? 'opacity-40' : ''}>
                  <td className="text-left px-2 font-medium bg-gray-50 whitespace-nowrap sticky left-0 z-10">
                    {row.rep.name}
                  </td>
                  <td className="bg-orange-50 text-slate-600 border-l-[3px] border-l-slate-400">{row.planCases > 0 ? Math.round(row.planCases * 10) / 10 : dash}</td>
                  <td className="bg-orange-50 font-bold text-slate-800">{row.acquisitions > 0 ? row.acquisitions : dash}</td>
                  <td className={`bg-orange-50 font-bold ${row.planCases > 0 ? achievementColor(row.achievementRate) : 'text-slate-300'}`}>
                    {row.planCases > 0 ? fmtRate(row.achievementRate) : dash}
                  </td>
                  <td className="bg-blue-50 border-l-[3px] border-l-slate-400">{row.visits > 0 ? row.visits : dash}</td>
                  <td className="bg-blue-50">{row.netMeetings > 0 ? row.netMeetings : dash}</td>
                  <td className="bg-blue-50">{row.ownerMeetings > 0 ? row.ownerMeetings : dash}</td>
                  <td className="bg-blue-50">{row.negotiations > 0 ? row.negotiations : dash}</td>
                  <td className="bg-green-50 text-blue-700 font-bold border-l-[3px] border-l-slate-400">{row.productivity > 0 ? round1(row.productivity) : dash}</td>
                  <td className="text-gray-600 font-bold border-l-[3px] border-l-slate-400">{row.acquisitions > 0 ? `${row.rank}位` : dash}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-400 font-bold bg-yellow-50">
                <td className="text-left px-2 bg-yellow-100 sticky left-0 z-10">合計</td>
                <td className="text-slate-600 border-l-[3px] border-l-slate-400">{totalPlanCases > 0 ? Math.round(totalPlanCases * 10) / 10 : dash}</td>
                <td className="text-slate-800">{totalAcquisitions > 0 ? totalAcquisitions : dash}</td>
                <td className={`font-bold ${totalPlanCases > 0 ? achievementColor(totalAchievementRate) : ''}`}>
                  {totalPlanCases > 0 ? fmtRate(totalAchievementRate) : dash}
                </td>
                <td className="border-l-[3px] border-l-slate-400">{totalVisits > 0 ? totalVisits : dash}</td>
                <td>{totalNetMeetings > 0 ? totalNetMeetings : dash}</td>
                <td>{totalOwnerMeetings > 0 ? totalOwnerMeetings : dash}</td>
                <td>{totalNegotiations > 0 ? totalNegotiations : dash}</td>
                <td className="text-blue-700 border-l-[3px] border-l-slate-400">{totalProductivity > 0 ? round1(totalProductivity) : dash}</td>
                <td className="border-l-[3px] border-l-slate-400">{dash}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 下段テーブル: 曜日別集計 */}
      <div>
        <div className="text-xs font-bold text-slate-500 mb-1 px-1">曜日別集計</div>
        <div className="overflow-x-auto">
          <table className="sheet-table min-w-[480px] w-full">
            <thead>
              <tr>
                <th className="bg-gray-200 text-left px-2 sticky left-0 z-10" style={{ minWidth: 88 }}>項目</th>
                {DAY_LABELS.map(l => (
                  <th key={l} className={`text-xs font-bold py-1 px-1 text-center ${
                    l === '土' ? 'bg-blue-50 text-blue-600' : l === '日' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
                  }`}>{l}</th>
                ))}
                <th className="bg-slate-200 text-slate-700 text-xs font-bold py-1 px-1 text-center">計</th>
              </tr>
            </thead>
            <tbody>
              {([
                { label: '計画稼働', key: 'plannedWork' as const, total: totalPlannedWork, cls: 'text-purple-600' },
                { label: '実稼働',   key: 'actualWork'  as const, total: totalActualWork,  cls: 'text-purple-600' },
                { label: '訪問数',   key: 'visits'      as const, total: totalDayVisits,   cls: '' },
                { label: '対面数',   key: 'netMeetings' as const, total: totalDayNet,      cls: '' },
                { label: '主権対面数', key: 'ownerMeetings' as const, total: totalDayOwner, cls: '' },
                { label: '商談数',   key: 'negotiations' as const, total: totalDayNego,   cls: '' },
                { label: '獲得件数', key: 'acquisitions' as const, total: totalDayAcq,    cls: 'font-bold text-slate-800' },
              ] as const).map(row => (
                <tr key={row.label}>
                  <td className="text-left px-2 bg-gray-50 sticky left-0 z-10 font-medium text-xs">{row.label}</td>
                  {DAY_ORDER.map(dow => {
                    const v = dayStats[dow][row.key]
                    return <td key={dow} className={row.cls}>{v > 0 ? v : dash}</td>
                  })}
                  <td className={`font-bold ${row.cls}`}>{row.total > 0 ? row.total : dash}</td>
                </tr>
              ))}
              <tr>
                <td className="text-left px-2 bg-gray-50 sticky left-0 z-10 font-medium text-xs">生産性</td>
                {DAY_ORDER.map(dow => {
                  const ds = dayStats[dow]
                  const prod = ds.actualWork > 0 ? ds.acquisitions / ds.actualWork : 0
                  return <td key={dow} className="text-blue-700 font-bold">{prod > 0 ? round1(prod) : dash}</td>
                })}
                <td className="text-blue-700 font-bold">{totalDayProductivity > 0 ? round1(totalDayProductivity) : dash}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
