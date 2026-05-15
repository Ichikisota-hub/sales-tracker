'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, SalesRep, Team } from '@/lib/supabase'

type Props = { yearMonth: string; teams: Team[]; orgIds?: string[] }

// ── 週定義（水〜月の6日サイクル、火=定休を除く） ────────────────────────────
type Week = { label: string; range: string; start: string; end: string }

function buildWeeks(yearMonth: string): Week[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const total = new Date(y, m, 0).getDate()
  const firstDow = new Date(y, m - 1, 1).getDay()
  const daysToWed = (firstDow - 3 + 7) % 7
  let wed = 1 - daysToWed
  const weeks: Week[] = []
  let n = 1
  while (wed <= total) {
    const s = Math.max(wed, 1)
    const e = Math.min(wed + 5, total)
    if (e >= 1) {
      weeks.push({
        label: `第${n}週`,
        range: `${s}日〜${e}日`,
        start: `${yearMonth}-${String(s).padStart(2, '0')}`,
        end: `${yearMonth}-${String(e).padStart(2, '0')}`,
      })
      n++
    }
    wed += 7
  }
  return weeks
}

// ── KPI計算 ─────────────────────────────────────────────────────────────────

type WeekKPI = {
  actual: number          // 現状件数（週）
  landing: number         // 着地（累計ベース）
  progress: number        // 進捗% = 着地/月目標
  productivity: number    // 生産性 = 現状/離席稼働
  workDays: number        // 離席稼働日数
}

type RepRow = {
  rep: SalesRep
  monthPlan: number
  planWorkDays: number
  weeks: WeekKPI[]
  totalActual: number
}

function calcRows(
  reps: SalesRep[],
  records: any[],
  schedules: any[],
  plans: any[],
  weeks: Week[],
  today: string,
): RepRow[] {
  return reps.map(rep => {
    const plan = plans.find((p: any) => p.sales_rep_id === rep.id)
    const monthPlan = Number(plan?.plan_cases) || 0
    const scheduledDays = schedules.filter((s: any) => s.sales_rep_id === rep.id && s.work_status === '稼働').length
    const planWorkDays = Math.max(Number(plan?.plan_working_days) || 0, scheduledDays)
    const repRecords = records.filter((r: any) => r.sales_rep_id === rep.id)

    let cumActual = 0
    let cumWorkDays = 0

    const weekKPIs: WeekKPI[] = weeks.map(week => {
      const weekRecs = repRecords.filter((r: any) => r.record_date >= week.start && r.record_date <= week.end)
      const actual = weekRecs.reduce((s: number, r: any) => s + (Number(r.acquisitions) || 0), 0)
      const workDays = weekRecs.filter((r: any) => r.work_status === '稼働').length

      // 週が過去または進行中のみ累計更新
      const weekIsPast = week.end <= today
      const weekIsCurrent = week.start <= today && today <= week.end
      if (weekIsPast || weekIsCurrent) {
        cumActual += actual
        cumWorkDays += workDays
      }

      // 着地 = 累計件数 / 累計稼働日 × 計画稼働日(月)
      const landing = (weekIsPast || weekIsCurrent) && cumWorkDays > 0 && planWorkDays > 0
        ? Math.round((cumActual / cumWorkDays) * planWorkDays * 10) / 10
        : 0

      // 進捗 = 着地 / 月目標
      const progress = monthPlan > 0 && landing > 0
        ? Math.round((landing / monthPlan) * 100)
        : 0

      // 生産性 = 週件数 / 週稼働日
      const productivity = workDays > 0
        ? Math.round((actual / workDays) * 100) / 100
        : 0

      return { actual, landing, progress, productivity, workDays }
    })

    return {
      rep,
      monthPlan,
      planWorkDays,
      weeks: weekKPIs,
      totalActual: repRecords.reduce((s: number, r: any) => s + (Number(r.acquisitions) || 0), 0),
    }
  })
}

// ── 進捗カラー ───────────────────────────────────────────────────────────────

function pColor(pct: number): { cell: string; text: string } {
  if (pct >= 100) return { cell: '#f0fdf4', text: '#15803d' }
  if (pct >=  80) return { cell: '#eff6ff', text: '#1d4ed8' }
  if (pct >=  60) return { cell: '#fefce8', text: '#a16207' }
  if (pct >    0) return { cell: '#fff1f2', text: '#be123c' }
  return { cell: 'transparent', text: '#94a3b8' }
}

