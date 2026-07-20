// ============================================================================
// Pre-filter — CHEAP, deterministic narrowing that runs BEFORE the (expensive)
// LLM re-rank. Applies hard dealbreakers, then scores each survivor with a fast
// keyword/recency/salary heuristic and keeps the top N candidates.
// ============================================================================
import type { NormalizedJob, Preferences, Profile } from '../types'
import { normalizeKey } from '../lib/hash'

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
  const titleTok = tokens(job.title)
  const wantTitles = tokens([...prefs.targetTitles, ...profile.titles.map((t) => t.title)].join(' '))
  const skillTok = tokens(profile.skills.map((s) => s.name).join(' '))
  const descTok = tokens(job.description.slice(0, 2000))

  const titleHit = overlap(titleTok, wantTitles)          // strong signal
  const skillHit = overlap(skillTok, descTok)             // supporting signal

  let score = 0
  score += Math.min(titleHit, 3) * 18                     // up to 54
  score += Math.min(skillHit, 8) * 4                      // up to 32
  if (job.salary.min != null || job.salary.max != null) score += 6
  // Recency: within 30 days gets a boost that fades with age.
  if (job.posted_at) {
    const ageDays = (Date.now() - new Date(job.posted_at).getTime()) / 86_400_000
    if (ageDays >= 0) score += Math.max(0, 8 - ageDays / 5)
  }
  // Location alignment.
  if (prefs.remoteOnly) {
    if (job.location.remote) score += 6
  } else if (job.location.city) {
    const cityTok = normalizeKey(job.location.city)
    const wantCities = prefs.locations.map((l) => normalizeKey(l.city))
    if (wantCities.some((c) => c && cityTok.includes(c))) score += 8
    else if (job.location.remote) score += 4
  }
  return score
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
    return true
  })
  const scored: Scored[] = survivors.map((job) => ({ job, score: scoreJob(job, profile, prefs) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.job)
}