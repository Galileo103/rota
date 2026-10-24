import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { assignSeat, FinalMonthError, removeSeat, setMonthStatus, swapSeats, undo } from './editor'
import { saveDoctor } from './repos'

const M = '2026-11'
const seatA = { date: '2026-11-03', shift: 'D' as const, seat: 0 }
const seatB = { date: '2026-11-04', shift: 'N' as const, seat: 1 }
const row = (s: { date: string; shift: string; seat: number }) => db.assignments.get(`${M}|${s.date}|${s.shift}|${s.seat}`)

beforeEach(async () => {
  await db.delete()
  await db.open()
  for (let i = 0; i < 4; i++) await saveDoctor({ id: `d${i}`, name: `Dr ${i}`, levelId: 'level-specialist', archived: false })
})

describe('editor', () => {
  it('fills an empty seat, and undo removes it again', async () => {
    expect(await row(seatA)).toBeUndefined()
    const change = await assignSeat(M, seatA, 'd1')
    expect(await row(seatA)).toMatchObject({ monthId: M, doctorId: 'd1' })
    await undo(change)
    expect(await row(seatA)).toBeUndefined()
  })

  it('replaces a doctor, and undo restores the previous one', async () => {
    await assignSeat(M, seatA, 'd1')
    const change = await assignSeat(M, seatA, 'd2')
    expect((await row(seatA))!.doctorId).toBe('d2')
    await undo(change)
    expect((await row(seatA))!.doctorId).toBe('d1')
  })

  it('can empty a seat', async () => {
    await assignSeat(M, seatA, 'd1')
    await assignSeat(M, seatA, null)
    expect((await row(seatA))!.doctorId).toBeNull()
  })

  it('swaps two seats (also with an empty one) and undoes the swap', async () => {
    await assignSeat(M, seatA, 'd1')
    await assignSeat(M, seatB, 'd2')
    const change = await swapSeats(M, seatA, seatB)
    expect((await row(seatA))!.doctorId).toBe('d2')
    expect((await row(seatB))!.doctorId).toBe('d1')
    await undo(change)
    expect((await row(seatA))!.doctorId).toBe('d1')

    const empty = { date: '2026-11-20', shift: 'D' as const, seat: 0 }
    await swapSeats(M, seatA, empty)
    expect((await row(seatA))!.doctorId).toBeNull()
    expect((await row(empty))!.doctorId).toBe('d1')
  })

  it('removes an extra seat, moves later extra seats down, and undoes it', async () => {
    const at = (seat: number) => ({ date: '2026-11-06', shift: 'D' as const, seat })
    await assignSeat(M, at(0), 'd0')
    await assignSeat(M, at(1), 'd1')
    await assignSeat(M, at(2), 'd2') // 3rd doctor
    await assignSeat(M, at(3), 'd3') // 4th doctor
    const change = await removeSeat(M, at(2))
    expect((await row(at(2)))!.doctorId).toBe('d3')
    expect(await row(at(3))).toBeUndefined()
    expect((await row(at(1)))!.doctorId).toBe('d1')
    await undo(change)
    expect((await row(at(2)))!.doctorId).toBe('d2')
    expect((await row(at(3)))!.doctorId).toBe('d3')
  })

  it('refuses edits while the month is final', async () => {
    await db.months.put({ id: M, excludedDoctorIds: [], targetOverrides: {}, status: 'draft' })
    await setMonthStatus(M, 'final')
    await expect(assignSeat(M, seatA, 'd1')).rejects.toBeInstanceOf(FinalMonthError)
    await setMonthStatus(M, 'draft')
    await expect(assignSeat(M, seatA, 'd1')).resolves.toBeTruthy()
  })
})
