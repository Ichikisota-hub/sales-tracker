'use client'

import { useEffect, useState } from 'react'
import { supabase, Contract, SalesRep } from '@/lib/supabase'

type ViewMode = '月別' | '人別' | '人×月' | 'ランキング' | '案件種別'

type StatRow = {
  label: string
  total: number
  constructionSet: number // 工事日決定 + 開通
  opened: number          // 開通
  cancelled: number       // キャンセル
}

type RankRow = StatRow & {
  constructionRate: number // 工事日決定率 = constructionSet / total
  openRate: number         // 開通率 = opened / constructionSet
}

function calcRate(num: number, den: number): string {
  if (den === 0) return '-'
  return (num / den * 100).toFixed(1) + '%'
}

function rateColor(num: number, den: number): string {
  if (den === 0) return 'text-slate-400'
  const r = num / den
  if (r >= 0.7) return 'text-emerald-600 font-bold'
  if (r >= 0.4) return 'text-amber-600 font-bold'
  return 'text-red-500 font-bold'
}

function cancelColor(num: number, den: number): string {
  if (den === 0) return 'text-slate-400'
  const r = num / den
  if (r <= 0.05) return 'text-emerald-600 font-bold'
  if (r <= 0.15) return 'text-amber-600 font-bold'
  return 'text-red-500 font-bold'
}

