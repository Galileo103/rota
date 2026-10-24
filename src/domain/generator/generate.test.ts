import { describe, expect, it } from 'vitest'
import { daysInMonth, weekday } from '../dates'
import type { IsoDate } from '../types'
import { computeStats, generate, type GenerateInput, type GenerateResult } from './generate'

const NOV = daysInMonth('2026-11') // 30 days → 120 seats

/** 16 doctors whose targets add up to exactly 120: 4 × 10, 8 × 7, 4 × 6. */
function doctors() {
  return [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `sen${i}`, target: 10 })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `mid${i}`, target: 7 })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `jun${i}`, target: 6 })),
  ]
}

function leaveOf(entries: [string, IsoDate[]][]): Map<string, Set<IsoDate>> {
  return new Map(entries.map(([id, dates]) => [id, new Set(dates)]))
}

function input(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return { dates: NOV, doctors: doctors(), leave: new Map(), weekendDays: [5], seatsPerShift: 2, seed: 42, ...overrides }
}

function expectHardRules(inp: GenerateInput, result: GenerateResult) {
  const targets = new Map(inp.doctors.map((d) => [d.id, d.target]))
  const counts = new Map<string, number>()
  const byShift = new Map<string, string[]>()
  for (const s of result.seats) {
    if (!s.doctorId || s.locked) continue
    expect(inp.leave.get(s.doctorId)?.has(s.date) ?? false, `${s.doctorId} on leave ${s.date}`).toBe(false)
    const key = `${s.date}${s.shift}`
    const list = byShift.get(key) ?? []
    expect(list, `${s.doctorId} twice in ${key}`).not.toContain(s.doctorId)
    byShift.set(key, [...list, s.doctorId])
    counts.set(s.doctorId, (counts.get(s.doctorId) ?? 0) + 1)
  }
  for (const [id, c] of counts) expect(c, `${id} over target`).toBeLessThanOrEqual(targets.get(id)!)
}

describe('generate', () => {
  it('fills a normal month completely, hits every target and keeps the hard rules', () => {
    const inp = input()
    const result = generate(inp)
    expectHardRules(inp, result)
    expect(result.seats).toHaveLength(120)
    expect(result.empty).toEqual([])
    for (const s of result.stats) expect(s.shifts).toBe(s.target)
  })

  it('shares nights and Fridays fairly', () => {
    const result = generate(input())
    for (const s of result.stats) {
      expect(Math.abs(s.nights - s.shifts / 2), `${s.doctorId} nights`).toBeLessThanOrEqual(1)
    }
    // November 2026 has 4 Fridays → 16 Friday seats over 120: about 1 per doctor.
    const fridays = result.stats.map((s) => s.weekends)
    expect(Math.max(...fridays) - Math.min(...fridays)).toBeLessThanOrEqual(2)
    expect(fridays.reduce((a, b) => a + b, 0)).toBe(16)
  })

  it('spreads shifts through the month and keeps 24h runs rare', () => {
    const result = generate(input())
    const runs = result.stats.reduce((sum, s) => sum + s.longRuns, 0)
    expect(runs).toBeLessThanOrEqual(2)
    // A 10-shift doctor should not have all shifts inside two weeks.
    const sen0 = result.seats.filter((s) => s.doctorId === 'sen0').map((s) => Number(s.date.slice(8)))
    expect(Math.max(...sen0) - Math.min(...sen0)).toBeGreaterThanOrEqual(20)
  })

  it('works around heavy leave and still meets targets when possible', () => {
    const firstHalf = NOV.slice(0, 15)
    const leave = leaveOf([
      ['sen0', firstHalf], // 15 free days, needs 10 shifts
      ['mid0', NOV.slice(10, 25)],
      ['mid1', NOV.slice(5, 12)],
      ['jun0', NOV.slice(20)],
    ])
    const inp = input({ leave })
    const result = generate(inp)
    expectHardRules(inp, result)
    expect(result.empty).toEqual([])
    for (const s of result.stats) expect(s.shifts).toBe(s.target)
  })

  it('leaves seats empty with a reason when the month cannot be covered', () => {
    const few = [
      { id: 'a', target: 30 },
      { id: 'b', target: 30 },
      { id: 'c', target: 30 },
    ]
    const leave = leaveOf([
      ['a', ['2026-11-10']],
      ['b', ['2026-11-10']],
    ])
    const inp = input({ doctors: few, leave })
    const result = generate(inp)
    expectHardRules(inp, result)
    const tenth = result.empty.filter((e) => e.date === '2026-11-10')
    expect(tenth.length).toBeGreaterThanOrEqual(2)
    expect(tenth[0]!.reason).toMatch(/2 on leave/)
    // 3 doctors × 30 = 90 shifts for 120 seats: at least 30 stay empty.
    expect(result.empty.length).toBeGreaterThanOrEqual(30)
  })

  it('explains empty seats caused by targets being too low', () => {
    const inp = input({ doctors: doctors().map((d) => ({ ...d, target: 5 })) }) // 80 for 120 seats
    const result = generate(inp)
    expect(result.empty).toHaveLength(40)
    expect(result.empty[0]!.reason).toMatch(/at their target/)
    for (const s of result.stats) expect(s.shifts).toBe(5)
  })

  it('keeps locked seats exactly as they are, even when they break a rule', () => {
    const leave = leaveOf([['sen1', ['2026-11-03']]])
    const locked = [
      { date: '2026-11-03', shift: 'D' as const, seat: 0, doctorId: 'sen1' }, // she chose this despite leave
      { date: '2026-11-04', shift: 'N' as const, seat: 1, doctorId: null }, // kept empty on purpose
    ]
    const inp = input({ leave, locked })
    const result = generate(inp)
    const at = (date: string, shift: string, seat: number) =>
      result.seats.find((s) => s.date === date && s.shift === shift && s.seat === seat)!
    expect(at('2026-11-03', 'D', 0)).toMatchObject({ doctorId: 'sen1', locked: true })
    expect(at('2026-11-04', 'N', 1)).toMatchObject({ doctorId: null, locked: true })
    expect(result.empty.find((e) => e.date === '2026-11-04')?.reason).toMatch(/locked/)
    expectHardRules(inp, result)
  })

  it('gives the same schedule for the same seed', () => {
    const a = generate(input({ seed: 7 }))
    const b = generate(input({ seed: 7 }))
    expect(a.seats.map((s) => s.doctorId)).toEqual(b.seats.map((s) => s.doctorId))
  })

  it('handles a month with no doctors', () => {
    const result = generate(input({ doctors: [] }))
    expect(result.empty).toHaveLength(120)
    expect(result.empty[0]!.reason).toMatch(/No active doctors/)
  })

  it('runs a real month quickly', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, target: i < 4 ? 8 : 6 }))
    const start = performance.now()
    generate(input({ doctors: twenty, seed: undefined }))
    expect(performance.now() - start).toBeLessThan(3000)
  })
})

describe('computeStats', () => {
  it('counts shifts, nights, Fridays and back-to-back runs', () => {
    const fri = NOV.find((d) => weekday(d) === 5)!
    const stats = computeStats({ doctors: [{ id: 'x', target: 3 }], weekendDays: [5] }, [
      { date: '2026-11-01', shift: 'D', doctorId: 'x' },
      { date: '2026-11-01', shift: 'N', doctorId: 'x' }, // 24h run
      { date: fri, shift: 'N', doctorId: 'x' },
      { date: '2026-11-02', shift: 'D', doctorId: null },
    ])
    expect(stats[0]).toEqual({ doctorId: 'x', target: 3, shifts: 3, nights: 2, weekends: 1, longRuns: 1 })
  })
})
