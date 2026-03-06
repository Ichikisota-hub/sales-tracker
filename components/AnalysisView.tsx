'use client'

import { useEffect, useState } from 'react'
import { supabase, DailyRecord, MonthlyPlan } from '@/lib/supabase'
import { calcMonthlyStats, pct, round1, MonthlyStats } from '@/lib/calcUtils'

type Props = { repId: string; repName: string; yearMonth: string }

export default function AnalysisView({ repId, repName, yearMonth }: Props) {
  const [plan, setPlan] = useState<MonthlyPlan | null>(null)
  const [stats, setStats] = useState<MonthlyStats | null>(null)

  useEffect(() => { loadData() }, [repId, yearMonth])

  async function loadData() {
    const [y, m] = yearMonth.split('-')
    const { data: recData } = await supabase.from('daily_records').select('*')
      .eq('sales_rep_id', repId).gte('record_date', `${y}-${m}-01`).lte('record_date', `${y}-${m}-31`)
    const { data: planData } = await supabase.from('monthly_plans').select('*')
      .eq('sales_rep_id', repId).eq('year_month', yearMonth).single()
    const recs = recData || []
    setPlan(planData || null)
    setStats(calcMonthlyStats(recs, planData?.plan_cases || 0, planData?.plan_working_days || 0, yearMonth))
  }

  if (!stats) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  const achieved = stats.forecastAcquisitions >= stats.planCases
  const forecastBg = achieved ? 'bg-emerald-500' : 'bg-red-500'

  return (
    <div className="space-y-3">

      {/* ── 着地予想 + 目標まで ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`forecast-big ${forecastBg}`}>
          <div className="forecast-big-label">月間着地予想</div>
          <div className="forecast-big-num">{round1(stats.forecastAcquisitions)}</div>
          <div style={{fontSize:10,opacity:.75,marginTop:4}}>
            目標 {stats.planCases}件
          </div>
        </div>
        <div className={`forecast-big ${achieved ? 'bg-emerald-600' : 'bg-orange-500'}`}>
          <div className="forecast-big-label">目標まで</div>
          {achieved
            ? <div className="forecast-big-num" style={{fontSize:32}}>達成<br />見込み</div>
            : <div className="forecast-big-num">あと<br /><span style={{fontSize:40}}>{round1(stats.gapToTarget)}</span><span style={{fontSize:18}}>件</span></div>
          }
        </div>
      </div>

      {/* ── 計算内訳 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label">着地予想の内訳</div>
        <div className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 leading-relaxed">
          <span className="font-bold text-slate-700">予測着地</span> = (生産性 <span className="font-bold text-blue-600">{round1(stats.productivity)}</span> × 残稼働 <span className="font-bold text-blue-600">{stats.remainingWorkingDays}日</span>) + 現在獲得 <span className="font-bold text-blue-600">{stats.totalAcquisitions}件</span>
          <div className="mt-1 font-bold text-slate-700 text-sm">= {round1(stats.forecastAcquisitions)}件</div>
        </div>
      </div>

      {/* ── 稼働サマリー ── */}
      <div className="mobile-card">
        <div className="mobile-card-label">稼働サマリー</div>
        <div className="stat-grid">
          {[
            { label: '生産性', value: round1(stats.productivity), sub: '獲得÷実稼働' },
            { label: '実稼働日数', value: `${stats.actualWorkingDays}日`, sub: `計画${stats.planWorkingDays}日` },
            { label: '残稼働日数', value: `${stats.remainingWorkingDays}日`, sub: '計画-実績' },
            { label: '稼働時間', value: `${stats.totalWorkingHours}h`, sub: '累計' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-card-label">{s.label}</div>
              <div className="stat-card-value">{s.value}</div>
              <div className="stat-card-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 各種率 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label">各種率</div>
        <div className="stat-grid">
          {[
            { label: '対面率', value: pct(stats.meetingRate), sub: 'ネット÷訪問' },
            { label: '主権対面率', value: pct(stats.ownerMeetingRate), sub: '主権÷ネット' },
            { label: '商談率', value: pct(stats.negotiationRate), sub: '商談÷主権' },
            { label: '獲得率', value: pct(stats.acquisitionRate), sub: '獲得÷商談' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-card-label">{s.label}</div>
              <div className="stat-card-value" style={{fontSize:17}}>{s.value}</div>
              <div className="stat-card-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 行動量 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label">行動量</div>
        <table className="sheet-table w-full">
          <thead>
            <tr>
              <th className="bg-slate-100 text-left px-2"></th>
              <th className="header-blue">訪問</th>
              <th className="header-blue">ネット</th>
              <th className="header-blue">主権</th>
              <th className="header-blue">商談</th>
              <th className="header-blue">獲得</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="bg-blue-50 font-semibold text-left px-2">合計</td>
              <td>{stats.totalVisits}</td><td>{stats.totalNetMeetings}</td>
              <td>{stats.totalOwnerMeetings}</td><td>{stats.totalNegotiations}</td>
              <td className="font-bold text-blue-700">{stats.totalAcquisitions}</td>
            </tr>
            <tr>
              <td className="bg-blue-50 font-semibold text-left px-2">1日Ave</td>
              <td>{round1(stats.avgVisits)}</td><td>{round1(stats.avgNetMeetings)}</td>
              <td>{round1(stats.avgOwnerMeetings)}</td><td>{round1(stats.avgNegotiations)}</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── 1件取る為には ── */}
      <div className="mobile-card">
        <div className="mobile-card-label">1件獲得に必要な行動量</div>
        <table className="sheet-table w-full">
          <thead>
            <tr>
              <th className="header-blue">訪問</th><th className="header-blue">ネット</th>
              <th className="header-blue">主権</th><th className="header-blue">商談</th>
              <th className="header-green">獲得</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{round1(stats.perCaseVisits)}</td><td>{round1(stats.perCaseMeetings)}</td>
              <td>{round1(stats.perCaseOwnerMeetings)}</td><td>{round1(stats.perCaseNegotiations)}</td>
              <td className="font-bold text-emerald-600">1</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── 曜日別集計 ── */}
      <div className="mobile-card">
        <div className="mobile-card-label">曜日別集計</div>
        <div className="text-xs text-slate-400 mb-2">計画稼働日数 {stats.planWorkingDays}日を曜日比率で按分</div>
        <div className="overflow-x-auto">
          <table className="sheet-table">
            <thead>
              <tr>
                <th className="bg-slate-100 text-left px-2" style={{minWidth:72}}>項目</th>
                {stats.byDow.map(d => (
                  <th key={d.dow} className={d.dow===6?'row-saturday':d.dow===0?'row-sunday':'bg-slate-50'}
                    style={{color: d.dow===6?'#1d4ed8':d.dow===0?'#dc2626':'inherit'}}>
                    {d.dowJa}
                  </th>
                ))}
                <th className="header-orange">計</th>
              </tr>
            </thead>
            <tbody>
              {[
                {label:'計画稼働', key:'planDays' as const},
                {label:'実稼働', key:'actualDays' as const},
                {label:'獲得数', key:'acquisitions' as const},
                {label:'生産性', key:'productivity' as const},
                {label:'残稼働', key:'remainingWork' as const},
                {label:'着地予想', key:'landingForecast' as const},
                {label:'稼働割合', key:'workRatio' as const},
              ].map(row => (
                <tr key={row.label}>
                  <td className="bg-slate-50 text-left px-2 font-medium whitespace-nowrap">{row.label}</td>
                  {stats.byDow.map(d => (
                    <td key={d.dow} className={d.dow===6?'row-saturday':d.dow===0?'row-sunday':''}>
                      {row.key==='workRatio' ? pct(d[row.key])
                       : row.key==='productivity'||row.key==='landingForecast' ? round1(d[row.key] as number)
                       : d[row.key]}
                    </td>
                  ))}
                  <td className="font-bold">
                    {row.key==='planDays' ? stats.planWorkingDays
                    :row.key==='actualDays' ? stats.actualWorkingDays
                    :row.key==='acquisitions' ? stats.totalAcquisitions
                    :row.key==='productivity' ? round1(stats.productivity)
                    :row.key==='remainingWork' ? stats.remainingWorkingDays
                    :row.key==='landingForecast' ? round1(stats.forecastAcquisitions)
                    :row.key==='workRatio' ? pct(stats.planWorkingDays>0?stats.actualWorkingDays/stats.planWorkingDays:0)
                    :''}
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
