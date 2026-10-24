import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { addMonths, monthLabel, shortDate, weekdayName, weekdayShort } from '../../domain/dates'
import { neighbourShifts, seatCounter, seatKey, seatOptions, validateSchedule, type IssueKind, type SeatRef } from '../../domain/editor'
import { buildExportTable } from '../../domain/exportTable'
import { leaveDaysIn } from '../../domain/leave'
import { DEFAULT_HIGHLIGHT, DEFAULT_SETTINGS, SHIFT_LABEL, type Doctor, type Level, type Month } from '../../domain/types'
import { Badge, Button, Card, ConfirmButton, Notice, PageHeader, ui } from '../../design/ui'
import { backupFileName, exportBackup } from '../../services/backup'
import { db } from '../../services/db'
import { downloadText } from '../../services/download'
import { assignSeat, removeSeat, setMonthStatus, swapSeats, undo, type Undo } from '../../services/editor'
import { getOrCreateMonth, saveSettings, setActive, setAllActive, setTargetOverride } from '../../services/repos'
import { balanceFor, buildMonthContext, clearSchedule } from '../../services/schedule'
import { ShareCard } from '../export/ShareCard'
import { BalanceCard } from './BalanceCard'
import { DoctorSummary } from './DoctorSummary'
import { ScheduleGrid } from './ScheduleGrid'
import { SeatPanel } from './SeatPanel'
import { WarningsCard } from './WarningsCard'
import s from './month.module.css'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Sort key that follows the calendar: date, then day before night, then seat. */
function order(s: SeatRef): string {
  return `${s.date}|${s.shift === 'D' ? 0 : 1}|${s.seat}`
}

/** Short text shown on a seat that breaks a rule. */
const SEAT_PROBLEM: Partial<Record<IssueKind, string>> = {
  leave: 'On leave this day',
  double: 'Twice in this shift',
  inactive: "Not on this month's rota",
}

