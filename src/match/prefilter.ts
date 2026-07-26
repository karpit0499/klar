// ============================================================================
// Pre-filter — CHEAP, deterministic narrowing that runs BEFORE the (expensive)
// LLM re-rank. Applies hard dealbreakers, then scores each survivor with a fast
// keyword/recency/salary heuristic and keeps the top N candidates.
// ============================================================================
import type { NormalizedJob, Preferences, Profile } from '../types'
import { normalizeKey } from '../lib/hash'
import { judgeCareerRelevance } from './relevance'

/** Tokenize to a Set of lowercase word stems for overlap tests. */
function tokens(s: string): Set<string> {
  return new Set(
    normalizeKey(s)
      .split(' ')
      .filter((w) => w.length > 2),
  )
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}

export type Scored = { job: NormalizedJob; score: number }

/** Deterministic candidate score in roughly 0–100. */
export function scoreJob(job: NormalizedJob, profile: Profile, prefs: Preferences): number {
  const relevance = judgeCareerRelevance(job, profile, prefs)
  if (!relevance.keep) return 0
  const skillTok = tokens(profile.skills.map((s) => s.name).join(' '))
  const descTok = tokens(job.description.slice(0, 2000))

  const skillHit = overlap(skillTok, descTok)             // supporting signal

  // v2.5.3.1: requested-role relevance is the dominant signal. Skills only
  // distinguish jobs that have already passed the title gate.
  let score = relevance.score * 0.78
  score += Math.min(skillHit, 8) * 1.25                   // up to 10
  if (job.salary.min != null || job.salary.max != null) score += 3
  // Recency: within 30 days gets a boost that fades with age.
  if (job.posted_at) {
    const ageDays = (Date.now() - new Date(job.posted_at).getTime()) / 86_400_000
    if (ageDays >= 0) score += Math.max(0, 4 - ageDays / 10)
  }
  // Location alignment.
  if (prefs.remoteOnly) {
    if (job.location.remote) score += 4
  } else if (job.location.city) {
    const cityTok = normalizeKey(job.location.city)
    const wantCities = prefs.locations.map((l) => normalizeKey(l.city))
    if (wantCities.some((c) => c && cityTok.includes(c))) score += 5
    else if (job.location.remote) score += 2
  }
  return Math.max(0, Math.min(100, score))
}

function hasDealbreaker(job: NormalizedJob, prefs: Preferences): boolean {
  if (!prefs.dealbreakers.length) return false
  const hay = `${job.title} ${job.company} ${job.description}`.toLowerCase()
  return prefs.dealbreakers.some((d) => d.trim() && hay.includes(d.toLowerCase()))
}

export function prefilter(
  jobs: NormalizedJob[],
  profile: Profile,
  prefs: Preferences,
  limit: number,
): NormalizedJob[] {
  const survivors = jobs.filter((j) => {
    if (hasDealbreaker(j, prefs)) return false
    if (prefs.remoteOnly && !j.location.remote) return false
    if (!judgeCareerRelevance(j, profile, prefs).keep) return false
    return true
  })
  const scored: Scored[] = survivors.map((job) => ({ job, score: scoreJob(job, profile, prefs) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.job)
}
