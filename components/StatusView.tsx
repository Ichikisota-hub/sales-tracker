'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { calcMonthlyStats, round1, MonthlyStats } from '@/lib/calcUtils'

type Props = { repId: string; repName: string; yearMonth: string }

function Block({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="text-base text-slate-500 font-medium">{label}</div>
      <div className="text-right">
        <div className={`text-2xl font-black ${color || 'text-slate-800'}`}>{value}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function SectionTitle({ icon, title, color }: { icon: string; title: string; color?: string }) {
  return (
    <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${color || 'border-blue-400'}`}>
      <span className="text-xl">{icon}</span>
      <span className={`text-base font-black ${color ? 'text-slate-700' : 'text-slate-700'}`}>{title}</span>
    </div>
  )
}

export default function StatusView({ repId, repName, yearMonth }: Props) {
  const [stats, setStats] = useState<MonthlyStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [repId, yearMonth])

  async function loadData() {
    setLoading(true)
    const [y, m] = yearMonth.split('-')
    const [{ data: recData }, { data: planData }, schedRes] = await Promise.all([
      supabase.from('daily_records').select('*')
        .eq('sales_rep_id', repId).gte('record_date', `${y}-${m}-01`).lte('record_date', `${y}-${m}-31`),
      supabase.from('monthly_plans').select('*')
        .eq('sales_rep_id', repId).eq('year_month', yearMonth).single(),
      fetch(`/api/schedule?yearMonth=${yearMonth}`).then(r => r.json()).catch(() => null),
    ])
    const scheduleMap: Record<string, string[]> = schedRes?.schedule || {}
    const schedWorkingDays = scheduleMap[repName] || []
    setStats(calcMonthlyStats(
      recData || [],
      planData?.plan_cases || 0,
      planData?.plan_working_days || 0,
      yearMonth,
      schedWorkingDays
    ))
    setLoading(false)
  }

  if (loading) return <div className="p-8 text-center text-slate-400 text-base">読み込み中...</div>
  if (!stats)  return <div className="p-8 text-center text-slate-400 text-base">データなし</div>

  const neededProd = stats.remainingWorkingDays > 0
    ? Math.max(0, (stats.planCases - stats.totalAcquisitions) / stats.remainingWorkingDays)
    : null
  const prodDiff = neededProd !== null ? neededProd - stats.productivity : null
  const isAchieved = stats.forecastAcquisitions >= stats.planCases
  const forecastGap = stats.forecastAcquisitions - stats.planCases  // + なら超過、- なら不足
  const lacking = Math.max(0, stats.planCases - stats.totalAcquisitions)

  return (
    <div className="space-y-4">

      {/* ── ヘッダー ── */}
      <div className="mobile-card" style={{background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)'}}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-black flex-shrink-0">
            {repName.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="text-sm text-slate-400">現状整理</div>
            <div className="text-2xl font-black text-white">{repName}</div>
            <div className="text-sm text-slate-400">{yearMonth.replace('-', '年')}月</div>
          </div>
          {/* 達成 / 未達 バッジ */}
          <div className={`px-4 py-2 rounded-2xl text-center ${isAchieved ? 'bg-emerald-500' : 'bg-red-500'}`}>
            <div className="text-xs font-bold text-white/80">{isAchieved ? '達成見込み' : '未達予測'}</div>
            <div className="text-xl font-black text-white">
              {isAchieved ? `＋${round1(Math.abs(forecastGap))}件` : `−${round1(Math.abs(forecastGap))}件`}
            </div>
          </div>
        </div>
      </div>

      {/* ── ■ 現状整理 ── */}
      <div className="mobile-card">
        <SectionTitle icon="■" title="現状整理" color="border-slate-700" />
        <Block label="月間目標"       value={`${stats.planCases}件`}            color="text-slate-800" />
        <Block label="実績（獲得件数）" value={`${stats.totalAcquisitions}件`}   color="text-blue-700" />
        <Block label="計画稼働日数"   value={`${stats.planWorkingDays}日`}       color="text-slate-700" />
        <Block label="実稼働日数"     value={`${stats.actualWorkingDays}日`}     color="text-slate-700" />
        <Block label="残稼働日数"     value={`${stats.remainingWorkingDays}日`}  color="text-amber-600" />
      </div>

      {/* ── ■ 生産性 ── */}
      <div className="mobile-card" style={{borderLeft:'4px solid #3b82f6'}}>
        <SectionTitle icon="⚡" title="生産性" color="border-blue-400" />
        <div className="bg-blue-50 rounded-2xl p-4 mb-3">
          <div className="text-sm text-blue-600 font-bold mb-1">生産性 ＝ 実績 ÷ 実稼働日数</div>
          <div className="text-sm text-slate-500 mb-3">
            {stats.totalAcquisitions}件 ÷ {stats.actualWorkingDays}日
          </div>
          <div className="flex items-end gap-2">
            <div className="text-5xl font-black text-blue-700">{round1(stats.productivity)}</div>
            <div className="text-xl text-blue-500 font-bold mb-1">件／日</div>
          </div>
        </div>
        <div className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-2">
          ※「今の自分の実力」を示す数値
        </div>
      </div>

      {/* ── ■ 予実（このままいった場合） ── */}
      <div className="mobile-card" style={{borderLeft:`4px solid ${isAchieved ? '#10b981' : '#ef4444'}`}}>
        <SectionTitle icon="📊" title="予実（このままいった場合）" color={isAchieved ? 'border-emerald-400' : 'border-red-400'} />
        <div className={`rounded-2xl p-4 mb-3 ${isAchieved ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <div className="text-sm font-bold text-slate-600 mb-1">
            予測着地 ＝（生産性 × 残稼働日数）＋ 実績
          </div>
          <div className="text-sm text-slate-500 mb-3">
            （{round1(stats.productivity)} × {stats.remainingWorkingDays}日）＋ {stats.totalAcquisitions}件
          </div>
          <div className="flex items-end gap-2">
            <div className={`text-5xl font-black ${isAchieved ? 'text-emerald-700' : 'text-red-600'}`}>
              {round1(stats.forecastAcquisitions)}
            </div>
            <div className={`text-xl font-bold mb-1 ${isAchieved ? 'text-emerald-500' : 'text-red-400'}`}>件</div>
          </div>
          <div className="text-sm text-slate-500 mt-2">▶︎ 予測最終着地：{round1(stats.forecastAcquisitions)}件</div>
        </div>
      </div>

      {/* ── ■ 目標との差 ── */}
      <div className="mobile-card">
        <SectionTitle icon="🎯" title="目標との差" color="border-purple-400" />
        <Block label="月間目標"  value={`${stats.planCases}件`}                    color="text-slate-700" />
        <Block label="予測着地"  value={`${round1(stats.forecastAcquisitions)}件`} color={isAchieved ? 'text-emerald-700' : 'text-red-600'} />
        <div className="mt-3 rounded-2xl p-4 text-center"
          style={{background: isAchieved ? '#f0fdf4' : '#fef2f2', border: `2px solid ${isAchieved ? '#86efac' : '#fca5a5'}`}}>
          <div className="text-sm font-bold text-slate-500 mb-1">▶︎ 予実差</div>
          <div className={`text-4xl font-black ${isAchieved ? 'text-emerald-600' : 'text-red-600'}`}>
            {isAchieved ? '＋' : '−'}{round1(Math.abs(forecastGap))}件
          </div>
          <div className="text-sm text-slate-400 mt-1">
            {isAchieved ? '目標を上回る見込み 🎉' : 'このままでは目標未達の見込み'}
          </div>
        </div>
      </div>

      {/* ── ■ 今日の意味（未達予測の場合のみ） ── */}
      {!isAchieved && (
        <div className="mobile-card" style={{borderLeft:'4px solid #f97316', background:'#fff7ed'}}>
          <SectionTitle icon="🔥" title="今日の意味（未達予測）" color="border-orange-400" />

          <div className="mb-4">
            <div className="text-sm font-bold text-slate-600 mb-2">不足件数</div>
            <div className="bg-orange-100 rounded-2xl p-4 flex items-end gap-2">
              <div className="text-5xl font-black text-orange-700">{lacking}</div>
              <div className="text-xl text-orange-500 font-bold mb-1">件</div>
              <div className="text-sm text-orange-400 mb-1 ml-1">足りない</div>
            </div>
          </div>

          {stats.remainingWorkingDays > 0 && neededProd !== null && (
            <>
              <div className="mb-4">
                <div className="text-sm font-bold text-slate-600 mb-1">
                  必要生産性 ＝（目標 − 実績）÷ 残稼働日数
                </div>
                <div className="text-sm text-slate-500 mb-3">
                  （{stats.planCases} − {stats.totalAcquisitions}）÷ {stats.remainingWorkingDays}日
                </div>
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 flex items-end gap-2">
                  <div className="text-5xl font-black text-red-600">{round1(neededProd)}</div>
                  <div className="text-xl text-red-400 font-bold mb-1">件／日</div>
                </div>
                <div className="text-sm text-slate-500 mt-2">▶︎ 必要生産性：{round1(neededProd)}件／日</div>
              </div>

              {prodDiff !== null && (
                <div className="rounded-2xl p-4 bg-white border-2 border-orange-200">
                  <div className="text-sm font-bold text-slate-600 mb-2">今の生産性との差</div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-500">
                      <div>必要：{round1(neededProd)}件／日</div>
                      <div>現状：{round1(stats.productivity)}件／日</div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-orange-600">
                        ＋{round1(prodDiff)}
                      </div>
                      <div className="text-sm text-orange-400">件／日 上げる必要</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {stats.remainingWorkingDays === 0 && (
            <div className="bg-red-100 rounded-2xl p-4 text-center">
              <div className="text-base font-black text-red-700">残稼働日数が0日です</div>
              <div className="text-sm text-red-500 mt-1">今月の残り稼働日がありません</div>
            </div>
          )}
        </div>
      )}

      {/* ── 達成見込みの場合 ── */}
      {isAchieved && (
        <div className="mobile-card" style={{borderLeft:'4px solid #10b981', background:'#f0fdf4'}}>
          <div className="text-center py-4">
            <div className="text-4xl mb-2">🏆</div>
            <div className="text-xl font-black text-emerald-700 mb-1">目標達成見込み！</div>
            <div className="text-sm text-emerald-600">
              予測着地 {round1(stats.forecastAcquisitions)}件 ≥ 目標 {stats.planCases}件
            </div>
            <div className="mt-3 bg-emerald-100 rounded-2xl p-3">
              <div className="text-sm text-emerald-700 font-bold">このペースを維持しましょう 💪</div>
              <div className="text-sm text-emerald-600 mt-1">
                現在の生産性：<b>{round1(stats.productivity)}件／日</b>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
