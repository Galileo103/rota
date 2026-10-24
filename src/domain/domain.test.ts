import { describe, expect, it } from 'vitest'
import { checkBalance } from './balance'
import { addDays, addMonths, daysInMonth, diffDays, monthLabel, shortDate, weekday } from './dates'
import { leaveDaysIn, leaveEnd, leaveIndex, overlappingLeave } from './leave'
import { effectiveTarget } from './targets'
import type { Leave } from './types'

function leave(id: string, doctorId: string, startDate: string, days: number): Leave {
  return { id, doctorId, startDate, days, noteRequired: false, createdAt: '2026-10-24T00:00:00Z' }
}

describe('dates', () => {
  it('lists the days of a month, leap years included', () => {
    expect(daysInMonth('2026-11')).toHaveLength(30)
    expect(daysInMonth('2028-02')).toHaveLength(29)
    expect(daysInMonth('2026-12').at(-1)).toBe('2026-12-31')
  })

  it('adds days and months across boundaries', () => {
    expect(addDays('2026-11-29', 3)).toBe('2026-12-02')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(diffDays('2026-10-30', '2026-11-02')).toBe(3)
  })

  it('knows weekdays and labels', () => {
    expect(weekday('2026-10-23')).toBe(5) // Friday
    expect(monthLabel('2026-11')).toBe('November 2026')
    expect(shortDate('2026-11-05')).toBe('5 Nov')
  })
})

describe('leave', () => {
  it('computes the end date from start + number of days', () => {
    expect(leaveEnd({ startDate: '2026-11-28', days: 5 })).toBe('2026-12-02')
    expect(leaveEnd({ startDate: '2026-11-10', days: 1 })).toBe('2026-11-10')
  })

  it('indexes only the days inside the month asked for', () => {
    const idx = leaveIndex([leave('1', 'a', '2026-10-30', 4)], '2026-11')
    expect([...idx.get('a')!]).toEqual(['2026-11-01', '2026-11-02'])
  })

  it('counts leave days per month and per year, overlaps once', () => {
    const leaves = [leave('1', 'a', '2026-11-01', 5), leave('2', 'a', '2026-11-04', 3), leave('3', 'b', '2026-11-01', 9)]
    expect(leaveDaysIn(leaves, 'a', '2026-11')).toBe(6)
    expect(leaveDaysIn(leaves, 'a', '2026')).toBe(6)
    expect(leaveDaysIn(leaves, 'a', '2027')).toBe(0)
  })

  it('finds an overlapping leave of the same doctor', () => {
    const leaves = [leave('1', 'a', '2026-11-10', 3)]
    expect(overlappingLeave(leaves, { id: 'new', doctorId: 'a', startDate: '2026-11-12', days: 2 })?.id).toBe('1')
    expect(overlappingLeave(leaves, { id: 'new', doctorId: 'a', startDate: '2026-11-13', days: 2 })).toBeUndefined()
    expect(overlappingLeave(leaves, { id: 'new', doctorId: 'b', startDate: '2026-11-10', days: 2 })).toBeUndefined()
    expect(overlappingLeave(leaves, { id: '1', doctorId: 'a', startDate: '2026-11-10', days: 5 })).toBeUndefined()
  })
})

describe('targets', () => {
  const levels = [{ id: 'res', name: 'Resident', defaultTarget: 14 }]
  const doc = { id: 'x', name: 'X', levelId: 'res', archived: false }
  it('uses the level default unless overridden for the month', () => {
    expect(effectiveTarget(doc, levels)).toBe(14)
    expect(effectiveTarget(doc, levels, { targetOverrides: { x: 9 } })).toBe(9)
    expect(effectiveTarget(doc, levels, { targetOverrides: { x: 0 } })).toBe(0)
    expect(effectiveTarget({ ...doc, levelId: 'gone' }, levels)).toBe(0)
  })
})

describe('checkBalance', () => {
  it('compares targets with seats and flags short days and impossible targets', () => {
    const dates = daysInMonth('2026-11')
    const docs = [
      { id: 'a', target: 40 },
      { id: 'b', target: 40 },
      { id: 'c', target: 30 },
    ]
    const leave = new Map([
      ['a', new Set(['2026-11-05', '2026-11-06'])],
      ['b', new Set(['2026-11-05'])],
      ['c', new Set(dates.slice(0, 20))],
    ])
    const r = checkBalance(dates, docs, leave, 2)
    expect(r.seats).toBe(120)
    expect(r.targetTotal).toBe(110)
    expect(r.diff).toBe(-10)
    expect(r.shortDays.map((d) => d.date)).toEqual(['2026-11-05', '2026-11-06'])
    expect(r.tightDays).toHaveLength(dates.length - 2) // only 3 doctors: every other day forces a 24h run
    expect(r.impossibleTargets).toEqual([{ doctorId: 'c', target: 30, max: 20 }])
  })
})
