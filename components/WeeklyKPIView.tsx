'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, SalesRep, Team } from '@/lib/supabase'

type Props = { yearMonth: string; teams: Team[]; orgIds?: string[] }

// ── テーマ定義 ────────────────────────────────────────────────────────────────

type Theme = 1 | 2 | 3

const THEMES: { id: Theme; label: string; desc: string }[] = [
  { id: 1, label: 'スタンダード', desc: 'Google Sheets風・シンプル' },
  { id: 2, label: 'ミニマル',    desc: 'Notion風・ボーダーレス' },
  { id: 3, label: 'ファイナンス', desc: '財務表風・数字重視' },
]

type ThemeTokens = {
  // テーブル外
  wrapBg: string
  wrapBorder: string
  wrapRadius: string
  // ヘッダー
  headerBg: string
  headerText: string
  subHeaderBg: string
  subHeaderText: string
  currentWeekHeaderBg: string
  currentWeekHeaderText: string
  // 偶数/奇数行
  rowEven: string
  rowOdd: string
  currentRowEven: string
  currentRowOdd: string
  // 固定列
  stickyBg: (even: boolean) => string
  stickyBorder: string
  // セルボーダー
  cellBorder: string
  rowBorder: string
  // 数字スタイル
  numFont: string
  numSize: string
  nameFont: string
  // フッター行
  footerBg: string
  footerText: string
  // タグ・バッジ
  tagBg: string
  tagText: string
}

