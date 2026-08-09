// ============================================================================
// Matching orchestrator: locally rank every relevant job, then optionally
// enrich a bounded AI-priority subset. The cache key includes the canonical
// posting content, so a source may update a stable job ID without reusing an
// explanation for the previous posting.
// ============================================================================
import type { MatchResult, NormalizedJob, Preferences, Profile } from '../types'
import { MATCH, type LlmRerankMode } from '../lib/config'
import { stableHash } from '../lib/hash'
import {
  isFailedMatchPlaceholder,
  rerankJobPromptInput,
  rerankBatch,
  rerankAll,
  type RerankDiagnostics,
} from './rerank'
import { fetchBaDetail } from '../sources/ba'
import type { MatchRow } from '../db/db'
import { deleteMatchRows, getMatchRows, putMatchRows } from '../storage/careerData'
import { CAREER_RELEVANCE_VERSION, filterCareerRelevantJobs } from './relevance'
import {
  buildLocalMatch,
  isLocalMatch,
  mergeAiExplanationWithLocal,
} from './fallback'
import { rankCandidateSetV2, RANKING_MODEL_VERSION } from './rankingV2'
import type { ErrorCategory } from '../errors/appError'

/** A stable fingerprint of the profile+prefs that influence scoring. */
export function matchContextHash(profile: Profile, prefs: Preferences): string {
  const sig = JSON.stringify({
    rv: CAREER_RELEVANCE_VERSION,
    ranking: RANKING_MODEL_VERSION,
    su: profile.summary, t: profile.titles, s: profile.skills.map((s) => s.name),
    d: profile.domains, y: profile.totalYears, la: profile.languages,
    ce: profile.certifications, ed: profile.education,
    tt: prefs.targetTitles, f: prefs.fields, se: prefs.seniority, sa: prefs.salary,
    lo: prefs.locations, ro: prefs.remoteOnly, hy: prefs.hybridOk,
    wa: prefs.workAuth, pl: prefs.languages, ct: prefs.contractType,
    mh: prefs.mustHaves, db: prefs.dealbreakers, w: prefs.weights,
  })
  return stableHash(sig)
}

export function matchJobContentHash(job: NormalizedJob): string {
  // Mirror the provider prompt exactly. Acquisition timestamps, source merge
  // metadata, and text beyond the prompt cap cannot change the explanation and
  // must not turn a refresh into another paid request.
  return stableHash(JSON.stringify(rerankJobPromptInput(job)))
}

export function matchCacheKey(
  profile: Profile,
  prefs: Preferences,
  job: NormalizedJob,
): string {
  return `${matchContextHash(profile, prefs)}:${job.id}:${matchJobContentHash(job)}`
}

/** Spend follows attention: enrich exactly one opened job, then cache it. */
export async function explainMatchWithAi(
  job: NormalizedJob,
  profile: Profile,
  prefs: Preferences,
  apiKey: string,
  signal?: AbortSignal,
): Promise<MatchResult> {
  const cacheKey = matchCacheKey(profile, prefs, job)
  const [cached] = await getMatchRows([cacheKey])
  if (cached && !isFailedMatchPlaceholder(cached)) return cached
  const [fresh] = await rerankBatch(profile, prefs, [job], apiKey, signal)
  if (!fresh) throw new Error('The AI explanation did not contain this job.')
  await putMatchRows([{ ...fresh, cacheKey }])
  return fresh
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
    /** @deprecated v2.6 accepts the historical value but ranking-v2 owns the one deterministic path. */
    prefilterMode?: 'keyword' | 'semantic'
    /** Publish every locally ranked relevant candidate before optional AI work starts. */
    onCandidates?: (candidates: NormalizedJob[]) => void
    /** Publish complete snapshots. Every candidate always has a local or AI match. */
    onMatches?: (matches: MatchResult[]) => void
    /** Publish the reconciled initial, progressive, and terminal matching funnel. */
    onDiagnostics?: (diagnostics: MatchRunDiagnostics) => void
    /** v2.5.5: deterministic by default; shortlist/top-40 AI remain explicit escapes. */
    rerankMode?: LlmRerankMode
    /** Language used by the private deterministic explanation. */
    locale?: 'en' | 'de'
  } = {},
): Promise<MatchResult[]> {
  // 1. Apply hard drops and rank every survivor locally. MATCH.candidateLimit
  // controls only automatic AI work; it must never truncate visible results.
  opts.onProgress?.({ phase: 'prefilter', done: 0, total: jobs.length })
  const selected = filterCareerRelevantJobs(jobs, profile, prefs).jobs

  // Enrich before the final relevance check. SearchStep normally did this
  // already, but keeping the invariant here protects every direct caller.
  opts.onProgress?.({ phase: 'enrich', done: 0, total: selected.length })
  await enrichBaDescriptions(selected, opts.signal)
  const rankedCandidates = rankCandidateSetV2(
    filterCareerRelevantJobs(selected, profile, prefs).jobs,
    profile,
    prefs,
  )
  const candidates = rankedCandidates.map((entry) => entry.job)
  opts.onCandidates?.(candidates)

  const localById = new Map(
    rankedCandidates.map((entry) => [
      entry.job.id,
      buildLocalMatch(
        entry.job,
        profile,
        prefs,
        entry.snapshot.evaluatedAt,
        opts.locale,
        entry.snapshot,
      ),
    ]),
  )
  const snapshot = (aiById: ReadonlyMap<string, MatchResult>): MatchResult[] =>
    candidates.map((job) => {
      const local = localById.get(job.id)!
      const ai = aiById.get(job.id)
      return ai ? mergeAiExplanationWithLocal(local, ai) : local
    })

  const rerankMode = opts.rerankMode ?? MATCH.llmRerank
  const aiPriority = candidates.slice(0, MATCH.candidateLimit)
  const aiCandidates =
    rerankMode === 'off'
      ? []
      : rerankMode === 'shortlist'
        ? aiPriority.slice(0, MATCH.shortlistSize)
        : aiPriority
  const notPrioritizedCount = Math.max(0, candidates.length - aiPriority.length)

  // Local discovery remains available without an API key. The user is asked
  // for Groq only when an explicitly AI-dependent action is invoked.
  if (!apiKey || aiCandidates.length === 0) {
    const local = snapshot(new Map())
    opts.onMatches?.(local)
    opts.onDiagnostics?.({
      candidateCount: candidates.length,
      notPrioritizedCount,
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

  const key = (job: NormalizedJob) => matchCacheKey(profile, prefs, job)
  const cacheKeyByJobId = new Map(
    aiCandidates.map((job) => [job.id, key(job)]),
  )

  // 2. Split cached vs. uncached.
  const cachedRows = await getMatchRows(aiCandidates.map(key))
  const cached: MatchResult[] = []
  const todo: NormalizedJob[] = []
  const staleKeys: string[] = []
  aiCandidates.forEach((c, i) => {
    const row = cachedRows[i]
    if (row && !isFailedMatchPlaceholder(row)) cached.push(row)
    else {
      todo.push(c)
      if (row) staleKeys.push(key(c))
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
      notPrioritizedCount,
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
    const rows: MatchRow[] = fresh.map((match) => ({
      ...match,
      cacheKey: cacheKeyByJobId.get(match.jobId)!,
    }))
    await putMatchRows(rows)
  }

  for (const match of fresh) aiById.set(match.jobId, match)
  const all = snapshot(aiById)
  const diagnostics: MatchRunDiagnostics = {
    candidateCount: candidates.length,
    notPrioritizedCount,
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
    done: candidates.length,
    total: candidates.length,
  })
  return all
}