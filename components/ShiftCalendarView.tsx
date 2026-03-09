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

const STATUS_STYLE: Record<string, { bg: string; text: string; short: string }> = {
  '稼働': { bg: 'bg-emerald-500', text: 'text-white', short: '稼' },
  '休日': { bg: 'bg-slate-200', text: 'text-slate-400', short: '休' },
  '同行': { bg: 'bg-blue-400', text: 'text-white', short: '同' },
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

  // repId × date → schedule
  const schedMap: Record<string, ScheduleRow> = {}
  schedules.forEach(s => { schedMap[`${s.sales_rep_id}__${s.schedule_date}`] = s })

  const getStatus = (repId: string, dateStr: string) =>
    schedMap[`${repId}__${dateStr}`]?.work_status || ''
  const getTime = (repId: string, dateStr: string) => {
    const s = schedMap[`${repId}__${dateStr}`]
    if (!s || s.work_status !== '稼働') return ''
    if (s.work_time_start && s.work_time_end) return `${s.work_time_start}〜${s.work_time_end}`
    return ''
  }

  // 各日付の稼働人数
  const workingCountByDate: Record<string, number> = {}
  days.forEach(d => {
    workingCountByDate[d.dateStr] = reps.filter(r => getStatus(r.id, d.dateStr) === '稼働').length
  })

  // 各担当者の稼働日数
  const workingDaysByRep: Record<string, number> = {}
  reps.forEach(r => {
    workingDaysByRep[r.id] = days.filter(d => getStatus(r.id, d.dateStr) === '稼働').length
  })

  const maxWorking = Math.max(...Object.values(workingCountByDate), 1)

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-black text-slate-800 text-base">{yearMonth.replace('-', '年')}月 シフト</div>
          <div className="text-xs text-slate-400">work_schedulesテーブルに保存中</div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setViewMode('calendar')}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${viewMode === 'calendar' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            📅 カレンダー
          </button>
          <button onClick={() => setViewMode('list')}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            📋 一覧
          </button>
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {Object.entries(STATUS_STYLE).map(([s, v]) => (
          <span key={s} className={`${v.bg} ${v.text} text-xs font-bold px-2 py-0.5 rounded-full`}>{s}</span>
        ))}
        <span className="text-xs text-slate-400 self-center ml-1">※ 未提出は空白</span>
      </div>

      {/* ===== カレンダービュー ===== */}
      {viewMode === 'calendar' && (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{minWidth: reps.length * 52 + 80}}>
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-800 text-white px-2 py-1.5 text-left z-10" style={{minWidth:70}}>日付</th>
                {reps.map(r => (
                  <th key={r.id} className="bg-slate-700 text-white px-1 py-1.5 text-center font-bold" style={{minWidth:48}}>
                    <div className="truncate max-w-[44px]">{r.name}</div>
                    <div className="text-emerald-400 font-black">{workingDaysByRep[r.id] || 0}日</div>
                  </th>
                ))}
                <th className="bg-slate-600 text-white px-2 py-1.5 text-center" style={{minWidth:44}}>人数</th>
              </tr>
            </thead>
            <tbody>
              {days.map(d => {
                const isWeekend = d.dow === 0 || d.dow === 6
                const count = workingCountByDate[d.dateStr] || 0
                const intensity = maxWorking > 0 ? count / maxWorking : 0
                return (
                  <tr key={d.dateStr} className={isWeekend ? 'bg-slate-50' : 'bg-white'}>
                    <td className={`sticky left-0 px-2 py-1 font-bold border-b border-slate-100 z-10 ${
                      isWeekend ? 'bg-slate-50' : 'bg-white'
                    } ${d.dow === 0 ? 'text-red-500' : d.dow === 6 ? 'text-blue-500' : 'text-slate-700'}`}>
                      {d.dateStr.slice(5).replace('-','/')} {d.dowJa}
                    </td>
                    {reps.map(r => {
                      const status = getStatus(r.id, d.dateStr)
                      const time = getTime(r.id, d.dateStr)
                      const style = STATUS_STYLE[status]
                      return (
                        <td key={r.id} className="border-b border-slate-100 text-center px-0.5 py-0.5">
                          {style ? (
                            <div className={`${style.bg} ${style.text} rounded font-black text-center leading-tight px-0.5 py-1`}
                              title={time || status}>
                              <div>{style.short}</div>
                              {time && <div className="text-[9px] opacity-80 leading-none mt-0.5">
                                {time.split('〜')[0]}
                              </div>}
                            </div>
                          ) : (
                            <div className="text-slate-200 text-center">—</div>
                          )}
                        </td>
                      )
                    })}
                    <td className="border-b border-slate-100 text-center px-1">
                      {count > 0 ? (
                        <div className="relative rounded overflow-hidden" style={{height:20}}>
                          <div className="absolute inset-0 rounded"
                            style={{width:`${intensity*100}%`, background:'linear-gradient(90deg,#10b981,#059669)', opacity:0.8}} />
                          <div className="relative text-xs font-black text-emerald-900 text-center leading-5">{count}</div>
                        </div>
                      ) : <span className="text-slate-300">0</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 一覧ビュー（担当者ごと） ===== */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {reps.map(r => {
            const workDays = days.filter(d => getStatus(r.id, d.dateStr) === '稼働')
            const totalDays = workDays.length
            if (totalDays === 0) return (
              <div key={r.id} className="mobile-card opacity-40">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-white font-black text-sm">{r.name.charAt(0)}</div>
                  <span className="font-bold text-slate-500 text-sm">{r.name}</span>
                  <span className="text-xs text-slate-400">未提出</span>
                </div>
              </div>
            )
            return (
              <div key={r.id} className="mobile-card">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-sm">{r.name.charAt(0)}</div>
                  <div className="flex-1">
                    <span className="font-bold text-slate-800 text-sm">{r.name}</span>
                    <span className="text-xs text-slate-400 ml-2">稼働 {totalDays}日</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {workDays.map(d => {
                    const time = getTime(r.id, d.dateStr)
                    return (
                      <div key={d.dateStr}
                        className={`rounded-lg text-center px-2 py-1 bg-emerald-100 border border-emerald-200 ${d.dow===0?'border-red-200 bg-red-50':d.dow===6?'border-blue-200 bg-blue-50':''}`}>
                        <div className={`text-xs font-black ${d.dow===0?'text-red-500':d.dow===6?'text-blue-500':'text-emerald-700'}`}>
                          {d.dateStr.slice(5).replace('-','/')}
                        </div>
                        {time && <div className="text-[10px] text-slate-500 leading-none mt-0.5">{time}</div>}
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
