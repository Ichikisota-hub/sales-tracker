'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep } from '@/lib/supabase'
import { calcMonthlyStats, round1, MonthlyStats } from '@/lib/calcUtils'

type Props = { yearMonth: string }
type RepStats = { rep: SalesRep; stats: MonthlyStats }

export default function OverallView({ yearMonth }: Props) {
  const [data, setData] = useState<RepStats[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<'name' | 'forecast' | 'acquisitions' | 'productivity'>('forecast')

  useEffect(() => { loadAll() }, [yearMonth])

  async function loadAll() {
    setLoading(true)
    const [y, m] = yearMonth.split('-')
    const [{ data: reps }, { data: allRecords }, { data: allPlans }, schedRes] = await Promise.all([
      supabase.from('sales_reps').select('*').order('display_order'),
      supabase.from('daily_records').select('*')
        .gte('record_date', `${y}-${m}-01`).lte('record_date', `${y}-${m}-31`),
      supabase.from('monthly_plans').select('*').eq('year_month', yearMonth),
      fetch(`/api/schedule?yearMonth=${yearMonth}`).then(r => r.json()).catch(() => null),
    ])
    if (!reps) { setLoading(false); return }
    const scheduleMap: Record<string, string[]> = schedRes?.schedule || {}
    const result: RepStats[] = reps.map(rep => {
      const records = (allRecords || []).filter(r => r.sales_rep_id === rep.id)
      const plan = (allPlans || []).find(p => p.sales_rep_id === rep.id)
      const schedWorkingDays = scheduleMap[rep.name] || []
      const stats = calcMonthlyStats(records, plan?.plan_cases || 0, plan?.plan_working_days || 0, yearMonth, schedWorkingDays)
      return { rep, stats }
    })
    setData(result)
    setLoading(false)
  }

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  const sorted = [...data].sort((a, b) => {
    if (sortKey === 'name') return a.rep.display_order - b.rep.display_order
    if (sortKey === 'forecast') return b.stats.forecastAcquisitions - a.stats.forecastAcquisitions
    if (sortKey === 'acquisitions') return b.stats.totalAcquisitions - a.stats.totalAcquisitions
    if (sortKey === 'productivity') return b.stats.productivity - a.stats.productivity
    return 0
  })

  const teamAcq = data.reduce((s, d) => s + d.stats.totalAcquisitions, 0)
  const teamForecast = data.reduce((s, d) => s + d.stats.forecastAcquisitions, 0)
  const teamPlan = data.reduce((s, d) => s + d.stats.planCases, 0)
  const teamWorking = data.reduce((s, d) => s + d.stats.actualWorkingDays, 0)
  const teamProductivity = teamWorking > 0 ? teamAcq / teamWorking : 0

  // 獲得件数ランキング（降順）
  const acqRanking = [...data]
    .filter(d => d.stats.totalAcquisitions > 0)
    .sort((a, b) => b.stats.totalAcquisitions - a.stats.totalAcquisitions)
  const maxAcq = acqRanking[0]?.stats.totalAcquisitions || 1

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

  return (
    <div>
      {/* ===== MOBILE ===== */}
      <div className="md:hidden space-y-3">

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
                        <div className="text-2xl mb-1">🥈</div>
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
                      <div className="text-3xl mb-1">🥇</div>
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
                        <div className="text-2xl mb-1">🥉</div>
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
                          <span className="text-xs text-slate-500 font-black w-5 text-center">{i + 4}</span>
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
      </div>

      {/* ===== PC ===== */}
      <div className="hidden md:block">
        <div className="text-xs font-bold text-slate-600 mb-3">全体着地 — {yearMonth}</div>

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
                    const isTop3 = i < 3
                    const barBg = i === 0
                      ? 'linear-gradient(90deg,#f59e0b,#ef4444)'
                      : i === 1
                      ? 'linear-gradient(90deg,#64748b,#94a3b8)'
                      : i === 2
                      ? 'linear-gradient(90deg,#92400e,#b45309)'
                      : 'linear-gradient(90deg,#3730a3,#6366f1)'
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                    return (
                      <div key={d.rep.id} className="flex items-center gap-2">
                        <span className="w-7 text-center text-sm flex-shrink-0">
                          {medal || <span className="text-xs text-slate-500 font-black">{i+1}</span>}
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
                              i === 0 ? 'text-yellow-300 text-xl' :
                              i === 1 ? 'text-slate-200 text-lg' :
                              i === 2 ? 'text-amber-300 text-base' :
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
      </div>
    </div>
  )
}
