'use client'

import { useEffect, useState } from 'react'
import { supabase, DailyRecord, MonthlyPlan } from '@/lib/supabase'
import { calcMonthlyStats, pct, round1, MonthlyStats } from '@/lib/calcUtils'

type Props = { repId: string; repName: string; yearMonth: string }

export default function AnalysisView({ repId, repName, yearMonth }: Props) {
  const [records, setRecords] = useState<DailyRecord[]>([])
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [stats, setStats] = useState<MonthlyStats | null>(null)

  useEffect(() => { loadData() }, [repId, yearMonth])

  async function loadData() {
    const [y, m] = yearMonth.split('-')
    const { data: recData } = await supabase
      .from('daily_records').select('*')
      .eq('sales_rep_id', repId)
      .gte('record_date', `${y}-${m}-01`)
      .lte('record_date', `${y}-${m}-31`)
    const { data: planData } = await supabase
      .from('monthly_plans').select('*')
      .eq('sales_rep_id', repId).eq('year_month', yearMonth).single()
    const recs = recData || []
    setRecords(recs)
    setPlan(planData || null)
    setStats(calcMonthlyStats(recs, planData?.plan_cases || 0, planData?.plan_working_days || 0, yearMonth))
  }

  if (!stats) return <div className="p-4 text-xs text-gray-400">読み込み中...</div>

  const forecastColor = stats.forecastAcquisitions >= stats.planCases ? 'bg-green-600' : 'bg-red-600'
  const gapColor = stats.gapToTarget <= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="font-bold text-sm">{repName} — 稼働結果分析</h2>
        <span className="text-xs text-gray-400">{yearMonth}</span>
      </div>

      {/* 着地予想 + 目標まで */}
      <div className="flex gap-3 flex-wrap">
        {/* 月間着地予想 */}
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col items-center justify-center min-w-[150px]">
          <div className="text-xs font-bold text-gray-500 mb-2">月間着地予想</div>
          <div className={`${forecastColor} text-white text-4xl font-black rounded-xl px-6 py-3 text-center`}>
            {round1(stats.forecastAcquisitions)}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            (生産性{round1(stats.productivity)} × 残{stats.remainingWorkingDays}日) + {stats.totalAcquisitions}件
          </div>
        </div>

        {/* 目標まで */}
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col items-center justify-center min-w-[150px]">
          <div className="text-xs font-bold text-gray-500 mb-2">目標まで</div>
          <div className={`text-4xl font-black ${gapColor}`}>
            {stats.gapToTarget > 0 ? `あと ${round1(stats.gapToTarget)}件` : `達成見込み ✓`}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            目標{stats.planCases}件 — 着地予想{round1(stats.forecastAcquisitions)}件
          </div>
          <div className="text-xs text-gray-400 mt-1">
            現時点の残件数: {stats.gapToTargetActual > 0 ? `${stats.gapToTargetActual}件` : '達成済み ✓'}
          </div>
        </div>

        {/* 計画情報 */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-2 min-w-[160px]">
          <div className="text-xs font-bold text-gray-500 mb-1">計画</div>
          <div className="flex justify-between text-sm gap-4">
            <span className="text-gray-600">計画件数</span>
            <span className="font-bold text-red-600">{stats.planCases}件</span>
          </div>
          <div className="flex justify-between text-sm gap-4">
            <span className="text-gray-600">計画稼働日数</span>
            <span className="font-bold">{stats.planWorkingDays}日</span>
          </div>
          <div className="flex justify-between text-sm gap-4">
            <span className="text-gray-600">実稼働日数</span>
            <span className="font-bold">{stats.actualWorkingDays}日</span>
          </div>
          <div className="flex justify-between text-sm gap-4">
            <span className="text-gray-600">残稼働日数</span>
            <span className="font-bold text-blue-600">{stats.remainingWorkingDays}日</span>
          </div>
          <div className="flex justify-between text-sm gap-4">
            <span className="text-gray-600">生産性</span>
            <span className="font-bold">{round1(stats.productivity)}</span>
          </div>
        </div>
      </div>

      {/* 月間サマリー */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-xs font-bold text-gray-500 mb-3">月間サマリー</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: '生産性', value: round1(stats.productivity), sub: '獲得÷実稼働日数' },
            { label: '対面率', value: pct(stats.meetingRate), sub: 'ネット÷訪問' },
            { label: '主権対面率', value: pct(stats.ownerMeetingRate), sub: '主権÷ネット' },
            { label: '商談率', value: pct(stats.negotiationRate), sub: '商談÷主権' },
            { label: '獲得率', value: pct(stats.acquisitionRate), sub: '獲得÷商談' },
            { label: '稼働時間', value: `${stats.totalWorkingHours}h`, sub: '合計' },
          ].map(item => (
            <div key={item.label} className="bg-gray-50 rounded-lg p-2">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className="text-lg font-bold text-gray-800">{item.value}</div>
              <div className="text-xs text-gray-400">{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 行動量 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-xs font-bold text-gray-500 mb-3">行動量</div>
        <table className="sheet-table w-full">
          <thead>
            <tr>
              <th className="bg-gray-100 text-left px-2"></th>
              <th className="header-blue">訪問</th>
              <th className="header-blue">ネット対面</th>
              <th className="header-blue">主権対面</th>
              <th className="header-blue">商談</th>
              <th className="header-blue">獲得</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="bg-blue-50 font-semibold text-left px-2">合計</td>
              <td>{stats.totalVisits}</td>
              <td>{stats.totalNetMeetings}</td>
              <td>{stats.totalOwnerMeetings}</td>
              <td>{stats.totalNegotiations}</td>
              <td className="font-bold">{stats.totalAcquisitions}</td>
            </tr>
            <tr>
              <td className="bg-blue-50 font-semibold text-left px-2">1日Ave</td>
              <td>{round1(stats.avgVisits)}</td>
              <td>{round1(stats.avgNetMeetings)}</td>
              <td>{round1(stats.avgOwnerMeetings)}</td>
              <td>{round1(stats.avgNegotiations)}</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 1件取る為には */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-xs font-bold text-gray-500 mb-3">1件獲得するために必要な行動量</div>
        <table className="sheet-table w-full">
          <thead>
            <tr>
              <th className="header-blue">訪問</th>
              <th className="header-blue">ネット対面</th>
              <th className="header-blue">主権対面</th>
              <th className="header-blue">商談</th>
              <th className="header-blue">獲得</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{round1(stats.perCaseVisits)}</td>
              <td>{round1(stats.perCaseMeetings)}</td>
              <td>{round1(stats.perCaseOwnerMeetings)}</td>
              <td>{round1(stats.perCaseNegotiations)}</td>
              <td className="font-bold text-green-600">1</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 曜日別集計 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-xs font-bold text-gray-500 mb-1">曜日別集計</div>
        <div className="text-xs text-gray-400 mb-3">計画稼働日数は月間計画稼働日数({stats.planWorkingDays}日)を曜日比率で按分</div>
        <div className="overflow-x-auto">
          <table className="sheet-table">
            <thead>
              <tr>
                <th className="bg-gray-100 text-left px-2">項目</th>
                {stats.byDow.map(d => (
                  <th key={d.dow} className={
                    d.dow === 6 ? 'row-saturday text-blue-700' :
                    d.dow === 0 ? 'row-sunday text-red-600' : 'bg-gray-50'
                  }>{d.dowJa}</th>
                ))}
                <th className="header-orange">TTL</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: '計画稼働日数', key: 'planDays' as const },
                { label: '実稼働数', key: 'actualDays' as const },
                { label: '獲得数', key: 'acquisitions' as const },
                { label: '生産性', key: 'productivity' as const },
                { label: '残稼働', key: 'remainingWork' as const },
                { label: '着地予想', key: 'landingForecast' as const },
                { label: '稼働割合', key: 'workRatio' as const },
              ].map(row => (
                <tr key={row.label}>
                  <td className="bg-gray-50 text-left px-2 font-medium whitespace-nowrap">{row.label}</td>
                  {stats.byDow.map(d => (
                    <td key={d.dow} className={
                      d.dow === 6 ? 'row-saturday' : d.dow === 0 ? 'row-sunday' : ''
                    }>
                      {row.key === 'workRatio'
                        ? pct(d[row.key])
                        : row.key === 'productivity' || row.key === 'landingForecast'
                          ? round1(d[row.key] as number)
                          : d[row.key]}
                    </td>
                  ))}
                  <td className="font-bold">
                    {row.key === 'planDays'        ? stats.planWorkingDays :
                     row.key === 'actualDays'      ? stats.actualWorkingDays :
                     row.key === 'acquisitions'    ? stats.totalAcquisitions :
                     row.key === 'productivity'    ? round1(stats.productivity) :
                     row.key === 'remainingWork'   ? stats.remainingWorkingDays :
                     row.key === 'landingForecast' ? round1(stats.forecastAcquisitions) :
                     row.key === 'workRatio'       ? pct(stats.planWorkingDays > 0 ? stats.actualWorkingDays / stats.planWorkingDays : 0) :
                     ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
