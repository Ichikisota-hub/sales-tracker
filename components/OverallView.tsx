'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep, Team } from '@/lib/supabase'
import { calcMonthlyStats, round1, MonthlyStats } from '@/lib/calcUtils'

type Props = { yearMonth: string; teams: Team[]; orgIds?: string[] }
type RepStats = { rep: SalesRep; stats: MonthlyStats }

type TeamStats = {
  team: Team | null  // null = 未所属
  members: RepStats[]
  totalAcquisitions: number
  forecastAcquisitions: number
  planCases: number
  actualWorkingDays: number
  productivity: number
  rank: number
}

export default function OverallView({ yearMonth, teams, orgIds }: Props) {
  const [data, setData] = useState<RepStats[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<'name' | 'forecast' | 'acquisitions' | 'productivity'>('forecast')
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'individual' | 'team'>('individual')
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [yearMonth, orgIds?.join(',')])

  async function loadAll() {
    setLoading(true)
    const [y, m] = yearMonth.split('-')
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    const lastDayStr = `${y}-${m}-${String(lastDay).padStart(2, '0')}`

    let reps: any[], allRecords: any[], allPlans: any[], allSchedules: any[]
    if (orgIds && orgIds.length > 1) {
      const res = await fetch(`/api/combined/data?orgIds=${orgIds.join(',')}&yearMonth=${yearMonth}`)
      const d = await res.json()
      reps = d.reps; allRecords = d.records; allPlans = d.plans
      allSchedules = d.schedules.filter((s: any) => s.work_status === '稼働')
    } else {
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
        supabase.from('daily_records').select('*')
          .gte('record_date', `${y}-${m}-01`).lte('record_date', lastDayStr),
        supabase.from('monthly_plans').select('*').eq('year_month', yearMonth),
        supabase.from('work_schedules').select('sales_rep_id,schedule_date')
          .eq('work_status', '稼働')
          .gte('schedule_date', `${y}-${m}-01`).lte('schedule_date', lastDayStr),
      ])
      reps = r1.data ?? []; allRecords = r2.data ?? []; allPlans = r3.data ?? []; allSchedules = r4.data ?? []
    }
    if (!reps || reps.length === 0) { setLoading(false); return }
    const scheduleMap: Record<string, string[]> = {}
    for (const s of allSchedules || []) {
      if (!scheduleMap[s.sales_rep_id]) scheduleMap[s.sales_rep_id] = []
      scheduleMap[s.sales_rep_id].push(s.schedule_date)
    }
    const result: RepStats[] = reps.map(rep => {
      const records = (allRecords || []).filter(r => r.sales_rep_id === rep.id)
      const plan = (allPlans || []).find(p => p.sales_rep_id === rep.id)
      const today = new Date().toISOString().split('T')[0]
      const reportedDates = new Set(records.map((r: any) => r.record_date))
      const schedWorkingDays = (scheduleMap[rep.id] || []).filter((d: string) =>
        d >= today || reportedDates.has(d)
      )
      const stats = calcMonthlyStats(records, plan?.plan_cases || 0, schedWorkingDays.length, yearMonth, schedWorkingDays)
      return { rep, stats }
    })
    setData(result)
    setLoading(false)
  }

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  // ===== 個人モード用 =====
  const filteredData = filterTeamId
    ? data.filter(d => d.rep.team_id === filterTeamId)
    : data

  const sorted = [...filteredData].sort((a, b) => {
    if (sortKey === 'name') return a.rep.display_order - b.rep.display_order
    if (sortKey === 'forecast') return b.stats.forecastAcquisitions - a.stats.forecastAcquisitions
    if (sortKey === 'acquisitions') return b.stats.totalAcquisitions - a.stats.totalAcquisitions
    if (sortKey === 'productivity') return b.stats.productivity - a.stats.productivity
    return 0
  })

  const teamAcq = filteredData.reduce((s, d) => s + d.stats.totalAcquisitions, 0)
  const teamForecast = filteredData.reduce((s, d) => s + d.stats.forecastAcquisitions, 0)
  const teamPlan = filteredData.reduce((s, d) => s + d.stats.planCases, 0)
  const teamWorking = filteredData.reduce((s, d) => s + d.stats.actualWorkingDays, 0)
  const teamProductivity = teamWorking > 0 ? teamAcq / teamWorking : 0

  // 獲得件数ランキング（降順）
  const acqRanking = [...filteredData]
    .filter(d => d.stats.totalAcquisitions > 0)
    .sort((a, b) => b.stats.totalAcquisitions - a.stats.totalAcquisitions)
  const maxAcq = acqRanking[0]?.stats.totalAcquisitions || 1

  // 同率対応: dense ranking
  const acqRanks: number[] = []
  acqRanking.forEach((d, i) => {
    if (i === 0) { acqRanks.push(1); return }
    if (acqRanking[i - 1].stats.totalAcquisitions === d.stats.totalAcquisitions) {
      acqRanks.push(acqRanks[i - 1])
    } else {
      acqRanks.push(i + 1)
    }
  })
  const getMedal = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null

  // ===== チーム対抗モード用 =====
  const teamStats: TeamStats[] = (() => {
    const result: TeamStats[] = teams.map(team => {
      const members = data.filter(d => d.rep.team_id === team.id)
      const totalAcquisitions = members.reduce((s, d) => s + d.stats.totalAcquisitions, 0)
      const forecastAcquisitions = members.reduce((s, d) => s + d.stats.forecastAcquisitions, 0)
      const planCases = members.reduce((s, d) => s + d.stats.planCases, 0)
      const actualWorkingDays = members.reduce((s, d) => s + d.stats.actualWorkingDays, 0)
      const productivity = actualWorkingDays > 0 ? totalAcquisitions / actualWorkingDays : 0
      return { team, members, totalAcquisitions, forecastAcquisitions, planCases, actualWorkingDays, productivity, rank: 0 }
    })

    // 未所属メンバー
    const unassigned = data.filter(d => !d.rep.team_id || !teams.find(t => t.id === d.rep.team_id))
    if (unassigned.length > 0) {
      const totalAcquisitions = unassigned.reduce((s, d) => s + d.stats.totalAcquisitions, 0)
      const forecastAcquisitions = unassigned.reduce((s, d) => s + d.stats.forecastAcquisitions, 0)
      const planCases = unassigned.reduce((s, d) => s + d.stats.planCases, 0)
      const actualWorkingDays = unassigned.reduce((s, d) => s + d.stats.actualWorkingDays, 0)
      const productivity = actualWorkingDays > 0 ? totalAcquisitions / actualWorkingDays : 0
      result.push({ team: null, members: unassigned, totalAcquisitions, forecastAcquisitions, planCases, actualWorkingDays, productivity, rank: 0 })
    }

    // forecastAcquisitions 降順でソート → ランク付け
    result.sort((a, b) => b.forecastAcquisitions - a.forecastAcquisitions)
    result.forEach((ts, i) => { ts.rank = i + 1 })
    return result
  })()

  const maxTeamForecast = teamStats[0]?.forecastAcquisitions || 1

  const SortBtn = ({ k, label }: { k: typeof sortKey; label: string }) => (
    <button onClick={() => setSortKey(k)}
      className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
        sortKey === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >{label}</button>
  )

  const RANK_COLORS = [
    { bg: 'linear-gradient(135deg,#f59e0b,#ef4444)', text: 'text-yellow-100', bar: 'linear-gradient(90deg,#f59e0b,#ef4444)' },
    { bg: 'linear-gradient(135deg,#64748b,#94a3b8)', text: 'text-slate-100', bar: 'linear-gradient(90deg,#64748b,#94a3b8)' },
    { bg: 'linear-gradient(135deg,#92400e,#b45309)', text: 'text-amber-100', bar: 'linear-gradient(90deg,#92400e,#b45309)' },
  ]

  const getTeamId = (ts: TeamStats) => ts.team?.id ?? '__unassigned__'

  return (
    <div>
      {/* ===== MOBILE ===== */}
      <div className="md:hidden space-y-3">

        {/* 表示モード切り替えトグル */}
        {teams.length > 0 && (
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
            <button
              onClick={() => setViewMode('individual')}
              className={`text-xs px-4 py-1.5 rounded-lg font-bold transition-colors ${viewMode === 'individual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >個人</button>
            <button
              onClick={() => setViewMode('team')}
              className={`text-xs px-4 py-1.5 rounded-lg font-bold transition-colors ${viewMode === 'team' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >チーム対抗</button>
          </div>
        )}

        {viewMode === 'individual' ? (
          <>
            {/* チームフィルター */}
            {teams.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setFilterTeamId(null)}
                  className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${filterTeamId === null ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                >全体</button>
                {teams.map(t => (
                  <button key={t.id}
                    onClick={() => setFilterTeamId(t.id)}
                    className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${filterTeamId === t.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                  >{t.name}</button>
                ))}
              </div>
            )}

            {/* チームサマリー */}
            <div className="mobile-card">
              <div className="mobile-card-label">チーム合計</div>
              <div className="grid grid-cols-2 gap-2">
                <div className={`rounded-xl p-3 text-center text-white ${teamForecast >= teamPlan ? 'bg-emerald-500' : 'bg-red-500'}`}>
                  <div className="text-xs font-bold opacity-80">全体着地予想</div>
                  <div className="text-3xl font-black leading-tight">{round1(teamForecast)}</div>
                  <div className="text-xs opacity-70 mt-1">目標 {teamPlan}件</div>
                </div>
                <div className="rounded-xl p-3 text-center bg-slate-700 text-white">
                  <div className="text-xs font-bold opacity-80">現在獲得</div>
                  <div className="text-3xl font-black leading-tight">{teamAcq}</div>
                  <div className="text-xs opacity-70 mt-1">生産性 {round1(teamProductivity)}</div>
                </div>
              </div>
            </div>

            {/* 獲得件数ランキング */}
            <div className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(160deg,#0f172a 0%,#1e1b4b 100%)'}}>
              <div className="px-4 pt-4 pb-1">
                <div className="text-xs font-bold text-indigo-300 tracking-widest uppercase mb-1">🏆 獲得件数ランキング</div>
                <div className="text-xs text-slate-500 mb-4">{yearMonth.replace('-','年')}月 現在</div>

                {acqRanking.length === 0 ? (
                  <div className="text-xs text-slate-600 text-center py-6">まだデータがありません</div>
                ) : (
                  <>
                    {/* TOP3 表彰台 */}
                    {acqRanking.length >= 1 && (
                      <div className="flex items-end justify-center gap-2 mb-5">
                        {/* 2位 */}
                        {acqRanking[1] ? (
                          <div className="flex flex-col items-center flex-1">
                            <div className="text-2xl mb-1">{getMedal(acqRanks[1]) ?? `${acqRanks[1]}位`}</div>
                            <div className="text-xs text-slate-400 font-bold mb-1 truncate w-full text-center">
                              {acqRanking[1].rep.name}
                            </div>
                            <div className="w-full rounded-t-xl text-center py-3"
                              style={{background: RANK_COLORS[1].bg, minHeight: 64}}>
                              <div className="text-2xl font-black text-white leading-tight">
                                {acqRanking[1].stats.totalAcquisitions}
                              </div>
                              <div className="text-xs text-slate-200 opacity-80">件</div>
                            </div>
                          </div>
                        ) : <div className="flex-1" />}

                        {/* 1位 */}
                        <div className="flex flex-col items-center flex-1" style={{transform:'scale(1.1)', transformOrigin:'bottom center'}}>
                          <div className="text-3xl mb-1">{getMedal(acqRanks[0]) ?? `${acqRanks[0]}位`}</div>
                          <div className="text-sm text-yellow-300 font-black mb-1 truncate w-full text-center">
                            {acqRanking[0].rep.name}
                          </div>
                          <div className="w-full rounded-t-xl text-center py-4"
                            style={{background: RANK_COLORS[0].bg, minHeight: 84}}>
                            <div className="text-4xl font-black text-white leading-tight">
                              {acqRanking[0].stats.totalAcquisitions}
                            </div>
                            <div className="text-sm text-yellow-200 opacity-80">件</div>
                          </div>
                        </div>

                        {/* 3位 */}
                        {acqRanking[2] ? (
                          <div className="flex flex-col items-center flex-1">
                            <div className="text-2xl mb-1">{getMedal(acqRanks[2]) ?? `${acqRanks[2]}位`}</div>
                            <div className="text-xs text-slate-400 font-bold mb-1 truncate w-full text-center">
                              {acqRanking[2].rep.name}
                            </div>
                            <div className="w-full rounded-t-xl text-center py-2"
                              style={{background: RANK_COLORS[2].bg, minHeight: 52}}>
                              <div className="text-xl font-black text-white leading-tight">
                                {acqRanking[2].stats.totalAcquisitions}
                              </div>
                              <div className="text-xs text-amber-200 opacity-80">件</div>
                            </div>
                          </div>
                        ) : <div className="flex-1" />}
                      </div>
                    )}

                    {/* 4位以下 バー */}
                    {acqRanking.length > 3 && (
                      <div className="space-y-2 pb-4">
                        {acqRanking.slice(3).map((d, i) => {
                          const pct = (d.stats.totalAcquisitions / maxAcq) * 100
                          return (
                            <div key={d.rep.id} className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 font-black w-5 text-center">{acqRanks[i + 3]}</span>
                              <div className="flex-1 relative rounded-lg overflow-hidden border border-slate-700/50" style={{height:32}}>
                                <div className="absolute inset-0 bg-slate-800/60 rounded-lg" />
                                <div className="absolute inset-y-0 left-0 rounded-lg"
                                  style={{width:`${pct}%`, background:'linear-gradient(90deg,#3730a3,#6366f1)', opacity:0.7}} />
                                <div className="relative h-full flex items-center justify-between px-3">
                                  <span className="text-xs font-bold text-slate-200">{d.rep.name}</span>
                                  <span className="text-sm font-black text-indigo-300">
                                    {d.stats.totalAcquisitions}<span className="text-xs font-normal text-slate-500 ml-0.5">件</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 並び替え */}
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs text-slate-400 self-center">並び替え:</span>
              <SortBtn k="name" label="順番" />
              <SortBtn k="forecast" label="着地予想" />
              <SortBtn k="acquisitions" label="獲得数" />
              <SortBtn k="productivity" label="生産性" />
            </div>

            {/* 担当者カード一覧 */}
            {sorted.map(({ rep, stats }) => {
              const achieved = stats.forecastAcquisitions >= stats.planCases
              const hasData = stats.planCases > 0 || stats.totalAcquisitions > 0
              const progress = stats.planCases > 0 ? Math.min(100, (stats.forecastAcquisitions / stats.planCases) * 100) : 0
              const neededPerDay = (!achieved && stats.remainingWorkingDays > 0)
                ? stats.gapToTargetActual / stats.remainingWorkingDays
                : null
              return (
                <div key={rep.id} className={`mobile-card ${!hasData ? 'opacity-40' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-slate-800">{rep.name}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      !hasData ? 'bg-slate-100 text-slate-400' :
                      achieved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {!hasData ? '未入力' : achieved ? '達成見込み ✓' : `あと${round1(stats.gapToTarget)}件`}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center mb-2">
                    <div className="bg-slate-50 rounded-lg p-1.5">
                      <div className="text-xs text-slate-400">着地予想</div>
                      <div className={`text-lg font-black ${achieved ? 'text-emerald-600' : 'text-red-500'}`}>{round1(stats.forecastAcquisitions)}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-1.5">
                      <div className="text-xs text-slate-400">獲得</div>
                      <div className="text-lg font-black text-slate-700">{stats.totalAcquisitions}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-1.5">
                      <div className="text-xs text-slate-400">目標</div>
                      <div className="text-lg font-black text-slate-500">{stats.planCases}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-1.5">
                      <div className="text-xs text-slate-400">生産性</div>
                      <div className="text-lg font-black text-blue-600">{round1(stats.productivity)}</div>
                    </div>
                  </div>
                  {hasData && !achieved && neededPerDay !== null && (
                    <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 mb-2">
                      <span className="text-xs text-orange-700 font-medium">残{stats.remainingWorkingDays}日で達成するには</span>
                      <span className="text-base font-black text-orange-600">{round1(neededPerDay)}<span className="text-xs font-normal text-orange-400">件/日</span></span>
                    </div>
                  )}
                  {hasData && achieved && (
                    <div className="flex items-center justify-center bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 mb-2">
                      <span className="text-xs text-emerald-700 font-bold">🏆 目標達成見込み！</span>
                    </div>
                  )}
                  {hasData && stats.planCases > 0 && (
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${achieved ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                  )}
                </div>
              )
            })}
          </>
        ) : (
          /* ===== チーム対抗モバイル ===== */
          <>
            <div className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(160deg,#0f172a 0%,#1e1b4b 100%)'}}>
              <div className="px-4 pt-4 pb-4">
                <div className="text-xs font-bold text-indigo-300 tracking-widest uppercase mb-1">🏆 チームランキング</div>
                <div className="text-xs text-slate-500 mb-4">{yearMonth.replace('-','年')}月 着地予想順</div>

                {teamStats.length === 0 ? (
                  <div className="text-xs text-slate-600 text-center py-6">チームデータがありません</div>
                ) : (
                  <>
                    {/* TOP3 表彰台 */}
                    <div className="flex items-end justify-center gap-2 mb-5">
                      {/* 2位 */}
                      {teamStats[1] ? (
                        <div className="flex flex-col items-center flex-1">
                          <div className="text-2xl mb-1">🥈</div>
                          <div className="text-xs text-slate-400 font-bold mb-1 truncate w-full text-center">
                            {teamStats[1].team?.name ?? '未所属'}
                          </div>
                          <div className="w-full rounded-t-xl text-center py-3"
                            style={{background: RANK_COLORS[1].bg, minHeight: 64}}>
                            <div className="text-xs text-slate-300 opacity-80">現在獲得</div>
                            <div className="text-2xl font-black text-white leading-tight">
                              {teamStats[1].totalAcquisitions}
                            </div>
                            <div className="text-xs text-slate-300 opacity-60 mt-0.5">着地予想 {round1(teamStats[1].forecastAcquisitions)}</div>
                          </div>
                        </div>
                      ) : <div className="flex-1" />}

                      {/* 1位 */}
                      {teamStats[0] && (
                        <div className="flex flex-col items-center flex-1" style={{transform:'scale(1.1)', transformOrigin:'bottom center'}}>
                          <div className="text-3xl mb-1">🥇</div>
                          <div className="text-sm text-yellow-300 font-black mb-1 truncate w-full text-center">
                            {teamStats[0].team?.name ?? '未所属'}
                          </div>
                          <div className="w-full rounded-t-xl text-center py-4"
                            style={{background: RANK_COLORS[0].bg, minHeight: 84}}>
                            <div className="text-xs text-yellow-200 opacity-80">現在獲得</div>
                            <div className="text-4xl font-black text-white leading-tight">
                              {teamStats[0].totalAcquisitions}
                            </div>
                            <div className="text-xs text-yellow-200 opacity-60 mt-1">着地予想 {round1(teamStats[0].forecastAcquisitions)}</div>
                          </div>
                        </div>
                      )}

                      {/* 3位 */}
                      {teamStats[2] ? (
                        <div className="flex flex-col items-center flex-1">
                          <div className="text-2xl mb-1">🥉</div>
                          <div className="text-xs text-slate-400 font-bold mb-1 truncate w-full text-center">
                            {teamStats[2].team?.name ?? '未所属'}
                          </div>
                          <div className="w-full rounded-t-xl text-center py-2"
                            style={{background: RANK_COLORS[2].bg, minHeight: 52}}>
                            <div className="text-xs text-amber-200 opacity-80">現在獲得</div>
                            <div className="text-xl font-black text-white leading-tight">
                              {teamStats[2].totalAcquisitions}
                            </div>
                            <div className="text-xs text-amber-200 opacity-60 mt-0.5">着地予想 {round1(teamStats[2].forecastAcquisitions)}</div>
                          </div>
                        </div>
                      ) : <div className="flex-1" />}
                    </div>

                    {/* 4位以下 バー */}
                    {teamStats.length > 3 && (
                      <div className="space-y-2">
                        {teamStats.slice(3).map((ts) => {
                          const pct = maxTeamForecast > 0 ? (ts.forecastAcquisitions / maxTeamForecast) * 100 : 0
                          return (
                            <div key={getTeamId(ts)} className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 font-black w-5 text-center">{ts.rank}</span>
                              <div className="flex-1 relative rounded-lg overflow-hidden border border-slate-700/50" style={{height:32}}>
                                <div className="absolute inset-0 bg-slate-800/60 rounded-lg" />
                                <div className="absolute inset-y-0 left-0 rounded-lg"
                                  style={{width:`${pct}%`, background:'linear-gradient(90deg,#3730a3,#6366f1)', opacity:0.7}} />
                                <div className="relative h-full flex items-center justify-between px-3">
                                  <span className="text-xs font-bold text-slate-200">{ts.team?.name ?? '未所属'}</span>
                                  <div className="flex flex-col items-end">
                                    <span className="text-sm font-black text-indigo-300">
                                      {ts.totalAcquisitions}<span className="text-xs font-normal text-slate-500 ml-0.5">件</span>
                                    </span>
                                    <span className="text-xs text-slate-500">着地 {round1(ts.forecastAcquisitions)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* チームカード一覧 */}
            {teamStats.map((ts) => {
              const tid = getTeamId(ts)
              const isExpanded = expandedTeamId === tid
              const achieved = ts.forecastAcquisitions >= ts.planCases && ts.planCases > 0
              const hasData = ts.planCases > 0 || ts.totalAcquisitions > 0
              const medal = getMedal(ts.rank)
              return (
                <div key={tid} className="mobile-card">
                  <button
                    className="w-full text-left"
                    onClick={() => setExpandedTeamId(isExpanded ? null : tid)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{medal ?? `${ts.rank}位`}</span>
                        <span className="font-bold text-sm text-slate-800">{ts.team?.name ?? '未所属'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasData && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            achieved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {achieved ? '達成見込み ✓' : `あと${round1(ts.planCases - ts.forecastAcquisitions)}件`}
                          </span>
                        )}
                        <span className="text-slate-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-center">
                      <div className="bg-slate-50 rounded-lg p-1.5">
                        <div className="text-xs text-slate-400">現在獲得</div>
                        <div className="text-2xl font-black text-slate-800">{ts.totalAcquisitions}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-1.5">
                        <div className="text-xs text-slate-400">着地予想</div>
                        <div className={`text-sm font-bold ${achieved ? 'text-emerald-600' : 'text-red-400'}`}>{round1(ts.forecastAcquisitions)}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-1.5">
                        <div className="text-xs text-slate-400">目標</div>
                        <div className="text-lg font-black text-slate-500">{ts.planCases}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-1.5">
                        <div className="text-xs text-slate-400">生産性</div>
                        <div className="text-lg font-black text-blue-600">{round1(ts.productivity)}</div>
                      </div>
                    </div>
                  </button>

                  {/* メンバー一覧（展開時） */}
                  {isExpanded && (
                    <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                      {ts.members.length === 0 ? (
                        <div className="text-xs text-slate-400 text-center py-2">メンバーなし</div>
                      ) : (
                        ts.members.map(({ rep, stats }) => (
                          <div key={rep.id} className="flex items-center justify-between px-2 py-1.5 bg-slate-50 rounded-lg">
                            <span className="text-xs font-bold text-slate-700">{rep.name}</span>
                            <div className="flex gap-3 text-xs text-slate-500">
                              <span>獲得 <span className="font-black text-slate-700">{stats.totalAcquisitions}</span></span>
                              <span>着地 <span className={`font-black ${stats.forecastAcquisitions >= stats.planCases && stats.planCases > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{round1(stats.forecastAcquisitions)}</span></span>
                              <span>生産性 <span className="font-black text-blue-600">{round1(stats.productivity)}</span></span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ===== PC ===== */}
      <div className="hidden md:block">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="text-xs font-bold text-slate-600">全体着地 — {yearMonth}</div>

          {/* 表示モード切り替えトグル */}
          {teams.length > 0 && (
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => setViewMode('individual')}
                className={`text-xs px-4 py-1 rounded-lg font-bold transition-colors ${viewMode === 'individual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >個人</button>
              <button
                onClick={() => setViewMode('team')}
                className={`text-xs px-4 py-1 rounded-lg font-bold transition-colors ${viewMode === 'team' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >チーム対抗</button>
            </div>
          )}

          {viewMode === 'individual' && teams.length > 0 && (
            <>
              <button
                onClick={() => setFilterTeamId(null)}
                className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${filterTeamId === null ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
              >全体</button>
              {teams.map(t => (
                <button key={t.id}
                  onClick={() => setFilterTeamId(t.id)}
                  className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${filterTeamId === t.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                >{t.name}</button>
              ))}
            </>
          )}
        </div>

        {viewMode === 'individual' ? (
          <>
            <div className="flex gap-3 mb-4 flex-wrap items-start">
              {/* チーム合計 */}
              <div className={`${teamForecast >= teamPlan ? 'bg-emerald-500' : 'bg-red-600'} text-white rounded-xl px-5 py-3 text-center`}>
                <div className="text-xs font-bold opacity-80">チーム着地予想</div>
                <div className="text-4xl font-black leading-tight">{round1(teamForecast)}</div>
                <div className="text-xs opacity-70">目標 {teamPlan}件</div>
              </div>
              <div className="bg-slate-700 text-white rounded-xl px-5 py-3 text-center">
                <div className="text-xs font-bold opacity-80">現在獲得合計</div>
                <div className="text-4xl font-black leading-tight">{teamAcq}</div>
                <div className="text-xs opacity-70">チーム生産性 {round1(teamProductivity)}</div>
              </div>

              {/* 獲得件数ランキング（PC横並び） */}
              {acqRanking.length > 0 && (
                <div className="rounded-xl overflow-hidden flex-1 min-w-[320px]" style={{background:'linear-gradient(160deg,#0f172a,#1e1b4b)'}}>
                  <div className="px-4 py-3">
                    <div className="text-xs font-bold text-indigo-300 tracking-widest uppercase mb-3">🏆 獲得件数ランキング</div>
                    <div className="space-y-2">
                      {acqRanking.map((d, i) => {
                        const pct = (d.stats.totalAcquisitions / maxAcq) * 100
                        const rank = acqRanks[i]
                        const isTop3 = rank <= 3
                        const barBg = rank === 1
                          ? 'linear-gradient(90deg,#f59e0b,#ef4444)'
                          : rank === 2
                          ? 'linear-gradient(90deg,#64748b,#94a3b8)'
                          : rank === 3
                          ? 'linear-gradient(90deg,#92400e,#b45309)'
                          : 'linear-gradient(90deg,#3730a3,#6366f1)'
                        const medal = getMedal(rank)
                        return (
                          <div key={d.rep.id} className="flex items-center gap-2">
                            <span className="w-7 text-center text-sm flex-shrink-0">
                              {medal || <span className="text-xs text-slate-500 font-black">{rank}</span>}
                            </span>
                            <div className="flex-1 relative rounded-lg overflow-hidden border border-slate-700/40"
                              style={{height: isTop3 ? 34 : 28}}>
                              <div className="absolute inset-0 bg-slate-800/50" />
                              <div className="absolute inset-y-0 left-0 rounded-lg transition-all"
                                style={{width:`${pct}%`, background: barBg, opacity: 0.85}} />
                              <div className="relative h-full flex items-center justify-between px-3">
                                <span className={`font-black truncate ${isTop3 ? 'text-sm text-white' : 'text-xs text-slate-300'}`}>
                                  {d.rep.name}
                                </span>
                                <span className={`font-black ml-2 flex-shrink-0 ${
                                  rank === 1 ? 'text-yellow-300 text-xl' :
                                  rank === 2 ? 'text-slate-200 text-lg' :
                                  rank === 3 ? 'text-amber-300 text-base' :
                                  'text-indigo-300 text-sm'
                                }`}>
                                  {d.stats.totalAcquisitions}
                                  <span className="text-xs font-normal opacity-60 ml-0.5">件</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-1 self-center">
                <span className="text-xs text-slate-400 self-center mr-1">並び替え:</span>
                <SortBtn k="name" label="順番" />
                <SortBtn k="forecast" label="着地予想↓" />
                <SortBtn k="acquisitions" label="獲得数↓" />
                <SortBtn k="productivity" label="生産性↓" />
              </div>
            </div>

            {/* 一覧表 */}
            <div className="bg-white rounded shadow-sm p-2 inline-block min-w-[600px]">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th className="bg-gray-200 text-left px-2" style={{minWidth:80}}>担当者</th>
                    <th className="header-red">着地予想</th>
                    <th className="header-orange">目標</th>
                    <th className="header-blue">現在獲得</th>
                    <th className="header-blue">実稼働</th>
                    <th className="header-blue">残稼働</th>
                    <th className="header-green">生産性</th>
                    <th className="header-green">対面率</th>
                    <th className="header-green">商談率</th>
                    <th className="bg-orange-100 text-orange-700">必要件/日</th>
                    <th className="bg-gray-100">状況</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(({ rep, stats }) => {
                    const achieved = stats.forecastAcquisitions >= stats.planCases
                    const hasData = stats.planCases > 0 || stats.totalAcquisitions > 0
                    const neededPerDay = (!achieved && stats.remainingWorkingDays > 0)
                      ? stats.gapToTargetActual / stats.remainingWorkingDays : null
                    return (
                      <tr key={rep.id} className={!hasData ? 'opacity-40' : ''}>
                        <td className="text-left px-2 font-medium bg-gray-50 whitespace-nowrap">{rep.name}</td>
                        <td className={`font-bold ${achieved ? 'text-emerald-600' : 'text-red-600'}`}>{round1(stats.forecastAcquisitions)}</td>
                        <td>{stats.planCases}</td>
                        <td className="font-bold">{stats.totalAcquisitions}</td>
                        <td>{stats.actualWorkingDays}日</td>
                        <td className="text-blue-600">{stats.remainingWorkingDays}日</td>
                        <td>{round1(stats.productivity)}</td>
                        <td>{stats.totalVisits > 0 ? (stats.totalNetMeetings / stats.totalVisits * 100).toFixed(0) + '%' : '—'}</td>
                        <td>{stats.totalOwnerMeetings > 0 ? (stats.totalNegotiations / stats.totalOwnerMeetings * 100).toFixed(0) + '%' : '—'}</td>
                        <td className={`font-bold ${achieved ? 'text-emerald-600' : neededPerDay !== null ? 'text-orange-600' : 'text-slate-300'}`}>
                          {!hasData ? '—' : achieved ? '🏆' : neededPerDay !== null ? round1(neededPerDay) : '—'}
                        </td>
                        <td className={`font-bold text-xs ${!hasData ? 'text-slate-300' : achieved ? 'text-emerald-600' : 'text-red-500'}`}>
                          {!hasData ? '未' : achieved ? '達成見込✓' : `あと${round1(stats.gapToTarget)}件`}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-slate-400 bg-yellow-50 font-bold">
                    <td className="text-left px-2 bg-yellow-100">合計</td>
                    <td className={teamForecast >= teamPlan ? 'text-emerald-600' : 'text-red-600'}>{round1(teamForecast)}</td>
                    <td>{teamPlan}</td>
                    <td>{teamAcq}</td>
                    <td>{teamWorking}日</td>
                    <td>—</td>
                    <td>{round1(teamProductivity)}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td className={teamForecast >= teamPlan ? 'text-emerald-600 text-xs' : 'text-red-500 text-xs'}>
                      {teamForecast >= teamPlan ? '達成見込✓' : `あと${round1(teamPlan - teamForecast)}件`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          /* ===== チーム対抗 PC ===== */
          <div className="bg-white rounded shadow-sm p-2 inline-block min-w-[640px]">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th className="bg-gray-200 text-left px-2" style={{minWidth:40}}>順位</th>
                  <th className="bg-gray-200 text-left px-2" style={{minWidth:100}}>チーム</th>
                  <th className="header-red">着地予想</th>
                  <th className="header-orange">目標</th>
                  <th className="header-blue">現在獲得</th>
                  <th className="header-blue">実稼働</th>
                  <th className="header-green">生産性</th>
                  <th className="bg-gray-100">状況</th>
                  <th className="bg-gray-100" style={{minWidth:30}}></th>
                </tr>
              </thead>
              <tbody>
                {teamStats.map((ts) => {
                  const tid = getTeamId(ts)
                  const isExpanded = expandedTeamId === tid
                  const achieved = ts.forecastAcquisitions >= ts.planCases && ts.planCases > 0
                  const hasData = ts.planCases > 0 || ts.totalAcquisitions > 0
                  const medal = getMedal(ts.rank)
                  return (
                    <>
                      <tr
                        key={tid}
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setExpandedTeamId(isExpanded ? null : tid)}
                      >
                        <td className="text-center font-bold text-lg">{medal ?? `${ts.rank}位`}</td>
                        <td className="text-left px-2 font-bold bg-gray-50 whitespace-nowrap">{ts.team?.name ?? '未所属'}</td>
                        <td className={`text-xs ${achieved ? 'text-emerald-500' : 'text-red-400'}`}>{round1(ts.forecastAcquisitions)}</td>
                        <td>{ts.planCases}</td>
                        <td className="font-black text-xl text-slate-800">{ts.totalAcquisitions}</td>
                        <td>{ts.actualWorkingDays}日</td>
                        <td>{round1(ts.productivity)}</td>
                        <td className={`font-bold text-xs ${!hasData ? 'text-slate-300' : achieved ? 'text-emerald-600' : 'text-red-500'}`}>
                          {!hasData ? '—' : achieved ? '達成見込✓' : `あと${round1(ts.planCases - ts.forecastAcquisitions)}件`}
                        </td>
                        <td className="text-center text-slate-400 text-xs">{isExpanded ? '▲' : '▼'}</td>
                      </tr>
                      {isExpanded && ts.members.map(({ rep, stats }) => {
                        const mAchieved = stats.forecastAcquisitions >= stats.planCases && stats.planCases > 0
                        return (
                          <tr key={rep.id} className="bg-slate-50/80 text-slate-600">
                            <td></td>
                            <td className="text-left px-4 text-xs text-slate-500 whitespace-nowrap">└ {rep.name}</td>
                            <td className={`text-xs opacity-70 ${mAchieved ? 'text-emerald-500' : 'text-red-400'}`}>{round1(stats.forecastAcquisitions)}</td>
                            <td className="text-xs">{stats.planCases}</td>
                            <td className="text-sm font-black text-slate-700">{stats.totalAcquisitions}</td>
                            <td className="text-xs">{stats.actualWorkingDays}日</td>
                            <td className="text-xs">{round1(stats.productivity)}</td>
                            <td className={`text-xs ${mAchieved ? 'text-emerald-600' : 'text-red-500'}`}>
                              {stats.planCases === 0 && stats.totalAcquisitions === 0 ? '未入力' : mAchieved ? '達成見込✓' : `あと${round1(stats.planCases - stats.forecastAcquisitions)}件`}
                            </td>
                            <td></td>
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
