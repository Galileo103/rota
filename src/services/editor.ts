import type { SeatRef } from '../domain/editor'
import { assignmentId, type Assignment, type MonthId } from '../domain/types'
import { db } from './db'

/**
 * She fills the schedule by hand, seat by seat. Each edit returns an Undo
 * describing the rows as they were.
 */

export interface Undo {
  /** row null = the row did not exist before the edit. */
  before: { id: string; row: Assignment | null }[]
}

export class FinalMonthError extends Error {
  constructor() {
    super('This month is final. Reopen it to make changes.')
  }
}

async function ensureDraft(monthId: MonthId) {
  if ((await db.months.get(monthId))?.status === 'final') throw new FinalMonthError()
}

function blankRow(monthId: MonthId, seat: SeatRef): Assignment {
  return { id: assignmentId(monthId, seat.date, seat.shift, seat.seat), monthId, ...seat, doctorId: null, locked: false }
}

async function edit(monthId: MonthId, seats: SeatRef[], change: (rows: Assignment[]) => Assignment[]): Promise<Undo> {
  return db.transaction('rw', db.assignments, db.months, async () => {
    await ensureDraft(monthId)
    const ids = seats.map((s) => assignmentId(monthId, s.date, s.shift, s.seat))
    const existing = await db.assignments.bulkGet(ids)
    const before = ids.map((id, i) => ({ id, row: existing[i] ?? null }))
    const current = seats.map((s, i) => existing[i] ?? blankRow(monthId, s))
    await db.assignments.bulkPut(change(current))
    return { before }
  })
}

/** Puts a doctor in a seat, or empties it with null. */
export function assignSeat(monthId: MonthId, seat: SeatRef, doctorId: string | null): Promise<Undo> {
  return edit(monthId, [seat], ([row]) => [{ ...row!, doctorId }])
}

/** Exchanges the doctors of two seats. */
export function swapSeats(monthId: MonthId, a: SeatRef, b: SeatRef): Promise<Undo> {
  return edit(monthId, [a, b], ([ra, rb]) => [
    { ...ra!, doctorId: rb!.doctorId },
    { ...rb!, doctorId: ra!.doctorId },
  ])
}

/**
 * Takes an extra seat out of a shift (3rd or 4th doctor). Later extra seats
 * move down one, so the shift never shows a gap.
 */
export async function removeSeat(monthId: MonthId, seat: SeatRef): Promise<Undo> {
  return db.transaction('rw', db.assignments, db.months, async () => {
    await ensureDraft(monthId)
    const shiftRows = (await db.assignments.where('monthId').equals(monthId).toArray())
      .filter((r) => r.date === seat.date && r.shift === seat.shift && r.seat >= seat.seat)
      .sort((a, b) => a.seat - b.seat)
    const touched = new Map(shiftRows.map((r) => [r.id, r]))
    const moved = shiftRows
      .filter((r) => r.seat > seat.seat)
      .map((r) => ({ ...r, seat: r.seat - 1, id: assignmentId(monthId, r.date, r.shift, r.seat - 1) }))
    for (const m of moved) if (!touched.has(m.id)) touched.set(m.id, (await db.assignments.get(m.id)) as Assignment)
    await db.assignments.bulkDelete(shiftRows.map((r) => r.id))
    await db.assignments.bulkPut(moved)
    return { before: [...touched].map(([id, row]) => ({ id, row: row ?? null })) }
  })
}

export async function undo(change: Undo): Promise<void> {
  await db.transaction('rw', db.assignments, async () => {
    for (const { id, row } of change.before) {
      if (row) await db.assignments.put(row)
      else await db.assignments.delete(id)
    }
  })
}

export async function setMonthStatus(monthId: MonthId, status: 'draft' | 'final'): Promise<void> {
  await db.months.update(monthId, { status })
}
