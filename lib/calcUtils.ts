import { DailyRecord } from './supabase'
import { getDaysArray, isWeekend } from './dateUtils'

export type DailyCalc = DailyRecord & {
  progress: number // 進捗 = 獲得件数累計 - 計画の進捗
}

export type MonthlyStats = {
  // 行動量合計
  totalVisits: number
  totalNetMeetings: number
  totalOwnerMeetings: number
  totalNegotiations: number
  totalAcquisitions: number
  // 平均
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
  totalWorkingHours: number
  // 生産性・率
  productivity: number  // 生産性 = 獲得/稼働数
  meetingRate: number   // 対面率
  ownerMeetingRate: number // 主権対面率
  negotiationRate: number  // 商談率
  acquisitionRate: number  // 獲得率
  // 曜日別集計
  byDow: DowStats[]
  // 月間着地予想
  forecastAcquisitions: number
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
  dailyTargetCases: number
}

export function calcMonthlyStats(
  records: DailyRecord[],
  planCases: number,
  planWorkingDays: number,
  yearMonth: string
): MonthlyStats {
  const workingRecords = records.filter(r =>
    r.attendance_status === '稼働' || r.work_status === '稼働'
  )

  const totalVisits = records.reduce((s, r) => s + (r.visits || 0), 0)
  const totalNetMeetings = records.reduce((s, r) => s + (r.net_meetings || 0), 0)
  const totalOwnerMeetings = records.reduce((s, r) => s + (r.owner_meetings || 0), 0)
  const totalNegotiations = records.reduce((s, r) => s + (r.negotiations || 0), 0)
  const totalAcquisitions = records.reduce((s, r) => s + (r.acquisitions || 0), 0)
  const actualWorkingDays = workingRecords.length
  const totalWorkingHours = records.reduce((s, r) => s + (r.working_hours || 0), 0)

  const productivity = actualWorkingDays > 0 ? totalAcquisitions / actualWorkingDays : 0
  const meetingRate = totalVisits > 0 ? totalNetMeetings / totalVisits : 0
  const ownerMeetingRate = totalNetMeetings > 0 ? totalOwnerMeetings / totalNetMeetings : 0
  const negotiationRate = totalOwnerMeetings > 0 ? totalNegotiations / totalOwnerMeetings : 0
  const acquisitionRate = totalNegotiations > 0 ? totalAcquisitions / totalNegotiations : 0

  const avgVisits = actualWorkingDays > 0 ? totalVisits / actualWorkingDays : 0
  const avgNetMeetings = actualWorkingDays > 0 ? totalNetMeetings / actualWorkingDays : 0
  const avgOwnerMeetings = actualWorkingDays > 0 ? totalOwnerMeetings / actualWorkingDays : 0
  const avgNegotiations = actualWorkingDays > 0 ? totalNegotiations / actualWorkingDays : 0

  const perCaseVisits = totalAcquisitions > 0 ? totalVisits / totalAcquisitions : 0
  const perCaseMeetings = totalAcquisitions > 0 ? totalNetMeetings / totalAcquisitions : 0
  const perCaseOwnerMeetings = totalAcquisitions > 0 ? totalOwnerMeetings / totalAcquisitions : 0
  const perCaseNegotiations = totalAcquisitions > 0 ? totalNegotiations / totalAcquisitions : 0

  // 曜日別集計
  const days = getDaysArray(yearMonth)
  const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']
  const byDow: DowStats[] = [1, 2, 3, 4, 5, 6, 0].map(dow => {
    const dowDays = days.filter(d => d.dow === dow)
    const dowRecords = records.filter(r => {
      const d = days.find(dd => dd.dateStr === r.record_date)
      return d?.dow === dow
    })
    const dowWorking = dowRecords.filter(r => r.attendance_status === '稼働' || r.work_status === '稼働')
    const acq = dowRecords.reduce((s, r) => s + (r.acquisitions || 0), 0)
    const planDays = dowDays.length
    const actualDays = dowWorking.length
    const prod = actualDays > 0 ? acq / actualDays : 0
    const remaining = planDays - actualDays
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
      dailyTargetCases: planWorkingDays > 0 ? planCases / planWorkingDays : 0,
    }
  })

  // 月間着地予想 = 曜日別着地の合計
  const forecastAcquisitions = byDow.reduce((s, d) => s + d.landingForecast, 0)

  return {
    totalVisits, totalNetMeetings, totalOwnerMeetings, totalNegotiations, totalAcquisitions,
    avgVisits, avgNetMeetings, avgOwnerMeetings, avgNegotiations,
    perCaseVisits, perCaseMeetings, perCaseOwnerMeetings, perCaseNegotiations,
    actualWorkingDays, totalWorkingHours,
    productivity, meetingRate, ownerMeetingRate, negotiationRate, acquisitionRate,
    byDow,
    forecastAcquisitions,
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
