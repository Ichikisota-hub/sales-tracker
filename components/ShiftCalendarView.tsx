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

export default function ShiftCalendarView({ yearMonth }: Props) {
  const [reps, setReps] = useState<SalesRep[]>([])
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')

  const days = getDaysArray(yearMonth)

  useEffect(() => { loadAll() }, [yearMonth])

  async function loadAll() {
    setLoading(true)
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

  if (loading) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  const schedMap: Record<string, ScheduleRow> = {}
  schedules.forEach(s => { schedMap[`${s.sales_rep_id}__${s.schedule_date}`] = s })

  const getRow = (repId: string, dateStr: string): ScheduleRow | null =>
    schedMap[`${repId}__${dateStr}`] || null

  const workingDaysByRep: Record<string, number> = {}
  reps.forEach(r => {
    workingDaysByRep[r.id] = days.filter(d => getRow(r.id, d.dateStr)?.work_status === '稼働').length
  })

  const workingCountByDate: Record<string, number> = {}
  days.forEach(d => {
    workingCountByDate[d.dateStr] = reps.filter(r => getRow(r.id, d.dateStr)?.work_status === '稼働').length
  })
  const maxWorking = Math.max(...Object.values(workingCountByDate), 1)

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-black text-slate-800 text-lg">{yearMonth.replace('-', '年')}月 シフト確認</div>
          <div className="text-xs text-slate-400 mt-0.5">稼働の場合は時間帯も表示されます</div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setViewMode('calendar')}
            className={`text-sm px-3 py-2 rounded-xl font-bold transition-all ${viewMode === 'calendar' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            📅 カレンダー
          </button>
          <button onClick={() => setViewMode('list')}
            className={`text-sm px-3 py-2 rounded-xl font-bold transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            📋 一覧
          </button>
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">稼働</span>
        <span className="bg-slate-200 text-slate-500 text-xs font-bold px-3 py-1 rounded-full">休日</span>
        <span className="text-xs text-slate-400 ml-1">※ 未提出は空白</span>
      </div>

      {/* ===== カレンダービュー ===== */}
      {viewMode === 'calendar' && (
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{minWidth: reps.length * 90 + 80}}>
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-800 text-white px-2 py-2 text-left z-10 text-sm" style={{minWidth:72}}>日付</th>
                {reps.map(r => (
                  <th key={r.id} className="bg-slate-700 text-white px-2 py-2 text-center font-bold" style={{minWidth:88}}>
                    <div className="text-sm truncate max-w-[84px]">{r.name}</div>
                    <div className="text-emerald-400 font-black text-sm">{workingDaysByRep[r.id] || 0}日</div>
                  </th>
                ))}
                <th className="bg-slate-600 text-white px-2 py-2 text-center text-sm" style={{minWidth:48}}>人数</th>
              </tr>
            </thead>
            <tbody>
              {days.map(d => {
                const isWeekend = d.dow === 0 || d.dow === 6
                const count = workingCountByDate[d.dateStr] || 0
                const intensity = maxWorking > 0 ? count / maxWorking : 0
                return (
                  <tr key={d.dateStr} className={isWeekend ? 'bg-slate-50' : 'bg-white'}>
                    <td className={`sticky left-0 px-2 py-1.5 font-bold border-b border-slate-100 z-10 text-sm ${
                      isWeekend ? 'bg-slate-50' : 'bg-white'
                    } ${d.dow === 0 ? 'text-red-500' : d.dow === 6 ? 'text-blue-500' : 'text-slate-700'}`}>
                      {d.dateStr.slice(5).replace('-','/')} {d.dowJa}
                    </td>
                    {reps.map(r => {
                      const row = getRow(r.id, d.dateStr)
                      const status = row?.work_status || ''
                      const hasTime = status === '稼働' && row?.work_time_start && row?.work_time_end
                      return (
                        <td key={r.id} className="border-b border-slate-100 text-center px-1 py-1">
                          {status === '稼働' ? (
                            <div className="bg-emerald-500 text-white rounded-lg font-black text-center px-1 py-1.5">
                              <div className="text-sm">稼働</div>
                              {hasTime ? (
                                <div className="text-xs font-bold opacity-90 leading-tight mt-0.5">
                                  <div>{row!.work_time_start}</div>
                                  <div className="opacity-70">〜</div>
                                  <div>{row!.work_time_end}</div>
                                </div>
                              ) : (
                                <div className="text-xs opacity-60">時間未登録</div>
                              )}
                            </div>
                          ) : status === '休日' ? (
                            <div className="bg-slate-100 text-slate-400 rounded-lg text-center px-1 py-2">
                              <div className="text-sm font-bold">休日</div>
                            </div>
                          ) : (
                            <div className="text-slate-200 text-center text-lg">—</div>
                          )}
                        </td>
                      )
                    })}
                    <td className="border-b border-slate-100 text-center px-1">
                      {count > 0 ? (
                        <div className="relative rounded-lg overflow-hidden" style={{height:24}}>
                          <div className="absolute inset-0 rounded-lg"
                            style={{width:`${intensity*100}%`, background:'linear-gradient(90deg,#10b981,#059669)', opacity:0.8}} />
                          <div className="relative text-sm font-black text-emerald-900 text-center leading-6">{count}</div>
                        </div>
                      ) : <span className="text-slate-300 text-sm">0</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 一覧ビュー ===== */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {reps.map(r => {
            const workDays = days.filter(d => getRow(r.id, d.dateStr)?.work_status === '稼働')
            const totalDays = workDays.length
            if (totalDays === 0) return (
              <div key={r.id} className="mobile-card opacity-40">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center text-white font-black text-base">{r.name.charAt(0)}</div>
                  <span className="font-bold text-slate-500 text-base">{r.name}</span>
                  <span className="text-sm text-slate-400">未提出</span>
                </div>
              </div>
            )
            return (
              <div key={r.id} className="mobile-card">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-base">{r.name.charAt(0)}</div>
                  <div className="flex-1">
                    <span className="font-bold text-slate-800 text-base">{r.name}</span>
                    <span className="text-sm text-slate-400 ml-2">稼働 {totalDays}日</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {workDays.map(d => {
                    const row = getRow(r.id, d.dateStr)
                    const hasTime = row?.work_time_start && row?.work_time_end
                    return (
                      <div key={d.dateStr}
                        className={`rounded-xl text-center px-3 py-2 border-2 ${
                          d.dow === 0 ? 'border-red-200 bg-red-50' :
                          d.dow === 6 ? 'border-blue-200 bg-blue-50' :
                          'border-emerald-200 bg-emerald-50'
                        }`}>
                        <div className={`text-sm font-black ${d.dow===0?'text-red-500':d.dow===6?'text-blue-500':'text-emerald-700'}`}>
                          {d.dateStr.slice(5).replace('-','/')}({d.dowJa})
                        </div>
                        {hasTime ? (
                          <div className="text-xs text-slate-600 font-bold mt-1 leading-tight">
                            {row!.work_time_start}〜{row!.work_time_end}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-300 mt-1">時間未登録</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
