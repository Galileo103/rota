import { addDays, addMonths, daysInMonth, diffDays, shortDate } from './dates'
import type { Assignment, IsoDate, MonthId, Shift } from './types'

/** Rules for editing a schedule by hand: who fits a seat, and what is wrong right now. */

export type SeatRow = Pick<Assignment, 'date' | 'shift' | 'seat' | 'doctorId'>

export interface SeatRef {
  date: IsoDate
  shift: Shift
  seat: number
}

export interface EditorDoctor {
  id: string
  target: number
}

export function seatKey(s: SeatRef): string {
  return `${s.date}|${s.shift}|${s.seat}`
}

/** A shift can take extra doctors on busy days, up to this many seats. */
export const MAX_SEATS = 4

/**
 * Seats each shift shows: the usual number, or more where she added extra
 * doctors (any filled seat beyond the usual ones).
 */
export function seatCounter(rows: SeatRow[], base: number): (date: IsoDate, shift: Shift) => number {
  const extra = new Map<string, number>()
  for (const r of rows) {
    if (!r.doctorId || r.seat < base) continue
    const key = `${r.date}|${r.shift}`
    extra.set(key, Math.max(extra.get(key) ?? base, r.seat + 1))
  }
  return (date, shift) => extra.get(`${date}|${shift}`) ?? base
}

/** Half-days from `origin`'s day shift: −1 = the shift just before, +1 = just after. */
function halfDaysFrom(origin: IsoDate, date: IsoDate, shift: Shift): number {
  return diffDays(origin, date) * 2 + (shift === 'N' ? 1 : 0)
}

/**
 * The two shifts next to a month from its neighbours: the previous month's
 * last night and the next month's first day shift.
 */
export function neighbourShifts(month: MonthId): { previousNight: IsoDate; nextDay: IsoDate } {
  return {
    previousNight: addDays(daysInMonth(month)[0]!, -1),
    nextDay: daysInMonth(addMonths(month, 1))[0]!,
  }
}

// ── Picking a doctor for one seat ──────────────────────────────────────

export type OptionStatus = 'good' | 'warn' | 'blocked'

export interface SeatOption {
  doctorId: string
  /** Shifts this doctor has now. */
  shiftsNow: number
  /** Shifts this doctor would have with this seat. */
  shiftsAfter: number
  target: number
  status: OptionStatus
  /** Sits in this seat now. */
  current: boolean
  notes: string[]
}

const STATUS_RANK: Record<OptionStatus, number> = { good: 0, warn: 1, blocked: 2 }

/**
 * Every active doctor for this seat, best first. `blocked` = can't sit here
 * (already on this shift, or already has all their shifts); `warn` = allowed,
 * but breaks a rule she should see.
 *
 * `neighbours` are seats from the months either side (last night of the
 * previous month, first day of the next): they only reveal 24h runs across the
 * month change and never count toward this month's shifts.
 */
