import type { BalanceReport } from '../../domain/balance'
import { shortDate, weekdayShort } from '../../domain/dates'
import { Card, Notice, ui } from '../../design/ui'
import s from './month.module.css'

const MAX_LISTED = 6

/** "Sun 1 Nov (1 free) · … and 12 more days" — long lists stay readable. */
function dayList(days: { date: string; available: number }[]) {
  const listed = days.slice(0, MAX_LISTED).map((d) => `${weekdayShort(d.date)} ${shortDate(d.date)} (${d.available} free)`)
  const rest = days.length - listed.length
  return listed.join(' · ') + (rest > 0 ? ` · and ${rest} more day${rest > 1 ? 's' : ''}` : '')
}

export function BalanceCard({
  balance,
  days,
  seatsPerShift,
  names,
}: {
  balance: BalanceReport
  days: number
  seatsPerShift: number
  names: Map<string, string>
}) {
  const { seats, targetTotal, diff } = balance
  const fill = seats > 0 ? Math.min(100, (targetTotal / seats) * 100) : 0
  return (
    <Card title="Balance check">
      <div className={s.meter} aria-hidden="true">
        <div className={s.meterFill} data-tone={diff === 0 ? 'ok' : 'warn'} style={{ width: `${fill}%` }} />
      </div>
      <div className={s.balanceNumbers}>
        <div>
          <strong>{seats}</strong>
          <span>
            seats to fill ({days} days × 2 shifts × {seatsPerShift})
          </span>
        </div>
        <div>
          <strong>{targetTotal}</strong>
          <span>shifts in doctors' targets</span>
        </div>
      </div>
      {diff === 0 && <Notice tone="ok">Targets match the seats exactly.</Notice>}
      {diff < 0 && (
        <Notice tone="warn">
          <strong>{-diff} seats will stay empty.</strong> Raise some targets or add doctors to this month.
        </Notice>
      )}
      {diff > 0 && (
        <Notice tone="warn">
          <strong>{diff} more target shifts than seats.</strong> Some doctors will end below their target. Lower a few targets to decide who.
        </Notice>
      )}
      {balance.impossibleTargets.length > 0 && (
        <Notice tone="danger">
          <strong>Targets too high for their leave:</strong>{' '}
          {balance.impossibleTargets.map((t) => `${names.get(t.doctorId) ?? '?'} (${t.target}, can do at most ${t.max})`).join(' · ')}
        </Notice>
      )}
      {balance.shortDays.length > 0 && (
        <Notice tone="danger">
          <strong>Not enough doctors free:</strong> {dayList(balance.shortDays)}. Some seats on these days will stay empty.
        </Notice>
      )}
      {balance.tightDays.length > 0 && (
        <p className={ui.muted}>
          Fewer than {seatsPerShift * 2} doctors free (someone will work 24h): {dayList(balance.tightDays)}
        </p>
      )}
    </Card>
  )
}
