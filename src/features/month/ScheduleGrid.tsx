import type { CSSProperties } from 'react'
import { shortDate, weekday, weekdayShort } from '../../domain/dates'
import { MAX_SEATS, seatKey, type SeatRef } from '../../domain/editor'
import { SHIFT_HOURS, SHIFT_LABEL, SHIFTS, type Assignment, type IsoDate, type Shift } from '../../domain/types'
import s from './month.module.css'

export function ScheduleGrid({
  dates,
  seatsIn,
  assignments,
  names,
  problems,
  weekendDays,
  weekendColor,
  selected,
  swapFrom,
  onSeat,
}: {
  dates: IsoDate[]
  /** Seats shown in a shift: the usual number plus any extra doctors she added. */
  seatsIn: (date: IsoDate, shift: Shift) => number
  assignments: Assignment[]
  names: Map<string, string>
  /** seatKey → what is wrong with that seat (leave clash, twice in a shift, off the rota). */
  problems: Map<string, string>
  weekendDays: number[]
  /** Same colour as the shared image, so what she picks is what she sees. */
  weekendColor: string
  selected?: SeatRef
  swapFrom?: SeatRef
  /** Absent = read-only (final month). */
  onSeat?: (seat: SeatRef) => void
}) {
  const byKey = new Map(assignments.map((a) => [seatKey(a), a]))
  const weekend = new Set(weekendDays)
  const selectedKey = selected && seatKey(selected)
  const swapKey = swapFrom && seatKey(swapFrom)
  return (
    <div
      className={s.grid}
      role="table"
      aria-label="Schedule"
      data-swapping={swapKey ? true : undefined}
      style={{ '--weekend-row': weekendColor } as CSSProperties}
    >
      <div className={s.gridHead} role="row">
        <span role="columnheader">Date</span>
        {SHIFTS.map((shift) => (
          <span key={shift} role="columnheader">
            {shift === 'N' ? '🌙' : '☀️'} {SHIFT_LABEL[shift]} <small>{SHIFT_HOURS[shift]}</small>
          </span>
        ))}
      </div>
      {dates.map((date) => (
        <div key={date} className={s.gridRow} data-weekend={weekend.has(weekday(date)) || undefined} role="row">
          <span className={s.dateCell} role="rowheader">
            <strong>{weekdayShort(date)}</strong> {shortDate(date)}
          </span>
          {SHIFTS.map((shift) => (
            <div key={shift} className={s.shiftCell} data-shift={shift} role="cell">
              <span className={s.shiftTag}>{SHIFT_LABEL[shift]}</span>
              {Array.from({ length: seatsIn(date, shift) }, (_, seat) => {
                const ref = { date, shift, seat }
                const key = seatKey(ref)
                const a = byKey.get(key)
                const problem = problems.get(key)
                const state = !a?.doctorId ? 'empty' : problem ? 'conflict' : 'ok'
                const label = a?.doctorId ? (names.get(a.doctorId) ?? 'Unknown') : 'Empty'
                const content = (
                  <>
                    <span>{a?.doctorId ? label : onSeat ? '＋ Add' : '—'}</span>
                    {problem && <small>⚠ {problem}</small>}
                  </>
                )
                const common = {
                  className: s.seat,
                  'data-state': state,
                  'data-selected': key === selectedKey || undefined,
                  'data-swap': key === swapKey || undefined,
                  title: problem,
                }
                return onSeat ? (
                  <button
                    key={seat}
                    type="button"
                    {...common}
                    onClick={() => onSeat(ref)}
                    aria-label={`${weekdayShort(date)} ${shortDate(date)} ${SHIFT_LABEL[shift]} seat ${seat + 1}: ${label}${problem ? `, ${problem}` : ''}`}
                  >
                    {content}
                  </button>
                ) : (
                  <span key={seat} {...common}>
                    {content}
                  </span>
                )
              })}
              {onSeat && seatsIn(date, shift) < MAX_SEATS && (
                <button
                  type="button"
                  className={s.addSeat}
                  title="Add another doctor to this shift"
                  aria-label={`Add another doctor to ${weekdayShort(date)} ${shortDate(date)} ${SHIFT_LABEL[shift]}`}
                  onClick={() => onSeat({ date, shift, seat: seatsIn(date, shift) })}
                >
                  ＋
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
