import { z } from 'zod'
import { db } from './db'

/**
 * Whole-database backup as one JSON file. The data lives only in this browser,
 * so this file is her safety net (new laptop, cleared browser data…).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const monthId = z.string().regex(/^\d{4}-\d{2}$/)

const level = z.object({ id: z.string(), name: z.string(), defaultTarget: z.number().int().min(0) })
const doctor = z.object({
  id: z.string(),
  name: z.string(),
  levelId: z.string(),
  phone: z.string().optional(),
  archived: z.boolean(),
})
const leave = z.object({
  id: z.string(),
  doctorId: z.string(),
  startDate: isoDate,
  days: z.number().int().min(1),
  noteRequired: z.boolean(),
  source: z.enum(['sms', 'whatsapp', 'call', 'other']).optional(),
  comment: z.string().optional(),
  createdAt: z.string(),
})
const month = z.object({
  id: monthId,
  excludedDoctorIds: z.array(z.string()),
  targetOverrides: z.record(z.string(), z.number().int().min(0)),
  status: z.enum(['draft', 'final']),
  generatedAt: z.string().optional(),
})
const assignment = z.object({
  id: z.string(),
  monthId,
  date: isoDate,
  shift: z.enum(['D', 'N']),
  seat: z.number().int().min(0),
  doctorId: z.string().nullable(),
  locked: z.boolean(),
  emptyReason: z.string().optional(),
})
const settings = z.object({
  id: z.literal('main'),
  weekendDays: z.array(z.number().int().min(0).max(6)),
  doctorsPerShift: z.number().int().min(1).max(6),
  highlightColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
})

export const backupSchema = z.object({
  app: z.literal('rota'),
  version: z.literal(1),
  exportedAt: z.string(),
  data: z.object({
    levels: z.array(level),
    doctors: z.array(doctor),
    leaves: z.array(leave),
    months: z.array(month),
    assignments: z.array(assignment),
    settings: z.array(settings),
  }),
})

export type Backup = z.infer<typeof backupSchema>

export async function exportBackup(): Promise<Backup> {
  const [levels, doctors, leaves, months, assignments, settingsRows] = await Promise.all([
    db.levels.toArray(),
    db.doctors.toArray(),
    db.leaves.toArray(),
    db.months.toArray(),
    db.assignments.toArray(),
    db.settings.toArray(),
  ])
  return {
    app: 'rota',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { levels, doctors, leaves, months, assignments, settings: settingsRows },
  }
}

export interface ImportSummary {
  doctors: number
  leaves: number
  months: number
}

/** Replaces everything with the backup. Throws a readable Error when the file is not a Rota backup. */
export async function importBackup(json: string): Promise<ImportSummary> {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('This file is not a Rota backup (it is not valid JSON).')
  }
  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) throw new Error('This file is not a Rota backup, or it is damaged.')
  const { data } = parsed.data
  const tables = [db.levels, db.doctors, db.leaves, db.months, db.assignments, db.settings]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    await db.levels.bulkAdd(data.levels)
    await db.doctors.bulkAdd(data.doctors)
    await db.leaves.bulkAdd(data.leaves)
    await db.months.bulkAdd(data.months)
    await db.assignments.bulkAdd(data.assignments)
    await db.settings.bulkAdd(data.settings)
  })
  return { doctors: data.doctors.length, leaves: data.leaves.length, months: data.months.length }
}

export function backupFileName(now = new Date()): string {
  return `rota-backup-${now.toISOString().slice(0, 10)}.json`
}
