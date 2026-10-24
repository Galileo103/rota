import { weekday } from './dates'
import { SHIFT_HOURS_AR, SHIFTS, type Assignment, type IsoDate, type MonthId, type Shift } from './types'

/**
 * The shared schedule follows the department's printed one: Arabic, right to
 * left, one row per day, names in each shift joined by " - ".
 */

export const SCHEDULE_TITLE = 'جدول نباطشيات قسم المخ والأعصاب'

// Spelled as on the printed schedule.
const AR_WEEKDAYS = ['الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعة', 'السبت']
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

export function arabicDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => AR_DIGITS[Number(d)]!)
}

export interface ExportRow {
  date: IsoDate
  /** "الخميس ١/١٠" */
  dayLabel: string
  cells: Record<Shift, string>
  highlight: boolean
}

export interface ExportTable {
  title: string
  headers: { day: string } & Record<Shift, string>
  rows: ExportRow[]
}

export function buildExportTable({
  monthId,
  dates,
  seats,
  names,
  weekendDays,
}: {
  monthId: MonthId
  dates: IsoDate[]
  seats: Pick<Assignment, 'date' | 'shift' | 'seat' | 'doctorId'>[]
  names: Map<string, string>
  weekendDays: number[]
}): ExportTable {
  const [year, month] = monthId.split('-').map(Number)
  const weekend = new Set(weekendDays)
  const rows = dates.map((date): ExportRow => {
    const cell = (shift: Shift) =>
      seats
        .filter((s) => s.date === date && s.shift === shift && s.doctorId)
        .sort((a, b) => a.seat - b.seat)
        .map((s) => names.get(s.doctorId!) ?? '')
        .filter(Boolean)
        .join(' - ')
    return {
      date,
      dayLabel: `${AR_WEEKDAYS[weekday(date)]} ${arabicDigits(Number(date.slice(8)))}/${arabicDigits(month!)}`,
      cells: Object.fromEntries(SHIFTS.map((s) => [s, cell(s)])) as Record<Shift, string>,
      highlight: weekend.has(weekday(date)),
    }
  })
  return {
    title: `${SCHEDULE_TITLE} لشهر ${AR_MONTHS[month! - 1]} ${arabicDigits(year!)}`,
    headers: { day: 'اليوم', ...SHIFT_HOURS_AR },
    rows,
  }
}
