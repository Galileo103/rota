import { addDays, diffDays, monthOf } from './dates'
import type { IsoDate, Leave, MonthId } from './types'

export function leaveEnd(leave: Pick<Leave, 'startDate' | 'days'>): IsoDate {
  return addDays(leave.startDate, Math.max(1, leave.days) - 1)
}

export function leaveDates(leave: Pick<Leave, 'startDate' | 'days'>): IsoDate[] {
  return Array.from({ length: Math.max(1, leave.days) }, (_, i) => addDays(leave.startDate, i))
}

export function leaveOverlapsMonth(leave: Pick<Leave, 'startDate' | 'days'>, month: MonthId): boolean {
  return leaveDates(leave).some((d) => monthOf(d) === month)
}

/** doctorId → dates on leave (only the dates inside `month`, or all when month is omitted). */
export function leaveIndex(leaves: Leave[], month?: MonthId): Map<string, Set<IsoDate>> {
  const index = new Map<string, Set<IsoDate>>()
  for (const leave of leaves) {
    for (const date of leaveDates(leave)) {
      if (month && monthOf(date) !== month) continue
      let set = index.get(leave.doctorId)
      if (!set) index.set(leave.doctorId, (set = new Set()))
      set.add(date)
    }
  }
  return index
}

/** Leave days a doctor has inside a date prefix ('YYYY' for a year, 'YYYY-MM' for a month). Overlapping leaves count once. */
export function leaveDaysIn(leaves: Leave[], doctorId: string, prefix: string): number {
  const days = new Set<IsoDate>()
  for (const leave of leaves) {
    if (leave.doctorId !== doctorId) continue
    for (const d of leaveDates(leave)) if (d.startsWith(prefix)) days.add(d)
  }
  return days.size
}

/** Does this new/edited leave overlap another leave of the same doctor? */
export function overlappingLeave(leaves: Leave[], candidate: Pick<Leave, 'id' | 'doctorId' | 'startDate' | 'days'>): Leave | undefined {
  const start = candidate.startDate
  const end = leaveEnd(candidate)
  return leaves.find(
    (l) =>
      l.id !== candidate.id &&
      l.doctorId === candidate.doctorId &&
      diffDays(l.startDate, end) >= 0 &&
      diffDays(start, leaveEnd(l)) >= 0,
  )
}
