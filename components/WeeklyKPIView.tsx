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
  wrap: string; border: string; radius: string
  hBg: string; hText: string
  sh1Bg: string  // 件数セクションヘッダー
  sh2Bg: string  // 稼働セクションヘッダー
  sh3Bg: string  // 週セクションヘッダー
  shText: string
  curWkBg: string; curWkText: string
  rowE: string; rowO: string
  sticky: (e: boolean) => string
  stickBd: string; cBd: string; rBd: string
  fBg: string; fText: string
  numFont: string; nameFw: string
}

function getTK(t: Theme): TK {
  if (t === 2) return {
    wrap:'#fafaf9', border:'1px solid #e7e5e4', radius:'16px',
    hBg:'#292524', hText:'#fafaf9',
    sh1Bg:'#1c4966', sh2Bg:'#1a4731', sh3Bg:'#3d2d0f',
    shText:'#e2e8f0',
    curWkBg:'#1e3a5f', curWkText:'#bfdbfe',
    rowE:'#ffffff', rowO:'#fafaf9',
    sticky: e => e ? '#ffffff':'#fafaf9', stickBd:'transparent',
    cBd:'transparent', rBd:'#f5f5f4',
    fBg:'#292524', fText:'#d6d3d1',
    numFont:'inherit', nameFw:'500',
  }
  if (t === 3) return {
    wrap:'#ffffff', border:'2px solid #0f172a', radius:'4px',
    hBg:'#0f172a', hText:'#e2e8f0',
    sh1Bg:'#1e3a5f', sh2Bg:'#14532d', sh3Bg:'#451a03',
    shText:'#e2e8f0',
    curWkBg:'#1e3a5f', curWkText:'#93c5fd',
    rowE:'#ffffff', rowO:'#f8fafc',
    sticky: e => e ? '#f8fafc':'#f1f5f9', stickBd:'#cbd5e1',
    cBd:'#e2e8f0', rBd:'#e2e8f0',
    fBg:'#0f172a', fText:'#94a3b8',
    numFont:'monospace', nameFw:'700',
  }
  return {
    wrap:'#ffffff', border:'1px solid #d1d5db', radius:'12px',
    hBg:'#1e293b', hText:'#f1f5f9',
    sh1Bg:'#1e3a5f', sh2Bg:'#14532d', sh3Bg:'#451a03',
    shText:'#e2e8f0',
    curWkBg:'#1e3a5f', curWkText:'#93c5fd',
    rowE:'#ffffff', rowO:'#f8fafc',
    sticky: e => e ? '#ffffff':'#f8fafc', stickBd:'#e2e8f0',
    cBd:'#e2e8f0', rBd:'#f1f5f9',
    fBg:'#334155', fText:'#cbd5e1',
    numFont:'inherit', nameFw:'600',
  }
}

// ── 週定義 ───────────────────────────────────────────────────────────────────

type Week = { label: string; range: string; start: string; end: string }

function buildWeeks(ym: string): Week[] {
  const [y, m] = ym.split('-').map(Number)
  const total = new Date(y, m, 0).getDate()
  let wed = 1 - (new Date(y, m - 1, 1).getDay() - 3 + 7) % 7
  const weeks: Week[] = []
  let n = 1
  while (wed <= total) {
    const s = Math.max(wed, 1), e = Math.min(wed + 5, total)
    if (e >= 1) {
      weeks.push({ label:`第${n}週`, range:`${s}日〜${e}日`,
        start:`${ym}-${String(s).padStart(2,'0')}`,
        end:  `${ym}-${String(e).padStart(2,'0')}` })
      n++
    }
    wed += 7
  }
  return weeks
}

// ── データ型 ─────────────────────────────────────────────────────────────────

type RepRow = {
  rep: SalesRep
  // 月全体
  monthTarget: number    // 月目標（手打ち）
  monthActual: number    // 月現状
  monthYoji: number      // 予実 = 計画稼働 × 生産性
  monthProgress: number  // 進捗% = 予実/目標
  monthProd: number      // 生産性 = 現状/実稼
  monthPlanDays: number  // 計画稼働日数
  monthActualDays: number // 実稼働日数
  monthRemain: number    // 残稼働
  // 週別
  weeks: {
    target: number       // 週目標（手打ち）
    actual: number       // 週現状
    planDays: number     // 週計画稼働
    actualDays: number   // 週実稼働
  }[]
}

