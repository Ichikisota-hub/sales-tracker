'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep, DailyReport, Team } from '@/lib/supabase'
import { getMonthList, formatYearMonth, localYearMonth } from '@/lib/dateUtils'

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}（${DOW_JA[d.getDay()]}）`
}

type ReportWithRep = DailyReport & { rep: SalesRep | undefined }
type Props = { teams: Team[]; orgIds?: string[] }

export default function DailyReportListView({ teams, orgIds }: Props) {
  const [yearMonth, setYearMonth] = useState(localYearMonth())
  const [reps, setReps] = useState<SalesRep[]>([])
  const [reports, setReports] = useState<ReportWithRep[]>([])
  const [filterRepId, setFilterRepId] = useState<string>('all')
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const months = getMonthList(12)

  useEffect(() => {
    if (orgIds && orgIds.length > 1) return // load()でまとめて取得
    supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order').then(({ data }) => {
      setReps(data || [])
    })
  }, [orgIds?.join(',')])

  useEffect(() => { load() }, [yearMonth, orgIds?.join(',')])

  async function load() {
    setLoading(true)
    const [y, m] = yearMonth.split('-')
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    const from = `${y}-${m}-01`
    const to   = `${y}-${m}-${String(lastDay).padStart(2, '0')}`

    let repList = reps
    let reportData: any[]

    if (orgIds && orgIds.length > 1) {
      const res = await fetch(`/api/combined/data?orgIds=${orgIds.join(',')}&yearMonth=${yearMonth}`)
      const d = await res.json()
      repList = d.reps || []
      reportData = (d.reports || []).sort((a: any, b: any) => b.report_date.localeCompare(a.report_date))
      setReps(repList)
    } else {
      const { data } = await supabase
        .from('daily_reports')
        .select('*')
        .gte('report_date', from)
        .lte('report_date', to)
        .order('report_date', { ascending: false })
      reportData = data || []
    }

    const repMap: Record<string, SalesRep> = {}
    reps.forEach(r => { repMap[r.id] = r })

    // repsがまだ空の場合は再取得
    if (repList.length === 0 && !(orgIds && orgIds.length > 1)) {
      const { data: rd } = await supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order')
      repList = rd || []
      setReps(repList)
      repList.forEach(r => { repMap[r.id] = r })
    }

    repList.forEach(r => { repMap[r.id] = r })
    setReports((reportData || []).map((r: any) => ({ ...r, rep: repMap[r.sales_rep_id] })))
    setLoading(false)
  }

  const teamFilteredRepIds = filterTeamId
    ? new Set(reps.filter(r => r.team_id === filterTeamId).map(r => r.id))
    : null

  const filtered = reports.filter(r => {
    if (filterRepId !== 'all' && r.sales_rep_id !== filterRepId) return false
    if (teamFilteredRepIds && !teamFilteredRepIds.has(r.sales_rep_id)) return false
    return true
  })

  const hasContent = (r: DailyReport) =>
    r.acquisition_case || r.lost_case || r.good_points || r.issues || r.improvements || r.learnings ||
    r.visits > 0 || r.acquisitions > 0

  return (
    <div className="space-y-3">
      {/* フィルター */}
      <div className="mobile-card">
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={yearMonth}
            onChange={e => setYearMonth(e.target.value)}
            className="bg-slate-700 text-white text-xs font-semibold rounded-lg px-2 py-1.5 border-none outline-none"
          >
            {months.map(m => <option key={m} value={m}>{formatYearMonth(m)}</option>)}
          </select>
          <select
            value={filterRepId}
            onChange={e => { setFilterRepId(e.target.value); setFilterTeamId(null) }}
            className="bg-slate-700 text-white text-xs font-semibold rounded-lg px-2 py-1.5 border-none outline-none"
          >
            <option value="all">全員</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <span className="text-xs text-slate-400 ml-auto">{filtered.length}件</span>
        </div>
        {teams.length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <button
              onClick={() => { setFilterTeamId(null); setFilterRepId('all') }}
              className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors ${filterTeamId === null ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
            >全体</button>
            {teams.map(t => (
              <button key={t.id}
                onClick={() => { setFilterTeamId(t.id); setFilterRepId('all') }}
                className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors ${filterTeamId === t.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
              >{t.name}</button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-slate-400 text-sm py-10">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="mobile-card text-center text-slate-400 text-sm py-8">
          この期間の日報はまだありません
        </div>
      ) : (
        filtered.map(report => {
          const isExpanded = expandedId === report.id
          const rep = report.rep
          const isEmpty = !hasContent(report)
          return (
            <div key={report.id} className="mobile-card">
              {/* ヘッダー（常に表示） */}
              <button
                className="w-full text-left"
                onClick={() => setExpandedId(isExpanded ? null : report.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-black text-base flex-shrink-0">
                    {rep?.name?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-slate-800 text-base">{rep?.name ?? '不明'}</div>
                    <div className="text-xs text-slate-400 font-medium">{formatDate(report.report_date)}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isEmpty && (
                      <span className="text-[10px] bg-amber-100 text-amber-600 font-bold px-2 py-0.5 rounded-full">内容なし</span>
                    )}
                    <span className="text-slate-400 text-lg">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* プレビュー（折りたたみ時） */}
                {!isExpanded && report.good_points && (
                  <div className="mt-2 text-xs text-slate-500 truncate pl-13">
                    💡 {report.good_points}
                  </div>
                )}
              </button>

              {/* 展開内容 */}
              {isExpanded && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  {(report.visits > 0 || report.acquisitions > 0) && (
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      <Stat label="訪問" value={report.visits} />
                      <Stat label="ネット対面" value={report.net_meetings} />
                      <Stat label="主権対面" value={report.owner_meetings} />
                      <Stat label="商談" value={report.negotiations} />
                      <Stat label="獲得" value={report.acquisitions} color="emerald" />
                    </div>
                  )}
                  {report.acquisition_case && (
                    <Section icon="🏠" label="獲得案件" value={report.acquisition_case} color="emerald" />
                  )}
                  {report.lost_case && (
                    <Section icon="😞" label="失注案件" value={report.lost_case} color="red" />
                  )}
                  {report.remaining_work && (
                    <Section icon="📅" label="残稼働" value={report.remaining_work} color="slate" />
                  )}
                  {report.good_points && (
                    <Section icon="💡" label="よかった点" value={report.good_points} color="yellow" />
                  )}
                  {report.issues && (
                    <Section icon="❌" label="課題・失敗" value={report.issues} color="red" />
                  )}
                  {report.improvements && (
                    <Section icon="🔁" label="明日の改善ポイント" value={report.improvements} color="blue" />
                  )}
                  {report.learnings && (
                    <Section icon="📝" label="学び・気づき" value={report.learnings} color="purple" />
                  )}
                  {report.gratitude && (
                    <Section icon="👏" label="感謝・シェア" value={report.gratitude} color="pink" />
                  )}
                  {isEmpty && (
                    <div className="text-center text-slate-400 text-sm py-2">内容が入力されていません</div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function Stat({ label, value, color = 'slate' }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    slate:   'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`px-2 py-1 rounded-lg ${colorMap[color] || colorMap.slate}`}>
      {label}：{value}
    </span>
  )
}

function Section({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  const bg: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200',
    red:     'bg-red-50 border-red-200',
    yellow:  'bg-yellow-50 border-yellow-200',
    blue:    'bg-blue-50 border-blue-200',
    purple:  'bg-purple-50 border-purple-200',
    pink:    'bg-pink-50 border-pink-200',
    slate:   'bg-slate-50 border-slate-200',
  }
  const textColor: Record<string, string> = {
    emerald: 'text-emerald-700',
    red:     'text-red-700',
    yellow:  'text-yellow-700',
    blue:    'text-blue-700',
    purple:  'text-purple-700',
    pink:    'text-pink-700',
    slate:   'text-slate-600',
  }
  return (
    <div className={`rounded-xl border px-3 py-2 ${bg[color] || bg.slate}`}>
      <div className={`text-xs font-black mb-1 ${textColor[color] || 'text-slate-600'}`}>{icon} {label}</div>
      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{value}</div>
    </div>
  )
}