function getTokens(t: Theme): ThemeTokens {
  switch (t) {
    case 1: return {
      wrapBg: '#ffffff', wrapBorder: '1px solid #d1d5db', wrapRadius: '12px',
      headerBg: '#1e293b', headerText: '#f1f5f9',
      subHeaderBg: '#0f172a', subHeaderText: '#94a3b8',
      currentWeekHeaderBg: '#1e3a5f', currentWeekHeaderText: '#93c5fd',
      rowEven: '#ffffff', rowOdd: '#f8fafc',
      currentRowEven: '#eff6ff', currentRowOdd: '#dbeafe',
      stickyBg: (e) => e ? '#ffffff' : '#f8fafc',
      stickyBorder: '#e2e8f0',
      cellBorder: '#e2e8f0', rowBorder: '#f1f5f9',
      numFont: 'inherit', numSize: '13px',
      nameFont: '600',
      footerBg: '#334155', footerText: '#cbd5e1',
      tagBg: '#e0f2fe', tagText: '#0369a1',
    }
    case 2: return {
      wrapBg: '#fafaf9', wrapBorder: '1px solid #e7e5e4', wrapRadius: '16px',
      headerBg: '#292524', headerText: '#fafaf9',
      subHeaderBg: '#1c1917', subHeaderText: '#a8a29e',
      currentWeekHeaderBg: '#1e3a5f', currentWeekHeaderText: '#bfdbfe',
      rowEven: '#ffffff', rowOdd: '#fafaf9',
      currentRowEven: '#f0f9ff', currentRowOdd: '#e0f2fe',
      stickyBg: (e) => e ? '#ffffff' : '#fafaf9',
      stickyBorder: 'transparent',
      cellBorder: 'transparent', rowBorder: '#f5f5f4',
      numFont: 'inherit', numSize: '13px',
      nameFont: '500',
      footerBg: '#292524', footerText: '#d6d3d1',
      tagBg: '#f0f9ff', tagText: '#0369a1',
    }
    case 3: return {
      wrapBg: '#ffffff', wrapBorder: '2px solid #1e293b', wrapRadius: '4px',
      headerBg: '#0f172a', headerText: '#e2e8f0',
      subHeaderBg: '#1e293b', subHeaderText: '#64748b',
      currentWeekHeaderBg: '#1e3a5f', currentWeekHeaderText: '#93c5fd',
      rowEven: '#ffffff', rowOdd: '#f8fafc',
      currentRowEven: '#eff6ff', currentRowOdd: '#dbeafe',
      stickyBg: (e) => e ? '#f8fafc' : '#f1f5f9',
      stickyBorder: '#cbd5e1',
      cellBorder: '#e2e8f0', rowBorder: '#e2e8f0',
      numFont: 'monospace', numSize: '13px',
      nameFont: '700',
      footerBg: '#0f172a', footerText: '#94a3b8',
      tagBg: '#dbeafe', tagText: '#1e40af',
    }
  }
}

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
  const [theme, setTheme] = useState<Theme>(1)
  const tk = getTokens(theme)
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

        <div className="flex flex-col gap-2 items-end">
          {/* テーマ切り替え */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#f1f5f9' }}>
            {THEMES.map(th => (
              <button
                key={th.id}
                onClick={() => setTheme(th.id)}
                title={th.desc}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: theme === th.id ? '#1e293b' : 'transparent',
                  color: theme === th.id ? '#f1f5f9' : '#64748b',
                  boxShadow: theme === th.id ? '0 1px 4px rgba(0,0,0,0.25)' : 'none',
                }}
              >
                {th.id}. {th.label}
              </button>
            ))}
          </div>

          {/* チームフィルタ */}
          {teams.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-end">
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
      </div>

      {/* ─── テーブル ─── */}
      <div className="overflow-x-auto shadow-sm" style={{ background: tk.wrapBg, border: tk.wrapBorder, borderRadius: tk.wrapRadius }}>
        <table className="border-collapse text-sm" style={{ minWidth: weeks.length * 4 * 52 + 240 }}>

          {/* ─── 週ヘッダー ─── */}
          <thead>
            <tr>
              {/* 担当者 + 月目標 */}
              <th rowSpan={2}
                className="sticky left-0 z-20 px-4 py-3 text-left whitespace-nowrap"
                style={{ background: tk.headerBg, color: tk.headerText, minWidth: 120, fontSize: 12, fontWeight: 700, borderRight: `2px solid ${tk.stickyBorder}` }}>
                担当者
              </th>
              <th rowSpan={2}
                className="sticky z-20 px-3 py-3 text-center whitespace-nowrap"
                style={{ background: tk.headerBg, color: tk.headerText, left: 120, minWidth: 72, fontSize: 12, fontWeight: 700, borderRight: `2px solid ${tk.stickyBorder}` }}>
                月目標<br /><span style={{ color: tk.subHeaderText, fontWeight: 400, fontSize: 10 }}>✎ 編集可</span>
              </th>
              {/* 週 */}
              {weeks.map((w, wi) => (
                <th key={w.label} colSpan={4}
                  className="px-2 py-2 text-center border-l"
                  style={{
                    background: wi === currentWeekIdx ? tk.currentWeekHeaderBg : tk.headerBg,
                    color: wi === currentWeekIdx ? tk.currentWeekHeaderText : tk.headerText,
                    fontSize: 12, fontWeight: 700,
                    borderColor: tk.subHeaderBg,
                  }}>
                  <div>{w.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{w.range}</div>
                  {wi === currentWeekIdx && <div style={{ fontSize: 9, color: tk.currentWeekHeaderText, marginTop: 2 }}>◀ 今週</div>}
                </th>
              ))}
            </tr>
            {/* KPI小ヘッダー */}
            <tr>
              {weeks.map((w, wi) => (
                ['現状', '進捗', '生産性', '離席稼働'].map(col => (
                  <th key={`${wi}-${col}`}
                    className="px-1 py-1.5 text-center border-l"
                    style={{
                      background: wi === currentWeekIdx ? tk.currentWeekHeaderBg : tk.subHeaderBg,
                      color: tk.subHeaderText,
                      fontSize: 11, fontWeight: 600,
                      borderColor: tk.headerBg,
                      minWidth: col === '進捗' ? 52 : 48,
                    }}>
                    {col}
                    <div style={{ fontSize: 9, fontWeight: 400, color: '#475569', marginTop: 1 }}>
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
              const rowBg = isEven ? tk.rowEven : tk.rowOdd

              return (
                <tr key={row.rep.id}>
                  {/* 担当者名 */}
                  <td className="sticky left-0 z-10 px-4 py-2.5 whitespace-nowrap"
                    style={{ background: tk.stickyBg(isEven), borderRight: `2px solid ${tk.stickyBorder}`, borderBottom: `1px solid ${tk.rowBorder}` }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#2563eb)' }}>
                        {row.rep.name.charAt(0)}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: tk.nameFont, color: '#1e293b' }}>{row.rep.name}</span>
                    </div>
                  </td>

                  {/* 月目標（編集可） */}
                  <td className="sticky z-10 px-2 py-2 text-center"
                    style={{ background: tk.stickyBg(isEven), left: 120, borderRight: `2px solid ${tk.stickyBorder}`, borderBottom: `1px solid ${tk.rowBorder}` }}>
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
                    const hasData = wk.actual > 0 || wk.workDays > 0
                    const pc = wk.progress > 0 ? pColor(wk.progress) : { cell: 'transparent', text: '#cbd5e1' }
                    const cellBg = isCurr ? (isEven ? tk.currentRowEven : tk.currentRowOdd) : rowBg
                    const td = (key: string, content: React.ReactNode, bg?: string) => (
                      <td key={key}
                        className="px-2 py-2.5 text-center border-l"
                        style={{ background: bg ?? cellBg, borderColor: tk.cellBorder, borderBottom: `1px solid ${tk.rowBorder}` }}>
                        {content}
                      </td>
                    )

                    return (
                      <>
                        {td(`${wi}-a`,
                          <span style={{ fontFamily: tk.numFont, fontSize: tk.numSize, fontWeight: 700, color: hasData ? '#1e293b' : '#cbd5e1' }}>
                            {hasData ? wk.actual : '—'}
                          </span>
                        )}
                        {td(`${wi}-p`,
                          <span style={{ fontFamily: tk.numFont, fontSize: 12, fontWeight: 700, color: pc.text }}>
                            {wk.progress > 0 ? `${wk.progress}%` : '—'}
                          </span>,
                          wk.progress > 0 ? pc.cell : cellBg
                        )}
                        {td(`${wi}-pr`,
                          <span style={{ fontFamily: tk.numFont, fontSize: 12, fontWeight: 600, color: wk.productivity > 0 ? '#475569' : '#cbd5e1' }}>
                            {wk.productivity > 0 ? fmt1(wk.productivity) : '—'}
                          </span>
                        )}
                        {td(`${wi}-w`,
                          <span style={{ fontFamily: tk.numFont, fontSize: 12, fontWeight: 600, color: wk.workDays > 0 ? '#64748b' : '#cbd5e1' }}>
                            {wk.workDays > 0 ? wk.workDays : '—'}
                          </span>
                        )}
                      </>
                    )
                  })}
                </tr>
              )
            })}

            {/* ─── 合計行 ─── */}
            {visible.length > 0 && (
              <tr>
                <td className="sticky left-0 z-10 px-4 py-2.5"
                  style={{ background: tk.footerBg, color: tk.footerText, fontWeight: 800, fontSize: 12, borderRight: `2px solid ${tk.stickyBorder}` }}>
                  合計
                </td>
                <td className="sticky z-10 px-2 py-2 text-center"
                  style={{ background: tk.footerBg, color: '#e2e8f0', fontWeight: 800, fontSize: 13, left: 120, borderRight: `2px solid ${tk.stickyBorder}` }}>
                  {visible.reduce((s, r) => s + r.monthPlan, 0) || '—'}
                </td>
                {weeks.map((w, wi) => {
                  const totalActual   = visible.reduce((s, r) => s + r.weeks[wi].actual, 0)
                  const totalWorkDays = visible.reduce((s, r) => s + r.weeks[wi].workDays, 0)
                  const totalProd = totalWorkDays > 0 ? fmt1(totalActual / totalWorkDays) : '—'
                  const ftd = (key: string, content: React.ReactNode) => (
                    <td key={key} className="px-2 py-2 text-center border-l"
                      style={{ background: tk.footerBg, borderColor: tk.subHeaderBg }}>
                      {content}
                    </td>
                  )
                  return (
                    <>
                      {ftd(`${wi}-a`, <span style={{ fontFamily: tk.numFont, fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{totalActual || '—'}</span>)}
                      {ftd(`${wi}-p`, <span style={{ color: '#64748b', fontSize: 11 }}>—</span>)}
                      {ftd(`${wi}-pr`, <span style={{ fontFamily: tk.numFont, fontSize: 12, fontWeight: 600, color: tk.footerText }}>{totalProd}</span>)}
                      {ftd(`${wi}-w`, <span style={{ fontFamily: tk.numFont, fontSize: 12, fontWeight: 600, color: tk.footerText }}>{totalWorkDays || '—'}</span>)}
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
