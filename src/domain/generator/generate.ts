import { diffDays, weekday } from '../dates'
import type { IsoDate, Shift } from '../types'
import { createRng } from './rng'

/**
 * Builds a month schedule. Hard rules (never broken by the generator):
 *   - a doctor on leave works neither shift that day
 *   - a doctor sits at most once in the same shift
 *   - a doctor never goes over their target
 * Soft goals, scored by `penalty`: fill every seat, hit every target, spread each
 * doctor's shifts through the month, share nights and weekend days fairly.
 * 24h/36h runs are allowed but cost a little, so they appear only when they help.
 *
 * Method: many randomised greedy passes (hardest seats first), then hill-climbing
 * with move/swap steps on the best few, keeping the lowest penalty.
 */

export interface GenDoctor {
  id: string
  target: number
}

export interface LockedSeat {
  date: IsoDate
  shift: Shift
  seat: number
  doctorId: string | null
}

export interface GenerateInput {
  dates: IsoDate[]
  doctors: GenDoctor[]
  /** doctorId → dates on leave. */
  leave: Map<string, Set<IsoDate>>
  locked?: LockedSeat[]
  weekendDays: number[]
  seatsPerShift: number
  seed?: number
  /** Greedy passes; the default suits a real month (well under a second). */
  attempts?: number
  /** Hill-climbing steps for each of the best passes. */
  improveSteps?: number
}

export interface GenSeat {
  date: IsoDate
  shift: Shift
  seat: number
  doctorId: string | null
  locked: boolean
}

export interface EmptySeat {
  date: IsoDate
  shift: Shift
  seat: number
  reason: string
}

export interface DoctorStats {
  doctorId: string
  target: number
  shifts: number
  nights: number
  weekends: number
  /** Back-to-back shifts (24h runs; a 36h run counts as two). */
  longRuns: number
}

export interface GenerateResult {
  seats: GenSeat[]
  empty: EmptySeat[]
  stats: DoctorStats[]
  penalty: number
  seed: number
}

const W_EMPTY = 1000
const W_TARGET = 200
const W_NIGHT = 6
const W_WEEKEND = 6
const W_SPACING = 4
const W_RUN = 3

interface Model {
  seatCount: number
  seatsPerShift: number
  /** Half-day index of each seat: day × 2 + (night ? 1 : 0). */
  time: Int32Array
  isNight: Uint8Array
  isWeekend: Uint8Array
  locked: Uint8Array
  doctorCount: number
  target: Int32Array
  /** onLeave[doctor × days + day] */
  onLeave: Uint8Array
  days: number
  /** Ideal gap between two shifts of a doctor, in half-days. */
  idealGap: Float64Array
  /** Fair weekend seats for a doctor who works their full target. */
  fairWeekends: Float64Array
}

function buildModel(input: GenerateInput): Model {
  const { dates, doctors, seatsPerShift } = input
  const days = dates.length
  const seatCount = days * 2 * seatsPerShift
  const time = new Int32Array(seatCount)
  const isNight = new Uint8Array(seatCount)
  const isWeekend = new Uint8Array(seatCount)
  const weekendSet = new Set(input.weekendDays)
  let weekendSeats = 0
  for (let i = 0; i < seatCount; i++) {
    const t = Math.floor(i / seatsPerShift)
    time[i] = t
    isNight[i] = t % 2
    isWeekend[i] = weekendSet.has(weekday(dates[t >> 1]!)) ? 1 : 0
    weekendSeats += isWeekend[i]!
  }
  const doctorCount = doctors.length
  const target = new Int32Array(doctors.map((d) => Math.max(0, Math.floor(d.target))))
  const onLeave = new Uint8Array(doctorCount * days)
  doctors.forEach((doc, d) => {
    const set = input.leave.get(doc.id)
    if (!set) return
    dates.forEach((date, day) => {
      if (set.has(date)) onLeave[d * days + day] = 1
    })
  })
  const idealGap = new Float64Array(doctorCount)
  const fairWeekends = new Float64Array(doctorCount)
  for (let d = 0; d < doctorCount; d++) {
    const t = target[d]!
    idealGap[d] = t > 0 ? (days * 2) / t : 0
    fairWeekends[d] = (t * weekendSeats) / Math.max(1, seatCount)
  }
  return {
    seatCount, seatsPerShift, time, isNight, isWeekend, locked: new Uint8Array(seatCount),
    doctorCount, target, onLeave, days, idealGap, fairWeekends,
  }
}

