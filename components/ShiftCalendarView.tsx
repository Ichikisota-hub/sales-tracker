'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep } from '@/lib/supabase'
import { getDaysArray } from '@/lib/dateUtils'

type Props = { yearMonth: string }

type ScheduleRow = {
  sales_rep_id: string
  schedule_date: string
  work_status: string
  work_time_start: string
  work_time_end: string
}

type BulkResult = { name: string; matched: string | null; days: number; status: string }

export default function ShiftCalendarView({ yearMonth }: Props) {
  const [reps, setReps] = useState<SalesRep[]>([])
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null)

  const days = getDaysArray(yearMonth)

  useEffect(() => { loadAll() }, [yearMonth])

  async function loadAll() {
    setLoading(true)
    setBulkResults(null)
    const [y, m] = yearMonth.split('-')
    const [{ data: repData }, { data: schedData }] = await Promise.all([
      supabase.from('sales_reps').select('*').order('display_order'),
      supabase.from('work_schedules').select('*')
        .gte('schedule_date', `${y}-${m}-01`)
        .lte('schedule_date', `${y}-${m}-31`),
    ])
    setReps(repData || [])
    setSchedules(schedData || [])
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

  const activeReps = reps.filter(r => r.name && !r.name.startsWith('担当者'))

  // 日付ごとの稼働人数
  const countByDate: Record<string, number> = {}
  days.forEach(d => {
    countByDate[d.dateStr] = activeReps.filter(r => getRow(r.id, d.dateStr)?.work_status === '稼働').length
  })
  const maxCount = Math.max(...Object.values(countByDate), 1)

  // 担当者ごとの稼働日数
  const workingDaysByRep: Record<string, number> = {}
  activeReps.forEach(r => {
    workingDaysByRep[r.id] = days.filter(d => getRow(r.id, d.dateStr)?.work_status === '稼働').length
  })

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="font-black text-slate-800 text-lg">{yearMonth.replace('-', '年')}月 シフト確認</div>
          <div className="text-xs text-slate-400 mt-0.5">提出済み: {activeReps.filter(r => workingDaysByRep[r.id] > 0).length} / {activeReps.length}人</div>
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
          {days.map(d => {
            const count = countByDate[d.dateStr] || 0
            const intensity = count / maxCount
            const isWeekend = d.dow === 0 || d.dow === 6
            return (
              <div key={d.dateStr} className="flex flex-col items-center" style={{ minWidth: 50 }}>
                <div className="text-xs font-black text-slate-700 mb-1">{count > 0 ? count : ''}</div>
                <div className="w-6 rounded-t-md transition-all" style={{
                  height: 32,
                  background: count === 0 ? '#f1f5f9' :
                    `rgba(16,185,129,${0.3 + intensity * 0.7})`,
                }} />
                <div className={`text-[10px] font-bold mt-1 ${d.dow === 0 ? 'text-red-400' : d.dow === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
                  {d.day}
                </div>
                <div className={`text-[9px] ${d.dow === 0 ? 'text-red-300' : d.dow === 6 ? 'text-blue-300' : 'text-slate-300'}`}>
                  {d.dowJa}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* メインシフト表（担当者が行、日付が列） */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <table className="border-collapse" style={{ minWidth: days.length * 52 + 120 }}>
          <thead>
            <tr className="bg-slate-800">
              <th className="sticky left-0 bg-slate-800 z-10 px-3 py-2 text-left text-xs text-slate-300 font-bold" style={{ minWidth: 112 }}>担当者</th>
              {days.map(d => (
                <th key={d.dateStr} className="px-0 py-2 text-center" style={{ minWidth: 50 }}>
                  <div className={`text-[11px] font-black ${d.dow === 0 ? 'text-red-400' : d.dow === 6 ? 'text-blue-400' : 'text-slate-300'}`}>
                    {d.day}
                  </div>
                  <div className={`text-[9px] ${d.dow === 0 ? 'text-red-300' : d.dow === 6 ? 'text-blue-300' : 'text-slate-500'}`}>
                    {d.dowJa}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 text-center text-xs text-emerald-400 font-bold whitespace-nowrap" style={{ minWidth: 44 }}>計</th>
            </tr>
          </thead>
          <tbody>
            {activeReps.map((rep, i) => {
              const totalDays = workingDaysByRep[rep.id] || 0
              const submitted = totalDays > 0
              return (
                <tr key={rep.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  <td className={`sticky left-0 z-10 px-2 py-1.5 border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 ${submitted ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                        {rep.name.charAt(0)}
                      </div>
                      <span className={`text-xs font-bold truncate max-w-[72px] ${submitted ? 'text-slate-700' : 'text-slate-400'}`}>
                        {rep.name}
                      </span>
                    </div>
                  </td>
                  {days.map(d => {
                    const row = getRow(rep.id, d.dateStr)
                    const status = row?.work_status || ''
                    const isWeekend = d.dow === 0 || d.dow === 6
                    return (
                      <td key={d.dateStr} className={`border-b border-slate-100 text-center px-0 py-1 ${isWeekend ? 'bg-slate-50/80' : ''}`}
                        style={{ minWidth: 50 }}>
                        {status === '稼働' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="mx-auto w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
                              <span className="text-white font-black text-[9px]">稼</span>
                            </div>
                            {row?.work_time_start && row?.work_time_end && (
                              <div className="text-[8px] text-emerald-600 font-bold leading-tight whitespace-nowrap">
                                {row.work_time_start.slice(0,5)}
                                <br/>〜{row.work_time_end.slice(0,5)}
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
          <span>稼働</span>
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
