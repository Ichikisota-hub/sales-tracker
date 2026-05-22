'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { calcMonthlyStats, pct, round1, MonthlyStats } from '@/lib/calcUtils'

type Props = { repId: string; repName: string; yearMonth: string }

// ─── ファネル転換率ベンチマーク ─────────────────────────────────────────────

type FunnelBenchmark = {
  key: string
  label: string
  sub: string
  benchmark: number  // 基準値（小数: 0.04 = 4%）
}

const FUNNEL_BENCHMARKS: FunnelBenchmark[] = [
  { key: 'meeting',    label: '訪問→ネット対面', sub: 'ネット対面÷訪問',    benchmark: 0.040 },
  { key: 'owner',      label: 'ネット対面→主権', sub: '主権対面÷ネット対面', benchmark: 0.550 },
  { key: 'nego',       label: '主権対面→商談',   sub: '商談÷主権対面',       benchmark: 0.620 },
  { key: 'acq',        label: '商談→獲得',       sub: '獲得÷商談',           benchmark: 0.310 },
]

// 読み方の例に基づく自動コメント
const AUTO_COMMENTS: Record<string, Record<AchvStatus, string>> = {
  meeting: {
    good:     '行動量は強み。エリア・時間帯を維持しよう。',
    warning:  '行動量は標準。エリアや時間帯の見直しで伸び代あり。',
    critical: 'エリア/時間帯ミスの可能性。稼働場所・時間帯を再検討。',
  },
  owner: {
    good:     'インターホントークが強み。継続して磨こう。',
    warning:  'インターホントークに改善余地あり。',
    critical: 'インターホントーク改善が急務。対話継続のフレーズを見直し。',
  },
  nego: {
    good:     '宅内トークが武器。商談設定率は高い。',
    warning:  '商談設定トークに改善余地あり。',
    critical: '商談設定トークが弱点。宅内での誘導フレーズを優先的に改善。',
  },
  acq: {
    good:     'クロージングが強い。このペースを維持。',
    warning:  'クロージングに伸び代あり。最後の一押しを磨こう。',
    critical: '最後の一押し不足が最優先課題。クロージングトークを強化。',
  },
}

function calcFunnelRates(r: { visits?: number; net_meetings?: number; owner_meetings?: number; negotiations?: number; acquisitions?: number }) {
  const v = r.visits || 0, n = r.net_meetings || 0, o = r.owner_meetings || 0
  const neg = r.negotiations || 0, acq = r.acquisitions || 0
  return {
    meeting: v > 0   ? n   / v   : null,
    owner:   n > 0   ? o   / n   : null,
    nego:    o > 0   ? neg / o   : null,
    acq:     neg > 0 ? acq / neg : null,
  }
}

type AchvStatus = 'good' | 'warning' | 'critical'
function achvStatus(actual: number | null, benchmark: number): AchvStatus | null {
  if (actual === null) return null
  const pct = actual / benchmark
  if (pct >= 1.1) return 'good'
  if (pct >= 0.8) return 'warning'
  return 'critical'
}

