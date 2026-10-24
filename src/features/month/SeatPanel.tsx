import { useEffect, useRef, useState } from 'react'
import { shortDate, weekdayShort } from '../../domain/dates'
import type { SeatOption, SeatRef } from '../../domain/editor'
import { SHIFT_HOURS, SHIFT_LABEL, type Assignment } from '../../domain/types'
import { Badge, Button, ui } from '../../design/ui'
import s from './month.module.css'

/** Side drawer (laptop) / bottom sheet (phone) to choose who sits in one seat. */
export function SeatPanel({
  seat,
  row,
  options,
  names,
  levels,
  remaining,
  extra,
  onPick,
  onSwap,
  onRemoveSeat,
  onClose,
}: {
  seat: SeatRef
  row?: Assignment
  options: SeatOption[]
  names: Map<string, string>
  /** doctorId → level name */
  levels: Map<string, string>
  /** Empty seats left in the month. */
  remaining: number
  /** A seat beyond the usual number (3rd or 4th doctor). */
  extra: boolean
  onPick: (doctorId: string | null) => void
  onSwap: () => void
  onRemoveSeat: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    search.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const shown = options.filter((o) => !q || (names.get(o.doctorId) ?? '').toLowerCase().includes(q))
  const current = row?.doctorId ? names.get(row.doctorId) : undefined
  const title = `${weekdayShort(seat.date)} ${shortDate(seat.date)} · ${SHIFT_LABEL[seat.shift]}`

  return (
    <div className={s.backdrop} onClick={onClose}>
      <div className={s.panel} role="dialog" aria-modal="true" aria-label={`Choose a doctor for ${title}`} onClick={(e) => e.stopPropagation()}>
        <div className={s.panelHead}>
          <div>
            <h2>{title}</h2>
            <p className={ui.muted} style={{ margin: 0 }}>
              {SHIFT_HOURS[seat.shift]} · {extra ? `extra doctor (${seat.seat + 1} in this shift)` : `seat ${seat.seat + 1}`} · now:{' '}
              <strong>{current ?? 'empty'}</strong>
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>

        {/* A new extra seat has nothing to swap or empty yet: just pick a doctor. */}
        {(row?.doctorId || !extra) && (
          <div className={ui.actions}>
            <Button small onClick={onSwap}>
              ⇄ Swap with another seat
            </Button>
            {row?.doctorId &&
              (extra ? (
                <Button small variant="danger" onClick={onRemoveSeat}>
                  Remove extra doctor
                </Button>
              ) : (
                <Button small variant="danger" onClick={() => onPick(null)}>
                  Leave empty
                </Button>
              ))}
          </div>
        )}

        <input ref={search} className={ui.input} placeholder="Search doctor…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search doctor" />

        <ul className={s.options}>
          {shown.map((o) => (
            <li key={o.doctorId}>
              <button
                type="button"
                className={s.option}
                data-status={o.status}
                data-current={o.current || undefined}
                disabled={o.status === 'blocked' || o.current}
                onClick={() => onPick(o.doctorId)}
              >
                <span className={s.optionMain}>
                  <strong>{names.get(o.doctorId) ?? 'Unknown'}</strong>
                  <span className={ui.muted}>{levels.get(o.doctorId)}</span>
                </span>
                <span className={s.optionSide}>
                  {o.current ? (
                    <Badge tone="info">In this seat</Badge>
                  ) : (
                    o.shiftsAfter > o.target ? (
                      <Badge tone="ok">
                        ✓ {o.shiftsNow}/{o.target} full
                      </Badge>
                    ) : (
                      <Badge tone={o.shiftsAfter === o.target ? 'ok' : 'neutral'}>
                        {o.shiftsAfter}/{o.target}
                      </Badge>
                    )
                  )}
                </span>
                {o.notes.length > 0 && (
                  <span className={s.optionNotes}>
                    {o.notes.map((n) => (
                      <small key={n}>{o.status === 'good' ? 'ℹ' : '⚠'} {n}</small>
                    ))}
                  </span>
                )}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className={ui.empty}>No doctor matches “{query}”.</li>}
        </ul>
        <p className={ui.muted} style={{ margin: 0, fontSize: '0.82rem' }}>
          The number is the doctor's shifts this month if you pick them, over their target.
          {!row?.doctorId && remaining > 1 && ' After you pick, the next empty seat opens.'}
        </p>
      </div>
    </div>
  )
}
