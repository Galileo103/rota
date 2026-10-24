import type { IsoDate } from './types'

export interface BalanceDoctor {
  id: string
  target: number
}

export interface BalanceReport {
  /** Seats to fill this month: days × 2 shifts × doctors per shift. */
  seats: number
  targetTotal: number
  /** targetTotal − seats: negative = seats will stay empty, positive = some doctors will end under target. */
  diff: number
  /** Days where fewer doctors are free than one shift needs: a seat will stay empty. */
  shortDays: { date: IsoDate; available: number }[]
  /** Days where covering both shifts forces someone into a 24h run. */
  tightDays: { date: IsoDate; available: number }[]
  /** Doctors whose target is more than they can work around their leave (2 shifts per free day). */
  impossibleTargets: { doctorId: string; target: number; max: number }[]
}

export function checkBalance(
  dates: IsoDate[],
  doctors: BalanceDoctor[],
  leave: Map<string, Set<IsoDate>>,
  seatsPerShift: number,
): BalanceReport {
  const seats = dates.length * 2 * seatsPerShift
  const targetTotal = doctors.reduce((sum, d) => sum + d.target, 0)
  const shortDays: BalanceReport['shortDays'] = []
  const tightDays: BalanceReport['tightDays'] = []
  for (const date of dates) {
    const available = doctors.filter((d) => !leave.get(d.id)?.has(date)).length
    if (available < seatsPerShift) shortDays.push({ date, available })
    else if (available < 2 * seatsPerShift) tightDays.push({ date, available })
  }
  const impossibleTargets: BalanceReport['impossibleTargets'] = []
  for (const d of doctors) {
    const freeDays = dates.filter((date) => !leave.get(d.id)?.has(date)).length
    if (d.target > freeDays * 2) impossibleTargets.push({ doctorId: d.id, target: d.target, max: freeDays * 2 })
  }
  return { seats, targetTotal, diff: targetTotal - seats, shortDays, tightDays, impossibleTargets }
}
