'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, SalesRep, Team } from '@/lib/supabase'
import { getDaysArray } from '@/lib/dateUtils'

type Props = { yearMonth: string; teams: Team[]; orgIds?: string[] }

type ScheduleRow = {
  sales_rep_id: string
  schedule_date: string
  work_status: string
  work_time_start: string
  work_time_end: string
}

type BulkResult = { name: string; matched: string | null; days: number; status: string }

// 人別月カレンダー（全画面・スワイプで切り替え）
function RepCalendarModal({
  reps,
  initialIndex,
  yearMonth,
  schedMap,
  onClose,
}: {
  reps: SalesRep[]
  initialIndex: number
  yearMonth: string
  schedMap: Record<string, ScheduleRow>
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const touchStartX = useRef<number | null>(null)

  const rep = reps[index]
  const [y, m] = yearMonth.split('-').map(Number)
  const firstDow = new Date(y, m - 1, 1).getDay()
  const lastDay = new Date(y, m, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const getRow = (day: number) => {
    const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`
    return schedMap[`${rep.id}__${dateStr}`] || null
  }

  const workingDays = Array.from({ length: lastDay }, (_, i) => i + 1)
    .filter(d => getRow(d)?.work_status === '稼働').length

  function goTo(nextIndex: number, dir: 'left' | 'right') {
    if (nextIndex < 0 || nextIndex >= reps.length) return
    setSlideDir(dir)
    setTimeout(() => {
      setIndex(nextIndex)
      setSlideDir(null)
    }, 180)
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 50) return
    if (dx < 0) goTo(index + 1, 'left')   // 左スワイプ → 次の人
    else         goTo(index - 1, 'right')  // 右スワイプ → 前の人
  }

  const dowLabels = ['日', '月', '火', '水', '木', '金', '土']

  const slideClass = slideDir === 'left'
    ? 'animate-slide-out-left'
    : slideDir === 'right'
    ? 'animate-slide-out-right'
    : 'animate-slide-in'

  return (
    <div
      className="fixed inset-0 z-50 bg-white flex flex-col"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={() => goTo(index - 1, 'right')}
            disabled={index === 0}
            className="text-white/70 disabled:opacity-20 text-2xl w-10 h-10 flex items-center justify-center"
          >‹</button>
          <div className="text-center flex-1">
            <div className="text-white font-black text-lg">{rep.name}</div>
            <div className="text-blue-200 text-xs mt-0.5">
              {index + 1} / {reps.length}人 — {yearMonth.replace('-', '年')}月 稼働 {workingDays}日
            </div>
          </div>
          <button
            onClick={() => goTo(index + 1, 'left')}
            disabled={index === reps.length - 1}
            className="text-white/70 disabled:opacity-20 text-2xl w-10 h-10 flex items-center justify-center"
          >›</button>
        </div>
        {/* ドットインジケーター（最大15人まで表示） */}
        {reps.length <= 15 && (
          <div className="flex justify-center gap-1 mt-2">
            {reps.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > index ? 'left' : 'right')}
                className={`rounded-full transition-all ${i === index ? 'w-4 h-2 bg-white' : 'w-2 h-2 bg-white/40'}`}
              />
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/60 hover:text-white text-sm font-bold"
        >✕ 閉じる</button>
      </div>

      {/* カレンダー本体 */}
      <div key={rep.id} className={`flex-1 overflow-y-auto p-4 ${slideClass}`}>
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 mb-2">
          {dowLabels.map((d, i) => (
            <div key={d} className={`text-center text-sm font-bold py-2 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
              {d}
            </div>
          ))}
        </div>
        {/* 日付グリッド */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`e-${idx}`} />
            const row = getRow(day)
            const status = row?.work_status || ''
            const dow = (firstDow + day - 1) % 7
            const isWorking = status === '稼働'
            const isOff = status === '休日'
            return (
              <div key={day} className={`rounded-xl p-2 text-center min-h-[72px] flex flex-col items-center ${
                isWorking ? 'bg-emerald-50 border border-emerald-200' :
                isOff ? 'bg-slate-50 border border-slate-100' :
                'border border-transparent'
              }`}>
                <div className={`text-sm font-bold mb-1 ${
                  dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-slate-700'
                }`}>{day}</div>
                {isWorking ? (
                  <>
                    <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                      <span className="text-white font-black text-xs">稼</span>
                    </div>
                    {row?.work_time_start && row?.work_time_end && (
                      <div className="text-[10px] text-emerald-600 font-bold leading-tight mt-1">
                        {row.work_time_start.slice(0, 5)}<br />〜{row.work_time_end.slice(0, 5)}
                      </div>
                    )}
                  </>
                ) : isOff ? (
                  <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                    <span className="text-slate-400 text-xs">休</span>
                  </div>
                ) : (
                  <div className="text-slate-200 text-sm mt-1">—</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-4 px-4 py-3 border-t border-slate-100 text-sm text-slate-500 flex-shrink-0">
        <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded bg-emerald-500" />稼働</div>
        <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded bg-slate-200" />休日</div>
        <div className="flex items-center gap-1.5"><span className="text-slate-300 text-base">—</span>未提出</div>
      </div>
    </div>
  )
}

export default function ShiftCalendarView({ yearMonth, teams, orgIds }: Props) {
  const [reps, setReps] = useState<SalesRep[]>([])
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null)
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null)
  const [filterName, setFilterName] = useState('')
  const [selectedRepIndex, setSelectedRepIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date()
    const dow = d.getDay()
    const diff = dow === 0 ? -6 : 1 - dow
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    return d
  })

  function toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    const dow = d.getDay()
    return { dateStr: toIso(d), day: d.getDate(), dow, dowJa: DOW_JA[dow] }
  })

  const weekLabel = (() => {
    const sm = weekStart.getMonth() + 1
    const em = weekEnd.getMonth() + 1
    if (sm === em) return `${sm}月${weekDays[0].day}日〜${weekDays[6].day}日`
    return `${sm}月${weekDays[0].day}日〜${em}月${weekDays[6].day}日`
  })()

  const weekKey = toIso(weekStart)
  const days = getDaysArray(yearMonth)

  useEffect(() => { loadAll() }, [yearMonth, orgIds?.join(','), viewMode, weekKey])

  async function loadAll() {
    setLoading(true)
    setBulkResults(null)

    let startDate: string, endDate: string
    if (viewMode === 'week') {
      startDate = toIso(weekStart)
      const e = new Date(weekStart)
      e.setDate(weekStart.getDate() + 6)
      endDate = toIso(e)
    } else {
      const [y, m] = yearMonth.split('-')
      const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
      startDate = `${y}-${m}-01`
      endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    }

    let repData: SalesRep[] = []
    let schedData: ScheduleRow[] = []

    if (orgIds && orgIds.length > 1) {
      const res = await fetch(`/api/combined/data?orgIds=${orgIds.join(',')}&yearMonth=${yearMonth}`)
      const d = await res.json()
      repData = d.reps || []
      schedData = d.schedules || []
    } else {
      const [{ data: reps }, { data: scheds }] = await Promise.all([
        supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
        supabase.from('work_schedules').select('*')
          .gte('schedule_date', startDate)
          .lte('schedule_date', endDate),
      ])
      repData = reps || []
      schedData = scheds || []
    }

    // kaika shifts で上書き（orgIds に関わらず常に適用）
    const { data: kaShiftsData } = await supabase
      .from('shifts')
      .select('user_id, start_time, end_time, status, shift_date')
      .gte('shift_date', startDate)
      .lte('shift_date', endDate)
      .neq('status', 'rejected')

    let merged: ScheduleRow[] = schedData

    if (kaShiftsData && kaShiftsData.length > 0) {
      const userIds = Array.from(new Set(kaShiftsData.map((s: any) => s.user_id)))
      const { data: orgMembers } = await supabase
        .from('organization_members')
        .select('user_id, sales_rep_id')
        .in('user_id', userIds)
        .not('sales_rep_id', 'is', null)

      const userToRep: Record<string, string> = {}
      orgMembers?.forEach((m: any) => { if (m.sales_rep_id) userToRep[m.user_id] = m.sales_rep_id })

      const mergedMap: Record<string, ScheduleRow> = {}
      merged.forEach(s => { mergedMap[`${s.sales_rep_id}__${s.schedule_date}`] = s })
      kaShiftsData.forEach((s: any) => {
        const repId = userToRep[s.user_id]
        if (!repId) return
        mergedMap[`${repId}__${s.shift_date}`] = {
          sales_rep_id: repId,
          schedule_date: s.shift_date,
          work_status: s.start_time ? '稼働' : '休日',
          work_time_start: s.start_time || '',
          work_time_end: s.end_time || '',
        }
      })
      merged = Object.values(mergedMap)
    }

    setReps(repData)
    setSchedules(merged)
    setLoading(false)
  }

  async function handleBulkImport() {
    setBulkLoading(true)
    setBulkResults(null)
    try {
      const res = await fetch('/api/schedule/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearMonth }),
      })
      const json = await res.json()
      if (json.error) { alert(`エラー: ${json.error}`); return }
      setBulkResults(json.results)
      await loadAll()
    } finally {
      setBulkLoading(false)
    }
  }

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  const schedMap: Record<string, ScheduleRow> = {}
  schedules.forEach(s => { schedMap[`${s.sales_rep_id}__${s.schedule_date}`] = s })
  const getRow = (repId: string, dateStr: string) => schedMap[`${repId}__${dateStr}`] || null

  const baseReps = reps.filter(r => r.name && !r.name.startsWith('担当者'))
  const activeReps = baseReps
    .filter(r => !filterTeamId || r.team_id === filterTeamId)
    .filter(r => !filterName.trim() || r.name.includes(filterName.trim()))

  const displayDays = viewMode === 'week' ? weekDays : days

  // 日付ごとの稼働人数
  const countByDate: Record<string, number> = {}
  displayDays.forEach(d => {
    countByDate[d.dateStr] = activeReps.filter(r => getRow(r.id, d.dateStr)?.work_status === '稼働').length
  })
  const maxCount = Math.max(...Object.values(countByDate), 1)

  // 担当者ごとの月合計稼働日数（「計」列用）
  const workingDaysByRep: Record<string, number> = {}
  activeReps.forEach(r => {
    workingDaysByRep[r.id] = days.filter(d => getRow(r.id, d.dateStr)?.work_status === '稼働').length
  })

  const colMinW = viewMode === 'week' ? 88 : 50

  return (
    <div>
      {/* 人別カレンダー（全画面） */}
      {selectedRepIndex !== null && (
        <RepCalendarModal
          reps={activeReps}
          initialIndex={selectedRepIndex}
          yearMonth={yearMonth}
          schedMap={schedMap}
          onClose={() => setSelectedRepIndex(null)}
        />
      )}

      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          {/* タイトル + 月/週トグル */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-black text-slate-800 text-lg">
              {viewMode === 'week' ? `${weekLabel} シフト確認` : `${yearMonth.replace('-', '年')}月 シフト確認`}
            </div>
            <div className="flex rounded-xl overflow-hidden border border-slate-200 shadow-sm">
              <button
                onClick={() => setViewMode('month')}
                className={`text-xs px-3 py-1.5 font-bold transition-colors ${viewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >月表示</button>
              <button
                onClick={() => setViewMode('week')}
                className={`text-xs px-3 py-1.5 font-bold transition-colors border-l border-slate-200 ${viewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >週表示</button>
            </div>
          </div>

          {/* 週ナビゲーション */}
          {viewMode === 'week' && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d })}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xl transition-colors"
              >‹</button>
              <span className="text-sm font-bold text-slate-700 min-w-[160px] text-center">{weekLabel}</span>
              <button
                onClick={() => setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d })}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xl transition-colors"
              >›</button>
              <button
                onClick={() => {
                  const d = new Date()
                  const dow = d.getDay()
                  const diff = dow === 0 ? -6 : 1 - dow
                  d.setDate(d.getDate() + diff)
                  d.setHours(0, 0, 0, 0)
                  setWeekStart(d)
                }}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-bold hover:bg-blue-100 transition-colors border border-blue-200"
              >今週</button>
            </div>
          )}

          <div className="text-xs text-slate-400 mt-1">提出済み: {activeReps.filter(r => workingDaysByRep[r.id] > 0).length} / {activeReps.length}人</div>

          {/* 名前検索 */}
          <div className="mt-2">
            <input
              type="text"
              value={filterName}
              onChange={e => setFilterName(e.target.value)}
              placeholder="名前で絞り込み..."
              className="w-full max-w-[200px] border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {teams.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              <button
                onClick={() => setFilterTeamId(null)}
                className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors ${filterTeamId === null ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
              >全体</button>
              {teams.map(t => (
                <button key={t.id}
                  onClick={() => setFilterTeamId(t.id)}
                  className={`text-xs px-2.5 py-1 rounded-full font-bold transition-colors ${filterTeamId === t.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                >{t.name}</button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleBulkImport}
          disabled={bulkLoading}
          className="bg-green-500 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-green-600 disabled:opacity-50 transition-all"
        >
          {bulkLoading ? '取得中...' : '📥 全員分一括取得'}
        </button>
      </div>

      {/* 一括取得結果 */}
      {bulkResults && (
        <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-xl">
          <div className="text-sm font-bold text-green-700 mb-2">✅ 取得完了</div>
          <div className="flex flex-wrap gap-2">
            {bulkResults.map(r => (
              <div key={r.name} className={`text-xs px-2 py-1 rounded-lg font-medium ${
                r.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
              }`}>
                {r.name}{r.status === 'ok' ? ` ${r.days}日` : ' ✗'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 日別人数バー */}
      <div className="mb-3 bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="flex min-w-max">
          <div className="w-16 flex-shrink-0 p-2 text-xs text-slate-400 font-bold flex items-end">人数</div>
          {displayDays.map(d => {
            const count = countByDate[d.dateStr] || 0
            const intensity = count / maxCount
            return (
              <div key={d.dateStr} className="flex flex-col items-center" style={{ minWidth: colMinW }}>
                <div className="text-xs font-black text-slate-700 mb-1">{count > 0 ? count : ''}</div>
                <div className="w-6 rounded-t-md transition-all" style={{
                  height: 32,
                  background: count === 0 ? '#f1f5f9' : `rgba(16,185,129,${0.3 + intensity * 0.7})`,
                }} />
                <div className={`text-[10px] font-bold mt-1 ${d.dow === 0 ? 'text-red-400' : d.dow === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
                  {viewMode === 'week' ? `${d.day}(${d.dowJa})` : d.day}
                </div>
                {viewMode === 'month' && (
                  <div className={`text-[9px] ${d.dow === 0 ? 'text-red-300' : d.dow === 6 ? 'text-blue-300' : 'text-slate-300'}`}>
                    {d.dowJa}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* メインシフト表 */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table className="border-collapse" style={{ minWidth: displayDays.length * colMinW + 120 }}>
          <thead>
            <tr className="bg-slate-800">
              <th className="sticky left-0 bg-slate-800 z-10 px-3 py-2 text-left text-xs text-slate-300 font-bold" style={{ minWidth: 112 }}>担当者</th>
              {displayDays.map(d => (
                <th key={d.dateStr} className="px-0 py-2.5 text-center" style={{ minWidth: colMinW }}>
                  <div className={`text-[11px] font-black ${d.dow === 0 ? 'text-red-400' : d.dow === 6 ? 'text-blue-400' : 'text-slate-300'}`}>
                    {viewMode === 'week' ? `${d.day}日` : d.day}
                  </div>
                  <div className={`text-[9px] mt-0.5 ${d.dow === 0 ? 'text-red-300' : d.dow === 6 ? 'text-blue-300' : 'text-slate-500'}`}>
                    {d.dowJa}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 text-center text-xs text-emerald-400 font-bold whitespace-nowrap" style={{ minWidth: 44 }}>月計</th>
            </tr>
          </thead>
          <tbody>
            {activeReps.map((rep, i) => {
              const totalDays = workingDaysByRep[rep.id] || 0
              const submitted = totalDays > 0
              return (
                <tr key={rep.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className={`sticky left-0 z-10 px-2 py-2 border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <button
                      onClick={() => setSelectedRepIndex(i)}
                      className="flex items-center gap-1.5 w-full text-left active:opacity-60 transition-opacity"
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 ${submitted ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                        {rep.name.charAt(0)}
                      </div>
                      <span className={`text-xs font-bold truncate max-w-[72px] ${submitted ? 'text-slate-700' : 'text-slate-400'}`}>
                        {rep.name}
                      </span>
                    </button>
                  </td>
                  {displayDays.map(d => {
                    const row = getRow(rep.id, d.dateStr)
                    const status = row?.work_status || ''
                    const isWeekend = d.dow === 0 || d.dow === 6
                    return (
                      <td key={d.dateStr}
                        className={`border-b border-slate-100 text-center px-0 py-2 ${isWeekend ? 'bg-slate-50/80' : ''}`}
                        style={{ minWidth: colMinW }}>
                        {status === '稼働' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="mx-auto w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
                              <span className="text-white font-black text-[9px]">稼</span>
                            </div>
                            {row?.work_time_start && row?.work_time_end && (
                              <div className="text-[9px] text-emerald-600 font-bold leading-tight whitespace-nowrap mt-0.5">
                                {row.work_time_start.slice(0, 5)}〜{row.work_time_end.slice(0, 5)}
                              </div>
                            )}
                          </div>
                        ) : status === '休日' ? (
                          <div className="mx-auto w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">
                            <span className="text-slate-300 text-[9px]">休</span>
                          </div>
                        ) : (
                          <div className="mx-auto w-6 h-6 flex items-center justify-center">
                            <span className="text-slate-200 text-xs">—</span>
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="border-b border-slate-100 text-center px-1">
                    <span className={`text-xs font-black ${totalDays > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                      {totalDays > 0 ? totalDays : '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div className="flex gap-3 mt-3 flex-wrap text-xs text-slate-500 items-center">
        <div className="flex items-center gap-1">
          <div className="w-5 h-5 rounded-md bg-emerald-500 flex items-center justify-center"><span className="text-white font-black text-[8px]">稼</span></div>
          <span>稼働（時刻はシフト予定時間）</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center"><span className="text-slate-300 text-[8px]">休</span></div>
          <span>休日</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-5 h-5 flex items-center justify-center text-slate-200 text-xs">—</div>
          <span>未提出</span>
        </div>
      </div>
    </div>
  )
}
