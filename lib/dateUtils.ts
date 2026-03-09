import { format, getDaysInMonth, getDay, startOfMonth, addDays, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'

export const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']
export const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function getYearMonth(date: Date): string {
  return format(date, 'yyyy-MM')
}

export function getDaysArray(yearMonth: string): { day: number; dow: number; dowJa: string; dateStr: string }[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const days = getDaysInMonth(new Date(y, m - 1))
  const result = []
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m - 1, d)
    const dow = getDay(date)
    result.push({
      day: d,
      dow,
      dowJa: DOW_JA[dow],
      dateStr: format(date, 'yyyy-MM-dd'),
    })
  }
  return result
}

export function isWeekend(dow: number): boolean {
  return dow === 0 || dow === 6
}

export function isHoliday(dow: number): boolean {
  return dow === 0
}

export function formatYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-')
  return `${y}/${m}`
}

export function getMonthList(count = 12): string[] {
  const now = new Date()
  const months: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(format(d, 'yyyy-MM'))
  }
  return months
}

/** UTC ではなくローカルタイムゾーンで今日の yyyy-MM-dd を返す */
export function localToday(): string {
  const now = new Date()
  return format(now, 'yyyy-MM-dd')
}

/** ローカルタイムゾーンで今月の yyyy-MM を返す */
export function localYearMonth(): string {
  return format(new Date(), 'yyyy-MM')
}
