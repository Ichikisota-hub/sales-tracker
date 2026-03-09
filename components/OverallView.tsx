'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep } from '@/lib/supabase'
import { calcMonthlyStats, round1, MonthlyStats } from '@/lib/calcUtils'

type Props = { yearMonth: string }

type RepStats = { rep: SalesRep; stats: MonthlyStats }
type AreaStat = { pref: string; city: string; count: number; reps: string[] }

export default function OverallView({ yearMonth }: Props) {
  const [data, setData] = useState<RepStats[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<'name' | 'forecast' | 'acquisitions' | 'productivity'>('forecast')
  const [areaStats, setAreaStats] = useState<AreaStat[]>([])

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

    // エリア別成約集計
    const areaMap: Record<string, { count: number; repSet: Set<string> }> = {}
    ;(allRecords || []).forEach(r => {
      if ((r.acquisitions || 0) <= 0) return
      if (!r.area_pref && !r.area_city) return
      const key = `${r.area_pref || ''}__${r.area_city || ''}`
      if (!areaMap[key]) areaMap[key] = { count: 0, repSet: new Set() }
      areaMap[key].count += Number(r.acquisitions)
      const rep = reps.find(rep => rep.id === r.sales_rep_id)
      if (rep) areaMap[key].repSet.add(rep.name)
    })
    const areaSorted: AreaStat[] = Object.entries(areaMap)
      .map(([key, val]) => {
        const [pref, city] = key.split('__')
        return { pref, city, count: val.count, reps: Array.from(val.repSet) }
      })
      .sort((a, b) => b.count - a.count)
    setAreaStats(areaSorted)

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

  const SortBtn = ({ k, label }: { k: typeof sortKey; label: string }) => (
    <button onClick={() => setSortKey(k)}
      className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
        sortKey === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >{label}</button>
  )

  // エリアカードの色
  const MEDAL = ['🥇', '🥈', '🥉']

  return (
    <div>
      {/* ===== MOBILE ===== */}
      <div className="md:hidden space-y-3">
        {/* チームサマリー */}
        <div className="mobile-card">
          <div className="mobile-card-label">チーム合計</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
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

        {/* エリア別成約ランキング */}
        {areaStats.length > 0 && (
          <div className="mobile-card">
            <div className="mobile-card-label">📍 エリア別成約ランキング</div>
            <div className="space-y-2">
              {areaStats.slice(0, 10).map((a, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                  <span className="text-base w-6 flex-shrink-0">{MEDAL[i] || `${i+1}`}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">
                      {a.pref && a.city ? `${a.pref} › ${a.city}` : a.pref || a.city || '未設定'}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{a.reps.join('・')}</div>
                  </div>
                  <div className="text-lg font-black text-blue-700 flex-shrink-0">{a.count}<span className="text-xs font-normal text-slate-400">件</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {areaStats.length === 0 && (
          <div className="mobile-card">
            <div className="mobile-card-label">📍 エリア別成約ランキング</div>
            <div className="text-xs text-slate-400 text-center py-3">稼働エリアを入力すると表示されます</div>
          </div>
        )}

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
              {/* 1日あたり必要件数 */}
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
        <div className="text-xs font-bold text-slate-600 mb-2">全体着地 — {yearMonth}</div>

        <div className="flex gap-2 mb-3 flex-wrap items-start">
          {/* チーム合計 */}
          <div className={`${teamForecast >= teamPlan ? 'bg-emerald-500' : 'bg-red-600'} text-white rounded px-4 py-2 text-center`}>
            <div className="text-xs font-bold opacity-80">チーム着地予想</div>
            <div className="text-3xl font-black leading-tight">{round1(teamForecast)}</div>
            <div className="text-xs opacity-70">目標 {teamPlan}件</div>
          </div>
          <div className="bg-slate-700 text-white rounded px-4 py-2 text-center">
            <div className="text-xs font-bold opacity-80">現在獲得合計</div>
            <div className="text-3xl font-black leading-tight">{teamAcq}</div>
            <div className="text-xs opacity-70">チーム生産性 {round1(teamProductivity)}</div>
          </div>

          {/* エリア別ランキング（PC） */}
          {areaStats.length > 0 && (
            <div className="bg-white border border-slate-200 rounded px-3 py-2 min-w-[220px]">
              <div className="text-xs font-bold text-slate-600 mb-1">📍 エリア別成約TOP</div>
              <div className="space-y-1">
                {areaStats.slice(0, 5).map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-4">{MEDAL[i] || `${i+1}`}</span>
                    <span className="flex-1 text-slate-700 font-medium">
                      {a.pref && a.city ? `${a.pref}›${a.city}` : a.pref || a.city || '未設定'}
                    </span>
                    <span className="font-black text-blue-700">{a.count}件</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-1 ml-2 self-center">
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
                  ? stats.gapToTargetActual / stats.remainingWorkingDays
                  : null
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

        {/* PC用エリア別詳細テーブル */}
        {areaStats.length > 0 && (
          <div className="mt-4 bg-white rounded shadow-sm p-3">
            <div className="text-xs font-bold text-slate-600 mb-2">📍 エリア別成約詳細</div>
            <table className="sheet-table">
              <thead>
                <tr>
                  <th className="bg-gray-200 text-left px-2">順位</th>
                  <th className="header-blue text-left px-2">都道府県</th>
                  <th className="header-blue text-left px-2">市区町村</th>
                  <th className="header-green">成約件数</th>
                  <th className="bg-gray-100 text-left px-2">担当者</th>
                </tr>
              </thead>
              <tbody>
                {areaStats.map((a, i) => (
                  <tr key={i}>
                    <td className="text-center font-bold">{MEDAL[i] || i + 1}</td>
                    <td className="text-left px-2">{a.pref || '—'}</td>
                    <td className="text-left px-2">{a.city || '—'}</td>
                    <td className="font-black text-blue-700">{a.count}</td>
                    <td className="text-left px-2 text-xs text-slate-600">{a.reps.join('・')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
