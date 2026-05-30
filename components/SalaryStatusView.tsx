'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { calcSalaryStatus, SalaryStatus } from '@/lib/calcSalaryStatus'

type Props = { yearMonth: string; orgIds?: string[] }

const RANK_ORDER = [
  'チームリーダー',
  'ミニチームリーダー②',
  'ミニチームリーダー①',
  '旧Lメンバー',
  'クローザー2',
  'クローザー1',
  'アポインター',
]

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  green:  { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '条件達成' },
  yellow: { bg: 'bg-amber-100',   text: 'text-amber-700',   label: '注意' },
  red:    { bg: 'bg-red-100',     text: 'text-red-700',     label: '条件未達' },
}

export default function SalaryStatusView({ yearMonth, orgIds }: Props) {
  const [data, setData] = useState<SalaryStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState<'individual' | 'by_rank'>('individual')

  useEffect(() => { load() }, [yearMonth, orgIds?.join(',')])

  async function load() {
    setLoading(true)
    const [y, m] = yearMonth.split('-')
    const from = `${y}-${m}-01`
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    const to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`

    const orgId = orgIds?.[0]
    const repsQuery = supabase
      .from('sales_reps')
      .select('id, name, incentive_rank')
      .eq('is_active', true)
      .order('display_order')
    if (orgId) repsQuery.eq('organization_id', orgId)

    const [repsRes, schedulesRes, recordsRes, ratesRes] = await Promise.all([
      repsQuery,
      supabase
        .from('work_schedules')
        .select('sales_rep_id')
        .eq('work_status', '稼働')
        .gte('schedule_date', from)
        .lte('schedule_date', new Date().toISOString().slice(0, 10) < to ? new Date().toISOString().slice(0, 10) : to),
      supabase
        .from('daily_records')
        .select('sales_rep_id, acquisitions')
        .gte('record_date', from)
        .lte('record_date', to),
      supabase
        .from('incentive_rates')
        .select('rank, rate_per_contract'),
    ])

    const reps = (repsRes.data ?? []).filter(r => r.name && !r.name.startsWith('担当者'))
    const rateMap: Record<string, number> = {}
    for (const r of ratesRes.data ?? []) rateMap[r.rank] = r.rate_per_contract

    const workDaysMap: Record<string, number> = {}
    for (const s of schedulesRes.data ?? []) {
      workDaysMap[s.sales_rep_id] = (workDaysMap[s.sales_rep_id] ?? 0) + 1
    }

    const acqMap: Record<string, number> = {}
    for (const r of recordsRes.data ?? []) {
      acqMap[r.sales_rep_id] = (acqMap[r.sales_rep_id] ?? 0) + (r.acquisitions ?? 0)
    }

    const result = reps.map(rep =>
      calcSalaryStatus(
        rep,
        workDaysMap[rep.id] ?? 0,
        acqMap[rep.id] ?? 0,
        rateMap[rep.incentive_rank ?? 'アポインター'] ?? 0,
      )
    )
    setData(result)
    setLoading(false)
  }

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  // ─── 人別タブ ───────────────────────────────────────────────
  const IndividualView = () => {
    const sorted = [...data].sort((a, b) => {
      const ra = RANK_ORDER.indexOf(a.rank)
      const rb = RANK_ORDER.indexOf(b.rank)
      if (ra !== rb) return ra - rb
      return b.estimatedGross - a.estimatedGross
    })
    return (
      <div className="mobile-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="pb-2 font-bold">名前</th>
              <th className="pb-2 font-bold">役職</th>
              <th className="pb-2 font-bold text-center">稼働日</th>
              <th className="pb-2 font-bold text-center">獲得</th>
              <th className="pb-2 font-bold text-right">単価</th>
              <th className="pb-2 font-bold text-right">予想報酬</th>
              <th className="pb-2 font-bold text-center">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(d => {
              const badge = STATUS_BADGE[d.statusLevel]
              return (
                <tr key={d.repId} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 font-bold text-slate-800">{d.name}</td>
                  <td className="py-2.5 text-slate-500 text-xs whitespace-nowrap">{d.rank}</td>
                  <td className="py-2.5 text-center font-semibold text-slate-700">{d.workDays}</td>
                  <td className="py-2.5 text-center font-semibold text-slate-700">{d.acquisitions}</td>
                  <td className="py-2.5 text-right text-slate-500 text-xs">¥{d.appliedRate.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-black text-slate-800">
                    ¥{d.estimatedGross.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      <span className="text-[11px] text-slate-400 max-w-[120px] text-center leading-tight">
                        {d.conditionLabel}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {data.length === 0 && (
          <p className="text-center py-8 text-slate-400 text-sm">データがありません</p>
        )}
      </div>
    )
  }

  // ─── 給与別タブ ──────────────────────────────────────────────
  const ByRankView = () => {
    const groups: Record<string, SalaryStatus[]> = {}
    for (const d of data) {
      if (!groups[d.rank]) groups[d.rank] = []
      groups[d.rank].push(d)
    }
    const rankKeys = RANK_ORDER.filter(r => groups[r])

    return (
      <div className="space-y-3">
        {rankKeys.map(rank => {
          const members = groups[rank]
          const totalGross = members.reduce((s, m) => s + m.estimatedGross, 0)
          const avgDays = members.length ? Math.round(members.reduce((s, m) => s + m.workDays, 0) / members.length * 10) / 10 : 0
          const avgAcq = members.length ? Math.round(members.reduce((s, m) => s + m.acquisitions, 0) / members.length * 10) / 10 : 0
          const greenCount = members.filter(m => m.statusLevel === 'green').length
          const redCount = members.filter(m => m.statusLevel === 'red').length

          return (
            <div key={rank} className="mobile-card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-black text-slate-800 text-base">{rank}</span>
                  <span className="ml-2 text-xs text-slate-400">{members.length}名</span>
                </div>
                <span className="font-black text-slate-800 text-lg">
                  ¥{totalGross.toLocaleString()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                <div className="bg-slate-50 rounded-xl p-2">
                  <div className="text-base font-black text-slate-700">{avgDays}</div>
                  <div className="text-[10px] text-slate-400">平均稼働日</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-2">
                  <div className="text-base font-black text-slate-700">{avgAcq}</div>
                  <div className="text-[10px] text-slate-400">平均獲得</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-2">
                  <div className="text-base font-black text-emerald-600">{greenCount}</div>
                  <div className="text-[10px] text-slate-400">条件達成</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {members.map(m => {
                  const badge = STATUS_BADGE[m.statusLevel]
                  return (
                    <div key={m.repId} className={`flex items-center gap-1 px-2.5 py-1 rounded-xl ${badge.bg}`}>
                      <span className={`text-xs font-bold ${badge.text}`}>{m.name}</span>
                      <span className={`text-[10px] ${badge.text} opacity-70`}>{m.acquisitions}件</span>
                    </div>
                  )
                })}
              </div>
              {redCount > 0 && (
                <p className="text-[10px] text-red-400 mt-2">
                  ⚠ {redCount}名が条件未達
                </p>
              )}
            </div>
          )
        })}
        {rankKeys.length === 0 && (
          <p className="text-center py-8 text-slate-400 text-sm">データがありません</p>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* サブタブ */}
      <div className="flex gap-2 mb-4">
        {([['individual', '人別'], ['by_rank', '給与別']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${
              subTab === key
                ? 'text-white shadow'
                : 'text-slate-400 hover:text-slate-300'
            }`}
            style={subTab === key
              ? { background: 'linear-gradient(135deg,#6366f1,#2563eb)' }
              : { background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.08)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'individual' ? <IndividualView /> : <ByRankView />}
    </div>
  )
}
