'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getDaysArray } from '@/lib/dateUtils'

const WORK_STATUSES = ['稼働', '休日', '同行']

// 時刻選択肢（30分刻み）
const TIMES: string[] = []
for (let h = 6; h <= 23; h++) {
  TIMES.push(`${String(h).padStart(2,'0')}:00`)
  TIMES.push(`${String(h).padStart(2,'0')}:30`)
}

type Props = { repId: string; repName: string; yearMonth: string }

type DaySchedule = {
  work_status: string
  work_time_start: string
  work_time_end: string
}

const DEFAULT_DAY: DaySchedule = {
  work_status: '休日',
  work_time_start: '',
  work_time_end: '',
}

export default function ScheduleSubmitForm({ repId, repName, yearMonth }: Props) {
  const days = getDaysArray(yearMonth)
  const [schedules, setSchedules] = useState<Record<string, DaySchedule>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadSchedules() }, [repId, yearMonth])

  async function loadSchedules() {
    const [y, m] = yearMonth.split('-')
    const { data } = await supabase
      .from('work_schedules')
      .select('*')
      .eq('sales_rep_id', repId)
      .gte('schedule_date', `${y}-${m}-01`)
      .lte('schedule_date', `${y}-${m}-31`)

    const map: Record<string, DaySchedule> = {}
    days.forEach(d => { map[d.dateStr] = { ...DEFAULT_DAY } })
    data?.forEach(r => {
      map[r.schedule_date] = {
        work_status: r.work_status || '休日',
        work_time_start: r.work_time_start || '',
        work_time_end: r.work_time_end || '',
      }
    })
    setSchedules(map)
  }

  function setDayField(dateStr: string, field: keyof DaySchedule, value: string) {
    setSchedules(prev => ({
      ...prev,
      [dateStr]: { ...(prev[dateStr] || DEFAULT_DAY), [field]: value }
    }))
  }

  function bulkSetDow(dow: number, status: string) {
    setSchedules(prev => {
      const next = { ...prev }
      days.filter(d => d.dow === dow).forEach(d => {
        next[d.dateStr] = { ...(next[d.dateStr] || DEFAULT_DAY), work_status: status }
      })
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    const rows = days.map(d => ({
      sales_rep_id: repId,
      schedule_date: d.dateStr,
      work_status: schedules[d.dateStr]?.work_status || '休日',
      area_pref: '',
      area_city: '',
      work_time_start: schedules[d.dateStr]?.work_time_start || '',
      work_time_end: schedules[d.dateStr]?.work_time_end || '',
      updated_at: new Date().toISOString(),
    }))

    await supabase.from('work_schedules').upsert(rows, { onConflict: 'sales_rep_id,schedule_date' })

    const workingCount = rows.filter(r => r.work_status === '稼働').length
    await supabase.from('monthly_plans').upsert({
      sales_rep_id: repId,
      year_month: yearMonth,
      plan_working_days: workingCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sales_rep_id,year_month' })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const workingCount = days.filter(d => schedules[d.dateStr]?.work_status === '稼働').length

  const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']
  const STATUS_COLORS: Record<string, string> = {
    '稼働': 'bg-emerald-500 text-white',
    '休日': 'bg-slate-200 text-slate-500',
    '同行': 'bg-blue-400 text-white',
  }

  return (
    <div>
      {/* ヘッダー */}
      <div className="mobile-card" style={{background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)'}}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-400 flex items-center justify-center text-white text-xl font-black flex-shrink-0">
            {repName.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="text-xs text-blue-200 font-medium">稼働予定提出</div>
            <div className="text-xl font-black text-white">{repName}</div>
            <div className="text-xs text-blue-200 mt-0.5">{yearMonth.replace('-', '年')}月</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-emerald-400">{workingCount}</div>
            <div className="text-xs text-blue-200">稼働予定日</div>
          </div>
        </div>
      </div>

      {/* 一括設定 */}
      <div className="mobile-card">
        <div className="mobile-card-label">⚡ 一括設定</div>
        <div className="text-xs text-slate-500 mb-2">曜日ごとに一括でステータスを設定できます</div>
        <div className="space-y-2">
          {[1,2,3,4,5,6,0].map(dow => (
            <div key={dow} className="flex items-center gap-2">
              <span className={`text-xs font-bold w-6 text-center ${dow===0?'text-red-500':dow===6?'text-blue-500':'text-slate-600'}`}>
                {DOW_LABELS[dow]}
              </span>
              <div className="flex gap-2">
                {WORK_STATUSES.map(s => (
                  <button key={s} onClick={() => bulkSetDow(dow, s)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                      s === '稼働' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' :
                      s === '休日' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' :
                      'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}
                  >{s}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 日別設定 */}
      <div className="mobile-card">
        <div className="mobile-card-label">📅 日別設定</div>
        <div className="space-y-2">
          {days.map(d => {
            const sched = schedules[d.dateStr] || DEFAULT_DAY
            const isWork = sched.work_status === '稼働'

            return (
              <div key={d.dateStr}
                className={`rounded-xl border p-3 transition-all ${
                  isWork ? 'border-emerald-200 bg-emerald-50' :
                  sched.work_status === '同行' ? 'border-blue-200 bg-blue-50' :
                  d.dow === 0 ? 'border-red-100 bg-red-50' :
                  d.dow === 6 ? 'border-blue-100 bg-blue-50/50' :
                  'border-slate-100 bg-slate-50'
                }`}
              >
                {/* 日付 + ステータス */}
                <div className="flex items-center gap-2">
                  <div className={`text-sm font-black w-16 flex-shrink-0 ${
                    d.dow === 0 ? 'text-red-500' : d.dow === 6 ? 'text-blue-500' : 'text-slate-700'
                  }`}>
                    {d.dateStr.slice(5).replace('-', '/')}（{d.dowJa}）
                  </div>
                  <div className="flex gap-1.5 flex-1">
                    {WORK_STATUSES.map(s => (
                      <button key={s}
                        onClick={() => setDayField(d.dateStr, 'work_status', s)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                          sched.work_status === s
                            ? STATUS_COLORS[s]
                            : 'bg-white border border-slate-200 text-slate-400'
                        }`}
                      >{s}</button>
                    ))}
                  </div>
                </div>

                {/* 稼働時のみ: 時間帯 */}
                {isWork && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="text-xs text-slate-500 font-medium w-16 flex-shrink-0">⏰ 時間帯</div>
                    <select
                      value={sched.work_time_start}
                      onChange={e => setDayField(d.dateStr, 'work_time_start', e.target.value)}
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-300"
                    >
                      <option value="">開始</option>
                      {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-xs text-slate-400 font-bold">〜</span>
                    <select
                      value={sched.work_time_end}
                      onChange={e => setDayField(d.dateStr, 'work_time_end', e.target.value)}
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-300"
                    >
                      <option value="">終了</option>
                      {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {sched.work_time_start && sched.work_time_end && (
                      <span className="text-xs font-black text-emerald-700 bg-emerald-100 rounded-lg px-2 py-1 whitespace-nowrap">
                        {sched.work_time_start}〜{sched.work_time_end}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 提出ボタン */}
      <div className="save-bar">
        <div className="text-center text-xs text-slate-500 mb-2">
          稼働予定日数: <span className="font-black text-emerald-600 text-base">{workingCount}日</span>
          <span className="mx-2 text-slate-300">｜</span>
          提出すると「計画稼働」に反映されます
        </div>
        <button onClick={handleSave} disabled={saving}
          className={`save-btn ${saved ? 'save-btn-saved' : saving ? 'save-btn-saving' : 'save-btn-default'}`}
        >
          {saved ? '✓ 提出しました！計画稼働に反映済み' : saving ? '提出中...' : '📋 稼働予定を提出する'}
        </button>
      </div>
    </div>
  )
}
