// ============================================================================
// Cache safety (roadmap §6.3). We cache ONLY normalized, validated records;
// respect published expiry and removal; preserve first-seen and last-verified;
// never relabel cached content as newly posted; remove expired vacancies; and
// keep open-entry programmes separate from vacancy freshness rules.
// ============================================================================
import type { NormalizedJob } from '../types'
import { db, type FlexibleCacheRow } from '../db/db'

/** Fresh cache window for vacancy result sets. */
export const CACHE_TTL_MS = 30 * 60_000

/** A record we are willing to cache: normalized with the minimum viable fields. */
export function isCacheable(job: NormalizedJob): boolean {
  return Boolean(job.id && job.title && job.url && job.source)
}

/** A vacancy is expired when its employer-published validThrough has passed. */
export function isExpiredVacancy(job: NormalizedJob, now = Date.now()): boolean {
  if (job.kind === 'open_entry') return false // open-entry never "expires" as a vacancy
  if (!job.validThrough) return false
  const ends = new Date(job.validThrough).getTime()
  return Number.isFinite(ends) && ends < now
}

/** Drop expired/confirmed-removed vacancies; keep open-entry programmes. */
export function pruneExpired(jobs: NormalizedJob[], now = Date.now()): NormalizedJob[] {
  return jobs.filter((job) => isCacheable(job) && !isExpiredVacancy(job, now))
}

/**
 * Carry first-seen timestamps forward from the previous cache so returning
 * opportunities are never relabelled as newly posted, and stamp last-verified.
 */
export function preserveFreshness(
  previous: NormalizedJob[],
  incoming: NormalizedJob[],
  now = Date.now(),
): NormalizedJob[] {
  const seenAt = new Map(previous.map((job) => [job.id, job.fetched_at]))
  const stamp = new Date(now).toISOString()
  return incoming.map((job) => ({
    ...job,
    fetched_at: seenAt.get(job.id) ?? job.fetched_at,
    lastVerifiedAt: stamp,
  }))
}

/** Return validated, unexpired cached opportunities iff the row is still fresh. */
export async function readFreshCache(queryKey: string, now = Date.now()): Promise<NormalizedJob[] | null> {
  const row = await db.flexibleCache.get(queryKey)
  if (!row) return null
  if (new Date(row.expiresAt).getTime() <= now) return null
  return pruneExpired(row.opportunities, now)
}

/** The raw cache row (used for stale-while-revalidate on the fallback ladder). */
export async function readStaleCache(queryKey: string): Promise<FlexibleCacheRow | null> {
  return (await db.flexibleCache.get(queryKey)) ?? null
}

/** Write a validated, freshness-preserving cache row for a query. */
export async function writeFlexibleCache(
  queryKey: string,
  opportunities: NormalizedJob[],
  opts: { now?: number; ttlMs?: number } = {},
): Promise<void> {
  const now = opts.now ?? Date.now()
  const ttlMs = opts.ttlMs ?? CACHE_TTL_MS
  const existing = await db.flexibleCache.get(queryKey)
  const validated = pruneExpired(opportunities, now)
  const preserved = preserveFreshness(existing?.opportunities ?? [], validated, now)
  const row: FlexibleCacheRow = {
    queryKey,
    opportunities: preserved,
    firstSeenAt: existing?.firstSeenAt ?? new Date(now).toISOString(),
    lastVerifiedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  }
  await db.flexibleCache.put(row)
}

/** Remove every expired cache row (housekeeping). */
export async function sweepExpiredCache(now = Date.now()): Promise<number> {
  const rows = await db.flexibleCache.where('expiresAt').below(new Date(now).toISOString()).toArray()
  await Promise.all(rows.map((row) => db.flexibleCache.delete(row.queryKey)))
  return rows.length
}