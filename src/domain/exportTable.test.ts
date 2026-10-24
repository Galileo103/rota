import { describe, expect, it } from 'vitest'
import { daysInMonth } from './dates'
import { arabicDigits, buildExportTable } from './exportTable'

const names = new Map([
  ['a', 'سارة علي'],
  ['b', 'منى حسن'],
  ['c', 'كريم سمير'],
  ['d', 'يوسف عادل'],
])

describe('buildExportTable', () => {
  const table = buildExportTable({
    monthId: '2026-10',
    dates: daysInMonth('2026-10'),
    seats: [
      { date: '2026-10-01', shift: 'D', seat: 1, doctorId: 'b' },
      { date: '2026-10-01', shift: 'D', seat: 0, doctorId: 'a' },
      { date: '2026-10-01', shift: 'N', seat: 0, doctorId: 'c' },
      { date: '2026-10-01', shift: 'N', seat: 1, doctorId: null },
      { date: '2026-10-01', shift: 'N', seat: 2, doctorId: 'd' },
    ],
    names,
    weekendDays: [5],
  })

  it('writes the title with the Arabic month and year', () => {
    expect(table.title).toBe('جدول نباطشيات قسم المخ والأعصاب لشهر أكتوبر ٢٠٢٦')
    expect(table.headers).toEqual({ day: 'اليوم', D: '٩ص-٩م', N: '٩م-٩ص' })
  })

  it('labels each day like the printed schedule and highlights Fridays', () => {
    expect(table.rows).toHaveLength(31)
    expect(table.rows[0]).toMatchObject({ dayLabel: 'الخميس ١/١٠', highlight: false })
    expect(table.rows[1]).toMatchObject({ dayLabel: 'الجمعة ٢/١٠', highlight: true })
    expect(table.rows[30]).toMatchObject({ dayLabel: 'السبت ٣١/١٠', highlight: false })
    expect(table.rows.filter((r) => r.highlight).map((r) => r.date.slice(8))).toEqual(['02', '09', '16', '23', '30'])
  })

  it('joins the names of a shift in seat order and skips empty seats', () => {
    expect(table.rows[0]!.cells).toEqual({ D: 'سارة علي - منى حسن', N: 'كريم سمير - يوسف عادل' })
    expect(table.rows[1]!.cells).toEqual({ D: '', N: '' })
  })
})

describe('arabicDigits', () => {
  it('converts every digit', () => {
    expect(arabicDigits('2026-10')).toBe('٢٠٢٦-١٠')
    expect(arabicDigits(31)).toBe('٣١')
  })
})
