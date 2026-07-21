// ============================================================================
// Local, client-side quality-of-life filters (feature 9):
//   • hide-list  — hide named companies / recruiters (fuzzy, accent-insensitive)
//   • distance   — keep jobs within N km of the user's city (great-circle)
//   • recency    — keep jobs posted within the last N days
// All pure and deterministic — they run on data already in the browser, need no
// network, and are trivially unit-testable.
// ============================================================================
import type { NormalizedJob } from '../types'
import { normalizeKey } from '../lib/hash'

/** Great-circle distance between two lat/lng points, in kilometres (haversine). */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371 // Earth radius, km
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** True if the (normalized) company/recruiter name matches any hide-list entry. */
export function isHidden(job: NormalizedJob, hideList: string[]): boolean {
  if (!hideList.length) return false
  const company = normalizeKey(job.company)
  return hideList.some((raw) => {
    const needle = normalizeKey(raw)
    return needle.length > 0 && company.includes(needle)
  })
}

export type LocalFilterOptions = {
  /** Companies/recruiters to hide (matched fuzzily against `job.company`). */
  hideList?: string[]
  /** Keep only jobs within this many km of `origin`. Requires `origin`. */
  maxDistanceKm?: number
  /** The user's city coordinates, for the distance filter. */
  origin?: { lat: number; lng: number }
  /** Keep only jobs posted within this many days. */
  maxAgeDays?: number
  /**
   * When a distance filter is active, keep remote jobs even though they have no
   * coordinates (a remote role is "near" anywhere). Default true.
   */
  keepRemoteRegardlessOfDistance?: boolean
  /** When filtering by distance, keep jobs that have no coordinates. Default true
   *  (so we never silently drop a real job just because its source omitted lat/lng). */
  keepUnlocatable?: boolean
  now?: number
}

/** Whole days since an ISO date, or Infinity if missing/invalid. */
function ageDays(iso: string | undefined, now: number): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const t = new Date(iso).getTime()
  if (isNaN(t)) return Number.POSITIVE_INFINITY
  return Math.max(0, (now - t) / 86_400_000)
}

/** Does a single job survive all the active local filters? */
export function passesLocalFilters(job: NormalizedJob, opts: LocalFilterOptions): boolean {
  const now = opts.now ?? Date.now()
  const keepRemote = opts.keepRemoteRegardlessOfDistance ?? true
  const keepUnlocatable = opts.keepUnlocatable ?? true

  // Hide-list.
  if (isHidden(job, opts.hideList ?? [])) return false

  // Recency.
  if (opts.maxAgeDays != null) {
    if (ageDays(job.posted_at, now) > opts.maxAgeDays) return false
  }

  // Distance.
  if (opts.maxDistanceKm != null && opts.origin) {
    const remote = job.location.remote
    if (remote && keepRemote) return true
    const { lat, lng } = job.location
    if (lat == null || lng == null) return keepUnlocatable
    if (haversineKm(opts.origin, { lat, lng }) > opts.maxDistanceKm) return false
  }
  return true
}

/** Apply all active local filters to a list, preserving order. */
export function applyLocalFilters(
  jobs: NormalizedJob[],
  opts: LocalFilterOptions,
): NormalizedJob[] {
  return jobs.filter((j) => passesLocalFilters(j, opts))
}