function seatIndex(model: Model, dates: IsoDate[], date: IsoDate, shift: Shift, seat: number): number {
  const day = dates.indexOf(date)
  if (day < 0 || seat < 0 || seat >= model.seatsPerShift) return -1
  return (day * 2 + (shift === 'N' ? 1 : 0)) * model.seatsPerShift + seat
}

function sameShiftHas(model: Model, assign: Int32Array, i: number, d: number): boolean {
  const base = model.time[i]! * model.seatsPerShift
  for (let s = 0; s < model.seatsPerShift; s++) {
    const j = base + s
    if (j !== i && assign[j] === d) return true
  }
  return false
}

/** Hard-rule check for putting doctor d into seat i (target is checked by callers). */
function canSit(model: Model, assign: Int32Array, i: number, d: number): boolean {
  if (model.onLeave[d * model.days + (model.time[i]! >> 1)]) return false
  return !sameShiftHas(model, assign, i, d)
}

function penalty(model: Model, assign: Int32Array): number {
  const n = model.doctorCount
  const count = new Int32Array(n)
  const nights = new Int32Array(n)
  const weekends = new Int32Array(n)
  const last = new Int32Array(n).fill(-1)
  const prevWasRun = new Uint8Array(n)
  let total = 0
  for (let i = 0; i < model.seatCount; i++) {
    const d = assign[i]!
    if (d < 0) {
      total += W_EMPTY
      continue
    }
    count[d]!++
    nights[d]! += model.isNight[i]!
    weekends[d]! += model.isWeekend[i]!
    const t = model.time[i]!
    const prev = last[d]!
    if (prev >= 0 && prev !== t) {
      const gap = t - prev
      const ideal = model.idealGap[d]!
      if (gap < ideal) {
        const short = (ideal - gap) / ideal
        total += W_SPACING * short * short
      }
      if (gap === 1) {
        // A second back-to-back in a row is a 36h run: it costs more.
        total += prevWasRun[d] ? W_RUN * 2 : W_RUN
        prevWasRun[d] = 1
      } else prevWasRun[d] = 0
    }
    last[d] = t
  }
  for (let d = 0; d < n; d++) {
    const c = count[d]!
    const t = model.target[d]!
    total += W_TARGET * Math.abs(t - c)
    const nightDiff = nights[d]! - c / 2
    total += W_NIGHT * nightDiff * nightDiff
    const weekendDiff = weekends[d]! - (t > 0 ? (model.fairWeekends[d]! * c) / t : 0)
    total += W_WEEKEND * weekendDiff * weekendDiff
  }
  return total
}

