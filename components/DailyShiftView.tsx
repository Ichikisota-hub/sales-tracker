'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep } from '@/lib/supabase'
import { getDaysArray, localToday } from '@/lib/dateUtils'

type Props = { yearMonth: string }

type ScheduleRow = {
  sales_rep_id: string
  work_status: string
  work_time_start: string
  work_time_end: string
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

export default function DailyShiftView({ yearMonth }: Props) {
  const days = getDaysArray(yearMonth)
  const today = localToday()
  const defaultDate = days.find(d => d.dateStr === today) || days[0]

  const [selectedDate, setSelectedDate] = useState(defaultDate.dateStr)
  const [reps, setReps] = useState<SalesRep[]>([])
  const [schedules, setSchedules] = useState<Record<string, ScheduleRow>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadReps() }, [])
  useEffect(() => { loadSchedule() }, [selectedDate])

  async function loadReps() {
    const { data } = await supabase.from('sales_reps').select('*').order('display_order')
    setReps((data || []).filter(r => r.name && !r.name.startsWith('担当者')))
  }

  async function loadSchedule() {
    setLoading(true)
    const { data } = await supabase
      .from('work_schedules')
      .select('sales_rep_id, work_status, work_time_start, work_time_end')
      .eq('schedule_date', selectedDate)
    const map: Record<string, ScheduleRow> = {}
    data?.forEach(r => { map[r.sales_rep_id] = r })
    setSchedules(map)
    setLoading(false)
  }

  const selectedDay = days.find(d => d.dateStr === selectedDate)!
  const idx = days.findIndex(d => d.dateStr === selectedDate)
  const isToday = selectedDate === today

  const working = reps.filter(r => schedules[r.id]?.work_status === '稼働')
  const off = reps.filter(r => schedules[r.id]?.work_status === '休日')
  const unsubmitted = reps.filter(r => !schedules[r.id])

  return (
    <div>
      {/* 日付ナビ */}
      <div className="mobile-card">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${
            selectedDay.dow === 0 ? 'bg-red-100 text-red-600' :
            selectedDay.dow === 6 ? 'bg-blue-100 text-blue-600' :
            'bg-slate-100 text-slate-500'
          }`}>{selectedDay.dowJa}曜日</span>
          {isToday && <span className="text-sm font-bold bg-blue-500 text-white px-3 py-1 rounded-full">今日</span>}
        </div>
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => idx > 0 && setSelectedDate(days[idx - 1].dateStr)}>‹</button>
          <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="date-select">
            {days.map(d => (
              <option key={d.dateStr} value={d.dateStr}>
                {d.dateStr.slice(5).replace('-', '/')}（{d.dowJa}）{d.dateStr === today ? ' ← 今日' : ''}
              </option>
            ))}
          </select>
          <button className="date-nav-btn" onClick={() => idx < days.length - 1 && setSelectedDate(days[idx + 1].dateStr)}>›</button>
        </div>
      </div>

      {/* 稼働サマリー */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
          <div className="text-3xl font-black text-emerald-600">{working.length}</div>
          <div className="text-xs font-bold text-emerald-500 mt-0.5">稼働</div>
        </div>
        <div className="bg-slate-100 border border-slate-200 rounded-2xl p-3 text-center">
          <div className="text-3xl font-black text-slate-500">{off.length}</div>
          <div className="text-xs font-bold text-slate-400 mt-0.5">休日</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center">
          <div className="text-3xl font-black text-amber-500">{unsubmitted.length}</div>
          <div className="text-xs font-bold text-amber-400 mt-0.5">未提出</div>
        </div>
      </div>

      {/* 稼働メンバー */}
      {loading ? (
        <div className="text-center text-slate-400 text-sm py-8">読み込み中...</div>
      ) : (
        <>
          {working.length > 0 && (
            <div className="mobile-card">
              <div className="mobile-card-label text-base text-emerald-600">稼働メンバー（{working.length}人）</div>
              <div className="space-y-2">
                {working.map(rep => {
                  const s = schedules[rep.id]
                  const hasTime = s?.work_time_start && s?.work_time_end
                  return (
                    <div key={rep.id} className="flex items-center gap-3 p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                      <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white text-base font-black flex-shrink-0">
                        {rep.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-slate-800 text-base">{rep.name}</div>
                        {hasTime ? (
                          <div className="text-sm font-bold text-emerald-600">
                            ⏰ {s.work_time_start}〜{s.work_time_end}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400">時間未登録</div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        <span className="text-xs font-black bg-emerald-500 text-white px-2.5 py-1 rounded-full">稼働</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {working.length === 0 && (
            <div className="mobile-card text-center py-6 text-slate-400 text-sm font-medium">
              この日の稼働メンバーはいません
            </div>
          )}

          {/* 休日・未提出（折りたたみ表示） */}
          {(off.length > 0 || unsubmitted.length > 0) && (
            <div className="mobile-card">
              <div className="flex flex-wrap gap-2">
                {off.map(rep => (
                  <div key={rep.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-xl">
                    <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-white text-[10px] font-black">
                      {rep.name.charAt(0)}
                    </div>
                    <span className="text-xs font-bold text-slate-400">{rep.name}</span>
                    <span className="text-[10px] text-slate-300">休</span>
                  </div>
                ))}
                {unsubmitted.map(rep => (
                  <div key={rep.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center text-amber-600 text-[10px] font-black">
                      {rep.name.charAt(0)}
                    </div>
                    <span className="text-xs font-bold text-amber-500">{rep.name}</span>
                    <span className="text-[10px] text-amber-300">未</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