function calc(
  reps: SalesRep[], records: any[], schedules: any[],
  plans: any[], weeklyTargets: any[], weeks: Week[]
): RepRow[] {
  return reps.map(rep => {
    const plan = plans.find((p: any) => p.sales_rep_id === rep.id)
    const monthTarget = Number(plan?.plan_cases) || 0
    const recs = records.filter((r: any) => r.sales_rep_id === rep.id)
    const scheds = schedules.filter((s: any) => s.sales_rep_id === rep.id)

    const monthActual = recs.reduce((s: number, r: any) => s + (Number(r.acquisitions) || 0), 0)
    const today = new Date().toISOString().slice(0, 10)
    const monthActualDays = scheds.filter((s: any) => s.work_status === '稼働' && s.schedule_date <= today).length
    const reportedDates = new Set(recs.map((r: any) => r.record_date))
    const effectiveScheds = scheds.filter((s: any) =>
      s.work_status === '稼働' &&
      (s.schedule_date >= today || reportedDates.has(s.schedule_date))
    )
    const scheduledDays = effectiveScheds.length
    const monthPlanDays = scheduledDays > 0 ? scheduledDays : (Number(plan?.plan_working_days) || 0)

    const monthProd = monthActualDays > 0 ? monthActual / monthActualDays : 0
    const monthYoji = monthPlanDays > 0 && monthProd > 0
      ? Math.round(monthPlanDays * monthProd * 10) / 10
      : 0
    const monthProgress = monthTarget > 0 && monthYoji > 0
      ? Math.round((monthYoji / monthTarget) * 100) : 0
    const monthRemain = Math.max(0, monthPlanDays - monthActualDays)

    const wks = weeks.map((week, wi) => {
      const wt = weeklyTargets.find((t: any) => t.sales_rep_id === rep.id && t.week_index === wi)
      const weekRecs = recs.filter((r: any) => r.record_date >= week.start && r.record_date <= week.end)
      return {
        target: Number(wt?.target) || 0,
        actual: weekRecs.reduce((s: number, r: any) => s + (Number(r.acquisitions) || 0), 0),
        planDays: effectiveScheds.filter((s: any) => s.schedule_date >= week.start && s.schedule_date <= week.end).length,
        actualDays: scheds.filter((s: any) => s.work_status === '稼働' && s.schedule_date >= week.start && s.schedule_date <= week.end && s.schedule_date <= today).length,
      }
    })

    return {
      rep, monthTarget, monthActual, monthYoji, monthProgress,
      monthProd: Math.round(monthProd * 100) / 100,
      monthPlanDays, monthActualDays, monthRemain, weeks: wks,
    }
  })
}

// ── カラー ───────────────────────────────────────────────────────────────────

function pColor(pct: number) {
  if (pct >= 100) return { bg:'#f0fdf4', text:'#15803d', border:'#86efac' }
  if (pct >=  80) return { bg:'#eff6ff', text:'#1d4ed8', border:'#93c5fd' }
  if (pct >=  60) return { bg:'#fefce8', text:'#a16207', border:'#fde047' }
  if (pct >    0) return { bg:'#fff1f2', text:'#be123c', border:'#fca5a5' }
  return               { bg:'transparent', text:'#cbd5e1', border:'transparent' }
}

const fmt1 = (n: number) => n === 0 ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1)
const fmtPct = (n: number) => n === 0 ? '—' : `${n}%`
const DASH = <span style={{ color:'#cbd5e1' }}>—</span>

// ── 編集セル ─────────────────────────────────────────────────────────────────

function EditCell({ value, color = 'indigo', onCommit }: {
  value: number; color?: 'indigo' | 'amber'; onCommit: (v: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const ci = color === 'amber'
    ? { bd:'#fcd34d', bg:'#fffbeb', text:'#92400e', hover:'#fef9c3' }
    : { bd:'#818cf8', bg:'#eef2ff', text:'#3730a3', hover:'#e0e7ff' }

  async function commit() {
    const n = Math.max(0, parseInt(draft, 10) || 0)
    setSaving(true)
    await onCommit(n)
    setSaving(false)
    setEditing(false)
  }

  if (editing) return (
    <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      style={{ width: 44, textAlign:'center', fontSize: 12, fontWeight: 700,
        border:`2px solid ${ci.bd}`, borderRadius: 6, background: ci.bg, color: ci.text, outline:'none' }}
      type="number" min="0" disabled={saving} />
  )
  return (
    <button onClick={() => { setDraft(String(value || '')); setEditing(true) }}
      title="クリックして編集"
      style={{ width:'100%', textAlign:'center', fontSize: 12, fontWeight: 700,
        color: value ? ci.text : '#cbd5e1', cursor:'text', borderRadius: 4,
        padding: '2px 4px', background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = ci.hover)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      {value || '—'}
    </button>
  )
}

// ── 翌月計算 ────────────────────────────────────────────────────────────────

function nextYearMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, '0')}`
}

function fmtYM(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m)}月`
}

