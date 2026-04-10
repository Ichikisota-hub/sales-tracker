'use client'

import { useEffect, useState } from 'react'
import { supabase, Contract, SalesRep } from '@/lib/supabase'

type ViewMode = '月別' | '人別' | '人×月'

type StatRow = {
  label: string
  total: number
  constructionSet: number // 工事日決定 + 開通
  opened: number         // 開通
  cancelled: number      // キャンセル
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

export default function ContractStatsView() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [reps, setReps] = useState<SalesRep[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('月別')
  const [selectedRepId, setSelectedRepId] = useState<string>('')
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
    const months = Object.keys(monthMap).sort().reverse()
    return months.map(month => {
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
    const months = Object.keys(monthMap).sort().reverse()
    return months.map(month => {
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
      : buildRepMonthRows(effectiveRepId)
  const total = buildTotalRow(rows)

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-black text-slate-800">契約宅 統計</h2>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          {(['月別', '人別', '人×月'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                viewMode === mode
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        {viewMode === '人×月' && (
          <select
            value={effectiveRepId}
            onChange={e => setSelectedRepId(e.target.value)}
            className="border border-slate-200 bg-white rounded-xl px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          >
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2">
        <span><span className="font-bold text-slate-700">開通率</span> = 開通数 ÷ (工事日決定+開通数)</span>
        <span className="text-slate-300">|</span>
        <span><span className="font-bold text-slate-700">キャンセル率</span> = キャンセル数 ÷ 総数</span>
      </div>

      {/* テーブル */}
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
                <th className="text-center px-3 py-3 font-bold">開通数</th>
                <th className="text-center px-3 py-3 font-bold">開通率</th>
                <th className="text-center px-3 py-3 font-bold">キャンセル数</th>
                <th className="text-center px-3 py-3 font-bold">キャンセル率</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">データがありません</td>
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
    </div>
  )
}
