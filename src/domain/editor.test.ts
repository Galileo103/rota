import { describe, expect, it } from 'vitest'
import { neighbourShifts, seatCounter, seatOptions, validateSchedule, type SeatRow } from './editor'

describe('seatCounter', () => {
  it('shows the usual seats, or more where an extra doctor was added', () => {
    const seatsIn = seatCounter(
      [
        { date: '2026-11-01', shift: 'D', seat: 2, doctorId: 'a' },
        { date: '2026-11-02', shift: 'N', seat: 3, doctorId: null }, // emptied extra seat: not shown
      ],
      2,
    )
    expect(seatsIn('2026-11-01', 'D')).toBe(3)
    expect(seatsIn('2026-11-01', 'N')).toBe(2)
    expect(seatsIn('2026-11-02', 'N')).toBe(2)
  })
})

const doctors = [
  { id: 'a', target: 2 },
  { id: 'b', target: 2 },
  { id: 'c', target: 1 },
  { id: 'd', target: 3 },
]

const rows: SeatRow[] = [
  { date: '2026-11-01', shift: 'D', seat: 0, doctorId: 'a' },
  { date: '2026-11-01', shift: 'D', seat: 1, doctorId: 'b' },
  { date: '2026-11-01', shift: 'N', seat: 0, doctorId: 'c' },
  { date: '2026-11-01', shift: 'N', seat: 1, doctorId: null },
  { date: '2026-11-02', shift: 'D', seat: 0, doctorId: 'a' },
  { date: '2026-11-02', shift: 'D', seat: 1, doctorId: 'd' },
]

describe('seatOptions', () => {
  const seat = { date: '2026-11-01', shift: 'N' as const, seat: 1 }

  it('ranks free doctors first and explains the others', () => {
    const leave = new Map([['d', new Set(['2026-11-01'])]])
    const options = seatOptions(rows, seat, doctors, leave)
    const by = Object.fromEntries(options.map((o) => [o.doctorId, o]))

    expect(by.c).toMatchObject({ status: 'blocked', notes: ['Already on this shift', 'Reached target (1/1)'] })
    expect(by.d).toMatchObject({ status: 'warn', notes: ['On leave this day', 'Works the shift after: 24h run'] })
    // a already has both shifts (2/2): can't be added again.
    expect(by.a).toMatchObject({ status: 'blocked', shiftsNow: 2 })
    expect(by.a!.notes).toEqual(['Reached target (2/2)', 'Works the shift before: 24h run', 'Works the shift after: 24h run'])
    expect(by.b).toMatchObject({ status: 'good', shiftsNow: 1, shiftsAfter: 2, notes: ['Works the shift before: 24h run'] })
    // good → warn → blocked (fewer notes first)
    expect(options.map((o) => o.doctorId)).toEqual(['b', 'd', 'c', 'a'])
  })

  it('lets a full doctor in again once the target is raised', () => {
    const raised = doctors.map((d) => (d.id === 'a' ? { ...d, target: 3 } : d))
    const a = seatOptions(rows, seat, raised, new Map()).find((o) => o.doctorId === 'a')!
    expect(a).toMatchObject({ status: 'good', shiftsAfter: 3 })
  })

  it('puts the doctor already in the seat on top and does not count the seat twice', () => {
    const options = seatOptions(rows, { date: '2026-11-01', shift: 'N', seat: 0 }, doctors, new Map())
    expect(options[0]).toMatchObject({ doctorId: 'c', current: true, shiftsAfter: 1, status: 'good' })
  })
})

