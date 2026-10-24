import type { IsoDate, MonthId } from './types'

// All date math runs in UTC so a hospital day never shifts with the device's time zone.

function toUtc(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: IsoDate, n: number): IsoDate {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + n)
  return fromUtc(d)
}

/** Whole days from a to b (b − a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: IsoDate): number {
  return toUtc(date).getUTCDay()
}

export function monthOf(date: IsoDate): MonthId {
  return date.slice(0, 7)
}

export function daysInMonth(month: MonthId): IsoDate[] {
  const [y, m] = month.split('-').map(Number)
  const count = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

export function addMonths(month: MonthId, n: number): MonthId {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1))
  return fromUtc(d).slice(0, 7)
}

export function todayIso(now = new Date()): IsoDate {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function weekdayShort(date: IsoDate): string {
  return WEEKDAY_SHORT[weekday(date)]!
}

export function weekdayName(day: number): string {
  return WEEKDAY_LONG[day]!
}

export function monthLabel(month: MonthId): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m! - 1]} ${y}`
}

/** "12 Nov" */
export function shortDate(date: IsoDate): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[m! - 1]!.slice(0, 3)}`
}
