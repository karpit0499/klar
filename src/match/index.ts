// ============================================================================
// Matching orchestrator: pre-filter → enrich BA descriptions (lazy, bounded) →
// LLM re-rank (cached). The cache key is hash(profile+prefs)+jobId so re-running
// the same search is instant and cheap; only new jobs hit the LLM.
// ============================================================================
import type { MatchResult, NormalizedJob, Preferences, Profile } from '../types'
import { MATCH } from '../lib/config'
import { stableHash } from '../lib/hash'
import { prefilter } from './prefilter'
import { semanticPrefilter } from './semantic'
import {
  isFailedMatchPlaceholder,
  rerankAll,
  type RerankDiagnostics,
} from './rerank'
import { fetchBaDetail } from '../sources/ba'
import type { MatchRow } from '../db/db'
import { deleteMatchRows, getMatchRows, putMatchRows } from '../storage/careerData'
import { CAREER_RELEVANCE_VERSION, filterCareerRelevantJobs } from './relevance'
import { buildLocalMatch, isLocalMatch } from './fallback'
import type { ErrorCategory } from '../errors/appError'

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

export type MatchRunDiagnostics = {
  candidateCount: number
  notPrioritizedCount: number
  aiRequestedCount: number
  aiCachedCount: number
  aiFreshCount: number
  localFallbackCount: number
  failedBatchCount: number
  partialBatchCount: number
  failuresByCategory: Partial<Record<ErrorCategory, number>>
}

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
    /** Publish the bounded candidate set before optional AI work starts. */
    onCandidates?: (candidates: NormalizedJob[]) => void
    /** Publish complete snapshots. Every candidate always has a local or AI match. */
    onMatches?: (matches: MatchResult[]) => void
    /** Publish the reconciled initial, progressive, and terminal matching funnel. */
    onDiagnostics?: (diagnostics: MatchRunDiagnostics) => void
  } = {},
): Promise<MatchResult[]> {
  // 1. Pre-filter to a bounded candidate set (keyword heuristic or embeddings).
  opts.onProgress?.({ phase: 'prefilter', done: 0, total: jobs.length })
  const selected =
    opts.prefilterMode === 'semantic'
      ? await semanticPrefilter(jobs, profile, prefs, MATCH.candidateLimit)
      : prefilter(jobs, profile, prefs, MATCH.candidateLimit)

  // Enrich before the final relevance check. SearchStep normally did this
  // already, but keeping the invariant here protects every direct caller.
  opts.onProgress?.({ phase: 'enrich', done: 0, total: selected.length })
  await enrichBaDescriptions(selected, opts.signal)
  const candidates = filterCareerRelevantJobs(selected, profile, prefs).jobs
  opts.onCandidates?.(candidates)

  const localById = new Map(
    candidates.map((job) => [job.id, buildLocalMatch(job, profile, prefs)]),
  )
  const snapshot = (aiById: ReadonlyMap<string, MatchResult>): MatchResult[] =>
    candidates.map((job) => aiById.get(job.id) ?? localById.get(job.id)!)

  // Local discovery remains available without an API key. The user is asked
  // for Groq only when an explicitly AI-dependent action is invoked.
  if (!apiKey) {
    const local = snapshot(new Map())
    opts.onMatches?.(local)
    opts.onDiagnostics?.({
      candidateCount: candidates.length,
      notPrioritizedCount: Math.max(0, jobs.length - selected.length),
      aiRequestedCount: 0,
      aiCachedCount: 0,
      aiFreshCount: 0,
      localFallbackCount: local.length,
      failedBatchCount: 0,
      partialBatchCount: 0,
      failuresByCategory: {},
    })
    opts.onProgress?.({ phase: 'done', done: local.length, total: local.length })
    return local
  }

  const ctx = matchContextHash(profile, prefs)
  const key = (jobId: string) => `${ctx}:${jobId}`

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

  const aiById = new Map(cached.map((match) => [match.jobId, match]))
  let rerankDiagnostics: RerankDiagnostics = {
    requestedCount: todo.length,
    completedCount: 0,
    missingCount: todo.length,
    failedBatchCount: 0,
    partialBatchCount: 0,
    failuresByCategory: {},
  }
  const publishDiagnostics = () => {
    const aiFreshCount = Math.max(0, aiById.size - cached.length)
    opts.onDiagnostics?.({
      candidateCount: candidates.length,
      notPrioritizedCount: Math.max(0, jobs.length - selected.length),
      aiRequestedCount: todo.length,
      aiCachedCount: cached.length,
      aiFreshCount,
      localFallbackCount: Math.max(0, candidates.length - aiById.size),
      failedBatchCount: rerankDiagnostics.failedBatchCount,
      partialBatchCount: rerankDiagnostics.partialBatchCount,
      failuresByCategory: rerankDiagnostics.failuresByCategory,
    })
  }
  // Publish every candidate before the first provider request. Cached AI results
  // override local scores; every uncached candidate keeps an honest local score.
  // Publish the same reconciled counts immediately so the diagnostics panel
  // cannot show a pre-candidate filter total beside the local snapshot.
  opts.onMatches?.(snapshot(aiById))
  publishDiagnostics()

  // 3. LLM re-rank the uncached candidates. Missing rows and failed batches
  // retain their local result instead of disappearing from the UI.
  const fresh = await rerankAll(
    profile, prefs, todo, apiKey,
    (done, total) => opts.onProgress?.({ phase: 'score', done, total }),
    opts.signal,
    (diagnostics) => {
      rerankDiagnostics = diagnostics
    },
    (batch) => {
      for (const match of batch) aiById.set(match.jobId, match)
      opts.onMatches?.(snapshot(aiById))
      publishDiagnostics()
    },
  )

  // 4. Persist only provider scores. Local fallbacks are deterministic and can
  // always be rebuilt; caching them would make a later AI retry look complete.
  if (fresh.length) {
    const rows: MatchRow[] = fresh.map((m) => ({ ...m, cacheKey: key(m.jobId) }))
    await putMatchRows(rows)
  }

  for (const match of fresh) aiById.set(match.jobId, match)
  const all = snapshot(aiById)
  const diagnostics: MatchRunDiagnostics = {
    candidateCount: candidates.length,
    notPrioritizedCount: Math.max(0, jobs.length - selected.length),
    aiRequestedCount: todo.length,
    aiCachedCount: cached.length,
    aiFreshCount: fresh.length,
    localFallbackCount: all.filter(isLocalMatch).length,
    failedBatchCount: rerankDiagnostics.failedBatchCount,
    partialBatchCount: rerankDiagnostics.partialBatchCount,
    failuresByCategory: rerankDiagnostics.failuresByCategory,
  }
  opts.onMatches?.(all)
  opts.onDiagnostics?.(diagnostics)
  opts.onProgress?.({
    phase: 'done',
    done: cached.length + fresh.length,
    total: candidates.length,
  })
  return all
}