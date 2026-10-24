import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { weekdayName } from '../../domain/dates'
import { DEFAULT_SETTINGS } from '../../domain/types'
import { Button, Card, Field, Notice, PageHeader, ui } from '../../design/ui'
import { backupFileName, exportBackup, importBackup } from '../../services/backup'
import { db } from '../../services/db'
import { downloadText } from '../../services/download'
import { saveSettings } from '../../services/repos'

const WEEK = [6, 0, 1, 2, 3, 4, 5] // Saturday first, as on Egyptian calendars

export function SettingsPage() {
  const settings = useLiveQuery(async () => (await db.settings.get('main')) ?? DEFAULT_SETTINGS, [])
  const [pending, setPending] = useState<{ name: string; text: string }>()
  const [result, setResult] = useState<{ tone: 'ok' | 'danger'; text: string }>()
  if (!settings) return null

  const toggleDay = (day: number) => {
    const days = settings.weekendDays.includes(day) ? settings.weekendDays.filter((d) => d !== day) : [...settings.weekendDays, day]
    void saveSettings({ weekendDays: days.sort() })
  }

  const doExport = async () => {
    downloadText(backupFileName(), JSON.stringify(await exportBackup(), null, 2))
    setResult({ tone: 'ok', text: 'Backup saved to your Downloads folder. Keep a copy somewhere safe (Google Drive, email to yourself).' })
  }

  const doImport = async () => {
    if (!pending) return
    try {
      const summary = await importBackup(pending.text)
      setResult({ tone: 'ok', text: `Restored ${summary.doctors} doctors, ${summary.leaves} leave entries and ${summary.months} months.` })
    } catch (e) {
      setResult({ tone: 'danger', text: e instanceof Error ? e.message : 'Restore failed.' })
    } finally {
      setPending(undefined)
    }
  }

  return (
    <div className={ui.page}>
      <PageHeader title="Settings" />

      <Card title="Highlighted days">
        <p className={ui.muted}>
          These days are coloured in the schedule and the shared image, and counted per doctor so you can share them fairly. Tap a day to turn it on or off.
        </p>
        <div className={ui.actions}>
          {WEEK.map((day) => {
            const on = settings.weekendDays.includes(day)
            return (
              <Button key={day} variant={on ? 'primary' : 'default'} onClick={() => toggleDay(day)} aria-pressed={on}>
                {on ? '✓ ' : ''}
                {weekdayName(day)}
              </Button>
            )
          })}
        </div>
        {settings.weekendDays.length === 0 && <Notice tone="warn">No day is highlighted. Turn on Friday to colour Fridays again.</Notice>}
      </Card>

      <Card title="Doctors per shift">
        <div className={ui.formRow} style={{ maxWidth: 360 }}>
          <Field label="Each 12-hour shift needs">
            <select className={ui.input} value={settings.doctorsPerShift} onChange={(e) => void saveSettings({ doctorsPerShift: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} doctor{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className={ui.muted}>Changes how many seats each shift has in the schedule.</p>
      </Card>

      <Card title="Backup">
        <p className={ui.muted}>
          Everything is stored only in this browser. Save a backup after each month, and use it to move to a new laptop or phone.
        </p>
        <div className={ui.actions}>
          <Button variant="primary" onClick={() => void doExport()}>
            ⬇ Save backup
          </Button>
          <label className={`${ui.button}`} style={{ cursor: 'pointer' }}>
            ⬆ Restore from file…
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) setPending({ name: file.name, text: await file.text() })
              }}
            />
          </label>
        </div>
        {pending && (
          <Notice tone="warn">
            <p style={{ marginTop: 0 }}>
              Restoring <strong>{pending.name}</strong> replaces <strong>all</strong> current doctors, leave and schedules.
            </p>
            <div className={ui.actions}>
              <Button variant="danger" onClick={() => void doImport()}>
                Replace everything
              </Button>
              <Button variant="ghost" onClick={() => setPending(undefined)}>
                Cancel
              </Button>
            </div>
          </Notice>
        )}
        {result && <Notice tone={result.tone}>{result.text}</Notice>}
      </Card>
    </div>
  )
}
