'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, SalesRep, Team } from '@/lib/supabase'

type Props = { yearMonth: string; teams: Team[]; orgIds?: string[] }

// ── テーマ ──────────────────────────────────────────────────────────────────

type Theme = 1 | 2 | 3

const THEMES: { id: Theme; label: string }[] = [
  { id: 1, label: '1. スタンダード' },
  { id: 2, label: '2. ミニマル' },
  { id: 3, label: '3. ファイナンス' },
]

type TK = {
  wrapBg: string; wrapBorder: string; wrapRadius: string
  hBg: string; hText: string
  shBg: string; shText: string
  curHBg: string; curHText: string
  rowE: string; rowO: string
  curRowE: string; curRowO: string
  sticky: (e: boolean) => string
  stickBorder: string
  cBorder: string; rBorder: string
  numFont: string; numSz: string; nameFw: string
  fBg: string; fText: string
}

function tk(t: Theme): TK {
  if (t === 2) return {
    wrapBg:'#fafaf9', wrapBorder:'1px solid #e7e5e4', wrapRadius:'16px',
    hBg:'#292524', hText:'#fafaf9', shBg:'#1c1917', shText:'#a8a29e',
    curHBg:'#1e3a5f', curHText:'#bfdbfe',
    rowE:'#ffffff', rowO:'#fafaf9', curRowE:'#f0f9ff', curRowO:'#e0f2fe',
    sticky: e => e ? '#ffffff' : '#fafaf9', stickBorder:'transparent',
    cBorder:'transparent', rBorder:'#f5f5f4',
    numFont:'inherit', numSz:'13px', nameFw:'500',
    fBg:'#292524', fText:'#d6d3d1',
  }
  if (t === 3) return {
    wrapBg:'#ffffff', wrapBorder:'2px solid #1e293b', wrapRadius:'4px',
    hBg:'#0f172a', hText:'#e2e8f0', shBg:'#1e293b', shText:'#64748b',
    curHBg:'#1e3a5f', curHText:'#93c5fd',
    rowE:'#ffffff', rowO:'#f8fafc', curRowE:'#eff6ff', curRowO:'#dbeafe',
    sticky: e => e ? '#f8fafc' : '#f1f5f9', stickBorder:'#cbd5e1',
    cBorder:'#e2e8f0', rBorder:'#e2e8f0',
    numFont:'monospace', numSz:'13px', nameFw:'700',
    fBg:'#0f172a', fText:'#94a3b8',
  }
  // default = 1
  return {
    wrapBg:'#ffffff', wrapBorder:'1px solid #d1d5db', wrapRadius:'12px',
    hBg:'#1e293b', hText:'#f1f5f9', shBg:'#0f172a', shText:'#94a3b8',
    curHBg:'#1e3a5f', curHText:'#93c5fd',
    rowE:'#ffffff', rowO:'#f8fafc', curRowE:'#eff6ff', curRowO:'#dbeafe',
    sticky: e => e ? '#ffffff' : '#f8fafc', stickBorder:'#e2e8f0',
    cBorder:'#e2e8f0', rBorder:'#f1f5f9',
    numFont:'inherit', numSz:'13px', nameFw:'600',
    fBg:'#334155', fText:'#cbd5e1',
  }
}

// ── 週定義 ───────────────────────────────────────────────────────────────────

type Week = { label: string; range: string; start: string; end: string }

function buildWeeks(yearMonth: string): Week[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const total = new Date(y, m, 0).getDate()
  const firstDow = new Date(y, m - 1, 1).getDay()
  let wed = 1 - (firstDow - 3 + 7) % 7
  const weeks: Week[] = []
  let n = 1
  while (wed <= total) {
    const s = Math.max(wed, 1)
    const e = Math.min(wed + 5, total)
    if (e >= 1) {
      weeks.push({ label: `第${n}週`, range: `${s}日〜${e}日`,
        start: `${yearMonth}-${String(s).padStart(2,'0')}`,
        end:   `${yearMonth}-${String(e).padStart(2,'0')}` })
      n++
    }
    wed += 7
  }
  return weeks
}