describe('across the month change', () => {
  it('knows the neighbouring shifts of a month', () => {
    expect(neighbourShifts('2026-11')).toEqual({ previousNight: '2026-10-31', nextDay: '2026-12-01' })
    expect(neighbourShifts('2027-01')).toEqual({ previousNight: '2026-12-31', nextDay: '2027-02-01' })
  })

  it('warns about a 24h run with the previous month’s last night, without counting it', () => {
    const lastNightOfOctober: SeatRow[] = [{ date: '2026-10-31', shift: 'N', seat: 0, doctorId: 'a' }]
    const options = seatOptions([], { date: '2026-11-01', shift: 'D', seat: 0 }, doctors, new Map(), lastNightOfOctober)
    const a = options.find((o) => o.doctorId === 'a')!
    expect(a.notes).toEqual(['Worked the night before (31 Oct): 24h run'])
    expect(a).toMatchObject({ status: 'good', shiftsNow: 0, shiftsAfter: 1 })
  })

  it('warns about a 24h run with the next month’s first day shift', () => {
    const firstDayOfDecember: SeatRow[] = [{ date: '2026-12-01', shift: 'D', seat: 1, doctorId: 'b' }]
    const options = seatOptions([], { date: '2026-11-30', shift: 'N', seat: 0 }, doctors, new Map(), firstDayOfDecember)
    expect(options.find((o) => o.doctorId === 'b')!.notes).toEqual(['Works the next morning (1 Dec): 24h run'])
    // Not next to that shift: no note.
    const day = seatOptions([], { date: '2026-11-30', shift: 'D', seat: 0 }, doctors, new Map(), firstDayOfDecember)
    expect(day.find((o) => o.doctorId === 'b')!.notes).toEqual([])
  })
})

describe('validateSchedule', () => {
  it('lists empty seats, leave clashes, doubles, removed doctors and target gaps', () => {
    const withProblems: SeatRow[] = [
      ...rows.filter((r) => !(r.date === '2026-11-02' && r.shift === 'D')),
      { date: '2026-11-02', shift: 'D', seat: 0, doctorId: 'x' }, // not on the rota
      { date: '2026-11-02', shift: 'D', seat: 1, doctorId: 'x' }, // and twice in the shift
    ]
    const issues = validateSchedule(withProblems, {
      dates: ['2026-11-01', '2026-11-02'],
      seatsPerShift: 2,
      doctors,
      leave: new Map([['b', new Set(['2026-11-01'])]]),
    })
    const kinds = issues.map((i) => `${i.kind}:${i.doctorId ?? ''}${i.date ? '@' + i.date.slice(8) + i.shift + i.seat : ''}`)
    expect(kinds).toEqual([
      'leave:b@01D1',
      'empty:@01N1',
      'double:x@02D1',
      'empty:@02N0',
      'empty:@02N1',
      'inactive:x@02D0',
      'inactive:x@02D1',
      'under:a',
      'under:b',
      'under:d',
    ])
    expect(issues.find((i) => i.kind === 'under' && i.doctorId === 'd')).toMatchObject({ shifts: 0, target: 3, severity: 'info' })
  })

  it('checks extra seats too, without asking to fill seats that were never added', () => {
    const withExtra: SeatRow[] = [
      { date: '2026-11-01', shift: 'D', seat: 0, doctorId: 'a' },
      { date: '2026-11-01', shift: 'D', seat: 1, doctorId: 'b' },
      { date: '2026-11-01', shift: 'D', seat: 2, doctorId: 'c' }, // a 3rd doctor this shift
      { date: '2026-11-01', shift: 'N', seat: 0, doctorId: 'd' },
      { date: '2026-11-01', shift: 'N', seat: 1, doctorId: 'a' },
    ]
    const issues = validateSchedule(withExtra, {
      dates: ['2026-11-01'],
      seatsPerShift: 2,
      doctors,
      leave: new Map([['c', new Set(['2026-11-01'])]]),
    })
    expect(issues.filter((i) => i.severity !== 'info').map((i) => `${i.kind}:${i.shift}${i.seat}`)).toEqual(['leave:D2'])
  })

  it('reports over target', () => {
    const issues = validateSchedule(rows, { dates: ['2026-11-01'], seatsPerShift: 2, doctors: [{ id: 'a', target: 0 }], leave: new Map() })
    expect(issues.find((i) => i.kind === 'over')).toMatchObject({ doctorId: 'a', shifts: 1, target: 0 })
  })
})
