import { computeStats, type GenSeat } from '../../domain/generator/generate'
import { leaveDaysIn } from '../../domain/leave'
import type { Leave, Level } from '../../domain/types'
import { Card } from '../../design/ui'
import type { MonthContext } from '../../services/schedule'
import s from './doctorSummary.module.css'

type State = 'over' | 'under' | 'full' | 'off'

interface Row {
  id: string
  name: string
  level: string
  target: number
  shifts: number
  days: number
  nights: number
  weekends: number
  longRuns: number
  leaveDays: number
  state: State
}

// Problems first, then who still needs shifts (most left first), then the finished ones.
const STATE_ORDER: Record<State, number> = { over: 0, under: 1, full: 2, off: 3 }

function stateOf(shifts: number, target: number): State {
  if (shifts > target) return 'over'
  if (target === 0) return 'off'
  return shifts === target ? 'full' : 'under'
}

function chipText(r: Row): string {
  switch (r.state) {
    case 'over':
      return `+${r.shifts - r.target} over`
    case 'under':
      return `${r.target - r.shifts} left`
    case 'full':
      return '✓ Full'
    case 'off':
      return 'No shifts'
  }
}

/** Per-doctor progress for the month: how far each doctor is from their target, and how their shifts are spread. */
export function DoctorSummary({
  ctx,
  assignments,
  leaves,
  levels,
  monthId,
  weekendLabel,
}: {
  ctx: MonthContext
  assignments: Pick<GenSeat, 'date' | 'shift' | 'doctorId'>[]
  leaves: Leave[]
  levels: Level[]
  monthId: string
  weekendLabel: string
}) {
  const stats = computeStats({ doctors: ctx.doctors, weekendDays: ctx.weekendDays }, assignments)
  const byId = new Map(ctx.doctors.map((d) => [d.id, d.doctor]))
  const rows: Row[] = stats
    .map((st) => {
      const doctor = byId.get(st.doctorId)
      return {
        id: st.doctorId,
        name: doctor?.name ?? 'Unknown',
        level: levels.find((l) => l.id === doctor?.levelId)?.name ?? '',
        target: st.target,
        shifts: st.shifts,
        days: st.shifts - st.nights,
        nights: st.nights,
        weekends: st.weekends,
        longRuns: st.longRuns,
        leaveDays: leaveDaysIn(leaves, st.doctorId, monthId),
        state: stateOf(st.shifts, st.target),
      }
    })
    .sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        (a.state === 'under' ? b.target - b.shifts - (a.target - a.shifts) : 0) ||
        a.name.localeCompare(b.name),
    )

  const full = rows.filter((r) => r.state === 'full').length
  const over = rows.filter((r) => r.state === 'over').length
  const left = rows.reduce((sum, r) => sum + Math.max(0, r.target - r.shifts), 0)

  return (
    <Card title="Per doctor">
      <div className={s.summary}>
        <div className={s.stat} data-tone="ok">
          <strong>
            {full}
            <small> / {rows.length}</small>
          </strong>
          <span>doctors full</span>
        </div>
        <div className={s.stat}>
          <strong>{left}</strong>
          <span>shifts left to give</span>
        </div>
        {over > 0 && (
          <div className={s.stat} data-tone="danger">
            <strong>{over}</strong>
            <span>over target</span>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className={s.none}>No doctors on the rota this month.</p>
      ) : (
        <table className={s.table}>
          <thead>
            <tr>
              <th>Doctor</th>
              <th>Shifts</th>
              <th className={s.num}>Day · Night</th>
              <th className={s.num}>{weekendLabel}</th>
              <th className={s.num} title="Back-to-back shifts (24 hours)">
                24h runs
              </th>
              <th className={s.num}>Leave</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.target > 0 ? Math.min(100, (r.shifts / r.target) * 100) : r.shifts > 0 ? 100 : 0
              return (
                <tr key={r.id} data-state={r.state}>
                  <td className={s.who}>
                    <strong>{r.name}</strong>
                    {r.level && <span>{r.level}</span>}
                  </td>
                  <td className={s.progressCell}>
                    <div className={s.progress}>
                      <div
                        className={s.bar}
                        role="progressbar"
                        aria-label={`${r.name}: ${r.shifts} of ${r.target} shifts`}
                        aria-valuemin={0}
                        aria-valuemax={r.target}
                        aria-valuenow={r.shifts}
                      >
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <span className={s.count}>
                        {r.shifts}
                        <small> / {r.target}</small>
                      </span>
                      <span className={s.chip}>{chipText(r)}</span>
                    </div>
                  </td>
                  <td className={s.num} data-label="Day · Night">
                    <span className={s.pair} data-uneven={Math.abs(r.days - r.nights) > 2 || undefined} title={`${r.days} day, ${r.nights} night shifts`}>
                      <span>☀️ {r.days}</span>
                      <span>🌙 {r.nights}</span>
                    </span>
                  </td>
                  <td className={s.num} data-label={weekendLabel}>
                    <Value n={r.weekends} />
                  </td>
                  <td className={s.num} data-label="24h runs">
                    <Value n={r.longRuns} />
                  </td>
                  <td className={s.num} data-label="Leave">
                    <Value n={r.leaveDays} suffix="d" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function Value({ n, suffix = '' }: { n: number; suffix?: string }) {
  return n ? (
    <span className={s.value}>
      {n}
      {suffix && <small>{suffix}</small>}
    </span>
  ) : (
    <span className={s.zero} aria-label="none">
      —
    </span>
  )
}