export function seatOptions(
  rows: SeatRow[],
  seat: SeatRef,
  doctors: EditorDoctor[],
  leave: Map<string, Set<IsoDate>>,
  neighbours: SeatRow[] = [],
): SeatOption[] {
  const key = seatKey(seat)
  const here = halfDaysFrom(seat.date, seat.date, seat.shift)
  let current: string | null = null
  const counts = new Map<string, number>()
  const sameShift = new Set<string>()
  const before = new Set<string>()
  const after = new Set<string>()
  for (const r of rows) {
    if (!r.doctorId) continue
    if (seatKey(r) === key) {
      current = r.doctorId
    } else if (r.date === seat.date && r.shift === seat.shift) {
      sameShift.add(r.doctorId)
    }
    counts.set(r.doctorId, (counts.get(r.doctorId) ?? 0) + 1)
    const gap = halfDaysFrom(seat.date, r.date, r.shift) - here
    if (gap === -1) before.add(r.doctorId)
    if (gap === 1) after.add(r.doctorId)
  }
  // Across the month change: doctorId → the date of the adjoining shift.
  const beforeOther = new Map<string, IsoDate>()
  const afterOther = new Map<string, IsoDate>()
  for (const r of neighbours) {
    if (!r.doctorId) continue
    const gap = halfDaysFrom(seat.date, r.date, r.shift) - here
    if (gap === -1) beforeOther.set(r.doctorId, r.date)
    if (gap === 1) afterOther.set(r.doctorId, r.date)
  }

  const options = doctors.map((d): SeatOption => {
    const isCurrent = d.id === current
    const shiftsNow = counts.get(d.id) ?? 0
    const shiftsAfter = shiftsNow + (isCurrent ? 0 : 1)
    const notes: string[] = []
    let status: OptionStatus = 'good'
    if (sameShift.has(d.id)) {
      status = 'blocked'
      notes.push('Already on this shift')
    }
    // A doctor with all their shifts can't take another one (raise the month's target to allow it).
    if (shiftsAfter > d.target) {
      status = 'blocked'
      notes.push(`Reached target (${shiftsNow}/${d.target})`)
    }
    if (leave.get(d.id)?.has(seat.date)) {
      if (status === 'good') status = 'warn'
      notes.push('On leave this day')
    }
    if (before.has(d.id)) notes.push('Works the shift before: 24h run')
    if (after.has(d.id)) notes.push('Works the shift after: 24h run')
    const prevNight = beforeOther.get(d.id)
    if (prevNight) notes.push(`Worked the night before (${shortDate(prevNight)}): 24h run`)
    const nextDay = afterOther.get(d.id)
    if (nextDay) notes.push(`Works the next morning (${shortDate(nextDay)}): 24h run`)
    return { doctorId: d.id, shiftsNow, shiftsAfter, target: d.target, status, current: isCurrent, notes }
  })

  return options.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.notes.length - b.notes.length ||
      b.target - b.shiftsAfter - (a.target - a.shiftsAfter) ||
      a.doctorId.localeCompare(b.doctorId),
  )
}

// ── Checking the whole schedule ────────────────────────────────────────

export type IssueKind = 'empty' | 'leave' | 'double' | 'inactive' | 'over' | 'under'
export type Severity = 'error' | 'warn' | 'info'

export interface Issue {
  kind: IssueKind
  severity: Severity
  date?: IsoDate
  shift?: Shift
  seat?: number
  doctorId?: string
  shifts?: number
  target?: number
}

const SEVERITY: Record<IssueKind, Severity> = {
  empty: 'error',
  leave: 'error',
  double: 'error',
  inactive: 'warn',
  over: 'warn',
  under: 'info',
}
const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 }

export function validateSchedule(
  rows: SeatRow[],
  ctx: { dates: IsoDate[]; seatsPerShift: number; doctors: EditorDoctor[]; leave: Map<string, Set<IsoDate>> },
): Issue[] {
  const byKey = new Map(rows.map((r) => [seatKey(r), r]))
  const seatsIn = seatCounter(rows, ctx.seatsPerShift)
  const active = new Map(ctx.doctors.map((d) => [d.id, d]))
  const counts = new Map<string, number>()
  const issues: Issue[] = []
  const add = (kind: IssueKind, rest: Omit<Issue, 'kind' | 'severity'>) => issues.push({ kind, severity: SEVERITY[kind], ...rest })

  for (const date of ctx.dates) {
    for (const shift of ['D', 'N'] as const) {
      const seen = new Set<string>()
      for (let seat = 0; seat < seatsIn(date, shift); seat++) {
        const doctorId = byKey.get(seatKey({ date, shift, seat }))?.doctorId
        if (!doctorId) {
          add('empty', { date, shift, seat })
          continue
        }
        if (seen.has(doctorId)) add('double', { date, shift, seat, doctorId })
        seen.add(doctorId)
        if (ctx.leave.get(doctorId)?.has(date)) add('leave', { date, shift, seat, doctorId })
        if (!active.has(doctorId)) add('inactive', { date, shift, seat, doctorId })
        counts.set(doctorId, (counts.get(doctorId) ?? 0) + 1)
      }
    }
  }
  for (const d of ctx.doctors) {
    const shifts = counts.get(d.id) ?? 0
    if (shifts > d.target) add('over', { doctorId: d.id, shifts, target: d.target })
    if (shifts < d.target) add('under', { doctorId: d.id, shifts, target: d.target })
  }
  return issues.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.date ?? '').localeCompare(b.date ?? '') ||
      (a.shift ?? '').localeCompare(b.shift ?? '') ||
      (a.seat ?? 0) - (b.seat ?? 0),
  )
}
