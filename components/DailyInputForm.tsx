'use client'

import { useEffect, useState } from 'react'
import { supabase, DailyRecord, MonthlyPlan } from '@/lib/supabase'
import { getDaysArray } from '@/lib/dateUtils'

const WORK_STATUSES = ['稼働', '休日', '同行', '有休', '研修', '出張']
const HOURS = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

type Props = { repId: string; repName: string; yearMonth: string }

export default function DailyInputForm({ repId, repName, yearMonth }: Props) {
  const days = getDaysArray(yearMonth)
  const today = new Date().toISOString().split('T')[0]
  const defaultDay = days.find(d => d.dateStr === today) || days[0]

  const [selectedDate, setSelectedDate] = useState(defaultDay.dateStr)
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [record, setRecord] = useState<Partial<DailyRecord>>({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadPlan() }, [repId, yearMonth])
  useEffect(() => { loadRecord() }, [repId, selectedDate])

  async function loadPlan() {
    const { data } = await supabase
      .from('monthly_plans').select('*')
      .eq('sales_rep_id', repId).eq('year_month', yearMonth).single()
    setPlan(data)
  }

  async function loadRecord() {
    setSaved(false)
    const { data } = await supabase
      .from('daily_records').select('*')
      .eq('sales_rep_id', repId).eq('record_date', selectedDate).single()
    setRecord(data || {
      work_status: '',
      attendance_status: '',
      working_hours: 0,
      visits: 0,
      net_meetings: 0,
      owner_meetings: 0,
      negotiations: 0,
      acquisitions: 0,
    })
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('daily_records').upsert({
      ...record,
      sales_rep_id: repId,
      record_date: selectedDate,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sales_rep_id,record_date' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function updatePlan(field: 'plan_cases' | 'plan_working_days', value: number) {
    const newPlan = { ...(plan || {}), sales_rep_id: repId, year_month: yearMonth, [field]: value }
    setPlan(newPlan as MonthlyPlan)
    await supabase.from('monthly_plans').upsert({
      ...newPlan, updated_at: new Date().toISOString()
    }, { onConflict: 'sales_rep_id,year_month' })
  }

  function set(field: keyof DailyRecord, value: string | number) {
    setRecord(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  function increment(field: keyof DailyRecord) {
    setRecord(prev => ({ ...prev, [field]: ((prev[field] as number) || 0) + 1 }))
    setSaved(false)
  }

  function decrement(field: keyof DailyRecord) {
    setRecord(prev => ({ ...prev, [field]: Math.max(0, ((prev[field] as number) || 0) - 1) }))
    setSaved(false)
  }

  const selectedDay = days.find(d => d.dateStr === selectedDate)
  const isWorking = record.attendance_status === '稼働' || record.work_status === '稼働'

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base text-gray-800">📝 かんたん入力</h2>
          <span className="text-xs text-gray-500">{repName}</span>
        </div>

        {/* Date selector */}
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => {
              const idx = days.findIndex(d => d.dateStr === selectedDate)
              if (idx > 0) setSelectedDate(days[idx - 1].dateStr)
            }}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold"
          >‹</button>

          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-center bg-white"
          >
            {days.map(d => (
              <option key={d.dateStr} value={d.dateStr}>
                {d.day}日（{d.dowJa}）{d.dateStr === today ? ' ← 今日' : ''}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              const idx = days.findIndex(d => d.dateStr === selectedDate)
              if (idx < days.length - 1) setSelectedDate(days[idx + 1].dateStr)
            }}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold"
          >›</button>
        </div>

        {selectedDay && (
          <div className={`text-center text-xs font-medium ${
            selectedDay.dow === 0 ? 'text-red-500' :
            selectedDay.dow === 6 ? 'text-blue-500' : 'text-gray-400'
          }`}>
            {selectedDay.dateStr}
          </div>
        )}
      </div>

      {/* 出勤状態 */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">出勤状態</div>
        <div className="grid grid-cols-3 gap-2">
          {WORK_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => {
                set('work_status', s)
                set('attendance_status', s)
              }}
              className={`py-3 rounded-xl text-sm font-medium transition-all ${
                record.attendance_status === s || record.work_status === s
                  ? 'bg-blue-600 text-white shadow-md scale-105'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 稼働時間 */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">稼働時間</div>
        <div className="grid grid-cols-5 gap-2">
          {HOURS.map(h => (
            <button
              key={h}
              onClick={() => set('working_hours', h)}
              className={`py-2 rounded-lg text-xs font-medium transition-all ${
                record.working_hours === h
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {/* 行動量カウンター */}
      {isWorking && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">行動量（1日）</div>
          <div className="space-y-4">
            {[
              { label: '訪問', field: 'visits' as keyof DailyRecord, color: 'blue' },
              { label: 'ネット対面', field: 'net_meetings' as keyof DailyRecord, color: 'indigo' },
              { label: '主権対面', field: 'owner_meetings' as keyof DailyRecord, color: 'purple' },
              { label: '商談', field: 'negotiations' as keyof DailyRecord, color: 'orange' },
              { label: '獲得', field: 'acquisitions' as keyof DailyRecord, color: 'green' },
            ].map(({ label, field, color }) => {
              const val = (record[field] as number) || 0
              const colorMap: Record<string, string> = {
                blue: 'bg-blue-600 hover:bg-blue-700',
                indigo: 'bg-indigo-600 hover:bg-indigo-700',
                purple: 'bg-purple-600 hover:bg-purple-700',
                orange: 'bg-orange-500 hover:bg-orange-600',
                green: 'bg-green-600 hover:bg-green-700',
              }
              const textMap: Record<string, string> = {
                blue: 'text-blue-600', indigo: 'text-indigo-600',
                purple: 'text-purple-600', orange: 'text-orange-500', green: 'text-green-600',
              }
              return (
                <div key={field}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                    <span className={`text-xs font-bold ${textMap[color]}`}>{val}件</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* −ボタン */}
                    <button
                      onClick={() => decrement(field)}
                      className="w-11 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 text-2xl font-bold text-gray-600 flex items-center justify-center flex-shrink-0"
                    >−</button>

                    {/* 直接入力 */}
                    <input
                      type="number"
                      min={0}
                      value={val === 0 ? '' : val}
                      placeholder="0"
                      onChange={e => set(field, parseInt(e.target.value) || 0)}
                      className="flex-1 text-center text-2xl font-black border-2 border-gray-200 rounded-xl py-2 focus:outline-none focus:border-blue-400"
                    />

                    {/* ＋ボタン */}
                    <button
                      onClick={() => increment(field)}
                      className={`w-11 h-11 rounded-xl ${colorMap[color]} text-white text-2xl font-bold flex items-center justify-center flex-shrink-0 shadow-sm`}
                    >＋</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 月初計画入力 */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
        <div className="text-xs font-bold text-red-500 uppercase tracking-wide mb-3">月初計画入力</div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 flex-1">月間計画件数</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updatePlan('plan_cases', Math.max(0, (plan?.plan_cases || 0) - 1))}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-gray-600"
              >−</button>
              <input
                type="number" min={0}
                value={plan?.plan_cases || 0}
                onChange={e => updatePlan('plan_cases', parseInt(e.target.value) || 0)}
                className="w-16 text-center border border-gray-300 rounded-lg py-1 text-sm font-bold"
              />
              <button
                onClick={() => updatePlan('plan_cases', (plan?.plan_cases || 0) + 1)}
                className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold"
              >＋</button>
              <span className="text-sm text-gray-500">件</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 flex-1">月間計画稼働日数</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updatePlan('plan_working_days', Math.max(0, (plan?.plan_working_days || 0) - 1))}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 font-bold text-gray-600"
              >−</button>
              <input
                type="number" min={0}
                value={plan?.plan_working_days || 0}
                onChange={e => updatePlan('plan_working_days', parseInt(e.target.value) || 0)}
                className="w-16 text-center border border-gray-300 rounded-lg py-1 text-sm font-bold"
              />
              <button
                onClick={() => updatePlan('plan_working_days', (plan?.plan_working_days || 0) + 1)}
                className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold"
              >＋</button>
              <span className="text-sm text-gray-500">日</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save button - fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-4 rounded-xl text-base font-bold transition-all ${
            saved
              ? 'bg-green-500 text-white'
              : saving
              ? 'bg-gray-300 text-gray-500'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95'
          }`}
        >
          {saved ? '✓ 保存しました！' : saving ? '保存中...' : '💾 保存する'}
        </button>
      </div>
    </div>
  )
}
