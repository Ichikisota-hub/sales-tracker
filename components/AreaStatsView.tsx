'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep } from '@/lib/supabase'
import { getMonthList, formatYearMonth } from '@/lib/dateUtils'

type Props = { yearMonth: string }

type AreaStat = {
  pref: string
  city: string
  count: number
  reps: string[]
  months: Record<string, number>
}

const PREF_COLORS: Record<string, string> = {
  '大阪府': '#ef4444',
  '兵庫県': '#3b82f6',
  '京都府': '#8b5cf6',
  '奈良県': '#10b981',
  '滋賀県': '#f59e0b',
  '和歌山県': '#ec4899',
}

export default function AreaStatsView({ yearMonth }: Props) {
  const [reps, setReps] = useState<SalesRep[]>([])
  const [areaStats, setAreaStats] = useState<AreaStat[]>([])
  const [prefStats, setPrefStats] = useState<{ pref: string; count: number; cities: { city: string; count: number }[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'pref' | 'city'>('pref')
  const months = getMonthList(6).reverse() // 過去6ヶ月

  useEffect(() => { loadAll() }, [yearMonth])

  async function loadAll() {
    setLoading(true)
    const [y, m] = yearMonth.split('-')

    const [{ data: repData }, { data: records }] = await Promise.all([
      supabase.from('sales_reps').select('*').order('display_order'),
      supabase.from('daily_records').select('*')
        .gte('record_date', `${y}-${m}-01`)
        .lte('record_date', `${y}-${m}-31`),
    ])

    const repList = repData || []
    setReps(repList)

    // エリア集計
    const areaMap: Record<string, { count: number; repSet: Set<string>; months: Record<string, number> }> = {}
    const prefMap: Record<string, { count: number; cityMap: Record<string, number> }> = {}

    ;(records || []).forEach(r => {
      if ((r.acquisitions || 0) <= 0) return
      if (!r.area_pref && !r.area_city) return
      const pref = r.area_pref || ''
      const city = r.area_city || ''
      const key = `${pref}__${city}`
      const acq = Number(r.acquisitions)
      const mon = (r.record_date || '').slice(0, 7)
      const rep = repList.find(rep => rep.id === r.sales_rep_id)

      if (!areaMap[key]) areaMap[key] = { count: 0, repSet: new Set(), months: {} }
      areaMap[key].count += acq
      if (rep) areaMap[key].repSet.add(rep.name)
      areaMap[key].months[mon] = (areaMap[key].months[mon] || 0) + acq

      if (pref) {
        if (!prefMap[pref]) prefMap[pref] = { count: 0, cityMap: {} }
        prefMap[pref].count += acq
        if (city) prefMap[pref].cityMap[city] = (prefMap[pref].cityMap[city] || 0) + acq
      }
    })

    const areaSorted: AreaStat[] = Object.entries(areaMap)
      .map(([key, val]) => {
        const [pref, city] = key.split('__')
        return { pref, city, count: val.count, reps: Array.from(val.repSet), months: val.months }
      })
      .sort((a, b) => b.count - a.count)

    const prefSorted = Object.entries(prefMap)
      .map(([pref, val]) => ({
        pref,
        count: val.count,
        cities: Object.entries(val.cityMap)
          .map(([city, count]) => ({ city, count }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count)

    setAreaStats(areaSorted)
    setPrefStats(prefSorted)
    setLoading(false)
  }

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  const maxCount = areaStats[0]?.count || 1
  const maxPrefCount = prefStats[0]?.count || 1
  const MEDAL = ['🥇', '🥈', '🥉']

  const noData = areaStats.length === 0

  return (
    <div className="space-y-4">

      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-black text-slate-800 text-base">📍 エリア別獲得分析</div>
          <div className="text-xs text-slate-400">{yearMonth.replace('-','年')}月 · 日報入力のエリアを集計</div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setViewMode('pref')}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${viewMode === 'pref' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            都道府県
          </button>
          <button onClick={() => setViewMode('city')}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${viewMode === 'city' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            市区町村
          </button>
        </div>
      </div>

      {noData && (
        <div className="mobile-card text-center py-8">
          <div className="text-3xl mb-2">📍</div>
          <div className="text-sm text-slate-500 font-bold">エリアデータがありません</div>
          <div className="text-xs text-slate-400 mt-1">日報入力でエリアを設定すると表示されます</div>
        </div>
      )}

      {/* ===== 都道府県ビュー ===== */}
      {!noData && viewMode === 'pref' && (
        <>
          {/* 府県別バーチャート */}
          <div className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(160deg,#0f172a,#1e1b4b)'}}>
            <div className="px-4 pt-4 pb-4">
              <div className="text-xs font-bold text-indigo-300 tracking-widest uppercase mb-4">都道府県別 獲得件数</div>
              <div className="space-y-3">
                {prefStats.map((p, i) => {
                  const pct = (p.count / maxPrefCount) * 100
                  const color = PREF_COLORS[p.pref] || '#6366f1'
                  return (
                    <div key={p.pref}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{MEDAL[i] || i+1}</span>
                          <span className="text-sm font-black text-white">{p.pref}</span>
                        </div>
                        <span className="font-black text-lg" style={{color}}>{p.count}<span className="text-xs text-slate-400 ml-0.5">件</span></span>
                      </div>
                      {/* メインバー */}
                      <div className="relative rounded-lg overflow-hidden bg-slate-800" style={{height:12}}>
                        <div className="absolute inset-y-0 left-0 rounded-lg transition-all"
                          style={{width:`${pct}%`, background: color, opacity:0.9}} />
                      </div>
                      {/* 市区内訳 */}
                      {p.cities.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.cities.slice(0, 6).map(c => (
                            <span key={c.city} className="text-xs px-2 py-0.5 rounded-full font-bold"
                              style={{background: color + '22', color}}>
                              {c.city} {c.count}件
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 担当者×府県マトリクス */}
          {reps.length > 0 && (
            <div className="mobile-card overflow-x-auto">
              <div className="mobile-card-label">👥 担当者 × 府県マトリクス</div>
              <table className="text-xs border-collapse w-full mt-2">
                <thead>
                  <tr>
                    <th className="text-left text-slate-500 pb-1 pr-2">担当者</th>
                    {prefStats.map(p => (
                      <th key={p.pref} className="text-center pb-1 px-1 font-bold"
                        style={{color: PREF_COLORS[p.pref] || '#6366f1'}}>
                        {p.pref.replace('府','').replace('県','').replace('都','')}
                      </th>
                    ))}
                    <th className="text-center pb-1 px-1 text-slate-600">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {reps.map(r => {
                    const repTotal = areaStats.filter(a => a.reps.includes(r.name)).reduce((s, a) => s + a.count, 0)
                    if (repTotal === 0) return null
                    return (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="py-1 pr-2 font-bold text-slate-700 whitespace-nowrap">{r.name}</td>
                        {prefStats.map(p => {
                          const cnt = areaStats
                            .filter(a => a.pref === p.pref && a.reps.includes(r.name))
                            .reduce((s, a) => s + a.count, 0)
                          return (
                            <td key={p.pref} className="text-center py-1 px-1">
                              {cnt > 0 ? (
                                <span className="font-black px-1.5 py-0.5 rounded-full text-white"
                                  style={{background: PREF_COLORS[p.pref] || '#6366f1'}}>
                                  {cnt}
                                </span>
                              ) : <span className="text-slate-200">—</span>}
                            </td>
                          )
                        })}
                        <td className="text-center py-1 px-1 font-black text-slate-700">{repTotal}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===== 市区町村ビュー ===== */}
      {!noData && viewMode === 'city' && (
        <>
          {/* TOP3 表彰台 */}
          {areaStats.length >= 1 && (
            <div className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(160deg,#0f172a,#1e1b4b)'}}>
              <div className="px-4 pt-4 pb-2">
                <div className="text-xs font-bold text-indigo-300 tracking-widest uppercase mb-4">市区町村別 獲得ランキング</div>
                {/* 表彰台 */}
                <div className="flex items-end justify-center gap-2 mb-4">
                  {areaStats[1] && (
                    <div className="flex flex-col items-center flex-1">
                      <div className="text-xl mb-1">🥈</div>
                      <div className="text-xs text-slate-400 text-center truncate w-full mb-1">
                        {areaStats[1].city || areaStats[1].pref}
                      </div>
                      <div className="w-full rounded-t-xl bg-slate-500 text-center py-3" style={{minHeight:56}}>
                        <div className="text-xl font-black text-white">{areaStats[1].count}<span className="text-xs opacity-60">件</span></div>
                        <div className="text-xs text-slate-300 truncate px-1">{areaStats[1].pref}</div>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col items-center flex-1" style={{transform:'scale(1.08)', transformOrigin:'bottom'}}>
                    <div className="text-2xl mb-1">🥇</div>
                    <div className="text-xs text-yellow-300 font-bold text-center truncate w-full mb-1">
                      {areaStats[0].city || areaStats[0].pref}
                    </div>
                    <div className="w-full rounded-t-xl text-center py-4" style={{background:'linear-gradient(135deg,#f59e0b,#ef4444)', minHeight:72}}>
                      <div className="text-3xl font-black text-white">{areaStats[0].count}<span className="text-sm opacity-70">件</span></div>
                      <div className="text-xs text-yellow-200 truncate px-1">{areaStats[0].pref}</div>
                    </div>
                  </div>
                  {areaStats[2] && (
                    <div className="flex flex-col items-center flex-1">
                      <div className="text-xl mb-1">🥉</div>
                      <div className="text-xs text-slate-400 text-center truncate w-full mb-1">
                        {areaStats[2].city || areaStats[2].pref}
                      </div>
                      <div className="w-full rounded-t-xl bg-amber-700 text-center py-2" style={{minHeight:44}}>
                        <div className="text-lg font-black text-white">{areaStats[2].count}<span className="text-xs opacity-60">件</span></div>
                        <div className="text-xs text-amber-200 truncate px-1">{areaStats[2].pref}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4位以下バー */}
                {areaStats.length > 3 && (
                  <div className="space-y-2 pb-3">
                    {areaStats.slice(3).map((a, i) => {
                      const pct = (a.count / maxCount) * 100
                      const color = PREF_COLORS[a.pref] || '#6366f1'
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-black w-4 text-center">{i+4}</span>
                          <div className="flex-1 relative rounded-lg overflow-hidden border border-slate-700/40" style={{height:28}}>
                            <div className="absolute inset-0 bg-slate-800/50" />
                            <div className="absolute inset-y-0 left-0 rounded-lg"
                              style={{width:`${pct}%`, background: color, opacity:0.7}} />
                            <div className="relative h-full flex items-center justify-between px-2">
                              <span className="text-xs font-bold text-slate-200">
                                {a.pref && a.city ? `${a.pref.replace('府','').replace('県','')} › ${a.city}` : a.pref || a.city}
                              </span>
                              <span className="text-sm font-black ml-1" style={{color}}>{a.count}<span className="text-xs font-normal text-slate-500 ml-0.5">件</span></span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 全リスト */}
          <div className="mobile-card">
            <div className="mobile-card-label">全エリア一覧</div>
            <div className="space-y-1.5 mt-2">
              {areaStats.map((a, i) => {
                const color = PREF_COLORS[a.pref] || '#6366f1'
                const pct = (a.count / maxCount) * 100
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-4 text-right font-bold">{i+1}</span>
                    <div className="flex-1 relative rounded-lg overflow-hidden bg-slate-100" style={{height:26}}>
                      <div className="absolute inset-y-0 left-0 rounded-lg"
                        style={{width:`${pct}%`, background: color, opacity:0.25}} />
                      <div className="relative h-full flex items-center justify-between px-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold truncate" style={{color}}>
                            {a.pref && a.city ? `${a.pref} › ${a.city}` : a.pref || a.city || '未設定'}
                          </span>
                          <span className="text-xs text-slate-400 hidden sm:inline">{a.reps.join('・')}</span>
                        </div>
                        <span className="font-black text-sm ml-2 flex-shrink-0" style={{color}}>{a.count}<span className="text-xs font-normal text-slate-400">件</span></span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
