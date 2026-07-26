// ============================================================================
// Matching orchestrator: pre-filter → enrich BA descriptions (lazy, bounded) →
// LLM re-rank (cached). The cache key is hash(profile+prefs)+jobId so re-running
// the same search is instant and cheap; only new jobs hit the LLM.
// ============================================================================
import type { MatchResult, NormalizedJob, Preferences, Profile } from '../types'
import { MATCH } from '../lib/config'
import { stableHash } from '../lib/hash'
import { prefilter, scoreJob } from './prefilter'
import { semanticPrefilter } from './semantic'
import { isFailedMatchPlaceholder, rerankAll } from './rerank'
import { fetchBaDetail } from '../sources/ba'
import type { MatchRow } from '../db/db'
import { deleteMatchRows, getMatchRows, putMatchRows } from '../storage/careerData'
import { CAREER_RELEVANCE_VERSION, filterCareerRelevantJobs } from './relevance'

/** A stable fingerprint of the profile+prefs that influence scoring. */
export function matchContextHash(profile: Profile, prefs: Preferences): string {
  const sig = JSON.stringify({
    rv: CAREER_RELEVANCE_VERSION,
    su: profile.summary, t: profile.titles, s: profile.skills.map((s) => s.name),
    d: profile.domains, y: profile.totalYears,
    tt: prefs.targetTitles, f: prefs.fields, se: prefs.seniority, sa: prefs.salary,
    lo: prefs.locations, ro: prefs.remoteOnly, mh: prefs.mustHaves, db: prefs.dealbreakers,
  })
  return stableHash(sig)
}

/** Enrich BA candidates whose description is still empty (bounded concurrency). */
export async function enrichBaDescriptions(cands: NormalizedJob[], signal?: AbortSignal): Promise<void> {
  const targets = cands.filter((j) => j.source === 'ba' && !j.description)
  let idx = 0
  async function run() {
    while (idx < targets.length) {
      const job = targets[idx++]
      try {
        const detail = await fetchBaDetail(job.source_id, signal)
        job.description = detail.description
        if (detail.employment_type) job.employment_type = detail.employment_type
        if (detail.remote) job.location.remote = true
      } catch { /* leave description empty; scoring still works on title */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, run))
}

export type MatchProgress = { phase: 'prefilter' | 'enrich' | 'score' | 'done'; done: number; total: number }

export async function runMatching(
  jobs: NormalizedJob[],
  profile: Profile,
  prefs: Preferences,
  apiKey: string | undefined,
  opts: {
    onProgress?: (p: MatchProgress) => void
    signal?: AbortSignal
    /** 'keyword' (default) or 'semantic' cosine-similarity candidate selection (feature 1.4). */
    prefilterMode?: 'keyword' | 'semantic'
  } = {},
): Promise<MatchResult[]> {
  const ctx = matchContextHash(profile, prefs)
  const key = (jobId: string) => `${ctx}:${jobId}`

  // 1. Pre-filter to a bounded candidate set (keyword heuristic or embeddings).
  opts.onProgress?.({ phase: 'prefilter', done: 0, total: jobs.length })
  const candidates =
    opts.prefilterMode === 'semantic'
      ? await semanticPrefilter(jobs, profile, prefs, MATCH.candidateLimit)
      : prefilter(jobs, profile, prefs, MATCH.candidateLimit)

  // Local discovery remains available without an API key. The user is asked
  // for Groq only when an explicitly AI-dependent action is invoked.
  if (!apiKey) {
    // BA list results have no description. Verify their market after the
    // bounded detail enrichment so an unrelated Account Executive cannot pass
    // merely because its market was unknown at the first gate.
    opts.onProgress?.({ phase: 'enrich', done: 0, total: candidates.length })
    await enrichBaDescriptions(candidates, opts.signal)
    const verified = filterCareerRelevantJobs(candidates, profile, prefs).jobs
    const local = verified.map((job) => {
      const fitScore = Math.max(0, Math.min(100, Math.round(scoreJob(job, profile, prefs))))
      return {
        jobId: job.id, fitScore,
        verdict: fitScore >= 75 ? 'strong' as const : fitScore >= 55 ? 'good' as const : fitScore >= 35 ? 'stretch' as const : 'weak' as const,
        rationale: 'Local keyword ranking. Connect Groq from an AI action for a richer explanation.',
        matchedSkills: profile.skills.map((skill) => skill.name).filter((skill) => job.description.toLowerCase().includes(skill.toLowerCase())),
        missingSkills: [], redFlags: [], scoredAt: new Date().toISOString(), modelVersion: 'local-v2.3',
      }
    }).sort((a, b) => b.fitScore - a.fitScore)
    opts.onProgress?.({ phase: 'done', done: local.length, total: local.length })
    return local
  }

  // 2. Split cached vs. uncached.
  const cachedRows = await getMatchRows(candidates.map((c) => key(c.id)))
  const cached: MatchResult[] = []
  const todo: NormalizedJob[] = []
  const staleKeys: string[] = []
  candidates.forEach((c, i) => {
    const row = cachedRows[i]
    if (row && !isFailedMatchPlaceholder(row)) cached.push(row)
    else {
      todo.push(c)
      if (row) staleKeys.push(key(c.id))
    }
  })
  if (staleKeys.length) await deleteMatchRows(staleKeys)

  // 3. Enrich BA descriptions for the ones we'll actually score.
  opts.onProgress?.({ phase: 'enrich', done: 0, total: todo.length })
  await enrichBaDescriptions(todo, opts.signal)
  const verifiedTodo = filterCareerRelevantJobs(todo, profile, prefs).jobs

  // 4. LLM re-rank the uncached candidates.
  const fresh = await rerankAll(
    profile, prefs, verifiedTodo, apiKey,
    (done, total) => opts.onProgress?.({ phase: 'score', done, total }),
    opts.signal,
  )

  // 5. Persist fresh scores.
  if (fresh.length) {
    const rows: MatchRow[] = fresh.map((m) => ({ ...m, cacheKey: key(m.jobId) }))
    await putMatchRows(rows)
  }

  // 6. Merge + sort best-first.
  const all = [...cached, ...fresh]
  all.sort((a, b) => b.fitScore - a.fitScore)
  opts.onProgress?.({ phase: 'done', done: all.length, total: cached.length + verifiedTodo.length })
  return all
}
