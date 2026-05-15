'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep, Team } from '@/lib/supabase'

type Props = { yearMonth: string; teams: Team[]; orgIds?: string[] }

// ── 週定義（水〜月の6日サイクル、火=定休を除く） ──────────────────────────
type Week = { label: string; range: string; start: string; end: string; planDays: number }

function buildWeeks(yearMonth: string): Week[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const firstDow = new Date(y, m - 1, 1).getDay()
  const daysToWed = (firstDow - 3 + 7) % 7
  let wedDay = 1 - daysToWed

  const weeks: Week[] = []
  let n = 1
  while (wedDay <= daysInMonth) {
    const monDay = wedDay + 5
    const s = Math.max(wedDay, 1)
    const e = Math.min(monDay, daysInMonth)
    if (e >= 1) {
      let planDays = 0
      for (let d = s; d <= e; d++) {
        if (new Date(y, m - 1, d).getDay() !== 2) planDays++ // 火曜(2)除外
      }
      const startStr = `${yearMonth}-${String(s).padStart(2, '0')}`
      const endStr   = `${yearMonth}-${String(e).padStart(2, '0')}`
      weeks.push({
        label: `第${n}週`,
        range: `${s}日〜${e}日`,
        start: startStr,
        end: endStr,
        planDays,
      })
      n++
    }
    wedDay += 7
  }
  return weeks
}

// ── KPI計算 ────────────────────────────────────────────────────────────────

type RepKPIRow = {
  rep: SalesRep
  weeks: WeekKPI[]
  monthlyLanding: number   // 月着地（全体）
  monthPlan: number
  monthActual: number
  monthActualDays: number
  monthPlanDays: number
}

type WeekKPI = {
  target: number       // 目標件数（週按分）
  actual: number       // 現状件数
  progress: number     // 進捗%
  productivity: number // 生産性（件/実稼働日）
  planDays: number     // 計画稼働日数
  actualDays: number   // 実稼働日数
  remainDays: number   // 残稼働日数
}

function calcKPI(
  rep: SalesRep,
  records: any[],
  schedules: any[],
  plan: any,
  weeks: Week[],
  today: string,
): RepKPIRow {
  const monthPlan = Number(plan?.plan_cases) || 0
  const monthPlanDays = Number(plan?.plan_working_days) || 0

  // 月の計画稼働日数（work_schedules から再計算して補完）
  const scheduledDays = schedules.filter(s => s.sales_rep_id === rep.id && s.work_status === '稼働').length
  const totalPlanDays = monthPlanDays > 0 ? monthPlanDays : scheduledDays

  // 月全体の実績
  const repRecords = records.filter(r => r.sales_rep_id === rep.id)
  const monthActual = repRecords.reduce((s, r) => s + (Number(r.acquisitions) || 0), 0)
  const monthActualDays = repRecords.filter(r => r.work_status === '稼働').length

  // 月着地 = 現在の生産性 × 計画稼働日数
  const monthlyLanding = monthActualDays > 0
    ? Math.round((monthActual / monthActualDays) * totalPlanDays * 10) / 10
    : 0

  const repSchedules = schedules.filter(s => s.sales_rep_id === rep.id)

  const weekKPIs: WeekKPI[] = weeks.map(week => {
    // 計画稼働日数（この週）
    const planDays = repSchedules.filter(s =>
      s.work_status === '稼働' && s.schedule_date >= week.start && s.schedule_date <= week.end
    ).length

    // 実稼働日数（この週）
    const weekRecords = repRecords.filter(r =>
      r.record_date >= week.start && r.record_date <= week.end && r.work_status === '稼働'
    )
    const actualDays = weekRecords.length

    // 現状件数（この週）
    const actual = repRecords
      .filter(r => r.record_date >= week.start && r.record_date <= week.end)
      .reduce((s, r) => s + (Number(r.acquisitions) || 0), 0)

    // 目標件数（週按分: 計画稼働日数ベース）
    const target = totalPlanDays > 0
      ? Math.round(monthPlan * (planDays / totalPlanDays) * 10) / 10
      : 0

    // 進捗%
    const progress = target > 0 ? Math.round((actual / target) * 100) : 0

    // 生産性
    const productivity = actualDays > 0
      ? Math.round((actual / actualDays) * 100) / 100
      : 0

    // 残稼働日数（未来の計画稼働日）
    const remainDays = repSchedules.filter(s =>
      s.work_status === '稼働' &&
      s.schedule_date >= week.start && s.schedule_date <= week.end &&
      s.schedule_date > today
    ).length

    return { target, actual, progress, productivity, planDays, actualDays, remainDays }
  })

  return {
    rep,
    weeks: weekKPIs,
    monthlyLanding,
    monthPlan,
    monthActual,
    monthActualDays,
    monthPlanDays: totalPlanDays,
  }
}