// ── KPI計算 ──────────────────────────────────────────────────────────────────

type WeekKPI = {
  weekTarget: number   // 週間獲得目標（手打ち）
  actual: number       // 現状件数
  landing: number      // 着地
  progress: number     // 進捗% = 着地/月目標
  productivity: number // 生産性 = actual/actualDays
  actualDays: number   // 実稼働日数
  planDays: number     // 計画稼働日数
  remainDays: number   // 残稼働 = 計画 - 実稼働
}

type RepRow = {
  rep: SalesRep
  monthPlan: number
  planWorkDays: number
  weeks: WeekKPI[]
  totalActual: number
}

function calcRows(
  reps: SalesRep[], records: any[], schedules: any[],
  plans: any[], weeklyTargets: any[], weeks: Week[], today: string
): RepRow[] {
  return reps.map(rep => {
    const plan = plans.find((p: any) => p.sales_rep_id === rep.id)
    const monthPlan = Number(plan?.plan_cases) || 0
    const scheduledAllDays = schedules.filter((s: any) => s.sales_rep_id === rep.id && s.work_status === '稼働').length
    const planWorkDays = Math.max(Number(plan?.plan_working_days) || 0, scheduledAllDays)
    const repRecords = records.filter((r: any) => r.sales_rep_id === rep.id)
    const repSchedules = schedules.filter((s: any) => s.sales_rep_id === rep.id)

    let cumActual = 0, cumActualDays = 0

    const weekKPIs: WeekKPI[] = weeks.map((week, wi) => {
      // 週間目標（weekly_kpi_targets から）
      const wt = weeklyTargets.find((t: any) => t.sales_rep_id === rep.id && t.week_index === wi)
      const weekTarget = Number(wt?.target) || 0

      // 現状件数・実稼働
      const weekRecs = repRecords.filter((r: any) => r.record_date >= week.start && r.record_date <= week.end)
      const actual   = weekRecs.reduce((s: number, r: any) => s + (Number(r.acquisitions) || 0), 0)
      const actualDays = weekRecs.filter((r: any) => r.work_status === '稼働').length

      // 計画稼働（この週のwork_schedules）
      const planDays = repSchedules.filter((s: any) =>
        s.work_status === '稼働' && s.schedule_date >= week.start && s.schedule_date <= week.end
      ).length

      // 残稼働 = 計画稼働 - 実稼働（0以下は0）
      const remainDays = Math.max(0, planDays - actualDays)

      // 累計（過去・今週のみ）
      const isPastOrCurrent = week.end <= today || (week.start <= today && today <= week.end)
      if (isPastOrCurrent) { cumActual += actual; cumActualDays += actualDays }

      // 着地・進捗
      const landing = isPastOrCurrent && cumActualDays > 0 && planWorkDays > 0
        ? Math.round((cumActual / cumActualDays) * planWorkDays * 10) / 10
        : 0
      const progress = monthPlan > 0 && landing > 0
        ? Math.round((landing / monthPlan) * 100)
        : 0
      const productivity = actualDays > 0
        ? Math.round((actual / actualDays) * 100) / 100
        : 0

      return { weekTarget, actual, landing, progress, productivity, actualDays, planDays, remainDays }
    })

    return { rep, monthPlan, planWorkDays, weeks: weekKPIs,
      totalActual: repRecords.reduce((s: number, r: any) => s + (Number(r.acquisitions) || 0), 0) }
  })
}

// ── 進捗カラー ───────────────────────────────────────────────────────────────

function pColor(pct: number) {
  if (pct >= 100) return { cell:'#f0fdf4', text:'#15803d' }
  if (pct >=  80) return { cell:'#eff6ff', text:'#1d4ed8' }
  if (pct >=  60) return { cell:'#fefce8', text:'#a16207' }
  return               { cell:'#fff1f2', text:'#be123c' }
}

const fmt1 = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1)

// ── 編集セル（月目標） ────────────────────────────────────────────────────────

