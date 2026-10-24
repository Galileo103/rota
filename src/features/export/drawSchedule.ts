import type { ExportTable } from '../../domain/exportTable'

/**
 * Draws the month schedule as an image laid out like the department's printed
 * one: a red title in a box, then a right-to-left table (day · day shift ·
 * night shift) with weekend rows tinted. Canvas keeps the result identical on
 * every device and works offline.
 */

const WIDTH = 1080
const MARGIN = 16
const TITLE_BOX = { width: 766, height: 60, top: 40 }
const GAP = 36
const HEADER_HEIGHT = 34
const ROW_HEIGHT = 29
const BOTTOM = 60
// Column shares from the printed schedule, right to left: day, 9AM–9PM, 9PM–9AM.
const COLUMNS = [0.14, 0.49, 0.37]
const RED = '#C00000'
const INK = '#000000'
const FONT = '"Arial", "Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif'

export interface DrawOptions {
  highlight: string
  /** Pixel density; 2 keeps the text sharp when zoomed on a phone. */
  scale?: number
}

/** Largest bold font (down to 12px) at which the text fits the width. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, size: number, width: number): string {
  for (let px = size; px > 12; px--) {
    ctx.font = `bold ${px}px ${FONT}`
    if (ctx.measureText(text).width <= width) return ctx.font
  }
  return `bold 12px ${FONT}`
}

/** Returns null where canvas is unavailable (e.g. tests). */
export function drawSchedule(table: ExportTable, options: DrawOptions, canvas: HTMLCanvasElement = document.createElement('canvas')): HTMLCanvasElement | null {
  const scale = options.scale ?? 2
  const tableTop = TITLE_BOX.top + TITLE_BOX.height + GAP
  const height = tableTop + HEADER_HEIGHT + table.rows.length * ROW_HEIGHT + BOTTOM
  canvas.width = WIDTH * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(scale, scale)
  ctx.direction = 'rtl'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, WIDTH, height)

  // Title box
  const titleX = (WIDTH - TITLE_BOX.width) / 2
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.5
  ctx.strokeRect(titleX, TITLE_BOX.top, TITLE_BOX.width, TITLE_BOX.height)
  ctx.fillStyle = RED
  ctx.textAlign = 'center'
  ctx.font = fitFont(ctx, table.title, 28, TITLE_BOX.width - 32)
  ctx.fillText(table.title, WIDTH / 2, TITLE_BOX.top + TITLE_BOX.height / 2 + 1)

  // Column edges, right to left.
  const tableWidth = WIDTH - 2 * MARGIN
  const edges = [WIDTH - MARGIN]
  for (const share of COLUMNS) edges.push(edges.at(-1)! - share * tableWidth)
  edges[edges.length - 1] = MARGIN // absorb rounding
  const col = (i: number) => ({ left: edges[i + 1]!, right: edges[i]!, width: edges[i]! - edges[i + 1]! })

  const drawRow = (
    y: number,
    h: number,
    texts: string[],
    style: { color: string; size: number; dayAlign: 'right' | 'center'; fill?: string },
  ) => {
    if (style.fill) {
      ctx.fillStyle = style.fill
      ctx.fillRect(MARGIN, y, tableWidth, h)
    }
    ctx.fillStyle = style.color
    texts.forEach((text, i) => {
      if (!text) return
      const c = col(i)
      ctx.font = fitFont(ctx, text, style.size, c.width - 16)
      if (i === 0 && style.dayAlign === 'right') {
        ctx.textAlign = 'right'
        ctx.fillText(text, c.right - 8, y + h / 2 + 1)
      } else {
        ctx.textAlign = 'center'
        ctx.fillText(text, c.left + c.width / 2, y + h / 2 + 1)
      }
    })
  }

  drawRow(tableTop, HEADER_HEIGHT, [table.headers.day, table.headers.D, table.headers.N], { color: RED, size: 22, dayAlign: 'center' })
  // Day labels are right-aligned like the printed schedule; names are centred.
  table.rows.forEach((row, r) => {
    const y = tableTop + HEADER_HEIGHT + r * ROW_HEIGHT
    drawRow(y, ROW_HEIGHT, [row.dayLabel, row.cells.D, row.cells.N], {
      color: INK,
      size: 20,
      dayAlign: 'right',
      fill: row.highlight ? options.highlight : undefined,
    })
  })

  // Grid: thin black lines on half pixels so they stay crisp.
  const bottom = tableTop + HEADER_HEIGHT + table.rows.length * ROW_HEIGHT
  ctx.strokeStyle = INK
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let y = tableTop, r = -1; r <= table.rows.length; r++) {
    const line = Math.round(y) + 0.5
    ctx.moveTo(MARGIN, line)
    ctx.lineTo(WIDTH - MARGIN, line)
    y += r === -1 ? HEADER_HEIGHT : ROW_HEIGHT
  }
  for (const x of edges) {
    const line = Math.round(x) + 0.5
    ctx.moveTo(line, tableTop)
    ctx.lineTo(line, bottom)
  }
  ctx.stroke()
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