// ── カラーヘルパー ─────────────────────────────────────────────────────────

function progressColor(pct: number) {
  if (pct >= 100) return { bg: 'bg-emerald-100', text: 'text-emerald-700', bold: true }
  if (pct >= 80)  return { bg: 'bg-blue-50',     text: 'text-blue-700',    bold: false }
  if (pct >= 60)  return { bg: 'bg-yellow-50',   text: 'text-yellow-700',  bold: false }
  return              { bg: 'bg-red-50',       text: 'text-red-600',    bold: false }
}

const fmt1 = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(1)
const dash  = <span className="text-slate-300">—</span>

// ── メインコンポーネント ───────────────────────────────────────────────────

export default function WeeklyKPIView({ yearMonth, teams, orgIds }: Props) {
  const [rows, setRows] = useState<RepKPIRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null)
  const weeks = buildWeeks(yearMonth)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => { load() }, [yearMonth, orgIds?.join(',')])

  async function load() {
    setLoading(true)
    const [yStr, mStr] = yearMonth.split('-')
    const lastDay = new Date(parseInt(yStr), parseInt(mStr), 0).getDate()
    const dateFrom = `${yStr}-${mStr}-01`
    const dateTo   = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`

    let reps: any[], records: any[], schedules: any[], plans: any[]

    if (orgIds && orgIds.length > 1) {
      const res = await fetch(`/api/combined/data?orgIds=${orgIds.join(',')}&yearMonth=${yearMonth}`)
      const d = await res.json()
      reps = d.reps; records = d.records; schedules = d.schedules; plans = d.plans
    } else {
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
        supabase.from('daily_records').select('sales_rep_id,record_date,acquisitions,work_status')
          .gte('record_date', dateFrom).lte('record_date', dateTo),
        supabase.from('work_schedules').select('sales_rep_id,schedule_date,work_status')
          .gte('schedule_date', dateFrom).lte('schedule_date', dateTo),
        supabase.from('monthly_plans').select('sales_rep_id,plan_cases,plan_working_days').eq('year_month', yearMonth),
      ])
      reps = r1.data ?? []; records = r2.data ?? []; schedules = r3.data ?? []; plans = r4.data ?? []
    }

    if (!reps || reps.length === 0) { setLoading(false); return }

    const kpiRows = reps.map((rep: SalesRep) => {
      const plan = plans.find((p: any) => p.sales_rep_id === rep.id)
      return calcKPI(rep, records, schedules, plan, weeks, today)
    })

    setRows(kpiRows)
    setLoading(false)
  }

  const visibleRows = filterTeamId
    ? rows.filter(r => r.rep.team_id === filterTeamId)
    : rows

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  const KPI_COLS = [
    { key: 'target',       label: '目標', unit: '件' },
    { key: 'actual',       label: '現状', unit: '件' },
    { key: 'progress',     label: '進捗', unit: '%'  },
    { key: 'productivity', label: '生産', unit: ''   },
    { key: 'planDays',     label: '計画', unit: '日' },
    { key: 'actualDays',   label: '実稼', unit: '日' },
    { key: 'remainDays',   label: '残稼', unit: '日' },
  ] as const

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="font-black text-slate-800 text-lg">
            {yearMonth.replace('-', '年')}月 週間KPI
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            目標=月目標の週按分 / 現状=本週件数 / 進捗=現状÷目標 / 生産=件/実稼働日
          </p>
        </div>

        {/* チームフィルタ */}
        {teams.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterTeamId(null)}
              className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors ${filterTeamId === null ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}
            >全体</button>
            {teams.map(t => (
              <button key={t.id}
                onClick={() => setFilterTeamId(t.id)}
                className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors ${filterTeamId === t.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}
              >{t.name}</button>
            ))}
          </div>
        )}
      </div>

      {/* KPI凡例 */}
      <div className="flex gap-2 mb-3 flex-wrap text-xs">
        {[
          { label: '目標', desc: '月目標÷計画稼/週計画稼' },
          { label: '現状', desc: '今週の獲得件数' },
          { label: '進捗', desc: '現状÷目標' },
          { label: '生産', desc: '件÷実稼働日数' },
          { label: '計画', desc: '計画稼働日数' },
          { label: '実稼', desc: '実稼働日数' },
          { label: '残稼', desc: '未来の計画稼働日数' },
        ].map(({ label, desc }) => (
          <span key={label} className="bg-slate-100 px-2 py-0.5 rounded-full text-slate-500">
            <span className="font-bold text-slate-700">{label}</span>={desc}
          </span>
        ))}
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table className="border-collapse text-xs" style={{ minWidth: weeks.length * 7 * 48 + 160 }}>
          <thead>
            {/* 週ヘッダー */}
            <tr className="bg-slate-800">
              <th
                rowSpan={2}
                className="sticky left-0 bg-slate-800 z-10 px-3 py-2 text-left text-slate-300 font-bold text-sm"
                style={{ minWidth: 108 }}
              >
                担当者
              </th>
              {weeks.map(w => (
                <th
                  key={w.label}
                  colSpan={KPI_COLS.length}
                  className="px-2 py-1.5 text-center border-l border-slate-700"
                >
                  <div className="text-white font-black text-[11px]">{w.label}</div>
                  <div className="text-slate-400 text-[9px]">{w.range}</div>
                </th>
              ))}
              {/* 月計列 */}
              <th colSpan={4} className="px-2 py-1.5 text-center border-l border-slate-600 bg-slate-700">
                <div className="text-yellow-300 font-black text-[11px]">月計</div>
              </th>
            </tr>
            {/* KPI小ヘッダー */}
            <tr className="bg-slate-700">
              {weeks.map(w =>
                KPI_COLS.map(col => (
                  <th key={`${w.label}-${col.key}`}
                    className="px-1 py-1 text-center border-l border-slate-600"
                    style={{ minWidth: 44 }}>
                    <span className="text-slate-300 font-bold text-[10px]">{col.label}</span>
                    {col.unit && <span className="text-slate-500 text-[9px]">{col.unit}</span>}
                  </th>
                ))
              )}
              {/* 月計小ヘッダー */}
              {['目標', '現状', '着地', '進捗%'].map(h => (
                <th key={h} className="px-1 py-1 text-center border-l border-slate-600" style={{ minWidth: 44 }}>
                  <span className="text-yellow-200 font-bold text-[10px]">{h}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row, i) => {
              const monthProgress = row.monthPlan > 0
                ? Math.round((row.monthActual / row.monthPlan) * 100)
                : 0
              const pc = progressColor(monthProgress)

              return (
                <tr key={row.rep.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  {/* 担当者名 */}
                  <td className={`sticky left-0 z-10 px-3 py-2 font-bold border-b border-slate-100 whitespace-nowrap ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#2563eb)' }}>
                        {row.rep.name.charAt(0)}
                      </div>
                      <span className="text-slate-800 text-xs">{row.rep.name}</span>
                    </div>
                  </td>

                  {/* 週KPI */}
                  {row.weeks.map((wk, wi) => {
                    const pc2 = progressColor(wk.progress)
                    const isCurrentWeek = weeks[wi].start <= today && today <= weeks[wi].end
                    return KPI_COLS.map(col => {
                      let val: React.ReactNode
                      const raw = wk[col.key]
                      if (col.key === 'progress') {
                        if (raw === 0 && wk.target === 0) { val = dash; }
                        else {
                          val = (
                            <span className={`font-bold ${pc2.text}`}>{raw}%</span>
                          )
                        }
                      } else if (col.key === 'productivity') {
                        val = raw > 0 ? fmt1(raw) : dash
                      } else {
                        val = raw > 0 ? raw : (col.key === 'target' || col.key === 'actual' ? raw : dash)
                      }

                      return (
                        <td key={`${wi}-${col.key}`}
                          className={`border-b border-slate-100 text-center py-2 px-1 border-l ${
                            col.key === 'target' ? 'border-l-slate-200' : 'border-l-slate-100'
                          } ${isCurrentWeek && col.key === 'target' ? 'bg-blue-50/40' : ''}`}
                        >
                          <span className={`text-xs ${col.key === 'progress' ? '' : 'text-slate-700'}`}>{val}</span>
                        </td>
                      )
                    })
                  })}

                  {/* 月計 */}
                  <td className="border-b border-slate-100 text-center py-2 px-2 border-l border-l-slate-300">
                    <span className="text-xs text-slate-500">{row.monthPlan > 0 ? row.monthPlan : '—'}</span>
                  </td>
                  <td className="border-b border-slate-100 text-center py-2 px-2 border-l border-l-slate-100">
                    <span className={`text-xs font-bold ${row.monthActual > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                      {row.monthActual > 0 ? row.monthActual : '—'}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 text-center py-2 px-2 border-l border-l-slate-100">
                    <span className={`text-xs font-bold ${row.monthlyLanding > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                      {row.monthlyLanding > 0 ? fmt1(row.monthlyLanding) : '—'}
                    </span>
                  </td>
                  <td className={`border-b border-slate-100 text-center py-2 px-2 border-l border-l-slate-100 ${pc.bg}`}>
                    <span className={`text-xs font-bold ${pc.text}`}>
                      {row.monthPlan > 0 ? `${monthProgress}%` : '—'}
                    </span>
                  </td>
                </tr>
              )
            })}

            {/* 合計行 */}
            {visibleRows.length > 0 && (
              <tr className="bg-slate-800 font-bold">
                <td className="sticky left-0 bg-slate-800 z-10 px-3 py-2 text-slate-300 text-xs font-bold border-b border-slate-700">
                  合計
                </td>
                {weeks.map((w, wi) =>
                  KPI_COLS.map(col => {
                    let total: React.ReactNode = dash
                    if (col.key === 'progress' || col.key === 'productivity') {
                      total = dash
                    } else {
                      const sum = visibleRows.reduce((s, r) => s + (r.weeks[wi]?.[col.key] ?? 0), 0)
                      total = <span className="text-slate-200">{fmt1(sum)}</span>
                    }
                    return (
                      <td key={`total-${wi}-${col.key}`}
                        className="border-b border-slate-700 text-center py-2 px-1 border-l border-l-slate-700">
                        <span className="text-xs">{total}</span>
                      </td>
                    )
                  })
                )}
                {/* 月計合計 */}
                <td className="border-b border-slate-700 text-center py-2 px-2 border-l border-l-slate-600">
                  <span className="text-xs text-slate-300">{visibleRows.reduce((s, r) => s + r.monthPlan, 0)}</span>
                </td>
                <td className="border-b border-slate-700 text-center py-2 px-2 border-l border-l-slate-700">
                  <span className="text-xs text-slate-200 font-bold">{visibleRows.reduce((s, r) => s + r.monthActual, 0)}</span>
                </td>
                <td className="border-b border-slate-700 text-center py-2 px-2 border-l border-l-slate-700">
                  <span className="text-xs text-indigo-300 font-bold">
                    {fmt1(visibleRows.reduce((s, r) => s + r.monthlyLanding, 0))}
                  </span>
                </td>
                <td className="border-b border-slate-700 text-center py-2 px-2 border-l border-l-slate-700">
                  <span className="text-xs text-slate-300">
                    {(() => {
                      const totalPlan = visibleRows.reduce((s, r) => s + r.monthPlan, 0)
                      const totalActual = visibleRows.reduce((s, r) => s + r.monthActual, 0)
                      return totalPlan > 0 ? `${Math.round((totalActual / totalPlan) * 100)}%` : '—'
                    })()}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {visibleRows.length === 0 && (
        <p className="text-center text-slate-400 text-sm py-8">データがありません</p>
      )}
    </div>
  )
}
