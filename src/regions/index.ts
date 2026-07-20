// ============================================================================
// Region registry (feature 8.1). One place to list the markets Klar supports
// and to read/write which one is active (persisted in the settings store).
// ============================================================================
import type { Region } from '../types'
import { getSetting, setSetting } from '../db/db'
import { regionDE } from './de'
import { regionNL } from './nl'

/** All supported regions, keyed by code. */
export const REGIONS: Record<string, Region> = {
  de: regionDE,
  nl: regionNL,
}

export const DEFAULT_REGION_CODE = 'de'

const ACTIVE_REGION_KEY = 'activeRegion'

/** The active Region object (defaults to Germany). */
export async function getActiveRegion(): Promise<Region> {
  const code = (await getSetting<string>(ACTIVE_REGION_KEY)) ?? DEFAULT_REGION_CODE
  return REGIONS[code] ?? regionDE
}

/** Persist the active region by its code. */
export async function setActiveRegion(code: string): Promise<void> {
  if (!REGIONS[code]) return
  await setSetting(ACTIVE_REGION_KEY, code)
}