const MEDAL = ['🥇', '🥈', '🥉']

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function ContractStatsView() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [reps, setReps] = useState<SalesRep[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('月別')
  const [selectedRepId, setSelectedRepId] = useState<string>('')
  const [rankingMonth, setRankingMonth] = useState(currentYearMonth)
  const [providerMonth, setProviderMonth] = useState<string>('') // '' = 全期間
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: contractData }, { data: repData }] = await Promise.all([
      supabase.from('contracts').select('*').order('acquired_date', { ascending: false }),
      supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
    ])
    setContracts(contractData || [])
    setReps(repData || [])
    setLoading(false)
  }

  function buildMonthRows(): StatRow[] {
    const monthMap: Record<string, Contract[]> = {}
    contracts.forEach(c => {
      const month = (c.acquired_date || '').substring(0, 7)
      if (!month) return
      if (!monthMap[month]) monthMap[month] = []
      monthMap[month].push(c)
    })
    return Object.keys(monthMap).sort().reverse().map(month => {
      const list = monthMap[month]
      return {
        label: month.replace('-', '/'),
        total: list.length,
        constructionSet: list.filter(c => c.status === '工事日決定' || c.status === '開通').length,
        opened: list.filter(c => c.status === '開通').length,
        cancelled: list.filter(c => c.status === 'キャンセル').length,
      }
    })
  }

  function buildRepRows(): StatRow[] {
    const repMap: Record<string, Contract[]> = {}
    contracts.forEach(c => {
      if (!repMap[c.sales_rep_id]) repMap[c.sales_rep_id] = []
      repMap[c.sales_rep_id].push(c)
    })
    return reps
      .filter(r => repMap[r.id])
      .map(r => {
        const list = repMap[r.id]
        return {
          label: r.name,
          total: list.length,
          constructionSet: list.filter(c => c.status === '工事日決定' || c.status === '開通').length,
          opened: list.filter(c => c.status === '開通').length,
          cancelled: list.filter(c => c.status === 'キャンセル').length,
        }
      })
  }

  function buildRepMonthRows(repId: string): StatRow[] {
    const monthMap: Record<string, Contract[]> = {}
    contracts.filter(c => c.sales_rep_id === repId).forEach(c => {
      const month = (c.acquired_date || '').substring(0, 7)
      if (!month) return
      if (!monthMap[month]) monthMap[month] = []
      monthMap[month].push(c)
    })
    return Object.keys(monthMap).sort().reverse().map(month => {
      const list = monthMap[month]
      return {
        label: month.replace('-', '/'),
        total: list.length,
        constructionSet: list.filter(c => c.status === '工事日決定' || c.status === '開通').length,
        opened: list.filter(c => c.status === '開通').length,
        cancelled: list.filter(c => c.status === 'キャンセル').length,
      }
    })
  }

  function buildRankingRows(month: string): RankRow[] {
    const repMap: Record<string, Contract[]> = {}
    contracts
      .filter(c => (c.acquired_date || '').startsWith(month))
      .forEach(c => {
        if (!repMap[c.sales_rep_id]) repMap[c.sales_rep_id] = []
        repMap[c.sales_rep_id].push(c)
      })
    return reps
      .filter(r => repMap[r.id])
      .map(r => {
        const list = repMap[r.id]
        const total = list.length
        const constructionSet = list.filter(c => c.status === '工事日決定' || c.status === '開通').length
        const opened = list.filter(c => c.status === '開通').length
        const cancelled = list.filter(c => c.status === 'キャンセル').length
        return {
          label: r.name,
          total,
          constructionSet,
          opened,
          cancelled,
          constructionRate: total > 0 ? constructionSet / total : 0,
          openRate: constructionSet > 0 ? opened / constructionSet : 0,
        }
      })
      .sort((a, b) => b.constructionRate - a.constructionRate || b.openRate - a.openRate)
  }

  function buildProviderMatrix() {
    // 月フィルター適用
    const filtered = providerMonth
      ? contracts.filter(c => (c.acquired_date || '').startsWith(providerMonth))
      : contracts

    // プロバイダー名（wifi_provider_other は 'その他' にまとめる）
    const getProvider = (c: Contract) => c.wifi_provider || 'その他'

    // 全プロバイダーの集計（合計多い順）
    const providerTotals: Record<string, number> = {}
    filtered.forEach(c => {
      const p = getProvider(c)
      providerTotals[p] = (providerTotals[p] || 0) + 1
    })
    const providers = Object.keys(providerTotals).sort((a, b) => providerTotals[b] - providerTotals[a])

    // 担当者ごとの集計
    const repRows = reps.map(rep => {
      const repContracts = filtered.filter(c => c.sales_rep_id === rep.id)
      const byProvider: Record<string, number> = {}
      repContracts.forEach(c => {
        const p = getProvider(c)
        byProvider[p] = (byProvider[p] || 0) + 1
      })
      return { rep, total: repContracts.length, byProvider }
    }).filter(r => r.total > 0)

    return { providers, providerTotals, repRows, total: filtered.length }
  }

  function buildTotalRow(rows: StatRow[]): StatRow {
    return {
      label: '合計',
      total: rows.reduce((s, r) => s + r.total, 0),
      constructionSet: rows.reduce((s, r) => s + r.constructionSet, 0),
      opened: rows.reduce((s, r) => s + r.opened, 0),
      cancelled: rows.reduce((s, r) => s + r.cancelled, 0),
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  const effectiveRepId = selectedRepId || (reps[0]?.id ?? '')
  const rows = viewMode === '月別'
    ? buildMonthRows()
    : viewMode === '人別'
      ? buildRepRows()
      : viewMode === '人×月'
        ? buildRepMonthRows(effectiveRepId)
        : []
  const total = buildTotalRow(rows)
  const rankRows = viewMode === 'ランキング' ? buildRankingRows(rankingMonth) : []

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-black text-slate-800">契約宅 統計</h2>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1 flex-wrap">
          {(['月別', '人別', '人×月', 'ランキング', '案件種別'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                viewMode === mode
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {mode === 'ランキング' ? '🏆 ランキング' : mode}
            </button>
          ))}
        </div>

        {/* 人×月: 担当者選択 */}
        {viewMode === '人×月' && (
          <select
            value={effectiveRepId}
            onChange={e => setSelectedRepId(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          >
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}

        {/* ランキング: 月選択 */}
        {viewMode === 'ランキング' && (
          <input
            type="month"
            value={rankingMonth}
            onChange={e => setRankingMonth(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        {/* 案件種別: 月選択（全期間も可） */}
        {viewMode === '案件種別' && (
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={providerMonth}
              onChange={e => setProviderMonth(e.target.value)}
              className="border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            />
            {providerMonth && (
              <button
                onClick={() => setProviderMonth('')}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-200 text-slate-600 font-bold hover:bg-slate-300"
              >
                全期間
              </button>
            )}
          </div>
        )}
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2">
        <span><span className="font-bold text-slate-700">工事日決定率</span> = (工事日決定+開通数) ÷ 総数</span>
        <span className="text-slate-300">|</span>
        <span><span className="font-bold text-slate-700">開通率</span> = 開通数 ÷ (工事日決定+開通数)</span>
        <span className="text-slate-300">|</span>
        <span><span className="font-bold text-slate-700">キャンセル率</span> = キャンセル数 ÷ 総数</span>
      </div>

      {/* ランキングビュー */}
      {viewMode === 'ランキング' && (
        <div className="space-y-3">
          {rankRows.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 py-10 text-center text-slate-400">
              {rankingMonth.replace('-', '/')}のデータがありません
            </div>
          ) : (
            <>
              {/* ランキングカード */}
              {rankRows.map((row, i) => {
                const cRate = row.constructionRate
                const oRate = row.openRate
                return (
                  <div
                    key={row.label}
                    className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${
                      i === 0 ? 'border-yellow-300' : i === 1 ? 'border-slate-300' : i === 2 ? 'border-amber-600/40' : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* 順位 */}
                      <div className="text-2xl w-9 text-center shrink-0">
                        {i < 3 ? MEDAL[i] : <span className="text-base font-black text-slate-400">{i + 1}</span>}
                      </div>

                      {/* 名前 */}
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-slate-800 text-base">{row.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">獲得 {row.total}件</div>
                      </div>

                      {/* 工事日決定率（メイン指標） */}
                      <div className="text-right shrink-0">
                        <div className={`text-xl font-black ${rateColor(row.constructionSet, row.total)}`}>
                          {calcRate(row.constructionSet, row.total)}
                        </div>
                        <div className="text-xs text-slate-400">工事日決定率</div>
                      </div>
                    </div>

                    {/* バーグラフ + サブ指標 */}
                    <div className="px-4 pb-3 space-y-1.5">
                      {/* 工事日決定率バー */}
                      <div>
                        <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                          <span>工事日決定+開通 {row.constructionSet}件</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              cRate >= 0.7 ? 'bg-emerald-500' : cRate >= 0.4 ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${Math.min(cRate * 100, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* サブ指標行 */}
                      <div className="flex gap-4 text-xs pt-0.5">
                        <span className="text-slate-500">
                          開通率：
                          <span className={`font-bold ${rateColor(row.opened, row.constructionSet)}`}>
                            {calcRate(row.opened, row.constructionSet)}
                          </span>
                          <span className="text-slate-400 ml-1">({row.opened}件)</span>
                        </span>
                        <span className="text-slate-500">
                          キャンセル率：
                          <span className={`font-bold ${cancelColor(row.cancelled, row.total)}`}>
                            {calcRate(row.cancelled, row.total)}
                          </span>
                          <span className="text-slate-400 ml-1">({row.cancelled}件)</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* 案件種別ビュー */}
      {viewMode === '案件種別' && (() => {
        const { providers, providerTotals, repRows, total } = buildProviderMatrix()
        if (repRows.length === 0) return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 py-10 text-center text-slate-400">
            {providerMonth ? `${providerMonth.replace('-', '/')}のデータがありません` : 'データがありません'}
          </div>
        )
        return (
          <div className="space-y-4">
            {/* 全体の円グラフ代わりのバー */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <div className="text-xs font-bold text-slate-500 mb-3">
                プロバイダー別内訳（全体 {total}件）
              </div>
              <div className="space-y-2">
                {providers.map(p => {
                  const cnt = providerTotals[p]
                  const pct = total > 0 ? cnt / total : 0
                  return (
                    <div key={p} className="flex items-center gap-3">
                      <div className="w-20 text-xs font-bold text-slate-700 shrink-0 truncate">{p}</div>
                      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                      <div className="w-16 text-right text-xs font-bold text-slate-700 shrink-0">
                        {cnt}件 <span className="text-slate-400 font-normal">({(pct * 100).toFixed(0)}%)</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 担当者×プロバイダー クロス集計テーブル */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700 text-white">
                      <th className="text-left px-4 py-3 font-bold whitespace-nowrap sticky left-0 bg-slate-700 z-10">担当者</th>
                      {providers.map(p => (
                        <th key={p} className="text-center px-3 py-3 font-bold whitespace-nowrap">{p}</th>
                      ))}
                      <th className="text-center px-3 py-3 font-bold whitespace-nowrap bg-slate-600">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repRows.map((row, i) => (
                      <tr
                        key={row.rep.id}
                        className={`border-t border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                      >
                        <td className="px-4 py-2.5 font-bold text-slate-700 whitespace-nowrap sticky left-0 bg-inherit z-10">{row.rep.name}</td>
                        {providers.map(p => {
                          const cnt = row.byProvider[p] || 0
                          const isTop = cnt > 0 && cnt === Math.max(...repRows.map(r => r.byProvider[p] || 0))
                          return (
                            <td key={p} className="px-3 py-2.5 text-center">
                              {cnt > 0 ? (
                                <span className={`font-bold ${isTop ? 'text-blue-600' : 'text-slate-700'}`}>{cnt}</span>
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2.5 text-center font-black text-slate-800 bg-slate-50">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100">
                      <td className="px-4 py-2.5 font-black text-slate-800 sticky left-0 bg-slate-100 z-10">合計</td>
                      {providers.map(p => (
                        <td key={p} className="px-3 py-2.5 text-center font-bold text-slate-800">{providerTotals[p]}</td>
                      ))}
                      <td className="px-3 py-2.5 text-center font-black text-slate-800">{total}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 通常テーブル（ランキング・案件種別以外） */}
      {viewMode !== 'ランキング' && viewMode !== '案件種別' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="text-left px-4 py-3 font-bold">
                    {viewMode === '月別' ? '月' : viewMode === '人別' ? '担当者' : '月'}
                  </th>
                  <th className="text-center px-3 py-3 font-bold">総数</th>
                  <th className="text-center px-3 py-3 font-bold">工事日決定<br /><span className="font-normal text-xs text-slate-300">+開通含む</span></th>
                  <th className="text-center px-3 py-3 font-bold">工事日決定率</th>
                  <th className="text-center px-3 py-3 font-bold">開通数</th>
                  <th className="text-center px-3 py-3 font-bold">開通率</th>
                  <th className="text-center px-3 py-3 font-bold">キャンセル数</th>
                  <th className="text-center px-3 py-3 font-bold">キャンセル率</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400">データがありません</td>
                  </tr>
                )}
                {rows.map((row, i) => (
                  <tr
                    key={row.label}
                    className={`border-t border-slate-100 hover:bg-slate-50 transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                    }`}
                  >
                    <td className="px-4 py-3 font-bold text-slate-700">{row.label}</td>
                    <td className="px-3 py-3 text-center text-slate-600">{row.total}</td>
                    <td className="px-3 py-3 text-center text-slate-600">{row.constructionSet}</td>
                    <td className={`px-3 py-3 text-center ${rateColor(row.constructionSet, row.total)}`}>
                      {calcRate(row.constructionSet, row.total)}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600">{row.opened}</td>
                    <td className={`px-3 py-3 text-center ${rateColor(row.opened, row.constructionSet)}`}>
                      {calcRate(row.opened, row.constructionSet)}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600">{row.cancelled}</td>
                    <td className={`px-3 py-3 text-center ${cancelColor(row.cancelled, row.total)}`}>
                      {calcRate(row.cancelled, row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-100">
                    <td className="px-4 py-3 font-black text-slate-800">合計</td>
                    <td className="px-3 py-3 text-center font-bold text-slate-800">{total.total}</td>
                    <td className="px-3 py-3 text-center font-bold text-slate-800">{total.constructionSet}</td>
                    <td className={`px-3 py-3 text-center ${rateColor(total.constructionSet, total.total)}`}>
                      {calcRate(total.constructionSet, total.total)}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-slate-800">{total.opened}</td>
                    <td className={`px-3 py-3 text-center ${rateColor(total.opened, total.constructionSet)}`}>
                      {calcRate(total.opened, total.constructionSet)}
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-slate-800">{total.cancelled}</td>
                    <td className={`px-3 py-3 text-center ${cancelColor(total.cancelled, total.total)}`}>
                      {calcRate(total.cancelled, total.total)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
