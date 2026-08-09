// ============================================================================
// Pre-filter — CHEAP, deterministic narrowing that runs BEFORE the (expensive)
// LLM re-rank. Applies relevance, then the ranking-v2 known-mismatch contract,
// scores each survivor, and keeps the top N candidates.
// ============================================================================
import type { NormalizedJob, Preferences, Profile } from '../types'
import { judgeCareerRelevance } from './relevance'
import { evaluateJobV2, rankCandidateSetV2 } from './rankingV2'

export type Scored = { job: NormalizedJob; score: number }

/** Deterministic candidate score in roughly 0–100. */
export function scoreJob(job: NormalizedJob, profile: Profile, prefs: Preferences): number {
  return evaluateJobV2(job, profile, prefs, { asOf: job.fetched_at }).snapshot.features.scores.final
}

export function prefilter(
  jobs: NormalizedJob[],
  profile: Profile,
  prefs: Preferences,
  limit: number,
): NormalizedJob[] {
  const survivors = jobs.filter((j) => {
    if (!judgeCareerRelevance(j, profile, prefs).keep) return false
    return true
  })
  return rankCandidateSetV2(survivors, profile, prefs)
    .slice(0, limit)
    .map((entry) => entry.job)
}