const STATUS_COLOR: Record<AchvStatus, { bg: string; text: string; badge: string }> = {
  good:     { bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-500' },
  warning:  { bg: 'bg-yellow-50',  text: 'text-yellow-700',  badge: 'bg-yellow-400'  },
  critical: { bg: 'bg-red-50',     text: 'text-red-700',     badge: 'bg-red-500'     },
}

function AchvBar({ actual, benchmark }: { actual: number | null; benchmark: number }) {
  if (actual === null) return <span className="text-slate-300 text-xs">データなし</span>
  const achvPct = Math.round((actual / benchmark) * 100)
  const st = achvStatus(actual, benchmark)!
  const c = STATUS_COLOR[st]
  const barW = Math.min(100, Math.max(0, achvPct))
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 bg-slate-100 rounded-full h-2 relative">
        {/* 基準線(100%) */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400 z-10" style={{ left: `${Math.min(100, (1/1)*100)}%` }} />
        <div
          className={`${c.badge} h-2 rounded-full transition-all`}
          style={{ width: `${barW * (100 / Math.max(100, achvPct + 20))}%` }}
        />
      </div>
      <span className={`text-xs font-black w-12 text-right ${c.text}`}>{achvPct}%</span>
      <span className="text-xs text-slate-400 w-10">{(actual * 100).toFixed(1)}%</span>
    </div>
  )
}

function FunnelBenchmarkSection({
  stats, dailyRecords, repId, yearMonth,
}: {
  stats: MonthlyStats
  dailyRecords: { record_date: string; visits?: number; net_meetings?: number; owner_meetings?: number; negotiations?: number; acquisitions?: number; attendance_status?: string }[]
  repId: string
  yearMonth: string
}) {
  const monthlyRates = calcFunnelRates({
    visits: stats.totalVisits, net_meetings: stats.totalNetMeetings,
    owner_meetings: stats.totalOwnerMeetings, negotiations: stats.totalNegotiations,
    acquisitions: stats.totalAcquisitions,
  })

  const workingDays = dailyRecords
    .filter(r => r.attendance_status === '稼働')
    .sort((a, b) => a.record_date.localeCompare(b.record_date))

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
      <div className="text-sm font-bold text-slate-700 mb-3">📊 ファネル転換率 ベンチマーク達成度</div>

      {/* 月間サマリー */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-slate-500 mb-2">月間平均（100% = 基準値）</div>
        <div className="space-y-2">
          {FUNNEL_BENCHMARKS.map(fb => {
            const actual = monthlyRates[fb.key as keyof typeof monthlyRates]
            const st = achvStatus(actual, fb.benchmark)
            const c = st ? STATUS_COLOR[st] : null
            const autoComment = st ? AUTO_COMMENTS[fb.key]?.[st] : null
            return (
              <div key={fb.key} className={`rounded-lg p-2 ${c?.bg ?? 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="text-xs font-bold text-slate-700">{fb.label}</span>
                    <span className="text-xs text-slate-400 ml-1">{fb.sub}</span>
                  </div>
                  <span className="text-xs text-slate-400">基準 {(fb.benchmark * 100).toFixed(1)}%</span>
                </div>
                <AchvBar actual={actual} benchmark={fb.benchmark} />
                {autoComment && (
                  <div className={`mt-1.5 text-xs px-2 py-1 rounded ${c?.text ?? 'text-slate-600'} bg-white bg-opacity-60`}>
                    💬 {autoComment}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 日別 */}
      {workingDays.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-2">日別達成度（稼働日のみ）</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">日付</th>
                  {FUNNEL_BENCHMARKS.map(fb => (
                    <th key={fb.key} className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                      <div>{fb.label.split('→')[0]}</div>
                      <div className="text-slate-400">→{fb.label.split('→')[1]}</div>
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <td className="px-2 py-1 text-slate-400">基準値</td>
                  {FUNNEL_BENCHMARKS.map(fb => (
                    <td key={fb.key} className="px-2 py-1 text-center text-slate-500 font-medium">
                      {(fb.benchmark * 100).toFixed(1)}%
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workingDays.map(day => {
                  const rates = calcFunnelRates(day)
                  const dateLabel = day.record_date.slice(5)  // MM-DD
                  return (
                    <tr key={day.record_date} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-1.5 font-medium text-slate-600 whitespace-nowrap">{dateLabel}</td>
                      {FUNNEL_BENCHMARKS.map(fb => {
                        const actual = rates[fb.key as keyof typeof rates]
                        const st = achvStatus(actual, fb.benchmark)
                        if (actual === null) {
                          return <td key={fb.key} className="px-2 py-1.5 text-center text-slate-200">—</td>
                        }
                        const achvPct = Math.round((actual / fb.benchmark) * 100)
                        const c = STATUS_COLOR[st!]
                        return (
                          <td key={fb.key} className={`px-2 py-1.5 text-center ${c.bg}`}>
                            <div className={`font-black ${c.text}`}>{achvPct}%</div>
                            <div className="text-slate-400 text-xs">{(actual * 100).toFixed(1)}%</div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 mt-2 text-xs text-slate-500">
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />good ≥110%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1" />warning 80-110%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />critical &lt;80%</span>
          </div>
        </div>
      )}
    </div>
  )
}

function DowTable({ stats }: { stats: MonthlyStats }) {
  return (
    <table className="sheet-table">
      <thead>
        <tr>
          <th className="bg-gray-200 text-left px-2">項目</th>
          {stats.byDow.map(d => (
            <th key={d.dow}
              className={d.dow===6 ? 'row-saturday' : d.dow===0 ? 'row-sunday' : 'bg-gray-50'}
              style={{color: d.dow===6?'#1d4ed8': d.dow===0?'#dc2626':'inherit'}}>
              {d.dowJa}
            </th>
          ))}
          <th className="header-orange">計</th>
        </tr>
      </thead>
      <tbody>
        {([
          {label:'計画稼働', key:'planDays'},
          {label:'実稼働', key:'actualDays'},
          {label:'獲得数', key:'acquisitions'},
          {label:'生産性', key:'productivity'},
          {label:'残稼働', key:'remainingWork'},
          {label:'着地予想', key:'landingForecast'},
          {label:'稼働割合', key:'workRatio'},
        ] as {label:string; key: keyof (typeof stats.byDow)[0]}[]).map(row => (
          <tr key={row.label}>
            <td className="bg-gray-50 text-left px-2 font-medium whitespace-nowrap">{row.label}</td>
            {stats.byDow.map(d => (
              <td key={d.dow} className={d.dow===6?'row-saturday':d.dow===0?'row-sunday':''}>
                {row.key==='workRatio' ? pct(d[row.key] as number)
                 : row.key==='productivity'||row.key==='landingForecast' ? round1(d[row.key] as number)
                 : d[row.key]}
              </td>
            ))}
            <td className="font-bold">
              {row.key==='planDays'        ? stats.planWorkingDays
              :row.key==='actualDays'      ? stats.actualWorkingDays
              :row.key==='acquisitions'    ? stats.totalAcquisitions
              :row.key==='productivity'    ? round1(stats.productivity)
              :row.key==='remainingWork'   ? stats.remainingWorkingDays
              :row.key==='landingForecast' ? round1(stats.forecastAcquisitions)
              :row.key==='workRatio'       ? pct(stats.planWorkingDays>0 ? stats.actualWorkingDays/stats.planWorkingDays : 0)
              :''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AnalysisView({ repId, repName, yearMonth }: Props) {
  const [stats, setStats] = useState<MonthlyStats | null>(null)
  const [dailyRecords, setDailyRecords] = useState<any[]>([])

  useEffect(() => { loadData() }, [repId, yearMonth])

  async function loadData() {
    const [y, m] = yearMonth.split('-')
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    const lastDayStr = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    const [{ data: recData }, { data: planData }, { data: schedData }] = await Promise.all([
      supabase.from('daily_records').select('*')
        .eq('sales_rep_id', repId).gte('record_date', `${y}-${m}-01`).lte('record_date', lastDayStr),
      supabase.from('monthly_plans').select('*')
        .eq('sales_rep_id', repId).eq('year_month', yearMonth).single(),
      supabase.from('work_schedules').select('schedule_date')
        .eq('sales_rep_id', repId).eq('work_status', '稼働')
        .gte('schedule_date', `${y}-${m}-01`).lte('schedule_date', lastDayStr),
    ])
    const schedWorkingDays = schedData?.map(s => s.schedule_date) || []
    setDailyRecords(recData || [])
    setStats(calcMonthlyStats(recData || [], planData?.plan_cases || 0, planData?.plan_working_days || 0, yearMonth, schedWorkingDays))
  }

  if (!stats) return <div className="p-6 text-center text-slate-400 text-sm">読み込み中...</div>

  const achieved = stats.forecastAcquisitions >= stats.planCases

  return (
    <div>

      {/* ファネル転換率ベンチマーク（共通） */}
      <FunnelBenchmarkSection stats={stats} dailyRecords={dailyRecords} repId={repId} yearMonth={yearMonth} />

      {/* ========== MOBILE (< md) ========== */}
      <div className="md:hidden space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className={`forecast-big ${achieved ? 'bg-emerald-500' : 'bg-red-500'}`}>
            <div className="forecast-big-label">月間着地予想</div>
            <div className="forecast-big-num">{round1(stats.forecastAcquisitions)}</div>
            <div style={{fontSize:10,opacity:.75,marginTop:4}}>目標 {stats.planCases}件</div>
          </div>
          <div className={`forecast-big ${achieved ? 'bg-emerald-600' : 'bg-orange-500'}`}>
            <div className="forecast-big-label">目標まで</div>
            {achieved
              ? <div className="forecast-big-num" style={{fontSize:28}}>達成<br/>見込み</div>
              : <><div style={{fontSize:13,opacity:.9}}>あと</div><div className="forecast-big-num">{round1(stats.gapToTarget)}<span style={{fontSize:18}}>件</span></div></>
            }
          </div>
        </div>
        <div className="mobile-card">
          <div className="mobile-card-label">着地予想の内訳</div>
          <div className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 leading-relaxed">
            予測着地 = (生産性 <b className="text-blue-600">{round1(stats.productivity)}</b> × 残稼働 <b className="text-blue-600">{stats.remainingWorkingDays}日</b>) + 獲得 <b className="text-blue-600">{stats.totalAcquisitions}件</b>
            <div className="mt-1 font-bold text-slate-700">= {round1(stats.forecastAcquisitions)}件</div>
          </div>
        </div>

        {/* ── 目標達成に必要な残り件数 ── */}
        {!achieved && stats.remainingWorkingDays > 0 && (
          <div className="mobile-card" style={{border:'2px solid #f97316', background:'#fff7ed'}}>
            <div className="mobile-card-label" style={{color:'#ea580c'}}>🎯 目標達成に必要な残り件数</div>
            <div className="space-y-2">
              {/* 現在あと何件 */}
              <div className="flex items-center justify-between bg-orange-100 rounded-xl px-4 py-3">
                <div className="text-sm font-bold text-orange-800">今からあと何件取れば達成？</div>
                <div className="text-3xl font-black text-orange-600">
                  {Math.max(0, Math.ceil(stats.planCases - stats.totalAcquisitions))}<span className="text-base font-bold">件</span>
                </div>
              </div>
              {/* 必要生産性 */}
              {stats.remainingWorkingDays > 0 && (
                <div className="flex items-center justify-between bg-white rounded-xl border border-orange-200 px-4 py-2">
                  <div className="text-xs text-slate-600">残稼働で必要な1日あたりの件数</div>
                  <div className="text-lg font-black text-red-600">
                    {round1(Math.max(0, (stats.planCases - stats.totalAcquisitions) / stats.remainingWorkingDays))}
                    <span className="text-xs font-normal text-slate-500"> 件/日</span>
                  </div>
                </div>
              )}
              <div className="text-xs text-slate-500 px-1">
                現在獲得 <b>{stats.totalAcquisitions}件</b> ／ 目標 <b>{stats.planCases}件</b> ／ 残稼働 <b>{stats.remainingWorkingDays}日</b>
              </div>
            </div>
          </div>
        )}
        {achieved && (
          <div className="mobile-card" style={{border:'2px solid #22c55e', background:'#f0fdf4'}}>
            <div className="text-center py-2">
              <div className="text-2xl mb-1">🏆</div>
              <div className="text-sm font-black text-emerald-700">目標達成見込み！</div>
              <div className="text-xs text-emerald-600 mt-1">着地予想 {round1(stats.forecastAcquisitions)}件 ≥ 目標 {stats.planCases}件</div>
            </div>
          </div>
        )}
        <div className="mobile-card">
          <div className="mobile-card-label">稼働サマリー</div>
          <div className="stat-grid">
            {[
              { label:'⚡ 生産性',   value: round1(stats.productivity),            sub:'獲得÷実稼働',     bg:'bg-blue-50',   val:'text-blue-700' },
              { label:'📅 実稼働',   value: `${stats.actualWorkingDays}日`,         sub:`計画${stats.planWorkingDays}日`, bg:'bg-slate-50', val:'text-slate-700' },
              { label:'🔜 残稼働',   value: `${stats.remainingWorkingDays}日`,      sub:'計画-実績',      bg:'bg-amber-50',  val:'text-amber-700' },
              { label:'⏱ 稼働時間', value: `${stats.totalWorkingHours}h`,          sub:'累計',           bg:'bg-purple-50', val:'text-purple-700' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                <div className="text-xs text-slate-500 font-semibold mb-1">{s.label}</div>
                <div className={`text-xl font-black ${s.val}`}>{s.value}</div>
                <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mobile-card">
          <div className="mobile-card-label">各種率</div>
          <div className="space-y-2">
            {[
              { label:'👣 対面率',     value: stats.meetingRate,      sub:'ネット÷訪問',  color:'blue' },
              { label:'🤝 主権対面率', value: stats.ownerMeetingRate, sub:'主権÷ネット',  color:'indigo' },
              { label:'💬 商談率',     value: stats.negotiationRate,  sub:'商談÷主権',    color:'violet' },
              { label:'🏆 獲得率',     value: stats.acquisitionRate,  sub:'獲得÷商談',    color:'emerald' },
            ].map(s => {
              const pctVal = Math.round(s.value * 100)
              const colorMap: Record<string, { bar: string; text: string; bg: string }> = {
                blue:    { bar:'bg-blue-500',    text:'text-blue-700',    bg:'bg-blue-50' },
                indigo:  { bar:'bg-indigo-500',  text:'text-indigo-700',  bg:'bg-indigo-50' },
                violet:  { bar:'bg-violet-500',  text:'text-violet-700',  bg:'bg-violet-50' },
                emerald: { bar:'bg-emerald-500', text:'text-emerald-700', bg:'bg-emerald-50' },
              }
              const c = colorMap[s.color]
              return (
                <div key={s.label} className={`${c.bg} rounded-xl px-3 py-2`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-700">{s.label}</span>
                    <span className={`text-lg font-black ${c.text}`}>{pctVal}%</span>
                  </div>
                  <div className="w-full bg-white bg-opacity-60 rounded-full h-2">
                    <div className={`${c.bar} h-2 rounded-full`} style={{ width: `${Math.min(100, pctVal)}%` }} />
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="mobile-card">
          <div className="mobile-card-label">行動量</div>
          <table className="sheet-table w-full">
            <thead><tr>
              <th className="bg-slate-100 text-left px-2"></th>
              <th className="header-blue">訪問</th><th className="header-blue">ネット</th>
              <th className="header-blue">主権</th><th className="header-blue">商談</th><th className="header-blue">獲得</th>
            </tr></thead>
            <tbody>
              <tr>
                <td className="bg-blue-50 font-semibold text-left px-2">合計</td>
                <td>{stats.totalVisits}</td><td>{stats.totalNetMeetings}</td>
                <td>{stats.totalOwnerMeetings}</td><td>{stats.totalNegotiations}</td>
                <td className="font-bold text-blue-700">{stats.totalAcquisitions}</td>
              </tr>
              <tr>
                <td className="bg-blue-50 font-semibold text-left px-2">Ave</td>
                <td>{round1(stats.avgVisits)}</td><td>{round1(stats.avgNetMeetings)}</td>
                <td>{round1(stats.avgOwnerMeetings)}</td><td>{round1(stats.avgNegotiations)}</td><td>—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mobile-card">
          <div className="mobile-card-label">1件獲得に必要な行動量</div>
          <table className="sheet-table w-full">
            <thead><tr>
              <th className="header-blue">訪問</th><th className="header-blue">ネット</th>
              <th className="header-blue">主権</th><th className="header-blue">商談</th><th className="header-green">獲得</th>
            </tr></thead>
            <tbody><tr>
              <td>{round1(stats.perCaseVisits)}</td><td>{round1(stats.perCaseMeetings)}</td>
              <td>{round1(stats.perCaseOwnerMeetings)}</td><td>{round1(stats.perCaseNegotiations)}</td>
              <td className="font-bold text-emerald-600">1</td>
            </tr></tbody>
          </table>
        </div>
        <div className="mobile-card">
          <div className="mobile-card-label">曜日別集計</div>
          <div className="overflow-x-auto"><DowTable stats={stats} /></div>
        </div>
      </div>

      {/* ========== PC (>= md): コンパクト・スプレッドシート形式 ========== */}
      <div className="hidden md:block">
        <div className="text-xs font-bold text-slate-600 mb-2">{repName} — 稼働結果分析 ({yearMonth})</div>

        {/* 着地予想バナー */}
        <div className="flex gap-2 items-start mb-3 flex-wrap">
          <div className={`${achieved?'bg-emerald-500':'bg-red-600'} text-white rounded px-4 py-2 text-center`}>
            <div className="text-xs font-bold opacity-80">月間着地予想</div>
            <div className="text-3xl font-black leading-tight">{round1(stats.forecastAcquisitions)}</div>
            <div className="text-xs opacity-70">目標 {stats.planCases}件</div>
          </div>
          <div className={`${achieved?'bg-emerald-600':'bg-orange-500'} text-white rounded px-4 py-2 text-center`}>
            <div className="text-xs font-bold opacity-80">目標まで</div>
            {achieved
              ? <div className="text-lg font-black mt-1">達成見込み ✓</div>
              : <div className="text-3xl font-black">あと{round1(stats.gapToTarget)}件</div>
            }
          </div>
          {!achieved && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded px-4 py-2 text-center">
              <div className="text-xs font-bold text-orange-600">🎯 今から必要な件数</div>
              <div className="text-3xl font-black text-orange-700">
                {Math.max(0, Math.ceil(stats.planCases - stats.totalAcquisitions))}件
              </div>
              {stats.remainingWorkingDays > 0 && (
                <div className="text-xs text-orange-500 mt-0.5">
                  必要生産性: {round1(Math.max(0, (stats.planCases - stats.totalAcquisitions) / stats.remainingWorkingDays))}件/日
                </div>
              )}
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded px-3 py-2 text-xs text-slate-600 self-center">
            <span className="text-slate-400">計算式: </span>
            (生産性 <b>{round1(stats.productivity)}</b> × 残稼働 <b>{stats.remainingWorkingDays}日</b>) + 獲得 <b>{stats.totalAcquisitions}件</b> = <b>{round1(stats.forecastAcquisitions)}件</b>
            <span className="text-slate-400 ml-2">／計画{stats.planCases}件 ／計画稼働{stats.planWorkingDays}日 ／実稼働{stats.actualWorkingDays}日</span>
          </div>
        </div>

        {/* 月間サマリー表 */}
        <div className="bg-white rounded shadow-sm p-2 mb-2 inline-block">
          <div className="text-xs font-bold text-slate-500 mb-1">月間サマリー</div>
          <table className="sheet-table">
            <thead><tr>
              <th className="header-green">生産性</th>
              <th className="header-green">実稼働数</th>
              <th className="header-green">残稼働</th>
              <th className="header-green">稼働時間</th>
            </tr></thead>
            <tbody><tr>
              <td className="font-bold">{round1(stats.productivity)}</td>
              <td>{stats.actualWorkingDays}日</td>
              <td className="text-blue-600 font-bold">{stats.remainingWorkingDays}日</td>
              <td>{stats.totalWorkingHours}h</td>
            </tr></tbody>
          </table>
        </div>

        {/* 各種率 */}
        <div className="bg-white rounded shadow-sm p-2 mb-2 inline-block align-top ml-2">
          <div className="text-xs font-bold text-slate-500 mb-1">各種率</div>
          <table className="sheet-table">
            <thead><tr>
              <th className="header-green">対面率</th>
              <th className="header-green">主権対面率</th>
              <th className="header-green">商談率</th>
              <th className="header-green">獲得率</th>
            </tr></thead>
            <tbody><tr>
              <td>{pct(stats.meetingRate)}<div className="text-slate-400" style={{fontSize:9}}>対面÷訪問</div></td>
              <td>{pct(stats.ownerMeetingRate)}<div className="text-slate-400" style={{fontSize:9}}>主権÷対面</div></td>
              <td>{pct(stats.negotiationRate)}<div className="text-slate-400" style={{fontSize:9}}>商談÷対面</div></td>
              <td>{pct(stats.acquisitionRate)}<div className="text-slate-400" style={{fontSize:9}}>獲得÷商談</div></td>
            </tr></tbody>
          </table>
        </div>

        {/* 行動量 */}
        <div className="bg-white rounded shadow-sm p-2 mb-2 inline-block align-top ml-2">
          <div className="text-xs font-bold text-slate-500 mb-1">行動量</div>
          <table className="sheet-table">
            <thead><tr>
              <th></th>
              <th className="header-blue">訪問</th>
              <th className="header-blue">ネット対面</th>
              <th className="header-blue">主権対面</th>
              <th className="header-blue">商談</th>
              <th className="header-blue">獲得</th>
            </tr></thead>
            <tbody>
              <tr>
                <td className="bg-blue-50 font-semibold text-left px-2">合計</td>
                <td>{stats.totalVisits}</td><td>{stats.totalNetMeetings}</td>
                <td>{stats.totalOwnerMeetings}</td><td>{stats.totalNegotiations}</td>
                <td className="font-bold">{stats.totalAcquisitions}</td>
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

        {/* 1件取る為には */}
        <div className="bg-white rounded shadow-sm p-2 mb-2 inline-block">
          <div className="text-xs font-bold text-slate-500 mb-1">&lt;1件取る為には&gt;</div>
          <table className="sheet-table">
            <thead><tr>
              <th className="header-blue">訪問</th>
              <th className="header-blue">ネット対面</th>
              <th className="header-blue">主権対面</th>
              <th className="header-blue">商談</th>
              <th className="header-green">獲得</th>
            </tr></thead>
            <tbody><tr>
              <td>{round1(stats.perCaseVisits)}</td>
              <td>{round1(stats.perCaseMeetings)}</td>
              <td>{round1(stats.perCaseOwnerMeetings)}</td>
              <td>{round1(stats.perCaseNegotiations)}</td>
              <td className="font-bold text-emerald-600">1</td>
            </tr></tbody>
          </table>
        </div>

        {/* 曜日別集計 */}
        <div className="bg-white rounded shadow-sm p-2 mb-2 inline-block">
          <div className="text-xs font-bold text-slate-500 mb-1">曜日別集計（計画稼働{stats.planWorkingDays}日を曜日比率で按分）</div>
          <DowTable stats={stats} />
        </div>
      </div>

    </div>
  )
}
