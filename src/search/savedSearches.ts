// ============================================================================
// Saved searches + "new since last check" (feature 10).
//
// This is the biggest product-SHAPE change: it turns Klar from a one-shot search
// into a tool you return to. On each run we diff today's fetch against the ids
// this saved search has already seen, and highlight what's genuinely new. All
// diffing happens in the browser against IndexedDB — no backend, no scheduling,
// perfectly in keeping with the local-first model.
//
// The diff (`splitNewJobs`, `unionSeen`) is pure + testable; the CRUD is thin
// Dexie access with a live-query hook for the UI.
// ============================================================================
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SavedSearchRow } from '../db/db'
import type { EmploymentCategory } from '../match/employment'
import type { NormalizedJob, SearchQuery } from '../types'

export type SavedSearchInput = {
  name: string
  query: SearchQuery
  region?: string
  employment?: EmploymentCategory[]
  hideList?: string[]
  maxDistanceKm?: number
  maxAgeDays?: number
}

/** Live list of saved searches for the UI (re-renders on any change). */
export function useSavedSearches(): SavedSearchRow[] {
  return useLiveQuery(() => db.savedSearches.orderBy('updatedAt').reverse().toArray(), [], [])
}

/** Create a new saved search (starts with no jobs seen). */
export async function createSavedSearch(input: SavedSearchInput): Promise<string> {
  const now = new Date().toISOString()
  const id = `ss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const row: SavedSearchRow = {
    id,
    name: input.name.trim() || 'Untitled search',
    query: input.query,
    region: input.region,
    employment: input.employment,
    hideList: input.hideList,
    maxDistanceKm: input.maxDistanceKm,
    maxAgeDays: input.maxAgeDays,
    seenJobIds: [],
    createdAt: now,
    updatedAt: now,
  }
  await db.savedSearches.put(row)
  return id
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await db.savedSearches.delete(id)
}

export async function getSavedSearch(id: string): Promise<SavedSearchRow | undefined> {
  return db.savedSearches.get(id)
}

// --- Pure diff helpers (the heart of "new since last check") ------------------

/** Split a fresh fetch into { fresh, seen } given the ids already recorded. */
export function splitNewJobs(
  currentJobs: NormalizedJob[],
  seenJobIds: string[],
): { fresh: NormalizedJob[]; seen: NormalizedJob[] } {
  const seenSet = new Set(seenJobIds)
  const fresh: NormalizedJob[] = []
  const seen: NormalizedJob[] = []
  for (const j of currentJobs) (seenSet.has(j.id) ? seen : fresh).push(j)
  return { fresh, seen }
}

/** Merge the current fetch's ids into the seen set (union, de-duplicated). */
export function unionSeen(seenJobIds: string[], currentJobs: NormalizedJob[]): string[] {
  const set = new Set(seenJobIds)
  for (const j of currentJobs) set.add(j.id)
  return Array.from(set)
}

/**
 * Run a saved search's bookkeeping after a fetch: compute which jobs are new
 * since last time, then record the current ids so next time only newer ones show.
 * Returns the fresh jobs (to badge in the UI). Persists the updated seen set.
 */
export async function recordRun(id: string, currentJobs: NormalizedJob[]): Promise<NormalizedJob[]> {
  const row = await db.savedSearches.get(id)
  if (!row) return []
  const { fresh } = splitNewJobs(currentJobs, row.seenJobIds)
  row.seenJobIds = unionSeen(row.seenJobIds, currentJobs)
  row.lastRunAt = new Date().toISOString()
  row.updatedAt = row.lastRunAt
  await db.savedSearches.put(row)
  return fresh
}