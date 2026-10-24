import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { Doctor, Level } from '../../domain/types'
import { Badge, Button, Card, ConfirmButton, Field, Notice, PageHeader, ui } from '../../design/ui'
import { db } from '../../services/db'
import { deleteLevel, newId, saveDoctor, saveLevel, setArchived } from '../../services/repos'

export function DoctorsPage() {
  const levels = useLiveQuery(() => db.levels.toArray(), [])
  const doctors = useLiveQuery(() => db.doctors.toArray(), [])
  if (!levels || !doctors) return null

  const sortedLevels = [...levels].sort((a, b) => a.defaultTarget - b.defaultTarget || a.name.localeCompare(b.name))
  const current = doctors.filter((d) => !d.archived).sort(byName)
  const archived = doctors.filter((d) => d.archived).sort(byName)

  return (
    <div className={ui.page}>
      <PageHeader title="Doctors" subtitle={`${current.length} doctors · each level sets the default number of shifts per month`} />
      <LevelsCard levels={sortedLevels} doctors={doctors} />
      <Card title="Add a doctor">
        <DoctorForm levels={sortedLevels} />
      </Card>
      <Card title="Doctors">
        {current.length === 0 ? (
          <p className={ui.empty}>No doctors yet. Add the first one above.</p>
        ) : (
          <DoctorTable doctors={current} levels={sortedLevels} />
        )}
      </Card>
      {archived.length > 0 && (
        <Card title={`Archived (${archived.length})`}>
          <p className={ui.muted}>Archived doctors are kept for past months but are not offered for new schedules.</p>
          <DoctorTable doctors={archived} levels={sortedLevels} />
        </Card>
      )}
    </div>
  )
}

function byName(a: Doctor, b: Doctor) {
  return a.name.localeCompare(b.name)
}

function LevelsCard({ levels, doctors }: { levels: Level[]; doctors: Doctor[] }) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('10')
  const [error, setError] = useState<string>()

  const add = async () => {
    if (!name.trim()) return
    await saveLevel({ id: newId(), name, defaultTarget: Number(target) || 0 })
    setName('')
  }

  return (
    <Card title="Levels">
      <div className={ui.tableWrap}>
        <table className={`${ui.table} ${ui.stack}`}>
          <thead>
            <tr>
              <th>Level</th>
              <th className={ui.num}>Shifts / month</th>
              <th className={ui.num}>Doctors</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => (
              <LevelRow
                key={level.id}
                level={level}
                used={doctors.filter((d) => d.levelId === level.id).length}
                onDelete={async () => {
                  setError(undefined)
                  if (!(await deleteLevel(level.id))) setError(`“${level.name}” still has doctors. Move them to another level first.`)
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      <form
        className={ui.formRow}
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <Field label="New level">
          <input className={ui.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior resident" />
        </Field>
        <Field label="Shifts / month">
          <input className={ui.input} type="number" min={0} max={62} value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <div>
          <Button type="submit" disabled={!name.trim()}>
            Add level
          </Button>
        </div>
      </form>
    </Card>
  )
}

function LevelRow({ level, used, onDelete }: { level: Level; used: number; onDelete: () => void }) {
  const [name, setName] = useState(level.name)
  const [target, setTarget] = useState(String(level.defaultTarget))
  const commit = () => {
    if (!name.trim()) return setName(level.name)
    void saveLevel({ ...level, name, defaultTarget: Number(target) || 0 })
  }
  return (
    <tr>
      <td data-wide data-label="Level">
        <input className={ui.input} aria-label="Level name" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} />
      </td>
      <td className={ui.num} data-label="Shifts / month">
        <input
          className={ui.input}
          style={{ maxWidth: 90, textAlign: 'right' }}
          aria-label={`Shifts per month for ${level.name}`}
          type="number"
          min={0}
          max={62}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onBlur={commit}
        />
      </td>
      <td className={ui.num} data-label="Doctors">
        {used}
      </td>
      <td className={ui.num}>
        <ConfirmButton small confirmLabel="Delete" onConfirm={onDelete} disabled={used > 0}>
          Delete
        </ConfirmButton>
      </td>
    </tr>
  )
}

function DoctorForm({ levels, doctor, onDone }: { levels: Level[]; doctor?: Doctor; onDone?: () => void }) {
  const [name, setName] = useState(doctor?.name ?? '')
  const [levelId, setLevelId] = useState(doctor?.levelId ?? levels.at(-1)?.id ?? '')
  const [phone, setPhone] = useState(doctor?.phone ?? '')

  const submit = async () => {
    if (!name.trim() || !levelId) return
    await saveDoctor({ id: doctor?.id ?? newId(), name, levelId, phone, archived: doctor?.archived ?? false })
    if (!doctor) {
      setName('')
      setPhone('')
    }
    onDone?.()
  }

  return (
    <form
      className={ui.formRow}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label="Name">
        <input className={ui.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Sara Ahmed" autoFocus={!!doctor} />
      </Field>
      <Field label="Level">
        <select className={ui.input} value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.defaultTarget} shifts)
            </option>
          ))}
        </select>
      </Field>
      <Field label="Phone (optional)">
        <input className={ui.input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <div className={ui.actions}>
        <Button type="submit" variant="primary" disabled={!name.trim() || !levelId}>
          {doctor ? 'Save' : 'Add doctor'}
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

function DoctorTable({ doctors, levels }: { doctors: Doctor[]; levels: Level[] }) {
  const [editing, setEditing] = useState<string>()
  return (
    <div className={ui.tableWrap}>
      <table className={`${ui.table} ${ui.stack}`}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Level</th>
            <th>Phone</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {doctors.map((d) =>
            editing === d.id ? (
              <tr key={d.id}>
                <td colSpan={4} data-wide>
                  <DoctorForm levels={levels} doctor={d} onDone={() => setEditing(undefined)} />
                </td>
              </tr>
            ) : (
              <tr key={d.id}>
                <td data-wide>
                  <strong>{d.name}</strong>
                </td>
                <td data-label="Level">
                  <Badge>{levels.find((l) => l.id === d.levelId)?.name ?? '—'}</Badge>
                </td>
                <td data-label="Phone">{d.phone ?? <span className={ui.muted}>—</span>}</td>
                <td className={ui.num}>
                  <span className={ui.actions} style={{ justifyContent: 'flex-end' }} data-end>
                    <Button small onClick={() => setEditing(d.id)}>
                      Edit
                    </Button>
                    {d.archived ? (
                      <Button small onClick={() => void setArchived(d.id, false)}>
                        Restore
                      </Button>
                    ) : (
                      <ConfirmButton small confirmLabel="Archive" onConfirm={() => void setArchived(d.id, true)}>
                        Archive
                      </ConfirmButton>
                    )}
                  </span>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
