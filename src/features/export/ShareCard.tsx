import { useEffect, useState } from 'react'
import type { ExportTable } from '../../domain/exportTable'
import { DEFAULT_HIGHLIGHT } from '../../domain/types'
import { Button, Card, Notice, ui } from '../../design/ui'
import { canvasToBlob, drawSchedule } from './drawSchedule'
import s from './share.module.css'

const SWATCHES = [
  { color: DEFAULT_HIGHLIGHT, name: 'Peach' },
  { color: '#FFF2CC', name: 'Yellow' },
  { color: '#DDEBF7', name: 'Blue' },
  { color: '#E2EFDA', name: 'Green' },
  { color: '#EDEDED', name: 'Grey' },
]

/** Preview of the schedule image, the weekend colour, and Share / Download. */
export function ShareCard({
  table,
  highlight,
  onHighlight,
  fileName,
  emptySeats,
  onHighlightFridays,
}: {
  table: ExportTable
  highlight: string
  onHighlight: (color: string) => void
  fileName: string
  emptySeats: number
  /** Turns Friday highlighting back on when no day is highlighted. */
  onHighlightFridays: () => void
}) {
  const nothingHighlighted = !table.rows.some((r) => r.highlight)
  const [preview, setPreview] = useState<string>()
  const [status, setStatus] = useState<{ tone: 'ok' | 'danger'; text: string }>()
  const key = JSON.stringify(table)

  // Redraw shortly after the last change so filling seats stays smooth.
  useEffect(() => {
    const t = setTimeout(() => setPreview(drawSchedule(table, { highlight, scale: 1 })?.toDataURL('image/png')), 250)
    return () => clearTimeout(t)
    // `key` stands for `table`'s contents, which is a new object every render.
  }, [key, highlight])

  const makeFile = async (): Promise<File | null> => {
    const canvas = drawSchedule(table, { highlight })
    const blob = canvas && (await canvasToBlob(canvas))
    return blob ? new File([blob], fileName, { type: 'image/png' }) : null
  }

  const download = async () => {
    const file = await makeFile()
    if (!file) return setStatus({ tone: 'danger', text: 'Could not create the image on this device.' })
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setStatus({ tone: 'ok', text: `Saved ${fileName} to Downloads.` })
  }

  const share = async () => {
    const file = await makeFile()
    if (!file) return setStatus({ tone: 'danger', text: 'Could not create the image on this device.' })
    if (!navigator.canShare?.({ files: [file] })) return download()
    try {
      await navigator.share({ files: [file], title: table.title })
      setStatus(undefined)
    } catch (e) {
      // Closing the share sheet is not an error.
      if ((e as Error).name !== 'AbortError') setStatus({ tone: 'danger', text: 'Sharing failed. Use Download instead.' })
    }
  }

  return (
    <Card title="Share schedule">
      <div className={s.layout}>
        <div className={s.previewBox}>
          {preview ? <img className={s.preview} src={preview} alt={table.title} /> : <p className={ui.muted}>Preview not available.</p>}
        </div>
        <div className={s.side}>
          <div>
            <h3 className={s.label}>Friday colour</h3>
            <div className={s.swatches} role="radiogroup" aria-label="Friday colour">
              {SWATCHES.map((w) => (
                <button
                  key={w.color}
                  type="button"
                  role="radio"
                  aria-checked={highlight.toLowerCase() === w.color.toLowerCase()}
                  aria-label={w.name}
                  title={w.name}
                  className={s.swatch}
                  style={{ background: w.color }}
                  onClick={() => onHighlight(w.color)}
                />
              ))}
              <label className={s.custom} title="Any colour">
                <input type="color" value={highlight} onChange={(e) => onHighlight(e.target.value)} aria-label="Custom colour" />
                <span>Custom</span>
              </label>
            </div>
          </div>
          {nothingHighlighted && (
            <Notice tone="warn">
              <p style={{ marginTop: 0 }}>No day is set to be highlighted, so the colour has nothing to show on.</p>
              <Button small variant="primary" onClick={onHighlightFridays}>
                Highlight Fridays
              </Button>
            </Notice>
          )}
          {emptySeats > 0 && <Notice tone="warn">{emptySeats} seats are still empty. They will show as blank in the image.</Notice>}
          <div className={ui.actions}>
            <Button variant="primary" onClick={() => void share()}>
              📤 Share on WhatsApp
            </Button>
            <Button onClick={() => void download()}>⬇ Download image</Button>
          </div>
          <p className={ui.muted} style={{ margin: 0, fontSize: '0.85rem' }}>
            On a phone, Share opens WhatsApp (or any app). On a laptop it saves the image so you can send it from WhatsApp Web.
          </p>
          {status && <Notice tone={status.tone}>{status.text}</Notice>}
        </div>
      </div>
    </Card>
  )
}
