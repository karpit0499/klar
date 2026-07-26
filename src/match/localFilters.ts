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
import { classifyEmployment, type EmploymentCategory } from './employment'

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
  const company = normalizedWords(job.company)
  return hideList.some((raw) => {
    const needle = normalizedWords(raw)
    // Exact or word/phrase-aware only: "soft" must not hide "Microsoft".
    if (needle.length < 3) return false
    return company === needle || ` ${company} `.includes(` ${needle} `)
  })
}

export type HideTermValidation = {
  accepted: string[]
  rejected: { term: string; reason: string }[]
}

/** Reject terms too short to be safe after normalization. */
export function validateHideTerms(terms: string[]): HideTermValidation {
  const accepted: string[] = []
  const rejected: HideTermValidation['rejected'] = []
  for (const raw of terms) {
    const term = raw.trim()
    if (!term) continue
    if (normalizedWords(term).replace(/\s/g, '').length < 3) {
      rejected.push({ term, reason: 'Use at least 3 letters so unrelated companies are not hidden.' })
    } else {
      accepted.push(term)
    }
  }
  return { accepted, rejected }
}

function normalizedWords(value: string): string {
  return normalizeKey(value).split(/\s+/).filter(Boolean).join(' ')
}

export type LocalFilterOptions = {
  /** Canonical employment categories selected by the user. */
  employment?: EmploymentCategory[]
  /** Companies/recruiters to hide (matched fuzzily against `job.company`). */
  hideList?: string[]
  /** Keep only jobs within this many km of `origin`. Requires `origin`. */
  maxDistanceKm?: number
  /** The user's city coordinates, for the distance filter. */
  origin?: { lat: number; lng: number }
  /** User-entered origin city, used when a posting has a city but no coordinates. */
  targetCity?: string
  /** Accepted country names/codes for the active market (for global ATS feeds). */
  targetCountries?: string[]
  /** Active region's offline city resolver. */
  resolveLocation?: (city: string) => { lat?: number; lng?: number; canonical: string }
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

const COUNTRY_MARKERS = [
  'germany', 'deutschland', 'austria', 'osterreich', 'switzerland', 'schweiz',
  'netherlands', 'nederland', 'luxembourg', 'liechtenstein', 'united kingdom',
  'uk', 'england', 'scotland', 'wales', 'canada', 'united states', 'usa', 'us', 'france',
  'spain', 'italy', 'poland', 'portugal', 'ireland', 'belgium', 'denmark',
  'sweden', 'norway', 'finland', 'india', 'singapore', 'australia',
]

function wholePhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `)
}

function countryMismatch(job: NormalizedJob, opts: LocalFilterOptions): boolean {
  const accepted = (opts.targetCountries ?? []).map(normalizedWords).filter(Boolean)
  if (!accepted.length) return false
  const country = normalizedWords(job.location.country)
  const cityAndRegion = normalizedWords(`${job.location.city ?? ''} ${job.location.region ?? ''}`)
  const locationText = normalizedWords(
    `${job.location.city ?? ''} ${job.location.region ?? ''} ${job.location.country ?? ''}`,
  )
  const explicitForeign = COUNTRY_MARKERS.some(
    (marker) => wholePhrase(cityAndRegion, marker) && !accepted.includes(marker),
  )
  if (explicitForeign) return true
  const matchesAccepted = accepted.some(
    (alias) => country === alias || wholePhrase(locationText, alias),
  )
  if (matchesAccepted) return false

  const harmlessUnknown = new Set(['', 'remote', 'international', 'worldwide', 'multiple locations'])
  if (country && !harmlessUnknown.has(country)) return true

  // Some global sources default an unknown country. A country written inside
  // the city string ("London, UK", "Toronto, Canada") is stronger evidence.
  return COUNTRY_MARKERS.some(
    (marker) => wholePhrase(locationText, marker) && !accepted.includes(marker),
  )
}

type DistanceDecision = { keep: boolean; unlocatable: boolean }

function distanceDecision(job: NormalizedJob, opts: LocalFilterOptions): DistanceDecision {
  if (opts.maxDistanceKm == null || !opts.origin) return { keep: true, unlocatable: false }
  const keepRemote = opts.keepRemoteRegardlessOfDistance ?? true
  const keepUnlocatable = opts.keepUnlocatable ?? true
  if (job.location.remote && keepRemote) return { keep: true, unlocatable: false }
  if (countryMismatch(job, opts)) return { keep: false, unlocatable: false }

  let lat = job.location.lat
  let lng = job.location.lng
  if ((lat == null || lng == null) && job.location.city && opts.resolveLocation) {
    const resolved = opts.resolveLocation(job.location.city)
    lat = resolved.lat
    lng = resolved.lng
  }
  if (lat != null && lng != null) {
    return {
      keep: haversineKm(opts.origin, { lat, lng }) <= opts.maxDistanceKm,
      unlocatable: false,
    }
  }

  const target = normalizedWords(opts.targetCity ?? '')
  const city = normalizedWords(job.location.city ?? '')
  if (target && wholePhrase(city, target)) return { keep: true, unlocatable: false }
  return { keep: keepUnlocatable, unlocatable: true }
}

/** Does a single job survive all the active local filters? */
export function passesLocalFilters(job: NormalizedJob, opts: LocalFilterOptions): boolean {
  const now = opts.now ?? Date.now()
  const keepRemote = opts.keepRemoteRegardlessOfDistance ?? true
  const keepUnlocatable = opts.keepUnlocatable ?? true

  if (opts.employment?.length && !opts.employment.includes(classifyEmployment(job))) return false

  // Hide-list.
  if (isHidden(job, opts.hideList ?? [])) return false

  // Recency.
  if (opts.maxAgeDays != null) {
    if (ageDays(job.posted_at, now) > opts.maxAgeDays) return false
  }

  // Distance.
  if (opts.maxDistanceKm != null && opts.origin) {
    return distanceDecision(job, { ...opts, keepRemoteRegardlessOfDistance: keepRemote, keepUnlocatable }).keep
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

export type LocalFilterDiagnostics = {
  inputCount: number
  removed: { employment: number; hideList: number; recency: number; distance: number }
  unlocatableCount: number
  distanceRequested: boolean
  distanceEnforced: boolean
  distanceMessage?: string
  removedAllBy?: 'employment' | 'hideList' | 'recency' | 'distance'
  finalCount: number
}

/** Apply filters one at a time so every removed count is observable. */
export function applyLocalFiltersWithDiagnostics(
  jobs: NormalizedJob[],
  opts: LocalFilterOptions,
): { jobs: NormalizedJob[]; diagnostics: LocalFilterDiagnostics } {
  const distanceRequested = opts.maxDistanceKm != null
  const distanceEnforced = distanceRequested && opts.origin != null
  const diagnostics: LocalFilterDiagnostics = {
    inputCount: jobs.length,
    removed: { employment: 0, hideList: 0, recency: 0, distance: 0 },
    unlocatableCount: 0,
    distanceRequested,
    distanceEnforced,
    finalCount: jobs.length,
  }
  let current = [...jobs]

  if (opts.employment?.length) {
    const selected = new Set(opts.employment)
    const before = current.length
    current = current.filter((job) => selected.has(classifyEmployment(job)))
    diagnostics.removed.employment = before - current.length
    if (before > 0 && current.length === 0) diagnostics.removedAllBy = 'employment'
  }

  const hideTerms = validateHideTerms(opts.hideList ?? []).accepted
  if (hideTerms.length) {
    const before = current.length
    current = current.filter((job) => !isHidden(job, hideTerms))
    diagnostics.removed.hideList = before - current.length
    if (before > 0 && current.length === 0) diagnostics.removedAllBy = 'hideList'
  }

  if (opts.maxAgeDays != null && current.length) {
    const before = current.length
    current = current.filter((job) => ageDays(job.posted_at, opts.now ?? Date.now()) <= opts.maxAgeDays!)
    diagnostics.removed.recency = before - current.length
    if (before > 0 && current.length === 0) diagnostics.removedAllBy = 'recency'
  }

  if (distanceRequested) {
    if (!opts.origin) {
      diagnostics.unlocatableCount = current.filter((job) => (
        !job.location.remote && (job.location.lat == null || job.location.lng == null)
      )).length
      diagnostics.distanceMessage = 'The origin city could not be resolved, so the distance filter was not enforced.'
    } else if (current.length) {
      const before = current.length
      current = current.filter((job) => {
        const decision = distanceDecision(job, opts)
        if (decision.unlocatable) diagnostics.unlocatableCount += 1
        return decision.keep
      })
      diagnostics.removed.distance = before - current.length
      if (before > 0 && current.length === 0) diagnostics.removedAllBy = 'distance'
    }
  }

  diagnostics.finalCount = current.length
  return { jobs: current, diagnostics }
}
