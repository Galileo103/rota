import { addMonths } from '../domain/dates'
import { DEFAULT_SETTINGS, type Doctor, type Leave, type Level, type Month, type MonthId, type Settings } from '../domain/types'
import { db } from './db'

export function newId(): string {
  return crypto.randomUUID()
}

// ── Levels ──────────────────────────────────────────────────────────────

export async function saveLevel(level: Level): Promise<void> {
  await db.levels.put({ ...level, name: level.name.trim(), defaultTarget: Math.max(0, Math.floor(level.defaultTarget)) })
}

/** Refuses (returns false) while any doctor still has this level. */
export async function deleteLevel(id: string): Promise<boolean> {
  return db.transaction('rw', db.levels, db.doctors, async () => {
    if ((await db.doctors.where('levelId').equals(id).count()) > 0) return false
    await db.levels.delete(id)
    return true
  })
}

// ── Doctors ─────────────────────────────────────────────────────────────

export async function saveDoctor(doctor: Doctor): Promise<void> {
  const phone = doctor.phone?.trim()
  await db.doctors.put({ ...doctor, name: doctor.name.trim(), phone: phone || undefined })
}

export async function setArchived(id: string, archived: boolean): Promise<void> {
  await db.doctors.update(id, { archived })
}

// ── Leave ───────────────────────────────────────────────────────────────

export async function saveLeave(leave: Leave): Promise<void> {
  const comment = leave.comment?.trim()
  await db.leaves.put({ ...leave, days: Math.max(1, Math.floor(leave.days)), comment: comment || undefined })
}

export async function deleteLeave(id: string): Promise<void> {
  await db.leaves.delete(id)
}

// ── Months ──────────────────────────────────────────────────────────────

/**
 * The month's setup, created on first visit. Every non-archived doctor is on the
 * rota unless taken off; those taken off last month start off this month too.
 */
export async function getOrCreateMonth(id: MonthId): Promise<Month> {
  return db.transaction('rw', db.months, async () => {
    const existing = await db.months.get(id)
    if (existing) return existing
    const previous = await db.months.get(addMonths(id, -1))
    const month: Month = { id, excludedDoctorIds: previous?.excludedDoctorIds ?? [], targetOverrides: {}, status: 'draft' }
    await db.months.add(month)
    return month
  })
}

export async function setActive(monthId: MonthId, doctorId: string, active: boolean): Promise<void> {
  const month = await getOrCreateMonth(monthId)
  const ids = month.excludedDoctorIds.filter((d) => d !== doctorId)
  if (!active) ids.push(doctorId)
  await db.months.update(monthId, { excludedDoctorIds: ids })
}

export async function setAllActive(monthId: MonthId, doctorIds: string[], active: boolean): Promise<void> {
  await getOrCreateMonth(monthId)
  await db.months.update(monthId, { excludedDoctorIds: active ? [] : doctorIds })
}

/** `target` undefined clears the override (back to the level default). */
export async function setTargetOverride(monthId: MonthId, doctorId: string, target: number | undefined): Promise<void> {
  const month = await getOrCreateMonth(monthId)
  const overrides = { ...month.targetOverrides }
  if (target === undefined || Number.isNaN(target)) delete overrides[doctorId]
  else overrides[doctorId] = Math.max(0, Math.floor(target))
  await db.months.update(monthId, { targetOverrides: overrides })
}

// ── Settings ────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('main')) ?? DEFAULT_SETTINGS
}

export async function saveSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.settings.put({ ...(await getSettings()), ...patch, id: 'main' })
}