const fmt1 = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1)

// ── インライン編集セル ────────────────────────────────────────────────────────

function EditableCell({
  value,
  repId,
  yearMonth,
  onSaved,
}: {
  value: number
  repId: string
  yearMonth: string
  onSaved: (repId: string, val: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value || ''))
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  async function commit() {
    const v = parseInt(draft, 10)
    const n = isNaN(v) ? 0 : Math.max(0, v)
    setSaving(true)
    await supabase.from('monthly_plans').upsert(
      { sales_rep_id: repId, year_month: yearMonth, plan_cases: n, plan_working_days: 0 },
      { onConflict: 'sales_rep_id,year_month' }
    )
    setSaving(false)
    setEditing(false)
    onSaved(repId, n)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="w-12 text-center text-xs font-bold border-2 border-indigo-400 rounded outline-none py-0.5"
        style={{ background: '#eef2ff', color: '#3730a3' }}
        disabled={saving}
        type="number"
        min="0"
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(String(value || '')); setEditing(true) }}
      title="クリックして編集"
      className="w-full text-center text-xs font-bold rounded transition-colors hover:bg-indigo-50"
      style={{ color: value ? '#3730a3' : '#cbd5e1', cursor: 'text' }}
    >
      {value || '—'}
    </button>
  )
}

// ── メイン ───────────────────────────────────────────────────────────────────

