'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep, Team } from '@/lib/supabase'

type Props = { yearMonth: string; teams: Team[]; orgIds?: string[] }

type RepStatus = {
  rep: SalesRep
  hasNumbers: boolean   // 数値入力済み（訪問・獲得などが1つ以上入力）
  hasReport: boolean    // 日報提出済み
}

type DayStatus = {
  date: string          // YYYY-MM-DD
  label: string         // "4/5（土）"
  reps: RepStatus[]
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}（${DOW_JA[d.getDay()]}）`
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split('T')[0]
}

function isPast(dateStr: string): boolean {
  return dateStr < new Date().toISOString().split('T')[0]
}

export default function SubmissionCheckView({ yearMonth, teams, orgIds }: Props) {
  const [days, setDays] = useState<DayStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMode, setFilterMode] = useState<'all' | 'missing'>('missing')
  const [selectedTeamId, setSelectedTeamId] = useState<string | '__all__'>('__all__')

  useEffect(() => { load() }, [yearMonth, orgIds?.join(',')])

  async function load() {
    setLoading(true)
    const [y, m] = yearMonth.split('-')
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    const dateFrom = `${y}-${m}-01`
    const dateTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`

    let reps: any[], schedules: any[], records: any[], reports: any[]
    if (orgIds && orgIds.length > 1) {
      const res = await fetch(`/api/combined/data?orgIds=${orgIds.join(',')}&yearMonth=${yearMonth}`)
      const d = await res.json()
      reps = d.reps
      schedules = d.schedules.filter((s: any) => s.work_status === '稼働')
      records = d.records
      reports = d.reports
    } else {
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
        supabase.from('work_schedules').select('sales_rep_id,schedule_date,work_status')
          .gte('schedule_date', dateFrom).lte('schedule_date', dateTo).eq('work_status', '稼働'),
        supabase.from('daily_records').select('*').gte('record_date', dateFrom).lte('record_date', dateTo),
        supabase.from('daily_reports').select('sales_rep_id,report_date').gte('report_date', dateFrom).lte('report_date', dateTo),
      ])
      reps = r1.data ?? []; schedules = r2.data ?? []; records = r3.data ?? []; reports = r4.data ?? []
    }

    const repList: SalesRep[] = reps || []

    // work_schedules を date→Set<rep_id> でインデックス（稼働予定者）
    const schedIdx: Record<string, Set<string>> = {}
    for (const s of schedules || []) {
      if (!schedIdx[s.schedule_date]) schedIdx[s.schedule_date] = new Set()
      schedIdx[s.schedule_date].add(s.sales_rep_id)
    }

    // daily_records を date→rep_id→record でインデックス
    const recIdx: Record<string, Record<string, any>> = {}
    for (const r of records || []) {
      if (!recIdx[r.record_date]) recIdx[r.record_date] = {}
      recIdx[r.record_date][r.sales_rep_id] = r
    }

    // daily_reports を date+rep_id の Set で管理
    const reportSet = new Set<string>()
    for (const r of reports || []) {
      reportSet.add(`${r.report_date}__${r.sales_rep_id}`)
    }

    // 日付ごとに集計
    const result: DayStatus[] = []
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${y}-${m}-${String(d).padStart(2, '0')}`
      const scheduledRepIds = schedIdx[dateStr]
      if (!scheduledRepIds || scheduledRepIds.size === 0) continue

      // work_schedules で稼働予定のrepを基準にする
      const workingReps: RepStatus[] = repList
        .filter(rep => scheduledRepIds.has(rep.id))
        .map(rep => {
          const rec = (recIdx[dateStr] || {})[rep.id]
          const hasNumbers = rec != null && (
            Number(rec.visits)         > 0 ||
            Number(rec.net_meetings)   > 0 ||
            Number(rec.owner_meetings) > 0 ||
            Number(rec.negotiations)   > 0 ||
            Number(rec.acquisitions)   > 0
          )
          const hasReport = reportSet.has(`${dateStr}__${rep.id}`)
          return { rep, hasNumbers, hasReport }
        })

      if (workingReps.length > 0) {
        result.push({ date: dateStr, label: fmtDate(dateStr), reps: workingReps })
      }
    }

    setDays(result)
    setLoading(false)
  }

  const today = new Date().toISOString().split('T')[0]

  // チームフィルター適用
  const filteredDays = days.map(day => ({
    ...day,
    reps: day.reps.filter(rs =>
      selectedTeamId === '__all__' || rs.rep.team_id === selectedTeamId
    ),
  })).filter(day => day.reps.length > 0)

  // 未提出フィルター（今日以前の稼働日のみ）
  const displayDays = filteredDays.filter(day => {
    if (filterMode === 'all') return true
    if (!isPast(day.date) && !isToday(day.date)) return false  // 未来は表示しない
    return day.reps.some(rs => !rs.hasNumbers || !rs.hasReport)
  }).reverse()  // 新しい日付から表示

  // サマリー集計（今日以前の稼働日のみ）
  const pastDays = filteredDays.filter(d => isPast(d.date) || isToday(d.date))
  const totalWorking  = pastDays.reduce((s, d) => s + d.reps.length, 0)
  const missingNumbers= pastDays.reduce((s, d) => s + d.reps.filter(r => !r.hasNumbers).length, 0)
  const missingReports= pastDays.reduce((s, d) => s + d.reps.filter(r => !r.hasReport).length, 0)

  if (loading) return <div className="text-center text-slate-400 py-10 text-sm">読み込み中...</div>

  return (
    <div className="space-y-3">

      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl shadow-sm px-3 py-3 text-center">
          <div className="text-2xl font-black text-slate-800">{totalWorking}</div>
          <div className="text-xs text-slate-400 mt-0.5">稼働のべ人数</div>
        </div>
        <div className={`rounded-2xl shadow-sm px-3 py-3 text-center ${missingNumbers > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
          <div className={`text-2xl font-black ${missingNumbers > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {missingNumbers}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">数値 未提出</div>
        </div>
        <div className={`rounded-2xl shadow-sm px-3 py-3 text-center ${missingReports > 0 ? 'bg-orange-50' : 'bg-emerald-50'}`}>
          <div className={`text-2xl font-black ${missingReports > 0 ? 'text-orange-500' : 'text-emerald-600'}`}>
            {missingReports}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">日報 未提出</div>
        </div>
      </div>

      {/* フィルターバー */}
      <div className="flex gap-2 flex-wrap items-center">
        {/* チームフィルター */}
        {teams.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setSelectedTeamId('__all__')}
              className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${selectedTeamId === '__all__' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              全体
            </button>
            {teams.map(t => (
              <button key={t.id} onClick={() => setSelectedTeamId(t.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${selectedTeamId === t.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* 未提出のみ / 全員 */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 ml-auto">
          <button onClick={() => setFilterMode('missing')}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${filterMode === 'missing' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
            未提出のみ
          </button>
          <button onClick={() => setFilterMode('all')}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${filterMode === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
            全員
          </button>
        </div>
      </div>

      {/* 日別リスト */}
      {displayDays.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-sm font-bold text-slate-600">未提出なし</div>
          <div className="text-xs text-slate-400 mt-1">全員提出済みです</div>
        </div>
      ) : (
        displayDays.map(day => {
          const todayFlag = isToday(day.date)
          const pastFlag  = isPast(day.date)
          const hasMissing = day.reps.some(r => !r.hasNumbers || !r.hasReport)

          return (
            <div key={day.date}
              className={`bg-white rounded-2xl shadow-sm overflow-hidden border-2 ${
                todayFlag ? 'border-blue-400' : hasMissing && pastFlag ? 'border-red-200' : 'border-transparent'
              }`}>
              {/* 日付ヘッダー */}
              <div className={`flex items-center justify-between px-4 py-2.5 ${
                todayFlag ? 'bg-blue-600' : hasMissing && pastFlag ? 'bg-red-50' : 'bg-slate-50'
              }`}>
                <div className={`font-black text-sm ${todayFlag ? 'text-white' : 'text-slate-700'}`}>
                  {todayFlag && <span className="mr-1.5 text-xs bg-white text-blue-600 px-1.5 py-0.5 rounded-full font-black">TODAY</span>}
                  {day.label}
                </div>
                <div className="flex gap-2 text-xs">
                  <span className={`font-bold ${todayFlag ? 'text-blue-100' : 'text-slate-400'}`}>
                    稼働 {day.reps.length}名
                  </span>
                  {hasMissing && pastFlag && (
                    <span className="text-red-500 font-bold">未提出あり</span>
                  )}
                </div>
              </div>

              {/* 担当者行 */}
              <div className="divide-y divide-slate-50">
                {day.reps.map(({ rep, hasNumbers, hasReport }) => {
                  const allOk = hasNumbers && hasReport
                  return (
                    <div key={rep.id}
                      className={`flex items-center gap-3 px-4 py-2.5 ${allOk ? '' : 'bg-red-50/40'}`}>
                      {/* アバター */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0 ${
                        allOk ? 'bg-emerald-500' : 'bg-red-400'
                      }`}>
                        {rep.name.charAt(0)}
                      </div>

                      {/* 名前 */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 text-sm truncate">{rep.name}</div>
                      </div>

                      {/* 提出状況バッジ */}
                      <div className="flex gap-1.5 flex-shrink-0">
                        <Badge ok={hasNumbers} label="数値" />
                        <Badge ok={hasReport}  label="日報" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black ${
      ok
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-red-100 text-red-600'
    }`}>
      <span>{ok ? '✓' : '✗'}</span>
      <span>{label}</span>
    </div>
  )
}