// ── メイン ───────────────────────────────────────────────────────────────────

export default function WeeklyKPIView({ yearMonth, teams, orgIds }: Props) {
  const [rows, setRows] = useState<RepRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(1)
  const [monthOffset, setMonthOffset] = useState<0 | 1>(0)  // 0=今月, 1=翌月
  const viewMonth = monthOffset === 1 ? nextYearMonth(yearMonth) : yearMonth
  const tk = getTK(theme)
  const today = new Date().toISOString().slice(0, 10)
  const weeks = buildWeeks(viewMonth)
  const currentWeekIdx = monthOffset === 0
    ? weeks.findIndex(w => w.start <= today && today <= w.end)
    : -1

  useEffect(() => { setMonthOffset(0) }, [yearMonth])
  useEffect(() => { load() }, [viewMonth, orgIds?.join(',')])

  async function load() {
    setLoading(true)
    const [yStr, mStr] = viewMonth.split('-')
    const lastDay = new Date(parseInt(yStr), parseInt(mStr), 0).getDate()
    const from = `${yStr}-${mStr}-01`
    const to   = `${yStr}-${mStr}-${String(lastDay).padStart(2,'0')}`

    let reps: any[], records: any[], schedules: any[], plans: any[]
    if (orgIds && orgIds.length > 1) {
      const d = await fetch(`/api/combined/data?orgIds=${orgIds.join(',')}&yearMonth=${viewMonth}`).then(r => r.json())
      reps = d.reps; records = d.records; schedules = d.schedules; plans = d.plans
    } else {
      const [r1,r2,r3,r4] = await Promise.all([
        supabase.from('sales_reps').select('*').eq('is_active',true).order('display_order'),
        supabase.from('daily_records').select('sales_rep_id,record_date,acquisitions,work_status').gte('record_date',from).lte('record_date',to),
        supabase.from('work_schedules').select('sales_rep_id,schedule_date,work_status').gte('schedule_date',from).lte('schedule_date',to),
        supabase.from('monthly_plans').select('sales_rep_id,plan_cases,plan_working_days').eq('year_month',viewMonth),
      ])
      reps = r1.data??[]; records = r2.data??[]; schedules = r3.data??[]; plans = r4.data??[]
    }

    let weeklyTargets: any[] = []
    try {
      const { data } = await supabase.from('weekly_kpi_targets').select('sales_rep_id,week_index,target').eq('year_month',viewMonth)
      weeklyTargets = data ?? []
    } catch {}

    if (!reps?.length) { setLoading(false); return }
    setRows(calc(reps, records, schedules, plans, weeklyTargets, weeks))
    setLoading(false)
  }

  const visible = filterTeamId ? rows.filter(r => r.rep.team_id === filterTeamId) : rows

  // チームサマリー
  const totalTarget = visible.reduce((s, r) => s + r.monthTarget, 0)
  const totalActual = visible.reduce((s, r) => s + r.monthActual, 0)
  const totalRate = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0

  if (loading) return <div className="text-center py-12 text-slate-400 text-sm">読み込み中...</div>

  // ── セルビルダー
  const cell = (
    content: React.ReactNode,
    bg = 'transparent',
    opts?: { bl?: boolean; border?: string; rBd?: string }
  ) => ({ content, bg, bl: opts?.bl ?? false, border: opts?.border, rBd: opts?.rBd })

  return (
    <div>
      {/* ── ヘッダー ── */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          {/* 月サマリーバナー */}
          <div className="flex items-center gap-4 mb-2">
            {/* 今月 / 翌月 トグル */}
            <div className="flex gap-0.5 p-0.5 rounded-xl" style={{ background:'#e2e8f0' }}>
              {([0, 1] as const).map(offset => (
                <button
                  key={offset}
                  onClick={() => setMonthOffset(offset)}
                  className="px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all"
                  style={{
                    background: monthOffset === offset ? '#1e293b' : 'transparent',
                    color: monthOffset === offset ? '#f1f5f9' : '#64748b',
                    boxShadow: monthOffset === offset ? '0 1px 4px rgba(0,0,0,0.25)' : 'none',
                  }}
                >
                  {offset === 0 ? '今月' : '翌月'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
              style={{ background:'#1e293b', color:'white' }}>
              <span className="text-base font-black">{fmtYM(viewMonth)}</span>
              <span className="text-xl font-black text-emerald-400">{totalActual}件</span>
              <span className="text-slate-400 text-sm">／</span>
              <span className="text-sm font-bold text-slate-300">{totalTarget > 0 ? `${totalTarget}件` : '目標未設定'}</span>
              {totalTarget > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-black"
                  style={{ background: totalRate >= 100 ? '#15803d' : totalRate >= 80 ? '#1d4ed8' : '#be123c',
                    color: 'white' }}>
                  達成率 {totalRate}%
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400">
            月目標・週目標はセルをクリックして入力 / 予実=計画稼働×生産性 / 進捗=予実÷月目標
          </p>
        </div>

        <div className="flex flex-col gap-2 items-end">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background:'#f1f5f9' }}>
            {THEMES.map(th => (
              <button key={th.id} onClick={() => setTheme(th.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{ background: theme===th.id ? '#1e293b':'transparent',
                  color: theme===th.id ? '#f1f5f9':'#64748b',
                  boxShadow: theme===th.id ? '0 1px 4px rgba(0,0,0,0.25)':'none' }}>
                {th.label}
              </button>
            ))}
          </div>
          {teams.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              <button onClick={() => setFilterTeamId(null)}
                className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${filterTeamId===null?'bg-indigo-600 text-white':'bg-slate-100 text-slate-600'}`}>全体</button>
              {teams.map(tm => (
                <button key={tm.id} onClick={() => setFilterTeamId(tm.id)}
                  className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${filterTeamId===tm.id?'bg-indigo-600 text-white':'bg-slate-100 text-slate-600'}`}>{tm.name}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── テーブル ── */}
      <div className="overflow-x-auto shadow-sm"
        style={{ background:tk.wrap, border:tk.border, borderRadius:tk.radius }}>
        <table className="border-collapse text-xs" style={{ minWidth: weeks.length * 4 * 48 + 380 }}>
          <thead>
            {/* セクションヘッダー */}
            <tr>
              <th rowSpan={2} className="sticky left-0 z-20 px-4 py-2.5 text-left whitespace-nowrap"
                style={{ background:tk.hBg, color:tk.hText, fontSize:12, fontWeight:700, minWidth:128,
                  borderRight:`2px solid ${tk.stickBd}`, borderBottom:`1px solid ${tk.stickBd}` }}>
                担当者
              </th>

              {/* 件数（全体）: 5列 */}
              <th colSpan={5} className="px-3 py-2 text-center border-l"
                style={{ background:tk.sh1Bg, color:'#bfdbfe', fontSize:11, fontWeight:700, borderColor:tk.hBg }}>
                件数（全体）
              </th>

              {/* 稼働（全体）: 3列 */}
              <th colSpan={3} className="px-3 py-2 text-center border-l"
                style={{ background:tk.sh2Bg, color:'#bbf7d0', fontSize:11, fontWeight:700, borderColor:tk.hBg }}>
                稼働（全体）
              </th>

              {/* 週別 */}
              {weeks.map((w, wi) => (
                <th key={w.label} colSpan={4} className="px-2 py-2 text-center border-l"
                  style={{ background: wi===currentWeekIdx ? tk.curWkBg : tk.sh3Bg,
                    color: wi===currentWeekIdx ? tk.curWkText : '#fed7aa',
                    fontSize:11, fontWeight:700, borderColor:tk.hBg }}>
                  {w.label}
                  <span style={{ fontSize:9, fontWeight:400, opacity:0.75, marginLeft:4 }}>{w.range}</span>
                  {wi===currentWeekIdx && <span style={{ fontSize:9, color:tk.curWkText, marginLeft:4 }}>◀ 今週</span>}
                </th>
              ))}
            </tr>

            {/* カラム名 */}
            <tr>
              {/* 件数（全体）の列 */}
              {[
                { label:'月目標', unit:'件', note:'✎' },
                { label:'現状',   unit:'件' },
                { label:'予実',   unit:'件', note:'計画×生産性' },
                { label:'進捗',   unit:'%'  },
                { label:'生産性', unit:'件/日' },
              ].map((col, ci) => (
                <th key={ci} className="px-2 py-1.5 text-center border-l"
                  style={{ background:tk.sh1Bg, color:'#93c5fd', fontSize:11, fontWeight:600,
                    borderColor:tk.hBg, minWidth:52,
                    ...(ci===0 ? { borderLeft:`2px solid ${tk.stickBd}` } : {}) }}>
                  {col.label}
                  <div style={{ fontSize:9, color:'#60a5fa', fontWeight:400, marginTop:1 }}>
                    {col.note ?? col.unit}
                  </div>
                </th>
              ))}

              {/* 稼働（全体）の列 */}
              {[
                { label:'計画稼働', unit:'日' },
                { label:'実稼働',   unit:'日' },
                { label:'残稼働',   unit:'日', note:'計画-実稼' },
              ].map((col, ci) => (
                <th key={ci} className="px-2 py-1.5 text-center border-l"
                  style={{ background:tk.sh2Bg, color:'#86efac', fontSize:11, fontWeight:600,
                    borderColor:tk.hBg, minWidth:52,
                    ...(ci===0 ? { borderLeft:`2px solid ${tk.stickBd}` } : {}) }}>
                  {col.label}
                  <div style={{ fontSize:9, color:'#4ade80', fontWeight:400, marginTop:1 }}>
                    {col.note ?? col.unit}
                  </div>
                </th>
              ))}

              {/* 週別の列 */}
              {weeks.map((_, wi) =>
                [
                  { label:'週目標', unit:'件', note:'✎', key:'t' },
                  { label:'現状',   unit:'件', key:'a' },
                  { label:'計画稼', unit:'日', key:'p' },
                  { label:'実稼働', unit:'日', key:'d' },
                ].map((col, ci) => (
                  <th key={`${wi}-${col.key}`} className="px-1 py-1.5 text-center border-l"
                    style={{ background: wi===currentWeekIdx ? tk.curWkBg : tk.sh3Bg,
                      color: wi===currentWeekIdx ? tk.curWkText : '#fdba74',
                      fontSize:10, fontWeight:600, borderColor:tk.hBg, minWidth:46,
                      ...(ci===0 ? { borderLeft:`2px solid ${tk.stickBd}` } : {}) }}>
                    {col.label}
                    <div style={{ fontSize:9, fontWeight:400, opacity:0.7, marginTop:1 }}>
                      {col.note ?? col.unit}
                    </div>
                  </th>
                ))
              )}
            </tr>
          </thead>

          <tbody>
            {visible.map((row, ri) => {
              const isEven = ri % 2 === 0
              const bg = isEven ? tk.rowE : tk.rowO
              const pc = pColor(row.monthProgress)

              // セル共通スタイル
              const td = (key: string, content: React.ReactNode, opts?: {
                bg?: string; bl?: boolean; fw?: number; color?: string
              }) => (
                <td key={key} className="px-2 py-2.5 text-center border-l"
                  style={{ background: opts?.bg ?? bg, borderColor:tk.cBd, borderBottom:`1px solid ${tk.rBd}`,
                    ...(opts?.bl ? { borderLeft:`2px solid ${tk.stickBd}` } : {}) }}>
                  <span style={{ fontFamily:tk.numFont, fontSize:12, fontWeight:opts?.fw ?? 600,
                    color: opts?.color ?? '#475569' }}>
                    {content}
                  </span>
                </td>
              )

              return (
                <tr key={row.rep.id}>
                  {/* 担当者 */}
                  <td className="sticky left-0 z-10 px-4 py-2.5 whitespace-nowrap"
                    style={{ background:tk.sticky(isEven), borderRight:`2px solid ${tk.stickBd}`, borderBottom:`1px solid ${tk.rBd}` }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                        style={{ background:'linear-gradient(135deg,#6366f1,#2563eb)' }}>
                        {row.rep.name.charAt(0)}
                      </div>
                      <span style={{ fontSize:13, fontWeight:tk.nameFw, color:'#1e293b' }}>{row.rep.name}</span>
                    </div>
                  </td>

                  {/* ── 件数（全体） ── */}
                  {/* 月目標（編集可） */}
                  <td className="px-2 py-2.5 text-center"
                    style={{ background:bg, borderLeft:`2px solid ${tk.stickBd}`, borderColor:tk.cBd, borderBottom:`1px solid ${tk.rBd}` }}>
                    <EditCell value={row.monthTarget} color="indigo"
                      onCommit={async v => {
                        await supabase.from('monthly_plans').upsert(
                          { sales_rep_id:row.rep.id, year_month:yearMonth, plan_cases:v, plan_working_days:0 },
                          { onConflict:'sales_rep_id,year_month' }
                        )
                        setRows(prev => prev.map(r => r.rep.id===row.rep.id
                          ? { ...r, monthTarget:v,
                              monthProgress: v>0 && r.monthYoji>0 ? Math.round((r.monthYoji/v)*100) : 0 }
                          : r))
                      }} />
                  </td>
                  {/* 月現状 */}
                  {td('ma', row.monthActual > 0 ? row.monthActual : DASH, { fw:700, color:'#1e293b' })}
                  {/* 予実 */}
                  {td('my', row.monthYoji > 0 ? fmt1(row.monthYoji) : DASH, { fw:700, color:'#0369a1' })}
                  {/* 進捗 */}
                  <td key="mpg" className="px-2 py-2.5 text-center border-l"
                    style={{ background: row.monthProgress>0 ? pc.bg : bg, borderColor:tk.cBd, borderBottom:`1px solid ${tk.rBd}` }}>
                    <span style={{ fontFamily:tk.numFont, fontSize:12, fontWeight:700, color: pc.text }}>
                      {fmtPct(row.monthProgress)}
                    </span>
                  </td>
                  {/* 生産性 */}
                  {td('mprod', row.monthProd > 0 ? fmt1(row.monthProd) : DASH, { color:'#475569' })}

                  {/* ── 稼働（全体） ── */}
                  {td('mpd', row.monthPlanDays > 0 ? row.monthPlanDays : DASH, { bl:true, color:'#15803d', fw:600 })}
                  {td('mad', row.monthActualDays > 0 ? row.monthActualDays : DASH, { color:'#64748b', fw:600 })}
                  {td('mrem', row.monthRemain > 0 ? row.monthRemain : row.monthPlanDays > 0 ? '0' : DASH,
                    { color: row.monthRemain > 0 ? '#0369a1' : '#15803d', fw:700 })}

                  {/* ── 週別 ── */}
                  {row.weeks.map((wk, wi) => {
                    const isCurr = wi === currentWeekIdx
                    const wkBg = isCurr ? (isEven ? '#eff6ff':'#dbeafe') : bg
                    const wtd = (key: string, content: React.ReactNode, opts?: { fw?: number; color?: string }) => (
                      <td key={key} className="px-2 py-2.5 text-center border-l"
                        style={{ background: wkBg, borderColor:tk.cBd, borderBottom:`1px solid ${tk.rBd}` }}>
                        <span style={{ fontFamily:tk.numFont, fontSize:11, fontWeight:opts?.fw??600, color:opts?.color??'#64748b' }}>
                          {content}
                        </span>
                      </td>
                    )
                    return (
                      <>
                        {/* 週目標（編集可） */}
                        <td key={`${wi}-tg`} className="px-2 py-2.5 text-center"
                          style={{ background:wkBg, borderLeft:`2px solid ${tk.stickBd}`, borderColor:tk.cBd, borderBottom:`1px solid ${tk.rBd}` }}>
                          <EditCell value={wk.target} color="amber"
                            onCommit={async v => {
                              await supabase.from('weekly_kpi_targets').upsert(
                                { sales_rep_id:row.rep.id, year_month:yearMonth, week_index:wi, target:v },
                                { onConflict:'sales_rep_id,year_month,week_index' }
                              )
                              setRows(prev => prev.map(r => r.rep.id===row.rep.id
                                ? { ...r, weeks:r.weeks.map((w,i)=>i===wi ? {...w,target:v} : w) }
                                : r))
                            }} />
                        </td>
                        {wtd(`${wi}-wa`, row.monthActual>0 ? row.monthActual : DASH, { fw:700, color:'#1e293b' })}
                        {wtd(`${wi}-wp`, wk.planDays>0 ? wk.planDays : DASH, { color:'#15803d' })}
                        {wtd(`${wi}-wd`, wk.actualDays>0 ? wk.actualDays : DASH, { color:'#475569' })}
                      </>
                    )
                  })}
                </tr>
              )
            })}

            {/* ── 合計行 ── */}
            {visible.length > 0 && (() => {
              const sum = (fn: (r: RepRow) => number) => visible.reduce((s, r) => s + fn(r), 0)
              const sumTarget  = sum(r => r.monthTarget)
              const sumActual  = sum(r => r.monthActual)
              const sumPlanD   = sum(r => r.monthPlanDays)
              const sumActualD = sum(r => r.monthActualDays)
              const sumRemain  = sum(r => r.monthRemain)
              const sumProd    = sumActualD > 0 ? sumActual / sumActualD : 0
              const sumYoji    = sumPlanD > 0 && sumProd > 0 ? Math.round(sumPlanD * sumProd * 10) / 10 : 0
              const sumProg    = sumTarget > 0 && sumYoji > 0 ? Math.round((sumYoji/sumTarget)*100) : 0

              const ftr = (key: string, v: React.ReactNode, bl?: boolean) => (
                <td key={key} className="px-2 py-2 text-center border-l"
                  style={{ background:tk.fBg, borderColor:tk.sh1Bg, ...(bl?{borderLeft:`2px solid ${tk.stickBd}`}:{}) }}>
                  <span style={{ fontFamily:tk.numFont, fontSize:12, fontWeight:700, color:tk.fText }}>{v}</span>
                </td>
              )

              return (
                <tr>
                  <td className="sticky left-0 z-10 px-4 py-2.5"
                    style={{ background:tk.fBg, color:tk.fText, fontWeight:800, fontSize:12, borderRight:`2px solid ${tk.stickBd}` }}>
                    合計
                  </td>
                  {ftr('st', sumTarget||DASH, true)}
                  {ftr('sa', <span style={{ color:'#93c5fd' }}>{sumActual||DASH}</span>)}
                  {ftr('sy', <span style={{ color:'#67e8f9' }}>{sumYoji>0?fmt1(sumYoji):DASH}</span>)}
                  {ftr('sp', <span style={{ color: pColor(sumProg).text }}>{fmtPct(sumProg)}</span>)}
                  {ftr('spr', sumActualD>0 ? fmt1(sumActual/sumActualD) : DASH)}
                  {ftr('spd', <span style={{ color:'#86efac' }}>{sumPlanD||DASH}</span>, true)}
                  {ftr('sad', sumActualD||DASH)}
                  {ftr('sr', sumRemain||DASH)}
                  {weeks.map((_, wi) => {
                    const wSum = (fn: (w: RepRow['weeks'][0]) => number) =>
                      visible.reduce((s, r) => s + fn(r.weeks[wi]), 0)
                    const wt = wSum(w => w.target)
                    // 現状は月トータル（各週とも同じ）
                    const waTotal = visible.reduce((s, r) => s + r.monthActual, 0)
                    const wp = wSum(w => w.planDays), wd = wSum(w => w.actualDays)
                    return (
                      <>
                        {ftr(`${wi}-wt`, wt||DASH, true)}
                        {ftr(`${wi}-wa`, waTotal||DASH)}
                        {ftr(`${wi}-wp`, wp||DASH)}
                        {ftr(`${wi}-wd`, wd||DASH)}
                      </>
                    )
                  })}
                </tr>
              )
            })()}
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div className="flex gap-4 mt-3 flex-wrap text-xs text-slate-500 items-center">
        {([['#f0fdf4','#15803d','≥100%'],['#eff6ff','#1d4ed8','≥80%'],['#fefce8','#a16207','≥60%'],['#fff1f2','#be123c','<60%']] as [string,string,string][]).map(([bg,c,lbl]) => (
          <span key={lbl} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ background:bg, border:`1px solid ${c}` }}/>
            {lbl}
          </span>
        ))}
        <span className="ml-2 text-slate-400">予実=計画稼働×生産性 / 進捗=予実÷月目標×100%</span>
      </div>
    </div>
  )
}
