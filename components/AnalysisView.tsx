'use client'

import { useEffect, useState } from 'react'
import { supabase, DailyRecord, MonthlyPlan } from '@/lib/supabase'
import { getDaysArray } from '@/lib/dateUtils'
import { calcMonthlyStats, pct, round1, MonthlyStats } from '@/lib/calcUtils'

type Props = { repId: string; repName: string; yearMonth: string }

const DOW_ORDER = ['月', '火', '水', '木', '金', '土', '日', '祝', 'TTL']
const DOW_MAP: Record<string, number> = { '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6, '日': 0 }

export default function AnalysisView({ repId, repName, yearMonth }: Props) {
  const [records, setRecords] = useState<DailyRecord[]>([])
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [stats, setStats] = useState<MonthlyStats | null>(null)

  useEffect(() => {
    loadData()
  }, [repId, yearMonth])

  async function loadData() {
    const [y, m] = yearMonth.split('-')
    const { data: recData } = await supabase
      .from('daily_records')
      .select('*')
      .eq('sales_rep_id', repId)
      .gte('record_date', `${y}-${m}-01`)
      .lte('record_date', `${y}-${m}-31`)

    const { data: planData } = await supabase
      .from('monthly_plans')
      .select('*')
      .eq('sales_rep_id', repId)
      .eq('year_month', yearMonth)
      .single()

    const recs = recData || []
    setRecords(recs)
    setPlan(planData || null)
    setStats(calcMonthlyStats(recs, planData?.plan_cases || 0, planData?.plan_working_days || 0, yearMonth))
  }

  if (!stats) return <div className="p-4 text-xs text-gray-400">読み込み中...</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="font-bold text-sm">{repName} - 稼働結果分析</h2>
        <span className="text-xs text-gray-500">{yearMonth}</span>
      </div>

      <div className="flex gap-4 flex-wrap">
        {/* 月間サマリー */}
        <div className="bg-white rounded shadow p-3 min-w-[320px]">
          <div className="header-green text-center text-xs font-bold mb-2 p-1 rounded">月間</div>
          <table className="sheet-table w-full">
            <thead>
              <tr>
                <th className="header-green">生産性</th>
                <th className="header-green">稼働数</th>
                <th className="header-green">稼働時間</th>
                <th className="header-green">対面率</th>
                <th className="header-green">主権対面率</th>
                <th className="header-green">商談率</th>
                <th className="header-green">獲得率</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{pct(stats.productivity / (stats.actualWorkingDays || 1))}</td>
                <td>{stats.actualWorkingDays}</td>
                <td>{stats.totalWorkingHours}</td>
                <td>{pct(stats.meetingRate)}</td>
                <td>{pct(stats.ownerMeetingRate)}</td>
                <td>{pct(stats.negotiationRate)}</td>
                <td>{pct(stats.acquisitionRate)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 月間着地予想 */}
        <div className="bg-white rounded shadow p-3 flex flex-col items-center justify-center">
          <div className="forecast-label mb-1 text-red-600">月間着地予想</div>
          <div className="forecast-box">
            {stats.forecastAcquisitions.toFixed(1)}
          </div>
        </div>
      </div>

      {/* 行動量 */}
      <div className="bg-white rounded shadow p-3">
        <div className="header-blue text-center text-xs font-bold mb-2 p-1 rounded">&lt;行動量&gt;</div>
        <div className="text-xs font-semibold text-gray-600 mb-1">既存主権対面</div>
        <table className="sheet-table">
          <thead>
            <tr>
              <th></th>
              <th className="header-blue">訪問</th>
              <th className="header-blue">ネット対面</th>
              <th className="header-blue">主権対面</th>
              <th className="header-blue">商談</th>
              <th className="header-blue">獲得</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-semibold bg-blue-50">合計</td>
              <td>{stats.totalVisits}</td>
              <td>{stats.totalNetMeetings}</td>
              <td>{stats.totalOwnerMeetings}</td>
              <td>{stats.totalNegotiations}</td>
              <td>{stats.totalAcquisitions}</td>
            </tr>
            <tr>
              <td className="font-semibold bg-blue-50">Ave</td>
              <td>{round1(stats.avgVisits)}</td>
              <td>{round1(stats.avgNetMeetings)}</td>
              <td>{round1(stats.avgOwnerMeetings)}</td>
              <td>{round1(stats.avgNegotiations)}</td>
              <td>-</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 1件取る為には */}
      <div className="bg-white rounded shadow p-3">
        <div className="header-blue text-center text-xs font-bold mb-2 p-1 rounded">&lt;1件取る為には&gt;</div>
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="header-blue">訪問</th>
              <th className="header-blue">対面</th>
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
              <td className="font-bold">1</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 曜日別集計 */}
      <div className="bg-white rounded shadow p-3">
        <div className="text-xs font-bold mb-2 text-gray-700">曜日別集計</div>
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="bg-gray-200">曜日</th>
              {stats.byDow.map(d => (
                <th key={d.dow} className={
                  d.dow === 6 ? 'row-saturday text-blue-600' :
                  d.dow === 0 ? 'row-sunday text-red-600' : 'bg-gray-50'
                }>{d.dowJa}</th>
              ))}
              <th className="header-orange">TTL</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: '計画稼働日数', key: 'planDays' as const },
              { label: '稼働数', key: 'actualDays' as const },
              { label: '獲得数', key: 'acquisitions' as const },
              { label: '生産性', key: 'productivity' as const },
              { label: '残稼働', key: 'remainingWork' as const },
              { label: '着地', key: 'landingForecast' as const },
              { label: '稼働割合', key: 'workRatio' as const },
            ].map(row => (
              <tr key={row.label}>
                <td className="bg-gray-50 text-left px-2 font-medium">{row.label}</td>
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
                {/* TTL column */}
                <td className="font-bold">
                  {row.key === 'planDays' ? stats.byDow.reduce((s,d)=>s+d.planDays,0) :
                   row.key === 'actualDays' ? stats.actualWorkingDays :
                   row.key === 'acquisitions' ? stats.totalAcquisitions :
                   row.key === 'productivity' ? round1(stats.productivity) :
                   row.key === 'remainingWork' ? stats.byDow.reduce((s,d)=>s+d.remainingWork,0) :
                   row.key === 'landingForecast' ? round1(stats.forecastAcquisitions) :
                   row.key === 'workRatio' ? pct(stats.actualWorkingDays / (plan?.plan_working_days || 1)) :
                   ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 月間計画 */}
      <div className="bg-white rounded shadow p-3">
        <div className="flex gap-4 text-xs">
          <div className="bg-red-600 text-white rounded px-2 py-1 font-bold">
            月間計画件数: {plan?.plan_cases || 0}件
          </div>
          <div className="bg-red-600 text-white rounded px-2 py-1 font-bold">
            月間計画稼働日数: {plan?.plan_working_days || 0}日
          </div>
        </div>
      </div>
    </div>
  )
}
