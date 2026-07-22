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
import type { SavedSearchRow } from '../db/db'
import type { EmploymentCategory } from '../match/employment'
import type { NormalizedJob, SearchQuery } from '../types'
import { normalizeKey, stableHash } from '../lib/hash'
import {
  deleteSavedSearchRow,
  getSavedSearchRow,
  putSavedSearchRow,
  useSavedSearchRows,
} from '../storage/careerData'

const MAX_SEEN_IDENTITIES = 5_000
const SEEN_TTL_MS = 180 * 86_400_000

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
  return useSavedSearchRows()
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
  await putSavedSearchRow(row)
  return id
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await deleteSavedSearchRow(id)
}

export async function getSavedSearch(id: string): Promise<SavedSearchRow | undefined> {
  return getSavedSearchRow(id)
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
  return Array.from(set).slice(-MAX_SEEN_IDENTITIES)
}

/** Stable identity independent of a source-specific posting id. */
export function contentFingerprint(job: NormalizedJob): string {
  const descriptionHead = normalizeKey(job.description).split(' ').slice(0, 40).join(' ')
  return `content:${stableHash([
    normalizeKey(job.company),
    normalizeKey(job.title),
    normalizeKey(job.location.city ?? ''),
    descriptionHead,
  ].join('|'))}`
}

/** Include the primary id, every merged source identity, and content fingerprint. */
export function jobIdentities(job: NormalizedJob): string[] {
  const identities = new Set<string>([
    `job:${job.id}`,
    `source:${job.source}:${job.source_id}`,
    contentFingerprint(job),
  ])
  for (const merged of job.also_on ?? []) {
    identities.add(
      merged.source_id
        ? `source:${merged.source}:${merged.source_id}`
        : `source-url:${merged.source}:${stableHash(merged.url)}`,
    )
  }
  return [...identities]
}

export function mergeSeenIdentities(
  existing: { value: string; lastSeenAt: string }[],
  currentJobs: NormalizedJob[],
  now = new Date(),
): { value: string; lastSeenAt: string }[] {
  const cutoff = now.getTime() - SEEN_TTL_MS
  const map = new Map(
    existing
      .filter((entry) => new Date(entry.lastSeenAt).getTime() >= cutoff)
      .map((entry) => [entry.value, entry]),
  )
  const stamp = now.toISOString()
  for (const job of currentJobs) {
    for (const value of jobIdentities(job)) map.set(value, { value, lastSeenAt: stamp })
  }
  return [...map.values()]
    .sort((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt))
    .slice(-MAX_SEEN_IDENTITIES)
}

export function splitBySeenIdentities(
  currentJobs: NormalizedJob[],
  seen: { value: string; lastSeenAt: string }[],
): { fresh: NormalizedJob[]; seen: NormalizedJob[] } {
  const known = new Set(seen.map((entry) => entry.value))
  const fresh: NormalizedJob[] = []
  const alreadySeen: NormalizedJob[] = []
  for (const job of currentJobs) {
    const target = jobIdentities(job).some((identity) => known.has(identity)) ? alreadySeen : fresh
    target.push(job)
  }
  return { fresh, seen: alreadySeen }
}

/**
 * Run a saved search's bookkeeping after a fetch: compute which jobs are new
 * since last time, then record the current ids so next time only newer ones show.
 * Returns the fresh jobs (to badge in the UI). Persists the updated seen set.
 */
export async function recordRun(id: string, currentJobs: NormalizedJob[]): Promise<NormalizedJob[]> {
  const row = await getSavedSearchRow(id)
  if (!row) return []
  const firstRun = !row.lastRunAt
  const legacySeen = (row.seenJobIds ?? []).map((jobId) => ({
    value: `job:${jobId}`,
    lastSeenAt: row.updatedAt,
  }))
  const known = row.seenIdentities?.length ? row.seenIdentities : legacySeen
  // The first run establishes a baseline; existing results are not mislabeled
  // as newly published jobs.
  const { fresh } = firstRun ? { fresh: [] as NormalizedJob[] } : splitBySeenIdentities(currentJobs, known)
  row.seenJobIds = unionSeen(row.seenJobIds, currentJobs)
  const now = new Date()
  row.seenIdentities = mergeSeenIdentities(known, currentJobs, now)
  row.lastRunAt = now.toISOString()
  row.updatedAt = row.lastRunAt
  await putSavedSearchRow(row)
  return fresh
}