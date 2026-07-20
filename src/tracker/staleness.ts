// ============================================================================
// Stale-posting detection for saved jobs (feature 5.4).
//
// A browser CAN'T reliably check whether a job link still 200s: cross-origin
// fetches to job sites are blocked or opaque, so we can't read the status. That
// limitation is exactly WHY the tracker snapshots each posting. What we can do
// honestly is flag jobs that are old enough to have likely expired, so the user
// verifies before applying instead of trusting a stale link. Pure + testable.
// ============================================================================
import type { TrackedJob } from '../types'

/** Postings older than this (days) are flagged as "may no longer be live". */
export const STALE_AFTER_DAYS = 45

export type Staleness = {
  ageDays: number | null   // age of the posting, or null if we have no date
  likelyStale: boolean
  label: string            // short human summary for a badge / tooltip
}

/** Whole days between `iso` and `now`, or null if the date is missing/invalid. */
function ageDays(iso: string | undefined, now: number): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / 86_400_000))
}

/**
 * Assess how stale a saved job's posting is. Uses the posting's own
 * `posted_at`, falling back to when the user saved it (`createdAt`).
 */
export function stalenessInfo(row: TrackedJob, now: number = Date.now()): Staleness {
  const age = ageDays(row.job.posted_at, now) ?? ageDays(row.createdAt, now)
  if (age == null) {
    return { ageDays: null, likelyStale: false, label: 'Posting date unknown — verify it\u2019s live' }
  }
  const likelyStale = age >= STALE_AFTER_DAYS
  const label = likelyStale
    ? `Posted ${age} days ago — may no longer be live`
    : `Posted ${age} day${age === 1 ? '' : 's'} ago`
  return { ageDays: age, likelyStale, label }
}