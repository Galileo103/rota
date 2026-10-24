import type { Doctor, Level, Month } from './types'

export function effectiveTarget(doctor: Doctor, levels: Level[], month?: Pick<Month, 'targetOverrides'>): number {
  const override = month?.targetOverrides[doctor.id]
  if (override !== undefined) return override
  return levels.find((l) => l.id === doctor.levelId)?.defaultTarget ?? 0
}
