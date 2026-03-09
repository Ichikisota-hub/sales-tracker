import { DailyRecord } from './supabase'
import { getDaysArray } from './dateUtils'

export type MonthlyStats = {
  totalVisits: number
  totalNetMeetings: number
  totalOwnerMeetings: number
  totalNegotiations: number
  totalAcquisitions: number
  avgVisits: number
  avgNetMeetings: number
  avgOwnerMeetings: number
  avgNegotiations: number
  perCaseVisits: number
  perCaseMeetings: number
  perCaseOwnerMeetings: number
  perCaseNegotiations: number
  actualWorkingDays: number
  remainingWorkingDays: number
  totalWorkingHours: number
  productivity: number
  meetingRate: number
  ownerMeetingRate: number
  negotiationRate: number
  acquisitionRate: number
  forecastAcquisitions: number
  gapToTarget: number
  gapToTargetActual: number
  byDow: DowStats[]
  planCases: number
  planWorkingDays: number
}

export type DowStats = {
  dow: number
  dowJa: string
  planDays: number
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
  yearMonth: string,
  // Googleシートから取得した稼働予定日リスト（省略時は work_status にフォールバック）
  scheduleWorkingDays?: string[]
): MonthlyStats {
  const today = new Date().toISOString().split('T')[0]
  const days = getDaysArray(yearMonth)

  // 実稼働: attendance_status === '稼働' のみ
  const workingRecords = records.filter(r => r.attendance_status === '稼働')
  const totalVisits        = records.reduce((s, r) => s + (r.visits || 0), 0)
  const totalNetMeetings   = records.reduce((s, r) => s + (r.net_meetings || 0), 0)
  const totalOwnerMeetings = records.reduce((s, r) => s + (r.owner_meetings || 0), 0)
  const totalNegotiations  = records.reduce((s, r) => s + (r.negotiations || 0), 0)
  const totalAcquisitions  = records.reduce((s, r) => s + (r.acquisitions || 0), 0)
  const actualWorkingDays  = workingRecords.length
  const totalWorkingHours  = records.reduce((s, r) => s + (r.working_hours || 0), 0)

  const productivity = actualWorkingDays > 0 ? totalAcquisitions / actualWorkingDays : 0

  // 残稼働日数: today以降の日付に限定
  const futureDates = new Set(days.filter(d => d.dateStr >= today).map(d => d.dateStr))

  let remainingWorkingDays: number
  if (scheduleWorkingDays && scheduleWorkingDays.length > 0) {
    // Googleシートのデータ: today以降で稼働予定の日数
    remainingWorkingDays = scheduleWorkingDays.filter(d => futureDates.has(d)).length
  } else {
    // フォールバック: work_status === '稼働' の日数
    remainingWorkingDays = records.filter(r =>
      futureDates.has(r.record_date) && r.work_status === '稼働'
    ).length
  }

  const forecastAcquisitions = productivity * remainingWorkingDays + totalAcquisitions
  const gapToTarget          = planCases - forecastAcquisitions
  const gapToTargetActual    = planCases - totalAcquisitions

  const meetingRate      = totalVisits > 0       ? totalNetMeetings    / totalVisits       : 0
  const ownerMeetingRate = totalNetMeetings > 0  ? totalOwnerMeetings  / totalNetMeetings  : 0
  const negotiationRate  = totalNetMeetings > 0  ? totalNegotiations   / totalNetMeetings  : 0
  const acquisitionRate  = totalNegotiations > 0 ? totalAcquisitions   / totalNegotiations : 0

  const avgVisits        = actualWorkingDays > 0 ? totalVisits        / actualWorkingDays : 0
  const avgNetMeetings   = actualWorkingDays > 0 ? totalNetMeetings   / actualWorkingDays : 0
  const avgOwnerMeetings = actualWorkingDays > 0 ? totalOwnerMeetings / actualWorkingDays : 0
  const avgNegotiations  = actualWorkingDays > 0 ? totalNegotiations  / actualWorkingDays : 0

  const perCaseVisits        = totalAcquisitions > 0 ? totalVisits        / totalAcquisitions : 0
  const perCaseMeetings      = totalAcquisitions > 0 ? totalNetMeetings   / totalAcquisitions : 0
  const perCaseOwnerMeetings = totalAcquisitions > 0 ? totalOwnerMeetings / totalAcquisitions : 0
  const perCaseNegotiations  = totalAcquisitions > 0 ? totalNegotiations  / totalAcquisitions : 0

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
    const dowFutureDates = new Set(days.filter(d => d.dow === dow && d.dateStr >= today).map(d => d.dateStr))
    const dowWorking = dowRecords.filter(r => r.attendance_status === '稼働')
    const acq        = dowRecords.reduce((s, r) => s + (r.acquisitions || 0), 0)
    const actualDays = dowWorking.length
    const prod       = actualDays > 0 ? acq / actualDays : 0

    let remaining: number
    if (scheduleWorkingDays && scheduleWorkingDays.length > 0) {
      remaining = scheduleWorkingDays.filter(d => dowFutureDates.has(d)).length
    } else {
      remaining = records.filter(r =>
        dowFutureDates.has(r.record_date) && r.work_status === '稼働'
      ).length
    }

    return {
      dow,
      dowJa: DOW_LABELS[dow],
      planDays,
      actualDays,
      acquisitions: acq,
      productivity: prod,
      remainingWork: remaining,
      landingForecast: acq + prod * remaining,
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
