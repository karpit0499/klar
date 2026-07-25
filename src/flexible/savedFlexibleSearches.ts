// ============================================================================
// Saved Flexible Work searches (v2.4 deliverable). Résumé-free named searches
// that remember their own preferences and, on each run, highlight what is new
// since last time — reusing the v2.2 content-fingerprint "seen identities"
// model so a reposted job is not mislabelled as new. All local, no backend.
// ============================================================================
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type FlexibleSearchRow } from '../db/db'
import type { FlexibleWorkPreferences, NormalizedJob } from '../types'
import { jobIdentities, mergeSeenIdentities, splitBySeenIdentities } from '../search/savedSearches'

export type FlexibleSearchInput = {
  name: string
  preferences: FlexibleWorkPreferences
  keywords?: string[]
}

/** Live list for the UI (newest first). */
export function useFlexibleSearches(): FlexibleSearchRow[] {
  return useLiveQuery(
    () => db.flexibleSearches.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  )
}

export async function createFlexibleSearch(input: FlexibleSearchInput): Promise<string> {
  const now = new Date().toISOString()
  const id = `fs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const row: FlexibleSearchRow = {
    id,
    name: input.name.trim() || 'Untitled flexible search',
    preferences: input.preferences,
    keywords: input.keywords,
    seenIdentities: [],
    createdAt: now,
    updatedAt: now,
  }
  await db.flexibleSearches.put(row)
  return id
}

export async function deleteFlexibleSearch(id: string): Promise<void> {
  await db.flexibleSearches.delete(id)
}

export async function getFlexibleSearch(id: string): Promise<FlexibleSearchRow | undefined> {
  return db.flexibleSearches.get(id)
}

export async function renameFlexibleSearch(id: string, name: string): Promise<void> {
  const row = await db.flexibleSearches.get(id)
  if (!row) return
  row.name = name.trim() || row.name
  row.updatedAt = new Date().toISOString()
  await db.flexibleSearches.put(row)
}

/**
 * Record a run: return the opportunities that are new since last time, and
 * persist the updated seen set. The first run establishes a baseline (nothing
 * is mislabelled as newly published).
 */
export async function recordFlexibleRun(
  id: string,
  opportunities: NormalizedJob[],
): Promise<NormalizedJob[]> {
  const row = await db.flexibleSearches.get(id)
  if (!row) return []
  const firstRun = !row.lastRunAt
  const known = row.seenIdentities ?? []
  const { fresh } = firstRun ? { fresh: [] as NormalizedJob[] } : splitBySeenIdentities(opportunities, known)
  const now = new Date()
  row.seenIdentities = mergeSeenIdentities(known, opportunities, now)
  row.lastRunAt = now.toISOString()
  row.updatedAt = row.lastRunAt
  await db.flexibleSearches.put(row)
  return fresh
}

/** Pure helper the UI can call to count new-vs-seen without persisting. */
export function splitFlexibleFresh(
  opportunities: NormalizedJob[],
  row: FlexibleSearchRow,
): { fresh: NormalizedJob[]; seen: NormalizedJob[] } {
  if (!row.lastRunAt) return { fresh: [], seen: opportunities }
  return splitBySeenIdentities(opportunities, row.seenIdentities ?? [])
}

/** Reusable identity helper (re-exported for tests). */
export { jobIdentities }