function greedy(model: Model, base: Int32Array, rnd: () => number): Int32Array {
  const assign = base.slice()
  const n = model.doctorCount
  const count = new Int32Array(n)
  const nights = new Int32Array(n)
  const weekends = new Int32Array(n)
  const times: number[][] = Array.from({ length: n }, () => [])
  const freeHalfDays = new Int32Array(n)
  const freeDoctorsOnDay = new Int32Array(model.days)
  for (let d = 0; d < n; d++) {
    for (let day = 0; day < model.days; day++) {
      if (model.onLeave[d * model.days + day]) continue
      freeHalfDays[d]! += 2
      freeDoctorsOnDay[day]!++
    }
  }
  for (let i = 0; i < model.seatCount; i++) {
    const d = assign[i]!
    if (d < 0) continue
    count[d]!++
    nights[d]! += model.isNight[i]!
    weekends[d]! += model.isWeekend[i]!
    times[d]!.push(model.time[i]!)
  }

  // Hardest seats first: fewest doctors free that day, weekends and nights early, random tie-break.
  const order: { i: number; key: number }[] = []
  for (let i = 0; i < model.seatCount; i++) {
    if (model.locked[i]) continue
    const free = freeDoctorsOnDay[model.time[i]! >> 1]!
    const key = free - (model.isWeekend[i] ? 0.5 : 0) - (model.isNight[i] ? 0.25 : 0) + rnd() * 1.5
    order.push({ i, key })
  }
  order.sort((a, b) => a.key - b.key)

  for (const { i } of order) {
    const t = model.time[i]!
    let best = -1
    let bestCost = Infinity
    for (let d = 0; d < n; d++) {
      const target = model.target[d]!
      if (count[d]! >= target || !canSit(model, assign, i, d)) continue
      // Doctors furthest from their target, and with the fewest free days, go first.
      let cost = -12 * ((target - count[d]!) / target) - 8 * (target / Math.max(1, freeHalfDays[d]!))
      let nearest = Infinity
      for (const other of times[d]!) nearest = Math.min(nearest, Math.abs(other - t))
      const ideal = model.idealGap[d]!
      if (nearest < ideal) cost += W_SPACING * ((ideal - nearest) / ideal) ** 2
      if (nearest === 1) cost += W_RUN
      const c = count[d]! + 1
      const nightsAfter = nights[d]! + model.isNight[i]!
      cost += W_NIGHT * 0.5 * ((nightsAfter - c / 2) ** 2 - (nights[d]! - (c - 1) / 2) ** 2)
      if (model.isWeekend[i]) cost += W_WEEKEND * (weekends[d]! + 1 - model.fairWeekends[d]!)
      cost += rnd() * 0.8
      if (cost < bestCost) {
        bestCost = cost
        best = d
      }
    }
    if (best >= 0) {
      assign[i] = best
      count[best]!++
      nights[best]! += model.isNight[i]!
      weekends[best]! += model.isWeekend[i]!
      times[best]!.push(t)
    }
  }
  return assign
}

function improve(model: Model, start: Int32Array, steps: number, rnd: () => number): { assign: Int32Array; score: number } {
  const assign = start.slice()
  const counts = new Int32Array(model.doctorCount)
  for (const d of assign) if (d >= 0) counts[d]!++
  let score = penalty(model, assign)
  const open: number[] = []
  for (let i = 0; i < model.seatCount; i++) if (!model.locked[i]) open.push(i)
  if (open.length === 0 || model.doctorCount === 0) return { assign, score }

  for (let step = 0; step < steps; step++) {
    const i = open[Math.floor(rnd() * open.length)]!
    const a = assign[i]!
    if (rnd() < 0.5) {
      // Move: give seat i to another doctor (or fill it when empty).
      const d = Math.floor(rnd() * model.doctorCount)
      if (d === a || counts[d]! >= model.target[d]! || !canSit(model, assign, i, d)) continue
      assign[i] = d
      const next = penalty(model, assign)
      if (next <= score) {
        score = next
        counts[d]!++
        if (a >= 0) counts[a]!--
      } else assign[i] = a
    } else {
      // Swap the doctors of two seats in different shifts.
      const j = open[Math.floor(rnd() * open.length)]!
      const b = assign[j]!
      if (a === b || model.time[i] === model.time[j]) continue
      assign[i] = -1
      assign[j] = -1
      const legal = (b < 0 || canSit(model, assign, i, b)) && (a < 0 || canSit(model, assign, j, a))
      assign[i] = legal ? b : a
      assign[j] = legal ? a : b
      if (!legal) continue
      const next = penalty(model, assign)
      if (next <= score) score = next
      else {
        assign[i] = a
        assign[j] = b
      }
    }
  }

  // Last pass: a seat still empty takes any doctor who may legally sit there and is under target.
  for (const i of open) {
    if (assign[i]! >= 0) continue
    for (let d = 0; d < model.doctorCount; d++) {
      if (counts[d]! < model.target[d]! && canSit(model, assign, i, d)) {
        assign[i] = d
        counts[d]!++
        break
      }
    }
  }
  return { assign, score: penalty(model, assign) }
}

