/** Calendar date as 'YYYY-MM-DD' (no time zone: a hospital day, not an instant). */
export type IsoDate = string
/** Month as 'YYYY-MM'. */
export type MonthId = string
/** D = 09:00–21:00, N = 21:00–09:00 next morning. */
export type Shift = 'D' | 'N'

export const SHIFTS: readonly Shift[] = ['D', 'N']
export const SHIFT_LABEL: Record<Shift, string> = { D: 'Day', N: 'Night' }
export const SHIFT_HOURS: Record<Shift, string> = { D: '9 AM – 9 PM', N: '9 PM – 9 AM' }
/** Same hours as written on the department's printed schedule (ص = AM, م = PM). */
export const SHIFT_HOURS_AR: Record<Shift, string> = { D: '٩ص-٩م', N: '٩م-٩ص' }

export interface Level {
  id: string
  name: string
  defaultTarget: number
}

export interface Doctor {
  id: string
  name: string
  levelId: string
  phone?: string
  archived: boolean
}

export type LeaveSource = 'sms' | 'whatsapp' | 'call' | 'other'

export interface Leave {
  id: string
  doctorId: string
  startDate: IsoDate
  /** Whole days, ≥ 1. A day on leave blocks both shifts. */
  days: number
  noteRequired: boolean
  source?: LeaveSource
  comment?: string
  createdAt: string
}

export interface Month {
  id: MonthId
  /**
   * Doctors taken off the rota this month. Stored as exclusions so a doctor
   * added later is on the rota by default.
   */
  excludedDoctorIds: string[]
  /** Per-doctor shift target for this month only; absent = level default. */
  targetOverrides: Record<string, number>
  status: 'draft' | 'final'
  generatedAt?: string
}

export interface Assignment {
  /** `${monthId}|${date}|${shift}|${seat}` — one row per seat. */
  id: string
  monthId: MonthId
  date: IsoDate
  shift: Shift
  seat: number
  doctorId: string | null
  locked: boolean
  /** Why the generator could not fill this seat. */
  emptyReason?: string
}

export interface Settings {
  id: 'main'
  /** 0 = Sunday … 6 = Saturday. Default Friday. */
  weekendDays: number[]
  doctorsPerShift: number
  /** Row colour for weekend days in the shared schedule image (hex). */
  highlightColor?: string
}

/** The peach used on the department's printed schedule. */
export const DEFAULT_HIGHLIGHT = '#FBE4D5'

export const DEFAULT_SETTINGS: Settings = { id: 'main', weekendDays: [5], doctorsPerShift: 2, highlightColor: DEFAULT_HIGHLIGHT }

export function assignmentId(monthId: MonthId, date: IsoDate, shift: Shift, seat: number): string {
  return `${monthId}|${date}|${shift}|${seat}`
}