function MonthTargetCell({ value, repId, yearMonth, onSaved }: {
  value: number; repId: string; yearMonth: string; onSaved: (id: string, v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  async function commit() {
    const n = Math.max(0, parseInt(draft, 10) || 0)
    await supabase.from('monthly_plans').upsert(
      { sales_rep_id: repId, year_month: yearMonth, plan_cases: n, plan_working_days: 0 },
      { onConflict: 'sales_rep_id,year_month' }
    )
    setEditing(false)
    onSaved(repId, n)
  }

  if (editing) return (
    <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-12 text-center text-xs font-bold border-2 border-indigo-400 rounded outline-none py-0.5"
      style={{ background:'#eef2ff', color:'#3730a3' }} type="number" min="0" />
  )
  return (
    <button onClick={() => { setDraft(String(value || '')); setEditing(true) }}
      title="クリックして編集" className="w-full text-center text-xs font-bold rounded hover:bg-indigo-50 transition-colors"
      style={{ color: value ? '#3730a3' : '#cbd5e1', cursor:'text' }}>
      {value || '—'}
    </button>
  )
}

// ── 編集セル（週間目標） ──────────────────────────────────────────────────────

function WeekTargetCell({ value, repId, yearMonth, weekIndex, onSaved }: {
  value: number; repId: string; yearMonth: string; weekIndex: number; onSaved: (id: string, wi: number, v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  async function commit() {
    const n = Math.max(0, parseInt(draft, 10) || 0)
    await supabase.from('weekly_kpi_targets').upsert(
      { sales_rep_id: repId, year_month: yearMonth, week_index: weekIndex, target: n },
      { onConflict: 'sales_rep_id,year_month,week_index' }
    )
    setEditing(false)
    onSaved(repId, weekIndex, n)
  }

  if (editing) return (
    <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      className="w-12 text-center text-xs font-bold border-2 border-amber-400 rounded outline-none py-0.5"
      style={{ background:'#fffbeb', color:'#92400e' }} type="number" min="0" />
  )
  return (
    <button onClick={() => { setDraft(String(value || '')); setEditing(true) }}
      title="週間目標をクリックして編集" className="w-full text-center text-xs font-bold rounded hover:bg-amber-50 transition-colors"
      style={{ color: value ? '#92400e' : '#cbd5e1', cursor:'text' }}>
      {value || '—'}
    </button>
  )
}

// ── メイン ───────────────────────────────────────────────────────────────────

export default function WeeklyKPIView({ yearMonth, teams, orgIds }: Props) {
  const [rows, setRows] = useState<RepRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(1)
  const t = tk(theme)
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
        supabase.from('daily_records').select('sales_rep_id,record_date,acquisitions,work_status')
          .gte('record_date', from).lte('record_date', to),
        supabase.from('work_schedules').select('sales_rep_id,schedule_date,work_status')
          .gte('schedule_date', from).lte('schedule_date', to),
        supabase.from('monthly_plans').select('sales_rep_id,plan_cases,plan_working_days').eq('year_month', yearMonth),
      ])
      reps = r1.data ?? []; records = r2.data ?? []; schedules = r3.data ?? []; plans = r4.data ?? []
    }

    // 週間目標を取得（テーブルが存在しない場合は空配列で続行）
    let weeklyTargets: any[] = []
    try {
      const { data } = await supabase
        .from('weekly_kpi_targets')
        .select('sales_rep_id,week_index,target')
        .eq('year_month', yearMonth)
      weeklyTargets = data ?? []
    } catch { /* テーブル未作成の場合は無視 */ }

    if (!reps?.length) { setLoading(false); return }
    setRows(calcRows(reps, records, schedules, plans, weeklyTargets, weeks, today))
    setLoading(false)
  }

  function handleMonthTargetSaved(repId: string, val: number) {
    setRows(prev => prev.map(r => r.rep.id === repId ? { ...r, monthPlan: val } : r))
  }

  function handleWeekTargetSaved(repId: string, wi: number, val: number) {
    setRows(prev => prev.map(r =>
      r.rep.id === repId
        ? { ...r, weeks: r.weeks.map((w, i) => i === wi ? { ...w, weekTarget: val } : w) }
        : r
    ))
  }

  const visible = filterTeamId ? rows.filter(r => r.rep.team_id === filterTeamId) : rows
  const currentWeekIdx = weeks.findIndex(w => w.start <= today && today <= w.end)

  const COLS = [
    { key:'target',  label:'週目標', unit:'件', editable:true },
    { key:'actual',  label:'現状',   unit:'件' },
    { key:'prog',    label:'進捗',   unit:'%'  },
    { key:'prod',    label:'生産性', unit:'件/日' },
    { key:'actual_d',label:'実稼働', unit:'日' },
    { key:'remain',  label:'残稼働', unit:'日' },
  ] as const

  if (loading) return <div className="text-center py-12 text-slate-400 text-sm">読み込み中...</div>

  return (
    <div>
      {/* ── ヘッダー ── */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800">{yearMonth.replace('-','年')}月 週間KPI</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            月目標・週目標はクリックして入力 / 進捗=着地÷月目標 / 残稼働=計画稼働-実稼働
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {/* テーマ切り替え */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background:'#f1f5f9' }}>
            {THEMES.map(th => (
              <button key={th.id} onClick={() => setTheme(th.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{ background: theme===th.id ? '#1e293b':'transparent', color: theme===th.id ? '#f1f5f9':'#64748b',
                  boxShadow: theme===th.id ? '0 1px 4px rgba(0,0,0,0.25)':'none' }}>
                {th.label}
              </button>
            ))}
          </div>
          {teams.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              <button onClick={() => setFilterTeamId(null)}
                className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${filterTeamId===null ? 'bg-indigo-600 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>全体</button>
              {teams.map(tm => (
                <button key={tm.id} onClick={() => setFilterTeamId(tm.id)}
                  className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${filterTeamId===tm.id ? 'bg-indigo-600 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{tm.name}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── テーブル ── */}
      <div className="overflow-x-auto shadow-sm"
        style={{ background:t.wrapBg, border:t.wrapBorder, borderRadius:t.wrapRadius }}>
        <table className="border-collapse" style={{ minWidth: weeks.length * COLS.length * 48 + 220 }}>
          <thead>
            <tr>
              {/* 担当者 */}
              <th rowSpan={2} className="sticky left-0 z-20 px-4 py-3 text-left whitespace-nowrap"
                style={{ background:t.hBg, color:t.hText, fontSize:12, fontWeight:700, minWidth:128, borderRight:`2px solid ${t.stickBorder}` }}>
                担当者
              </th>
              {/* 月目標 */}
              <th rowSpan={2} className="sticky z-20 px-3 py-3 text-center whitespace-nowrap"
                style={{ background:t.hBg, color:t.hText, fontSize:12, fontWeight:700, left:128, minWidth:68, borderRight:`2px solid ${t.stickBorder}` }}>
                月目標<br/><span style={{ color:t.shText, fontWeight:400, fontSize:10 }}>✎ 編集可</span>
              </th>
              {/* 週ヘッダー */}
              {weeks.map((w, wi) => (
                <th key={w.label} colSpan={COLS.length} className="px-2 py-2 text-center border-l"
                  style={{ background: wi===currentWeekIdx ? t.curHBg:t.hBg, color: wi===currentWeekIdx ? t.curHText:t.hText,
                    fontSize:12, fontWeight:700, borderColor:t.shBg }}>
                  <div>{w.label}</div>
                  <div style={{ fontSize:10, fontWeight:400, opacity:0.7 }}>{w.range}</div>
                  {wi===currentWeekIdx && <div style={{ fontSize:9, color:t.curHText, marginTop:2 }}>◀ 今週</div>}
                </th>
              ))}
            </tr>
            <tr>
              {weeks.map((_, wi) =>
                COLS.map(col => (
                  <th key={`${wi}-${col.key}`} className="px-1 py-1.5 text-center border-l"
                    style={{ background: wi===currentWeekIdx ? t.curHBg:t.shBg, color:t.shText, fontSize:11, fontWeight:600,
                      borderColor:t.hBg, minWidth:48,
                      ...(col.key==='target' ? { borderLeft:`2px solid ${t.stickBorder}` } : {}) }}>
                    {col.label}
                    <div style={{ fontSize:9, fontWeight:400, color:'#475569', marginTop:1 }}>{col.unit}</div>
                  </th>
                ))
              )}
            </tr>
          </thead>

          <tbody>
            {visible.map((row, ri) => {
              const isEven = ri % 2 === 0
              const rowBg = isEven ? t.rowE : t.rowO

              return (
                <tr key={row.rep.id}>
                  {/* 担当者名 */}
                  <td className="sticky left-0 z-10 px-4 py-2.5 whitespace-nowrap"
                    style={{ background:t.sticky(isEven), borderRight:`2px solid ${t.stickBorder}`, borderBottom:`1px solid ${t.rBorder}` }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                        style={{ background:'linear-gradient(135deg,#6366f1,#2563eb)' }}>
                        {row.rep.name.charAt(0)}
                      </div>
                      <span style={{ fontSize:13, fontWeight:t.nameFw, color:'#1e293b' }}>{row.rep.name}</span>
                    </div>
                  </td>

                  {/* 月目標 */}
                  <td className="sticky z-10 px-2 py-2 text-center"
                    style={{ background:t.sticky(isEven), left:128, borderRight:`2px solid ${t.stickBorder}`, borderBottom:`1px solid ${t.rBorder}` }}>
                    <MonthTargetCell value={row.monthPlan} repId={row.rep.id} yearMonth={yearMonth} onSaved={handleMonthTargetSaved} />
                  </td>

                  {/* 週KPI */}
                  {row.weeks.map((wk, wi) => {
                    const isCurr = wi === currentWeekIdx
                    const hasData = wk.actual > 0 || wk.actualDays > 0
                    const pc = wk.progress > 0 ? pColor(wk.progress) : { cell:'transparent', text:'#cbd5e1' }
                    const cellBg = isCurr ? (isEven ? t.curRowE : t.curRowO) : rowBg
                    const border = { borderBottom:`1px solid ${t.rBorder}` }
                    const leftBorder = { borderLeft:`2px solid ${t.stickBorder}` }

                    return (
                      <>
                        {/* 週目標（編集可）*/}
                        <td key={`${wi}-tg`} className="px-2 py-2.5 text-center"
                          style={{ ...border, ...leftBorder, background: cellBg }}>
                          <WeekTargetCell value={wk.weekTarget} repId={row.rep.id} yearMonth={yearMonth} weekIndex={wi} onSaved={handleWeekTargetSaved} />
                        </td>
                        {/* 現状件数 */}
                        <td key={`${wi}-ac`} className="px-2 py-2.5 text-center border-l"
                          style={{ ...border, borderColor:t.cBorder, background: cellBg }}>
                          <span style={{ fontFamily:t.numFont, fontSize:t.numSz, fontWeight:700, color: hasData ? '#1e293b':'#cbd5e1' }}>
                            {hasData ? wk.actual : '—'}
                          </span>
                        </td>
                        {/* 進捗% */}
                        <td key={`${wi}-pg`} className="px-2 py-2.5 text-center border-l"
                          style={{ ...border, borderColor:t.cBorder, background: wk.progress>0 ? pc.cell : cellBg }}>
                          <span style={{ fontFamily:t.numFont, fontSize:12, fontWeight:700, color: pc.text }}>
                            {wk.progress > 0 ? `${wk.progress}%` : '—'}
                          </span>
                        </td>
                        {/* 生産性 */}
                        <td key={`${wi}-pr`} className="px-2 py-2.5 text-center border-l"
                          style={{ ...border, borderColor:t.cBorder, background: cellBg }}>
                          <span style={{ fontFamily:t.numFont, fontSize:12, fontWeight:600, color: wk.productivity>0 ? '#475569':'#cbd5e1' }}>
                            {wk.productivity > 0 ? fmt1(wk.productivity) : '—'}
                          </span>
                        </td>
                        {/* 実稼働 */}
                        <td key={`${wi}-ad`} className="px-2 py-2.5 text-center border-l"
                          style={{ ...border, borderColor:t.cBorder, background: cellBg }}>
                          <span style={{ fontFamily:t.numFont, fontSize:12, fontWeight:600, color: wk.actualDays>0 ? '#64748b':'#cbd5e1' }}>
                            {wk.actualDays > 0 ? wk.actualDays : '—'}
                          </span>
                        </td>
                        {/* 残稼働 */}
                        <td key={`${wi}-rm`} className="px-2 py-2.5 text-center border-l"
                          style={{ ...border, borderColor:t.cBorder, background: cellBg }}>
                          <span style={{ fontFamily:t.numFont, fontSize:12, fontWeight:600,
                            color: wk.remainDays > 0 ? '#0369a1' : wk.planDays > 0 ? '#15803d' : '#cbd5e1' }}>
                            {wk.planDays > 0 ? wk.remainDays : '—'}
                          </span>
                        </td>
                      </>
                    )
                  })}
                </tr>
              )
            })}

            {/* 合計行 */}
            {visible.length > 0 && (
              <tr>
                <td className="sticky left-0 z-10 px-4 py-2.5"
                  style={{ background:t.fBg, color:t.fText, fontWeight:800, fontSize:12, borderRight:`2px solid ${t.stickBorder}` }}>合計</td>
                <td className="sticky z-10 px-2 py-2 text-center"
                  style={{ background:t.fBg, color:'#e2e8f0', fontWeight:800, fontSize:13, left:128, borderRight:`2px solid ${t.stickBorder}` }}>
                  {visible.reduce((s, r) => s + r.monthPlan, 0) || '—'}
                </td>
                {weeks.map((_, wi) => {
                  const sumWkTarget  = visible.reduce((s, r) => s + r.weeks[wi].weekTarget, 0)
                  const sumActual    = visible.reduce((s, r) => s + r.weeks[wi].actual, 0)
                  const sumActualD   = visible.reduce((s, r) => s + r.weeks[wi].actualDays, 0)
                  const sumPlanD     = visible.reduce((s, r) => s + r.weeks[wi].planDays, 0)
                  const sumRemain    = visible.reduce((s, r) => s + r.weeks[wi].remainDays, 0)
                  const sumProd      = sumActualD > 0 ? fmt1(sumActual / sumActualD) : '—'
                  const ftd = (key: string, v: React.ReactNode, bl?: boolean) => (
                    <td key={key} className="px-2 py-2 text-center border-l"
                      style={{ background:t.fBg, borderColor:t.shBg, ...(bl ? { borderLeft:`2px solid ${t.stickBorder}` } : {}) }}>
                      {v}
                    </td>
                  )
                  const num = (v: React.ReactNode) => <span style={{ fontFamily:t.numFont, fontSize:12, fontWeight:700, color:'#e2e8f0' }}>{v}</span>
                  const dim = (v: React.ReactNode) => <span style={{ fontFamily:t.numFont, fontSize:12, fontWeight:600, color:t.fText }}>{v}</span>
                  return (
                    <>
                      {ftd(`${wi}-tg`, num(sumWkTarget || '—'), true)}
                      {ftd(`${wi}-ac`, num(sumActual || '—'))}
                      {ftd(`${wi}-pg`, dim('—'))}
                      {ftd(`${wi}-pr`, dim(sumProd))}
                      {ftd(`${wi}-ad`, dim(sumActualD || '—'))}
                      {ftd(`${wi}-rm`, dim(sumRemain || '—'))}
                    </>
                  )
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div className="flex gap-4 mt-3 flex-wrap text-xs text-slate-500 items-center">
        {[['#f0fdf4','#15803d','≥100%'], ['#eff6ff','#1d4ed8','≥80%'], ['#fefce8','#a16207','≥60%'], ['#fff1f2','#be123c','<60%']].map(([bg, c, lbl]) => (
          <span key={lbl} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ background:bg, border:`1px solid ${c}` }}/>
            進捗{lbl}
          </span>
        ))}
        <span className="ml-2 text-slate-400">残稼働 = 計画稼働 − 実稼働 / 進捗 = 着地 ÷ 月目標 × 100%</span>
      </div>

      {visible.length === 0 && (
        <p className="text-center text-slate-400 text-sm py-10">データがありません</p>
      )}
    </div>
  )
}