function emptyReason(model: Model, assign: Int32Array, counts: Int32Array, i: number): string {
  if (model.doctorCount === 0) return 'No active doctors this month'
  const day = model.time[i]! >> 1
  let leave = 0
  let full = 0
  let sameShift = 0
  for (let d = 0; d < model.doctorCount; d++) {
    if (model.onLeave[d * model.days + day]) leave++
    else if (sameShiftHas(model, assign, i, d)) sameShift++
    else if (counts[d]! >= model.target[d]!) full++
  }
  const parts: string[] = []
  if (leave) parts.push(`${leave} on leave`)
  if (full) parts.push(`${full} already at their target`)
  if (sameShift) parts.push(`${sameShift} already on this shift`)
  return `No one free: ${parts.join(', ')}`
}

export function generate(input: GenerateInput): GenerateResult {
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31)
  const rnd = createRng(seed)
  const model = buildModel(input)
  const { dates } = input
  const indexOf = new Map(input.doctors.map((d, i) => [d.id, i]))

  const base = new Int32Array(model.seatCount).fill(-1)
  for (const lock of input.locked ?? []) {
    const i = seatIndex(model, dates, lock.date, lock.shift, lock.seat)
    if (i < 0) continue
    model.locked[i] = 1
    base[i] = lock.doctorId === null ? -1 : (indexOf.get(lock.doctorId) ?? -1)
  }

  const attempts = input.attempts ?? 120
  const improveSteps = input.improveSteps ?? 6000
  const candidates: { assign: Int32Array; score: number }[] = []
  for (let a = 0; a < attempts; a++) {
    const assign = greedy(model, base, rnd)
    candidates.push({ assign, score: penalty(model, assign) })
  }
  candidates.sort((x, y) => x.score - y.score)
  let best = candidates[0] ?? { assign: base, score: penalty(model, base) }
  for (const c of candidates.slice(0, 3)) {
    const improved = improve(model, c.assign, improveSteps, rnd)
    if (improved.score < best.score) best = improved
  }
  const assign = best.assign
  const counts = new Int32Array(model.doctorCount)
  for (const d of assign) if (d >= 0) counts[d]!++

  const seats: GenSeat[] = []
  const empty: EmptySeat[] = []
  for (let i = 0; i < model.seatCount; i++) {
    const t = model.time[i]!
    const date = dates[t >> 1]!
    const shift: Shift = t % 2 ? 'N' : 'D'
    const seat = i % model.seatsPerShift
    const d = assign[i]!
    const locked = !!model.locked[i]
    seats.push({ date, shift, seat, doctorId: d >= 0 ? input.doctors[d]!.id : null, locked })
    if (d < 0) {
      empty.push({ date, shift, seat, reason: locked ? 'Kept empty (locked)' : emptyReason(model, assign, counts, i) })
    }
  }

  return { seats, empty, stats: computeStats(input, seats), penalty: best.score, seed }
}

/** Per-doctor totals for any schedule, generated or edited by hand. */
export function computeStats(
  input: Pick<GenerateInput, 'doctors' | 'weekendDays'>,
  seats: Pick<GenSeat, 'date' | 'shift' | 'doctorId'>[],
): DoctorStats[] {
  const weekendSet = new Set(input.weekendDays)
  const byDoctor = new Map<string, DoctorStats>(
    input.doctors.map((d) => [d.id, { doctorId: d.id, target: d.target, shifts: 0, nights: 0, weekends: 0, longRuns: 0 }]),
  )
  const first = seats[0]?.date
  const times = new Map<string, number[]>()
  for (const s of seats) {
    if (!s.doctorId || !first) continue
    const stats = byDoctor.get(s.doctorId)
    if (!stats) continue
    stats.shifts++
    if (s.shift === 'N') stats.nights++
    if (weekendSet.has(weekday(s.date))) stats.weekends++
    const list = times.get(s.doctorId) ?? []
    list.push(diffDays(first, s.date) * 2 + (s.shift === 'N' ? 1 : 0))
    times.set(s.doctorId, list)
  }
  for (const [id, list] of times) {
    list.sort((a, b) => a - b)
    for (let k = 1; k < list.length; k++) if (list[k]! - list[k - 1]! === 1) byDoctor.get(id)!.longRuns++
  }
  return [...byDoctor.values()]
}
