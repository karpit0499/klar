// ============================================================================
// The Flexible Work relevance gate (v2.4.2).
//
// Until v2.4.2 the flexible search had NO filter of any kind: every opportunity
// a connector returned was published straight into the results. That was safe
// for the curated employer connectors, but the always-on API baseline includes
// Arbeitnow, whose adapter is a plain "most recent jobs in Germany" feed with
// no server-side query at all. The result was senior professional roles in the
// wrong cities appearing in a minijob search.
//
// The career search never had this problem because it runs `match/prefilter`
// and `match/localFilters` before showing anything. Flexible Work needs its own
// equivalent, which is this module.
//
// Four independent gates, each with a named reason so the UI and the tests can
// explain exactly why something was dropped:
//
//   1. location   — the opportunity is in a city the user did not ask for
//   2. career     — the title is a career / qualified-professional role
//   3. pay        — the pay is far above anything a flexible arrangement offers
//   4. signal     — nothing about the TITLE says this is flexible work
//   5. employment — the user asked for specific arrangements and this is not one
//
// Deliberately conservative: unknown never means "reject". A missing city, a
// missing salary or an unclassifiable title is kept unless some other gate has
// positive evidence against it.
// ============================================================================
import type { FlexibleEmployment, NormalizedJob } from '../types'
import { normalizeKey } from '../lib/hash'
import { classifyFlexible, isCareerTitle } from './taxonomy'
import { publishedEmployment } from './opportunity'
import type { FlexibleQuery } from './connectors/types'

export type RejectionReason = 'location' | 'career' | 'pay' | 'signal' | 'employment'

export type RelevanceVerdict = { keep: true } | { keep: false; reason: RejectionReason }

/**
 * Annual pay above this is not a flexible arrangement. A German minijob is
 * capped at €556/month (€6,672/year) and even full part-time retail sits far
 * below this line, so €45,000 is a deliberately generous ceiling that only
 * catches unambiguous career salaries.
 */
const MAX_ANNUAL_EUR = 45_000
const MAX_MONTHLY_EUR = 3_750
const MAX_HOURLY_EUR = 45

/** True when the pay is unambiguously a career salary. */
export function payLooksCareer(job: NormalizedJob): boolean {
  const amount = job.salary.min ?? job.salary.max
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return false
  if (job.salary.period === 'year') return amount > MAX_ANNUAL_EUR
  if (job.salary.period === 'month') return amount > MAX_MONTHLY_EUR
  if (job.salary.period === 'hour') return amount > MAX_HOURLY_EUR
  return false
}

/** Loose city comparison: "10115 Berlin", "Berlin-Mitte" and "Berlin" all match. */
export function cityMatches(jobCity: string, wanted: string): boolean {
  const a = normalizeKey(jobCity)
  const b = normalizeKey(wanted)
  if (!a || !b) return false
  if (a === b) return true
  // Word-aware containment in either direction, so "berlin" matches
  // "berlin mitte" but "lauter" never matches "kaiserslautern".
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)
}

/** True when the opportunity is in (or near) one of the requested cities. */
export function locationMatches(job: NormalizedJob, query: FlexibleQuery): boolean {
  if (query.cities.length === 0) return true
  if (job.location.remote) return true
  // Open-entry programmes list the cities they cover instead of one location.
  if (job.cityAvailability?.length) {
    if (job.cityAvailability.some((c) => query.cities.some((w) => cityMatches(c, w.city)))) return true
  }
  const city = job.location.city
  // Unknown location is not evidence against the job — keep it.
  if (!city) return true
  return query.cities.some((wanted) => cityMatches(city, wanted.city))
}

/** Employment arrangements evidenced by the TITLE or published by the employer. */
export function hardEmploymentEvidence(job: NormalizedJob): FlexibleEmployment[] {
  const published = publishedEmployment(job)
  const fromTitle = classifyFlexible({ title: job.title }).employment
  return [...new Set([...published, ...fromTitle])]
}

/**
 * True when the TITLE (never the description) marks this as flexible work, or
 * the employer published a flexible arrangement, or the board's own employment
 * field says so.
 */
export function hasFlexibleSignal(job: NormalizedJob): boolean {
  if (job.kind === 'open_entry') return true
  if (publishedEmployment(job).length > 0) return true
  const titleOnly = classifyFlexible({ title: job.title })
  if (titleOnly.employment.length > 0) return true
  if (titleOnly.roleFamilies.length > 0) return true
  const declared = normalizeKey(job.employment_type ?? '')
  if (declared && /teilzeit|part time|minijob|aushilfe|werkstudent|befristet|temporary|seasonal|saison/.test(declared)) {
    return true
  }
  // A curated employer-family connector (REWE, DHL, Lidl…) is a flexible-work
  // source by construction. The career and pay gates still apply to it.
  const connectorId = job.connectorId ?? ''
  return Boolean(connectorId) && !connectorId.startsWith('baseline-')
}

/** Judge one opportunity against the query. */
export function judgeOpportunity(job: NormalizedJob, query: FlexibleQuery): RelevanceVerdict {
  // Official routes and open-application programmes are curated destinations,
  // not scraped vacancies. They only face the location gate.
  if (job.kind === 'open_entry') {
    return locationMatches(job, query) ? { keep: true } : { keep: false, reason: 'location' }
  }
  if (!locationMatches(job, query)) return { keep: false, reason: 'location' }
  if (isCareerTitle(job.title)) return { keep: false, reason: 'career' }
  if (payLooksCareer(job)) return { keep: false, reason: 'pay' }
  if (!hasFlexibleSignal(job)) return { keep: false, reason: 'signal' }

  // Respect an explicit arrangement choice, but only when the job itself gives
  // hard evidence of a DIFFERENT arrangement. No evidence means no rejection.
  //
  // 'temporary' is treated as compatible with everything: German ads use
  // "Aushilfe" as a catch-all that routinely covers minijob and part-time work,
  // so rejecting on it alone would hide genuinely relevant jobs.
  if (query.employment.length > 0) {
    const evidence = hardEmploymentEvidence(job).filter((value) => value !== 'temporary')
    if (evidence.length > 0 && !evidence.some((value) => query.employment.includes(value))) {
      return { keep: false, reason: 'employment' }
    }
  }
  return { keep: true }
}

export type RelevanceOutcome = {
  kept: NormalizedJob[]
  rejected: { job: NormalizedJob; reason: RejectionReason }[]
  counts: Record<RejectionReason, number>
}

/** Apply the gate to a connector batch. */
export function filterOpportunities(jobs: NormalizedJob[], query: FlexibleQuery): RelevanceOutcome {
  const kept: NormalizedJob[] = []
  const rejected: { job: NormalizedJob; reason: RejectionReason }[] = []
  const counts: Record<RejectionReason, number> = {
    location: 0, career: 0, pay: 0, signal: 0, employment: 0,
  }
  for (const job of jobs) {
    const verdict = judgeOpportunity(job, query)
    if (verdict.keep) kept.push(job)
    else {
      rejected.push({ job, reason: verdict.reason })
      counts[verdict.reason] += 1
    }
  }
  return { kept, rejected, counts }
}