export function MonthPage() {
  const { monthId = '' } = useParams()
  const valid = MONTH_RE.test(monthId)
  const navigate = useNavigate()

  useEffect(() => {
    if (valid) void getOrCreateMonth(monthId)
  }, [monthId, valid])

  const month = useLiveQuery(() => (valid ? db.months.get(monthId) : undefined), [monthId, valid])
  const levels = useLiveQuery(() => db.levels.toArray(), [])
  const doctors = useLiveQuery(() => db.doctors.toArray(), [])
  const leaves = useLiveQuery(() => db.leaves.toArray(), [])
  const settings = useLiveQuery(async () => (await db.settings.get('main')) ?? DEFAULT_SETTINGS, [])
  const assignments = useLiveQuery(() => db.assignments.where('monthId').equals(monthId).toArray(), [monthId])
  // Last night of the previous month and first day shift of the next: for 24h runs across the month change.
  const neighbours = useLiveQuery(async () => {
    if (!valid) return []
    const { previousNight, nextDay } = neighbourShifts(monthId)
    const rows = await db.assignments.where('monthId').anyOf([addMonths(monthId, -1), addMonths(monthId, 1)]).toArray()
    return rows.filter((r) => (r.date === previousNight && r.shift === 'N') || (r.date === nextDay && r.shift === 'D'))
  }, [monthId, valid])
  const [selected, setSelected] = useState<SeatRef>()
  const [swapFrom, setSwapFrom] = useState<SeatRef>()
  const [history, setHistory] = useState<Undo[]>([])
  const [editError, setEditError] = useState<string>()
  const [justFinalized, setJustFinalized] = useState(false)
  const closePanel = useCallback(() => setSelected(undefined), [])

  // A new month starts with a clean slate: no open seat, no undo history.
  useEffect(() => {
    setSelected(undefined)
    setSwapFrom(undefined)
    setHistory([])
    setJustFinalized(false)
  }, [monthId])

  if (!valid) return <Navigate to="/" replace />
  if (!month || !levels || !doctors || !leaves || !settings || !assignments) return null

  const ctx = buildMonthContext(monthId, month, settings, levels, doctors, leaves)
  const balance = balanceFor(ctx)
  const names = new Map(doctors.map((d) => [d.id, d.name]))
  const levelNames = new Map(doctors.map((d) => [d.id, levels.find((l) => l.id === d.levelId)?.name ?? '']))
  const final = month.status === 'final'
  const highlight = settings.highlightColor ?? DEFAULT_HIGHLIGHT
  // The usual seats, plus extra doctors she added to busy shifts.
  const seats = assignments.filter((a) => a.seat < ctx.seatsPerShift || a.doctorId)
  const seatsIn = seatCounter(seats, ctx.seatsPerShift)
  const seatCount = ctx.dates.reduce((sum, date) => sum + seatsIn(date, 'D') + seatsIn(date, 'N'), 0)
  const filled = seats.filter((a) => a.doctorId).length
  const issues = validateSchedule(seats, { dates: ctx.dates, seatsPerShift: ctx.seatsPerShift, doctors: ctx.doctors, leave: ctx.leave })
  const problems = new Map<string, string>()
  for (const i of issues) {
    const text = SEAT_PROBLEM[i.kind]
    if (text && i.date && i.shift && i.seat !== undefined) problems.set(seatKey({ date: i.date, shift: i.shift, seat: i.seat }), text)
  }
  const rowAt = (seat: SeatRef) => seats.find((a) => seatKey(a) === seatKey(seat))
  const emptySeats = issues
    .filter((i) => i.kind === 'empty')
    .map((i) => ({ date: i.date!, shift: i.shift!, seat: i.seat! }))
    .sort((a, b) => order(a).localeCompare(order(b)))
  /** The next empty seat in the month after this one (wrapping to the start). */
  const nextEmpty = (from: SeatRef) =>
    emptySeats.find((s) => order(s) > order(from)) ?? emptySeats.find((s) => seatKey(s) !== seatKey(from))

  /** Runs one hand edit and remembers how to undo it. */
  const edit = async (change: Promise<Undo>) => {
    setEditError(undefined)
    try {
      const u = await change
      setHistory((h) => [...h.slice(-49), u])
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not save the change.')
    }
  }

  const onSeat = (seat: SeatRef) => {
    if (!swapFrom) return setSelected(seat)
    if (seatKey(swapFrom) !== seatKey(seat)) void edit(swapSeats(monthId, swapFrom, seat))
    setSwapFrom(undefined)
  }

  const undoLast = async () => {
    const last = history.at(-1)
    if (!last) return
    await undo(last)
    setHistory((h) => h.slice(0, -1))
  }

  const finalize = async () => {
    setSwapFrom(undefined)
    setSelected(undefined)
    await setMonthStatus(monthId, 'final')
    setJustFinalized(true)
  }

  const saveBackup = async () => downloadText(backupFileName(), JSON.stringify(await exportBackup(), null, 2))

  const pick = (seat: SeatRef, doctorId: string | null) => {
    const fillingUsualSeat = !rowAt(seat)?.doctorId && seat.seat < ctx.seatsPerShift
    void edit(assignSeat(monthId, seat, doctorId))
    // Filling the month seat by seat: jump straight to the next empty seat.
    setSelected(fillingUsualSeat && doctorId ? nextEmpty(seat) : undefined)
  }

  const go = (n: number) => navigate(`/month/${addMonths(monthId, n)}`)
  const weekendLabel = settings.weekendDays.length === 1 ? `${weekdayName(settings.weekendDays[0]!)}s` : 'Weekend days'

  return (
    <div className={ui.page}>
      <PageHeader
        title={monthLabel(monthId)}
        subtitle={final ? '✓ Final' : `${filled} of ${seatCount} seats filled`}
        actions={
          <div className={s.monthNav}>
            <Button onClick={() => go(-1)} aria-label="Previous month">
              ◀
            </Button>
            <Button onClick={() => go(1)} aria-label="Next month">
              ▶
            </Button>
          </div>
        }
      />

      <div className={s.layout}>
        <DoctorsThisMonth
          key={monthId}
          month={month}
          doctors={doctors}
          levels={levels}
          leaves={leaves}
          maxByDoctor={balance.impossibleTargets}
          targetTotal={balance.targetTotal}
          startOpen={filled === 0}
        />
        <BalanceCard balance={balance} days={ctx.dates.length} seatsPerShift={ctx.seatsPerShift} names={names} />
      </div>

      {filled > 0 && <WarningsCard issues={issues} names={names} onOpen={final ? undefined : setSelected} />}
      <Card title={`Schedule · ${filled} / ${seatCount} seats filled`} actions={final ? <Badge tone="ok">✓ Final</Badge> : undefined}>
        {ctx.doctors.length === 0 && <Notice tone="warn">Tick at least one doctor for this month to start filling the schedule.</Notice>}
        <div className={s.toolbar}>
          {final ? (
            <>
              <span className={ui.muted}>This month is final and can be shared.</span>
              <Button small onClick={() => void setMonthStatus(monthId, 'draft').then(() => setJustFinalized(false))}>
                ✎ Reopen to edit
              </Button>
            </>
          ) : (
            <>
              {swapFrom ? (
                <span className={s.swapBanner}>
                  ⇄ Tap the seat to swap with {rowAt(swapFrom)?.doctorId ? names.get(rowAt(swapFrom)!.doctorId!) : 'the empty seat'} ({weekdayShort(swapFrom.date)}{' '}
                  {shortDate(swapFrom.date)} {SHIFT_LABEL[swapFrom.shift]}){' '}
                  <Button small variant="ghost" onClick={() => setSwapFrom(undefined)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <span className={`${ui.muted} ${s.hint}`}>Tap a seat to choose a doctor.</span>
              )}
              {emptySeats.length > 0 && (
                <Button small variant="primary" onClick={() => setSelected(emptySeats[0])}>
                  ＋ Fill next empty
                </Button>
              )}
              <Button small onClick={() => void undoLast()} disabled={history.length === 0}>
                ↶ Undo{history.length > 0 ? ` (${history.length})` : ''}
              </Button>
              {filled > 0 && (
                <ConfirmButton
                  small
                  confirmLabel="Empty all seats"
                  onConfirm={() => {
                    setHistory([])
                    void clearSchedule(monthId)
                  }}
                >
                  Clear all
                </ConfirmButton>
              )}
              <ConfirmButton
                small
                variant="primary"
                confirmLabel={emptySeats.length ? `Mark final with ${emptySeats.length} empty seats` : 'Yes, mark final'}
                onConfirm={() => void finalize()}
                disabled={filled === 0}
              >
                ✓ Mark as final
              </ConfirmButton>
            </>
          )}
        </div>
        {editError && <Notice tone="danger">{editError}</Notice>}
        {final && justFinalized && (
          <Notice tone="ok">
            <p style={{ marginTop: 0 }}>
              ✓ {monthLabel(monthId)} is final. <strong>Save a backup now</strong>: the schedule lives only in this browser.
            </p>
            <Button small variant="primary" onClick={() => void saveBackup()}>
              ⬇ Save backup
            </Button>
          </Notice>
        )}
        <ScheduleGrid
          dates={ctx.dates}
          seatsIn={seatsIn}
          assignments={seats}
          names={names}
          problems={problems}
          weekendDays={settings.weekendDays}
          weekendColor={highlight}
          selected={selected}
          swapFrom={swapFrom}
          onSeat={final ? undefined : onSeat}
        />
      </Card>
      {filled > 0 && (
        <ShareCard
          table={buildExportTable({ monthId, dates: ctx.dates, seats, names, weekendDays: settings.weekendDays })}
          highlight={highlight}
          onHighlight={(color) => void saveSettings({ highlightColor: color })}
          fileName={`schedule-${monthId}.png`}
          emptySeats={emptySeats.length}
          onHighlightFridays={() => void saveSettings({ weekendDays: [5] })}
        />
      )}
      <DoctorSummary ctx={ctx} assignments={seats} leaves={leaves} levels={levels} monthId={monthId} weekendLabel={weekendLabel} />

      {selected && !final && (
        <SeatPanel
          key={seatKey(selected)}
          seat={selected}
          row={rowAt(selected)}
          options={seatOptions(seats, selected, ctx.doctors, ctx.leave, neighbours ?? [])}
          names={names}
          levels={levelNames}
          remaining={emptySeats.length}
          extra={selected.seat >= ctx.seatsPerShift}
          onRemoveSeat={() => {
            void edit(removeSeat(monthId, selected))
            setSelected(undefined)
          }}
          onPick={(doctorId) => pick(selected, doctorId)}
          onSwap={() => {
            setSwapFrom(selected)
            setSelected(undefined)
          }}
          onClose={closePanel}
        />
      )}
    </div>
  )
}

function DoctorsThisMonth({
  month,
  doctors,
  levels,
  leaves,
  maxByDoctor,
  targetTotal,
  startOpen,
}: {
  month: Month
  doctors: Doctor[]
  levels: Level[]
  leaves: Parameters<typeof leaveDaysIn>[0]
  maxByDoctor: { doctorId: string; max: number }[]
  targetTotal: number
  /** Open while setting up the month; folded away once she is filling seats. */
  startOpen: boolean
}) {
  const [open, setOpen] = useState(startOpen)
  const levelRank = new Map([...levels].sort((a, b) => a.defaultTarget - b.defaultTarget).map((l, i) => [l.id, i]))
  const list = doctors
    .filter((d) => !d.archived)
    .sort((a, b) => (levelRank.get(a.levelId) ?? 99) - (levelRank.get(b.levelId) ?? 99) || a.name.localeCompare(b.name))
  const excluded = new Set(month.excludedDoctorIds)
  const active = new Set(list.filter((d) => !excluded.has(d.id)).map((d) => d.id))
  const activeCount = active.size

  return (
    <Card
      title={`Doctors this month · ${activeCount} of ${list.length}`}
      actions={
        list.length > 0 && (
          <div className={ui.actions}>
            {open && (
              <>
                <Button small onClick={() => void setAllActive(month.id, list.map((d) => d.id), true)} disabled={activeCount === list.length}>
                  All on
                </Button>
                <Button small onClick={() => void setAllActive(month.id, list.map((d) => d.id), false)} disabled={activeCount === 0}>
                  All off
                </Button>
              </>
            )}
            <Button small variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? 'Hide ▲' : 'Show ▼'}
            </Button>
          </div>
        )
      }
    >
      {!open && list.length > 0 ? (
        <p className={ui.muted} style={{ margin: 0 }}>
          {activeCount} doctors on the rota · {targetTotal} shifts in their targets
          {Object.keys(month.targetOverrides).length > 0 && ` · ${Object.keys(month.targetOverrides).length} changed for this month`}
        </p>
      ) : list.length === 0 ? (
        <p className={ui.empty}>No doctors yet. Add them in the Doctors tab.</p>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>On rota</th>
                <th>Doctor</th>
                <th className={ui.num}>Shifts</th>
                <th className={ui.num}>Leave days</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const level = levels.find((l) => l.id === d.levelId)
                const on = active.has(d.id)
                const leaveDays = leaveDaysIn(leaves, d.id, month.id)
                const max = maxByDoctor.find((m) => m.doctorId === d.id)?.max
                return (
                  <tr key={d.id} className={on ? undefined : s.inactive}>
                    <td>
                      <label className={ui.check}>
                        <input type="checkbox" checked={on} onChange={(e) => void setActive(month.id, d.id, e.target.checked)} aria-label={`${d.name} on rota`} />
                      </label>
                    </td>
                    <td>
                      {d.name}
                      <div className={ui.muted} style={{ fontSize: '0.82rem' }}>
                        {level?.name ?? '—'}
                      </div>
                    </td>
                    <td className={ui.num}>
                      <TargetInput
                        key={`${month.id}-${d.id}-${month.targetOverrides[d.id] ?? ''}`}
                        doctor={d}
                        month={month}
                        fallback={level?.defaultTarget ?? 0}
                        disabled={!on}
                      />
                      {max !== undefined && on && (
                        <div>
                          <Badge tone="danger">max {max}</Badge>
                        </div>
                      )}
                    </td>
                    <td className={ui.num}>{leaveDays || <span className={ui.muted}>—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <p className={ui.muted} style={{ margin: 0, fontSize: '0.85rem' }}>
          Shifts come from the level. Type a number to change it for this month only; clear it to go back to the level default.
        </p>
      )}
    </Card>
  )
}

function TargetInput({ doctor, month, fallback, disabled }: { doctor: Doctor; month: Month; fallback: number; disabled: boolean }) {
  const override = month.targetOverrides[doctor.id]
  const [value, setValue] = useState(override === undefined ? '' : String(override))
  const commit = () => {
    const trimmed = value.trim()
    void setTargetOverride(month.id, doctor.id, trimmed === '' ? undefined : Number(trimmed))
  }
  return (
    <input
      className={`${ui.input} ${s.targetInput}`}
      type="number"
      min={0}
      max={62}
      placeholder={String(fallback)}
      value={value}
      disabled={disabled}
      aria-label={`Shifts for ${doctor.name}`}
      style={override !== undefined ? { borderColor: 'var(--primary)', fontWeight: 700 } : undefined}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}
