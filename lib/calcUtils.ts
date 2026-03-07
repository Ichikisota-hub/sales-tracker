import { DailyRecord } from './supabase'
import { getDaysArray } from './dateUtils'

export type MonthlyStats = {
  // 行動量合計
  totalVisits: number
  totalNetMeetings: number
  totalOwnerMeetings: number
  totalNegotiations: number
  totalAcquisitions: number
  // 平均（稼働日あたり）
  avgVisits: number
  avgNetMeetings: number
  avgOwnerMeetings: number
  avgNegotiations: number
  // 1件取るためには
  perCaseVisits: number
  perCaseMeetings: number
  perCaseOwnerMeetings: number
  perCaseNegotiations: number
  // 月間稼働
  actualWorkingDays: number
  remainingWorkingDays: number  // 残稼働日数 = 計画 - 実績
  totalWorkingHours: number
  // 生産性・率
  productivity: number       // 生産性 = 実績獲得 ÷ 実稼働日数
  meetingRate: number
  ownerMeetingRate: number
  negotiationRate: number
  acquisitionRate: number
  // 着地予想
  forecastAcquisitions: number  // 予測着地 = (生産性 × 残稼働日数) + 獲得件数
  gapToTarget: number           // 目標までの残件数 = 計画件数 - 予測着地
  gapToTargetActual: number     // 現時点での残件数 = 計画件数 - 現在獲得
  // 曜日別集計
  byDow: DowStats[]
  // 計画
  planCases: number
  planWorkingDays: number
}

export type DowStats = {
  dow: number
  dowJa: string
  planDays: number    // 月間計画稼働日数を曜日比率で按分
  actualDays: number
  acquisitions: number
  productivity: number
  remainingWork: number
  landingForecast: number
  workRatio: number
}

export function calcMonthlyStats(
  records: DailyRecord[],
  planCases: number,
  planWorkingDays: number,
  yearMonth: string
): MonthlyStats {
  const today = new Date().toISOString().split('T')[0]
  const days = getDaysArray(yearMonth)

  // 実稼働: attendance_status のみで判定（work_status は使わない）
  const workingRecords = records.filter(r => r.attendance_status === '稼働')

  const totalVisits = records.reduce((s, r) => s + (r.visits || 0), 0)
  const totalNetMeetings = records.reduce((s, r) => s + (r.net_meetings || 0), 0)
  const totalOwnerMeetings = records.reduce((s, r) => s + (r.owner_meetings || 0), 0)
  const totalNegotiations = records.reduce((s, r) => s + (r.negotiations || 0), 0)
  const totalAcquisitions = records.reduce((s, r) => s + (r.acquisitions || 0), 0)
  const actualWorkingDays = workingRecords.length
  const totalWorkingHours = records.reduce((s, r) => s + (r.working_hours || 0), 0)

  // 生産性 = 実績獲得 ÷ 実稼働日数
  const productivity = actualWorkingDays > 0 ? totalAcquisitions / actualWorkingDays : 0

  // 残稼働日数 = 閲覧日(today)以降の日付で work_status === '稼働' の日数
  const futureDates = days.filter(d => d.dateStr >= today).map(d => d.dateStr)
  const remainingWorkingDays = records.filter(r =>
    futureDates.includes(r.record_date) && r.work_status === '稼働'
  ).length

  // 予測着地 = (生産性 × 残稼働日数) + 現在獲得件数
  const forecastAcquisitions = productivity * remainingWorkingDays + totalAcquisitions

  // 目標までの残件数
  const gapToTarget = planCases - forecastAcquisitions
  const gapToTargetActual = planCases - totalAcquisitions

  const meetingRate      = totalVisits > 0          ? totalNetMeetings    / totalVisits          : 0
  const ownerMeetingRate = totalNetMeetings > 0     ? totalOwnerMeetings  / totalNetMeetings     : 0
  const negotiationRate  = totalNetMeetings > 0     ? totalNegotiations   / totalNetMeetings     : 0
  const acquisitionRate  = totalNegotiations > 0    ? totalAcquisitions   / totalNegotiations    : 0

  const avgVisits = actualWorkingDays > 0 ? totalVisits / actualWorkingDays : 0
  const avgNetMeetings = actualWorkingDays > 0 ? totalNetMeetings / actualWorkingDays : 0
  const avgOwnerMeetings = actualWorkingDays > 0 ? totalOwnerMeetings / actualWorkingDays : 0
  const avgNegotiations = actualWorkingDays > 0 ? totalNegotiations / actualWorkingDays : 0

  const perCaseVisits = totalAcquisitions > 0 ? totalVisits / totalAcquisitions : 0
  const perCaseMeetings = totalAcquisitions > 0 ? totalNetMeetings / totalAcquisitions : 0
  const perCaseOwnerMeetings = totalAcquisitions > 0 ? totalOwnerMeetings / totalAcquisitions : 0
  const perCaseNegotiations = totalAcquisitions > 0 ? totalNegotiations / totalAcquisitions : 0

  // 曜日別集計（実稼働は attendance_status のみ）
  const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']
  const totalCalendarDays = days.length

  const byDow: DowStats[] = [1, 2, 3, 4, 5, 6, 0].map(dow => {
    const dowCalendarDays = days.filter(d => d.dow === dow).length
    const planDays = planWorkingDays > 0
      ? Math.round(planWorkingDays * dowCalendarDays / totalCalendarDays)
      : dowCalendarDays

    const dowRecords = records.filter(r => {
      const d = days.find(dd => dd.dateStr === r.record_date)
      return d?.dow === dow
    })
    // 曜日別残稼働: today以降で work_status === '稼働' の日
    const dowFutureDates = days.filter(d => d.dow === dow && d.dateStr >= today).map(d => d.dateStr)
    const dowWorking = dowRecords.filter(r => r.attendance_status === '稼働')
    const acq = dowRecords.reduce((s, r) => s + (r.acquisitions || 0), 0)
    const actualDays = dowWorking.length
    const prod = actualDays > 0 ? acq / actualDays : 0
    const remaining = records.filter(r =>
      dowFutureDates.includes(r.record_date) && r.work_status === '稼働'
    ).length
    const landing = acq + prod * remaining

    return {
      dow,
      dowJa: DOW_LABELS[dow],
      planDays,
      actualDays,
      acquisitions: acq,
      productivity: prod,
      remainingWork: remaining,
      landingForecast: landing,
      workRatio: planDays > 0 ? actualDays / planDays : 0,
    }
  })

  return {
    totalVisits, totalNetMeetings, totalOwnerMeetings, totalNegotiations, totalAcquisitions,
    avgVisits, avgNetMeetings, avgOwnerMeetings, avgNegotiations,
    perCaseVisits, perCaseMeetings, perCaseOwnerMeetings, perCaseNegotiations,
    actualWorkingDays, remainingWorkingDays, totalWorkingHours,
    productivity, meetingRate, ownerMeetingRate, negotiationRate, acquisitionRate,
    forecastAcquisitions, gapToTarget, gapToTargetActual,
    byDow,
    planCases, planWorkingDays,
  }
}

export function calcProgress(
  dayIndex: number,
  totalDays: number,
  planCases: number,
  cumulativeAcquisitions: number
): number {
  const expectedByNow = totalDays > 0 ? Math.round((planCases * (dayIndex + 1)) / totalDays) : 0
  return cumulativeAcquisitions - expectedByNow
}

export function pct(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

export function round1(value: number): string {
  return value.toFixed(1)
}
