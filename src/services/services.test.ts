import { beforeEach, describe, expect, it } from 'vitest'
import { exportBackup, importBackup } from './backup'
import { db } from './db'
import { deleteLevel, getOrCreateMonth, saveDoctor, saveLeave, setActive, setTargetOverride } from './repos'
import { assignSeat } from './editor'
import { balanceFor, clearSchedule, loadMonthContext } from './schedule'

async function seedDoctors(count: number, levelId = 'level-specialist') {
  for (let i = 0; i < count; i++) {
    await saveDoctor({ id: `d${i}`, name: `Doctor ${String(i).padStart(2, '0')}`, levelId, archived: false })
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('repos', () => {
  it('starts with editable default levels', async () => {
    expect((await db.levels.toArray()).map((l) => l.name).sort()).toEqual(['Consultant', 'Resident', 'Specialist'])
  })

  it('refuses to delete a level still in use', async () => {
    await seedDoctors(1)
    expect(await deleteLevel('level-specialist')).toBe(false)
    expect(await deleteLevel('level-resident')).toBe(true)
  })

  it('puts every current doctor on the rota, including doctors added after the month was opened', async () => {
    await seedDoctors(2)
    await saveDoctor({ id: 'old', name: 'Old', levelId: 'level-specialist', archived: true })
    await getOrCreateMonth('2026-11')
    await saveDoctor({ id: 'late', name: 'Late', levelId: 'level-specialist', archived: false })
    const ctx = await loadMonthContext('2026-11')
    expect(ctx.doctors.map((d) => d.id).sort()).toEqual(['d0', 'd1', 'late'])
  })

  it('carries "off the rota" to the next month', async () => {
    await seedDoctors(3)
    await setActive('2026-11', 'd1', false)
    const dec = await getOrCreateMonth('2026-12')
    expect(dec.excludedDoctorIds).toEqual(['d1'])
    await setActive('2026-12', 'd1', true)
    expect((await loadMonthContext('2026-12')).doctors).toHaveLength(3)
  })
})

describe('schedule', () => {
  it('uses overrides and leave in the month context and balance', async () => {
    await seedDoctors(12) // 12 × 10 = 120 = seats in November
    await setTargetOverride('2026-11', 'd0', 6)
    await saveLeave({ id: 'l1', doctorId: 'd1', startDate: '2026-10-30', days: 4, noteRequired: true, createdAt: '' })
    const ctx = await loadMonthContext('2026-11')
    expect(ctx.doctors.find((d) => d.id === 'd0')?.target).toBe(6)
    expect([...ctx.leave.get('d1')!]).toEqual(['2026-11-01', '2026-11-02'])
    const balance = balanceFor(ctx)
    expect(balance).toMatchObject({ seats: 120, targetTotal: 116, diff: -4 })
  })

  it('clears only the chosen month', async () => {
    await seedDoctors(2)
    await assignSeat('2026-11', { date: '2026-11-01', shift: 'D', seat: 0 }, 'd0')
    await assignSeat('2026-12', { date: '2026-12-01', shift: 'D', seat: 0 }, 'd1')
    await clearSchedule('2026-11')
    expect((await db.assignments.toArray()).map((a) => a.monthId)).toEqual(['2026-12'])
  })
})

describe('backup', () => {
  it('round-trips the whole database', async () => {
    await seedDoctors(4)
    await saveLeave({ id: 'l1', doctorId: 'd1', startDate: '2026-11-03', days: 2, noteRequired: true, source: 'whatsapp', createdAt: 'x' })
    await getOrCreateMonth('2026-11')
    await assignSeat('2026-11', { date: '2026-11-05', shift: 'N', seat: 1 }, 'd2')
    const backup = JSON.stringify(await exportBackup())

    await db.delete()
    await db.open()
    const summary = await importBackup(backup)
    expect(summary).toEqual({ doctors: 4, leaves: 1, months: 1 })
    expect(await db.assignments.get('2026-11|2026-11-05|N|1')).toMatchObject({ doctorId: 'd2' })
    expect((await db.leaves.get('l1'))?.source).toBe('whatsapp')
  })

  it('rejects a file that is not a backup and keeps current data', async () => {
    await seedDoctors(2)
    await expect(importBackup('{"hello":1}')).rejects.toThrow(/not a Rota backup/)
    await expect(importBackup('not json')).rejects.toThrow(/not valid JSON/)
    expect(await db.doctors.count()).toBe(2)
  })
})
