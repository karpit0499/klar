import type { FlexibleEmployment, WorkplaceType } from '../types'

export function validateFlexibleWorkSelection(
  cities: string[],
  employment: FlexibleEmployment[],
  workplaces: WorkplaceType[],
): 'location' | 'work_type' | null {
  if (!cities.some((city) => city.trim().length >= 2)) return 'location'
  if (employment.length === 0 && workplaces.length === 0) return 'work_type'
  return null
}

export function normalizeFlexibleRadius(value: string): number {
  if (!value.trim()) return 15
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 15
  return Math.min(200, Math.max(1, Math.round(parsed)))
}