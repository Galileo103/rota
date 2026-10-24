import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { addMonths, monthLabel, monthOf, shortDate, todayIso, weekdayShort } from '../../domain/dates'
import { leaveDaysIn, leaveEnd, leaveOverlapsMonth, overlappingLeave } from '../../domain/leave'
import type { Doctor, Leave, LeaveSource } from '../../domain/types'
import { Badge, Button, Card, ConfirmButton, Field, Notice, PageHeader, ui } from '../../design/ui'
import { db } from '../../services/db'
import { deleteLeave, newId, saveLeave } from '../../services/repos'

const SOURCES: { id: LeaveSource; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'sms', label: 'SMS' },
  { id: 'call', label: 'Call' },
  { id: 'other', label: 'Other' },
]

export function LeavePage() {
  const doctors = useLiveQuery(() => db.doctors.toArray(), [])
  const leaves = useLiveQuery(() => db.leaves.toArray(), [])
  const [month, setMonth] = useState(() => addMonths(monthOf(todayIso()), 1))
  const [doctorFilter, setDoctorFilter] = useState('')
  const [editing, setEditing] = useState<Leave>()

  const names = useMemo(() => new Map((doctors ?? []).map((d) => [d.id, d.name])), [doctors])
  if (!doctors || !leaves) return null

  const current = doctors.filter((d) => !d.archived).sort((a, b) => a.name.localeCompare(b.name))
  const shown = leaves
    .filter((l) => leaveOverlapsMonth(l, month) && (!doctorFilter || l.doctorId === doctorFilter))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || (names.get(a.doctorId) ?? '').localeCompare(names.get(b.doctorId) ?? ''))
  const onLeaveThisMonth = [...new Set(leaves.filter((l) => leaveOverlapsMonth(l, month)).map((l) => l.doctorId))]
    .map((id) => ({ id, name: names.get(id) ?? 'Unknown', month: leaveDaysIn(leaves, id, month), year: leaveDaysIn(leaves, id, month.slice(0, 4)) }))
    .sort((a, b) => b.month - a.month || a.name.localeCompare(b.name))

  return (
    <div className={ui.page}>
      <PageHeader title="Leave" subtitle="Type in what doctors send by WhatsApp, SMS or a call. A day on leave blocks both shifts." />

      <Card title={editing ? 'Edit leave' : 'Add leave'}>
        {current.length === 0 ? (
          <p className={ui.empty}>Add doctors first (Doctors tab).</p>
        ) : (
          <LeaveForm
            key={editing?.id ?? 'new'}
            doctors={editing && !current.some((d) => d.id === editing.doctorId) ? [...current, ...doctors.filter((d) => d.id === editing.doctorId)] : current}
            leaves={leaves}
            leave={editing}
            onDone={() => setEditing(undefined)}
          />
        )}
      </Card>

      <Card
        title={`Leave in ${monthLabel(month)}`}
        actions={
          <div className={ui.actions}>
            <Button small onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
              ◀
            </Button>
            <input className={ui.input} style={{ width: 160 }} type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
            <Button small onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
              ▶
            </Button>
            <select className={ui.input} style={{ width: 190 }} value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} aria-label="Filter by doctor">
              <option value="">All doctors</option>
              {[...doctors].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {shown.length === 0 ? (
          <p className={ui.empty}>No leave recorded for this month.</p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={`${ui.table} ${ui.stack}`}>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>From</th>
                  <th>To</th>
                  <th className={ui.num}>Days</th>
                  <th>Details</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id}>
                    <td data-wide>
                      <strong>{names.get(l.doctorId) ?? 'Unknown'}</strong>
                    </td>
                    <td data-label="From">
                      {weekdayShort(l.startDate)} {shortDate(l.startDate)}
                    </td>
                    <td data-label="To">
                      {weekdayShort(leaveEnd(l))} {shortDate(leaveEnd(l))}
                    </td>
                    <td className={ui.num} data-label="Days">{l.days}</td>
                    <td data-wide>
                      <span className={ui.actions}>
                        {l.noteRequired && <Badge tone="warn">📄 Doctor's note required</Badge>}
                        {l.source && <Badge>{SOURCES.find((s) => s.id === l.source)?.label}</Badge>}
                        {l.comment && <span className={ui.muted}>{l.comment}</span>}
                      </span>
                    </td>
                    <td className={ui.num} data-wide>
                      <span className={ui.actions} style={{ justifyContent: 'flex-end' }} data-end>
                        <Button small onClick={() => setEditing(l)}>
                          Edit
                        </Button>
                        <ConfirmButton small confirmLabel="Delete" onConfirm={() => void deleteLeave(l.id)}>
                          Delete
                        </ConfirmButton>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {onLeaveThisMonth.length > 0 && (
        <Card title="Leave days per doctor">
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th className={ui.num}>{monthLabel(month)}</th>
                  <th className={ui.num}>Whole {month.slice(0, 4)}</th>
                </tr>
              </thead>
              <tbody>
                {onLeaveThisMonth.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className={ui.num}>{r.month}</td>
                    <td className={ui.num}>{r.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function LeaveForm({ doctors, leaves, leave, onDone }: { doctors: Doctor[]; leaves: Leave[]; leave?: Leave; onDone: () => void }) {
  const [doctorId, setDoctorId] = useState(leave?.doctorId ?? '')
  const [startDate, setStartDate] = useState(leave?.startDate ?? todayIso())
  const [days, setDays] = useState(String(leave?.days ?? 1))
  const [noteRequired, setNoteRequired] = useState(leave?.noteRequired ?? false)
  const [source, setSource] = useState<LeaveSource | undefined>(leave?.source)
  const [comment, setComment] = useState(leave?.comment ?? '')
  const [saved, setSaved] = useState<string>()

  const dayCount = Math.max(1, Math.floor(Number(days) || 1))
  const datesValid = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && Number(days) >= 1
  const valid = !!doctorId && datesValid
  const lastDay = datesValid ? leaveEnd({ startDate, days: dayCount }) : undefined
  const overlap = valid ? overlappingLeave(leaves, { id: leave?.id ?? '', doctorId, startDate, days: dayCount }) : undefined

  const submit = async () => {
    if (!valid) return
    await saveLeave({
      id: leave?.id ?? newId(),
      doctorId,
      startDate,
      days: dayCount,
      noteRequired,
      source,
      comment,
      createdAt: leave?.createdAt ?? new Date().toISOString(),
    })
    const name = doctors.find((d) => d.id === doctorId)?.name
    if (leave) return onDone()
    setSaved(`Saved: ${name}, ${dayCount} day${dayCount > 1 ? 's' : ''} from ${shortDate(startDate)}.`)
    setDays('1')
    setNoteRequired(false)
    setComment('')
  }

  return (
    <form
      style={{ display: 'grid', gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className={ui.formRow}>
        <Field label="Doctor">
          <select className={ui.input} value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required>
            <option value="">Choose…</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="First day">
          <input className={ui.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="Number of days">
          <input className={ui.input} type="number" min={1} max={366} value={days} onChange={(e) => setDays(e.target.value)} required />
        </Field>
        <Field label="Last day">
          <input className={ui.input} readOnly tabIndex={-1} value={lastDay ? `${weekdayShort(lastDay)} ${shortDate(lastDay)}` : ''} />
        </Field>
      </div>
      <div className={ui.formRow}>
        <label className={ui.check}>
          <input type="checkbox" checked={noteRequired} onChange={(e) => setNoteRequired(e.target.checked)} />
          📄 Doctor's note required
        </label>
        <Field label="Received by (optional)">
          <select className={ui.input} value={source ?? ''} onChange={(e) => setSource((e.target.value || undefined) as LeaveSource | undefined)}>
            <option value="">—</option>
            {SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Comment (optional)">
          <input className={ui.input} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. conference, sick" />
        </Field>
      </div>
      {overlap && (
        <Notice tone="warn">
          This overlaps another leave of the same doctor ({shortDate(overlap.startDate)} → {shortDate(leaveEnd(overlap))}). Overlapping days are counted once.
        </Notice>
      )}
      {saved && !leave && <Notice tone="ok">{saved}</Notice>}
      <div className={ui.actions}>
        <Button type="submit" variant="primary" disabled={!valid}>
          {leave ? 'Save changes' : 'Add leave'}
        </Button>
        {leave && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
