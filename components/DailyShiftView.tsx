'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep, Team } from '@/lib/supabase'
import { getDaysArray, localToday } from '@/lib/dateUtils'

type Props = { yearMonth: string; teams: Team[]; orgIds?: string[] }

type ScheduleRow = {
  sales_rep_id: string
  work_status: string
  work_time_start: string
  work_time_end: string
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

export default function DailyShiftView({ yearMonth, teams, orgIds }: Props) {
  const days = getDaysArray(yearMonth)
  const today = localToday()
  const defaultDate = days.find(d => d.dateStr === today) || days[0]

  const [selectedDate, setSelectedDate] = useState(defaultDate.dateStr)
  const [reps, setReps] = useState<SalesRep[]>([])
  const [schedules, setSchedules] = useState<Record<string, ScheduleRow>>({})
  const [loading, setLoading] = useState(true)
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null)

  // 月が変わったら選択日をリセット
  useEffect(() => {
    const newDays = getDaysArray(yearMonth)
    const newDefault = newDays.find(d => d.dateStr === today) || newDays[0]
    setSelectedDate(newDefault.dateStr)
  }, [yearMonth])

  useEffect(() => { loadReps() }, [orgIds?.join(',')])
  useEffect(() => { loadSchedule() }, [selectedDate])

  async function loadReps() {
    if (orgIds && orgIds.length > 1) {
      const res = await fetch(`/api/combined/data?orgIds=${orgIds.join(',')}&yearMonth=${yearMonth}`)
      const d = await res.json()
      setReps((d.reps || []).filter((r: any) => r.name && !r.name.startsWith('担当者')))
    } else {
      // 代理店(組織)で絞る — orgId が無い場合のみ全件フォールバック
      const orgId = orgIds?.[0]
      let q = supabase.from('sales_reps').select('*').eq('is_active', true)
      if (orgId) q = q.eq('organization_id', orgId)
      const { data } = await q.order('display_order')
      setReps((data || []).filter(r => r.name && !r.name.startsWith('担当者')))
    }
  }

  async function loadSchedule() {
    setLoading(true)
    const [schedsRes, recordsRes] = await Promise.all([
      supabase
        .from('work_schedules')
        .select('sales_rep_id, work_status, work_time_start, work_time_end')
        .eq('schedule_date', selectedDate),
      supabase
        .from('daily_records')
        .select('sales_rep_id, work_status, attendance_status, work_time_start, work_time_end')
        .eq('record_date', selectedDate),
    ])

    const map: Record<string, ScheduleRow> = {}
    schedsRes.data?.forEach(r => { map[r.sales_rep_id] = r })

    // daily_recordsの実績で上書き（予定 work_schedules → 実績 daily_records の順。実績を優先）
    recordsRes.data?.forEach(r => {
      const actualStatus = r.attendance_status || r.work_status
      if (!actualStatus) return
      map[r.sales_rep_id] = {
        sales_rep_id: r.sales_rep_id,
        work_status: actualStatus,
        work_time_start: r.work_time_start || map[r.sales_rep_id]?.work_time_start || '',
        work_time_end:   r.work_time_end   || map[r.sales_rep_id]?.work_time_end   || '',
      }
    })

    setSchedules(map)
    setLoading(false)
  }

  const selectedDay = days.find(d => d.dateStr === selectedDate) || days[0]
  const idx = days.findIndex(d => d.dateStr === selectedDate)
  const isToday = selectedDate === today

  const visibleReps = filterTeamId ? reps.filter(r => r.team_id === filterTeamId) : reps
  const working = visibleReps.filter(r => schedules[r.id]?.work_status === '稼働')
  const off = visibleReps.filter(r => {
    const s = schedules[r.id]?.work_status
    return s === '休日' || s === '非稼働'
  })
  const unsubmitted = visibleReps.filter(r => !schedules[r.id])

  if (!selectedDay) return null

  return (
    <div>
      {/* チームフィルター */}
      {teams.length > 0 && (
        <div className="flex gap-1.5 mb-3 flex-wrap">
          <button
            onClick={() => setFilterTeamId(null)}
            className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${filterTeamId === null ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
          >全体</button>
          {teams.map(t => (
            <button key={t.id}
              onClick={() => setFilterTeamId(t.id)}
              className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${filterTeamId === t.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
            >{t.name}</button>
          ))}
        </div>
      )}

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

          {/* 休日メンバー */}
          {off.length > 0 && (
            <div className="mobile-card">
              <div className="flex flex-wrap gap-2">
                {off.map(rep => (
                  <div key={rep.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-xl">
                    <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-white text-[10px] font-black">
                      {rep.name.charAt(0)}
                    </div>
                    <span className="text-xs font-bold text-slate-400">{rep.name}</span>
                    <span className="text-[10px] text-slate-400">休</span>
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
