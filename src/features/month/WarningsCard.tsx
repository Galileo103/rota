import { useState } from 'react'
import { shortDate, weekdayShort } from '../../domain/dates'
import type { Issue, SeatRef } from '../../domain/editor'
import { SHIFT_LABEL } from '../../domain/types'
import { Button, Card, Notice, ui } from '../../design/ui'
import s from './month.module.css'

const SHOW = 8

export function issueText(issue: Issue, names: Map<string, string>): string {
  const who = issue.doctorId ? (names.get(issue.doctorId) ?? 'Unknown doctor') : ''
  const when = issue.date && issue.shift ? `${weekdayShort(issue.date)} ${shortDate(issue.date)} ${SHIFT_LABEL[issue.shift]}` : ''
  switch (issue.kind) {
    case 'empty':
      return `${when}: empty seat`
    case 'leave':
      return `${when}: ${who} is on leave`
    case 'double':
      return `${when}: ${who} is in this shift twice`
    case 'inactive':
      return `${when}: ${who} is not on this month's rota`
    case 'over':
      return `${who}: ${issue.shifts} shifts, target ${issue.target}`
    case 'under':
      return `${who}: ${issue.shifts} shifts, target ${issue.target}`
  }
}

/** Live list of everything that breaks a rule; each seat problem opens that seat. */
export function WarningsCard({ issues, names, onOpen }: { issues: Issue[]; names: Map<string, string>; onOpen?: (seat: SeatRef) => void }) {
  const [all, setAll] = useState(false)
  // Empty seats are expected while she fills the month: one line, not one warning each.
  const empty = issues.filter((i) => i.kind === 'empty')
  const problems = issues.filter((i) => i.severity !== 'info' && i.kind !== 'empty')
  const under = issues.filter((i) => i.kind === 'under')
  const shown = all ? problems : problems.slice(0, SHOW)
  const firstEmpty = empty[0]

  return (
    <Card title={problems.length ? `⚠ ${problems.length} to check` : 'Checks'}>
      {empty.length > 0 && (
        <div className={s.emptyLine}>
          <span>
            <strong>{empty.length}</strong> seats still empty
          </span>
          {firstEmpty && onOpen && (
            <Button small onClick={() => onOpen({ date: firstEmpty.date!, shift: firstEmpty.shift!, seat: firstEmpty.seat! })}>
              Fill next empty
            </Button>
          )}
        </div>
      )}
      {problems.length === 0 ? (
        <Notice tone="ok">{empty.length ? 'No rule broken so far: no leave clashes, nobody over target.' : 'All seats filled and no rule broken.'}</Notice>
      ) : (
        <ul className={s.issues}>
          {shown.map((issue, i) => {
            const seat = issue.date && issue.shift && issue.seat !== undefined ? { date: issue.date, shift: issue.shift, seat: issue.seat } : undefined
            return (
              <li key={i} data-severity={issue.severity}>
                <span>{issueText(issue, names)}</span>
                {seat && onOpen && (
                  <Button small onClick={() => onOpen(seat)}>
                    Fix
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {problems.length > SHOW && (
        <Button small variant="ghost" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${problems.length}`}
        </Button>
      )}
      {under.length > 0 && (
        <p className={ui.muted} style={{ margin: 0 }}>
          <strong>Below target:</strong> {under.map((i) => `${names.get(i.doctorId!) ?? '?'} (${i.shifts}/${i.target})`).join(' · ')}
        </p>
      )}
    </Card>
  )
}
