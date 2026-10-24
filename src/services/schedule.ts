import { checkBalance, type BalanceReport } from '../domain/balance'
import { daysInMonth } from '../domain/dates'
import type { GenDoctor } from '../domain/generator/generate'
import { leaveIndex, leaveOverlapsMonth } from '../domain/leave'
import { effectiveTarget } from '../domain/targets'
import {
  type Doctor,
  type IsoDate,
  type Leave,
  type Level,
  type Month,
  type MonthId,
  type Settings,
} from '../domain/types'
import { db } from './db'
import { getOrCreateMonth, getSettings } from './repos'

export interface MonthContext {
  dates: IsoDate[]
  /** Active, non-archived doctors with this month's targets. */
  doctors: (GenDoctor & { doctor: Doctor })[]
  leave: Map<string, Set<IsoDate>>
  weekendDays: number[]
  seatsPerShift: number
}

export async function loadMonthContext(monthId: MonthId): Promise<MonthContext> {
  const [month, settings, levels, allDoctors, leaves] = await Promise.all([
    getOrCreateMonth(monthId),
    getSettings(),
    db.levels.toArray(),
    db.doctors.toArray(),
    db.leaves.toArray(),
  ])
  return buildMonthContext(monthId, month, settings, levels, allDoctors, leaves)
}

/** Pure version for screens that already hold live data. */
export function buildMonthContext(
  monthId: MonthId,
  month: Month,
  settings: Settings,
  levels: Level[],
  allDoctors: Doctor[],
  leaves: Leave[],
): MonthContext {
  const excluded = new Set(month.excludedDoctorIds)
  const doctors = allDoctors
    .filter((d) => !excluded.has(d.id) && !d.archived)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((doctor) => ({ id: doctor.id, target: effectiveTarget(doctor, levels, month), doctor }))
  return {
    dates: daysInMonth(monthId),
    doctors,
    leave: leaveIndex(leaves.filter((l) => leaveOverlapsMonth(l, monthId)), monthId),
    weekendDays: settings.weekendDays,
    seatsPerShift: settings.doctorsPerShift,
  }
}

export function balanceFor(ctx: MonthContext): BalanceReport {
  return checkBalance(ctx.dates, ctx.doctors, ctx.leave, ctx.seatsPerShift)
}

/** Empties every seat of the month (she fills the schedule by hand). */
export async function clearSchedule(monthId: MonthId): Promise<void> {
  await db.assignments.where('monthId').equals(monthId).delete()
}