export default function WeeklyKPIView({ yearMonth, teams, orgIds }: Props) {
  const [rows, setRows] = useState<RepRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const weeks = buildWeeks(yearMonth)

  useEffect(() => { load() }, [yearMonth, orgIds?.join(',')])

  async function load() {
    setLoading(true)
    const [yStr, mStr] = yearMonth.split('-')
    const lastDay = new Date(parseInt(yStr), parseInt(mStr), 0).getDate()
    const from = `${yStr}-${mStr}-01`
    const to   = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`

    let reps: any[], records: any[], schedules: any[], plans: any[]

    if (orgIds && orgIds.length > 1) {
      const res = await fetch(`/api/combined/data?orgIds=${orgIds.join(',')}&yearMonth=${yearMonth}`)
      const d = await res.json()
      reps = d.reps; records = d.records; schedules = d.schedules; plans = d.plans
    } else {
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
        supabase.from('daily_records')
          .select('sales_rep_id,record_date,acquisitions,work_status')
          .gte('record_date', from).lte('record_date', to),
        supabase.from('work_schedules')
          .select('sales_rep_id,schedule_date,work_status')
          .gte('schedule_date', from).lte('schedule_date', to),
        supabase.from('monthly_plans')
          .select('sales_rep_id,plan_cases,plan_working_days').eq('year_month', yearMonth),
      ])
      reps = r1.data ?? []; records = r2.data ?? []; schedules = r3.data ?? []; plans = r4.data ?? []
    }

    if (!reps?.length) { setLoading(false); return }
    setRows(calcRows(reps, records, schedules, plans, weeks, today))
    setLoading(false)
  }

  function handleTargetSaved(repId: string, val: number) {
    setRows(prev => prev.map(r =>
      r.rep.id === repId ? { ...r, monthPlan: val } : r
    ))
  }

  const visible = filterTeamId ? rows.filter(r => r.rep.team_id === filterTeamId) : rows

  if (loading) return (
    <div className="text-center py-12 text-slate-400 text-sm">読み込み中...</div>
  )

  // 凡例
  const today2 = today
  const currentWeekIdx = weeks.findIndex(w => w.start <= today2 && today2 <= w.end)

  return (
    <div>
      {/* ─── ヘッダー ─── */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800">
            {yearMonth.replace('-', '年')}月 週間KPI
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            月目標をクリックして入力 / 進捗＝着地÷月目標 / 着地＝累計ペース×計画稼働日数
          </p>
        </div>

        {/* チームフィルタ */}
        {teams.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setFilterTeamId(null)}
              className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${filterTeamId === null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              全体
            </button>
            {teams.map(t => (
              <button key={t.id} onClick={() => setFilterTeamId(t.id)}
                className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${filterTeamId === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── テーブル ─── */}
      <div className="rounded-xl border border-slate-200 overflow-x-auto shadow-sm bg-white">
        <table className="border-collapse text-sm" style={{ minWidth: weeks.length * 4 * 52 + 240 }}>

          {/* ─── 週ヘッダー ─── */}
          <thead>
            <tr>
              {/* 担当者 + 月目標 */}
              <th rowSpan={2}
                className="sticky left-0 z-20 px-4 py-3 text-left text-xs font-bold text-white whitespace-nowrap"
                style={{ background: '#1e293b', minWidth: 120, borderRight: '2px solid #334155' }}>
                担当者
              </th>
              <th rowSpan={2}
                className="sticky z-20 px-3 py-3 text-center text-xs font-bold text-white whitespace-nowrap"
                style={{ background: '#1e293b', left: 120, minWidth: 72, borderRight: '2px solid #475569' }}>
                月目標<br /><span className="text-slate-400 font-normal text-[10px]">✎ 編集可</span>
              </th>
              {/* 週 */}
              {weeks.map((w, wi) => (
                <th key={w.label} colSpan={4}
                  className="px-2 py-2 text-center text-xs font-bold border-l"
                  style={{
                    background: wi === currentWeekIdx ? '#1e3a5f' : '#334155',
                    color: wi === currentWeekIdx ? '#93c5fd' : '#cbd5e1',
                    borderColor: '#475569',
                  }}>
                  <div>{w.label}</div>
                  <div className="text-[10px] font-normal opacity-70">{w.range}</div>
                  {wi === currentWeekIdx && <div className="text-[9px] text-blue-300 mt-0.5">◀ 今週</div>}
                </th>
              ))}
            </tr>
            {/* KPI小ヘッダー */}
            <tr>
              {weeks.map((w, wi) => (
                ['現状', '進捗', '生産性', '離席稼働'].map(col => (
                  <th key={`${wi}-${col}`}
                    className="px-1 py-1.5 text-center text-[11px] font-semibold border-l"
                    style={{
                      background: wi === currentWeekIdx ? '#172554' : '#1e293b',
                      color: '#94a3b8',
                      borderColor: '#334155',
                      minWidth: col === '進捗' ? 52 : 48,
                    }}>
                    {col}
                    <div className="text-[9px] font-normal text-slate-600 leading-none mt-0.5">
                      {col === '現状' ? '件' : col === '進捗' ? '%' : col === '生産性' ? '件/日' : '日'}
                    </div>
                  </th>
                ))
              ))}
            </tr>
          </thead>

          {/* ─── データ行 ─── */}
          <tbody>
            {visible.map((row, ri) => {
              const isEven = ri % 2 === 0
              const rowBg = isEven ? '#ffffff' : '#f8fafc'

              return (
                <tr key={row.rep.id}>
                  {/* 担当者名 */}
                  <td className="sticky left-0 z-10 px-4 py-2.5 whitespace-nowrap"
                    style={{ background: rowBg, borderRight: '2px solid #e2e8f0', borderBottom: '1px solid #f1f5f9' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#2563eb)' }}>
                        {row.rep.name.charAt(0)}
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{row.rep.name}</span>
                    </div>
                  </td>

                  {/* 月目標（編集可） */}
                  <td className="sticky z-10 px-2 py-2 text-center"
                    style={{ background: rowBg, left: 120, borderRight: '2px solid #e2e8f0', borderBottom: '1px solid #f1f5f9' }}>
                    <EditableCell
                      value={row.monthPlan}
                      repId={row.rep.id}
                      yearMonth={yearMonth}
                      onSaved={handleTargetSaved}
                    />
                  </td>

                  {/* 週KPI */}
                  {row.weeks.map((wk, wi) => {
                    const isCurr = wi === currentWeekIdx
                    const isPast = weeks[wi].end < today
                    const hasData = wk.actual > 0 || wk.workDays > 0
                    const pc = wk.progress > 0 ? pColor(wk.progress) : { cell: 'transparent', text: '#cbd5e1' }
                    const cellBg = isCurr ? (isEven ? '#f0f9ff' : '#e0f2fe') : rowBg

                    return (
                      <>
                        {/* 現状件数 */}
                        <td key={`${wi}-actual`}
                          className="px-2 py-2.5 text-center border-l"
                          style={{ background: cellBg, borderColor: '#e2e8f0', borderBottom: '1px solid #f1f5f9' }}>
                          <span className="text-sm font-bold" style={{ color: hasData ? '#1e293b' : '#cbd5e1' }}>
                            {hasData ? wk.actual : '—'}
                          </span>
                        </td>
                        {/* 進捗% */}
                        <td key={`${wi}-progress`}
                          className="px-2 py-2.5 text-center border-l"
                          style={{ background: wk.progress > 0 ? pc.cell : cellBg, borderColor: '#e2e8f0', borderBottom: '1px solid #f1f5f9' }}>
                          <span className="text-xs font-bold" style={{ color: pc.text }}>
                            {wk.progress > 0 ? `${wk.progress}%` : '—'}
                          </span>
                        </td>
                        {/* 生産性 */}
                        <td key={`${wi}-prod`}
                          className="px-2 py-2.5 text-center border-l"
                          style={{ background: cellBg, borderColor: '#e2e8f0', borderBottom: '1px solid #f1f5f9' }}>
                          <span className="text-xs font-semibold text-slate-600">
                            {wk.productivity > 0 ? fmt1(wk.productivity) : '—'}
                          </span>
                        </td>
                        {/* 離席稼働 */}
                        <td key={`${wi}-work`}
                          className="px-2 py-2.5 text-center border-l"
                          style={{ background: cellBg, borderColor: '#e2e8f0', borderBottom: '1px solid #f1f5f9' }}>
                          <span className="text-xs font-semibold" style={{ color: wk.workDays > 0 ? '#64748b' : '#cbd5e1' }}>
                            {wk.workDays > 0 ? wk.workDays : '—'}
                          </span>
                        </td>
                      </>
                    )
                  })}
                </tr>
              )
            })}

            {/* ─── 合計行 ─── */}
            {visible.length > 0 && (
              <tr>
                <td className="sticky left-0 z-10 px-4 py-2.5 text-xs font-black text-white"
                  style={{ background: '#334155', borderRight: '2px solid #475569' }}>
                  合計
                </td>
                <td className="sticky z-10 px-2 py-2 text-center text-sm font-black text-slate-200"
                  style={{ background: '#334155', left: 120, borderRight: '2px solid #475569' }}>
                  {visible.reduce((s, r) => s + r.monthPlan, 0) || '—'}
                </td>
                {weeks.map((w, wi) => {
                  const totalActual   = visible.reduce((s, r) => s + r.weeks[wi].actual, 0)
                  const totalWorkDays = visible.reduce((s, r) => s + r.weeks[wi].workDays, 0)
                  const totalProd = totalWorkDays > 0 ? fmt1(totalActual / totalWorkDays) : '—'
                  return (
                    <>
                      <td key={`${wi}-a`} className="px-2 py-2 text-center border-l text-sm font-bold text-slate-200"
                        style={{ background: '#334155', borderColor: '#475569' }}>
                        {totalActual || '—'}
                      </td>
                      <td key={`${wi}-p`} className="px-2 py-2 text-center border-l text-xs text-slate-400"
                        style={{ background: '#334155', borderColor: '#475569' }}>—</td>
                      <td key={`${wi}-pr`} className="px-2 py-2 text-center border-l text-xs font-semibold text-slate-300"
                        style={{ background: '#334155', borderColor: '#475569' }}>
                        {totalProd}
                      </td>
                      <td key={`${wi}-w`} className="px-2 py-2 text-center border-l text-xs font-semibold text-slate-300"
                        style={{ background: '#334155', borderColor: '#475569' }}>
                        {totalWorkDays || '—'}
                      </td>
                    </>
                  )
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div className="flex gap-4 mt-3 flex-wrap text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#f0fdf4', border: '1px solid #15803d' }} />進捗 ≥100%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#eff6ff', border: '1px solid #1d4ed8' }} />≥80%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#fefce8', border: '1px solid #a16207' }} />≥60%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#fff1f2', border: '1px solid #be123c' }} />&lt;60%
        </span>
        <span className="ml-2">
          進捗 ＝ 着地（累計ペース×計画稼働日）÷ 月目標 × 100%
        </span>
      </div>

      {visible.length === 0 && (
        <p className="text-center text-slate-400 text-sm py-10">データがありません</p>
      )}
    </div>
  )
}
