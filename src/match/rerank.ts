// ============================================================================
// LLM re-rank — the "smart" matching pass. Sends small BATCHES of pre-filtered
// jobs to Groq with the profile + preferences and asks for a structured score,
// rationale, and skill-gap analysis per job. Batching keeps each prompt small
// and lets us show progress.
// ============================================================================
import type { MatchResult, NormalizedJob, Preferences, Profile } from '../types'
import { MATCH } from '../lib/config'
import { estimateRerankOutputTokens } from '../llm/budget'
import { chatComplete, extractJson, resolveModel } from '../llm/groq'
import { loadEngineSettings } from '../llm/provider'
import { RERANK_OUTPUT } from '../llm/jsonSchemas'
import { AppError, type ErrorCategory } from '../errors/appError'

const SYSTEM = `You are a precise technical recruiter. You compare a candidate profile to job postings and score fit HONESTLY. You never inflate scores. You must reply with a single JSON object and nothing else.`

const LEGACY_FAILED_RATIONALE = 'Scoring failed for this batch.'

export type RerankDiagnostics = {
  requestedCount: number
  completedCount: number
  missingCount: number
  failedBatchCount: number
  partialBatchCount: number
  failuresByCategory: Partial<Record<ErrorCategory, number>>
}

/** Identify 0/100 placeholders written by older Klar builds after an API error. */
export function isFailedMatchPlaceholder(match: MatchResult): boolean {
  // IndexedDB can contain rows written by older JavaScript bundles, so coerce
  // the score and trim the message instead of assuming today's runtime types.
  return Number(match.fitScore) === 0 &&
    typeof match.rationale === 'string' &&
    match.rationale.trim() === LEGACY_FAILED_RATIONALE
}

/** Build the (deterministic, testable) user prompt for one batch. */
export function buildRerankPrompt(
  profile: Profile,
  prefs: Preferences,
  batch: NormalizedJob[],
): string {
  const profileBlock = {
    summary: profile.summary,
    titles: profile.titles,
    skills: profile.skills.map((s) => s.name),
    totalYears: profile.totalYears,
    domains: profile.domains,
    languages: profile.languages,
  }
  const prefsBlock = {
    targetTitles: prefs.targetTitles,
    fields: prefs.fields,
    seniority: prefs.seniority,
    salary: prefs.salary,
    locations: prefs.locations,
    remoteOnly: prefs.remoteOnly,
    mustHaves: prefs.mustHaves,
    dealbreakers: prefs.dealbreakers,
  }
  // v2.4.3: only the fields the scorer actually reads. A whole `location`
  // object, lat/lng included, was being sent per job when the city and the
  // remote flag are all that is reasoned about.
  const jobsBlock = batch.map((j) => ({
    jobId: j.id,
    title: j.title,
    company: j.company,
    city: j.location.city,
    remote: j.location.remote || undefined,
    salary: j.salary.min != null || j.salary.max != null
      ? { min: j.salary.min, max: j.salary.max, period: j.salary.period, currency: j.salary.currency }
      : undefined,
    employment_type: j.employment_type,
    description: j.description.slice(0, MATCH.descriptionChars),
  }))

  return [
    'CANDIDATE PROFILE:',
    JSON.stringify(profileBlock),
    '',
    'CANDIDATE PREFERENCES:',
    JSON.stringify(prefsBlock),
    '',
    'JOBS TO SCORE:',
    JSON.stringify(jobsBlock),
    '',
    'For EACH job return an object with these exact keys:',
    'jobId (string, copy exactly), fitScore (0-100 integer), verdict ("strong"|"good"|"stretch"|"weak"),',
    'rationale (<=240 chars), matchedSkills (string[]), missingSkills (string[]),',
    'salaryFit ("above"|"in-range"|"below"|"unknown"), locationFit ("exact"|"commutable"|"remote"|"mismatch"),',
    'seniorityFit ("under"|"match"|"over"), redFlags (string[]),',
    'factors (object with 0-100 integer sub-scores: {"skills":..,"salary":..,"location":..,"seniority":..}),',
    'confidence (number 0-1: how sure you are, lower it when the description is thin).',
    'The factors must justify the fitScore: skills = how well the candidate\'s skills match,',
    'Treat the requested title AND job market/field as primary fit criteria. A shared secondary skill',
    'must not compensate for an unrelated role or industry (for example, data skills in a marketing résumé).',
    'salary = fit vs the candidate\'s salary preference (use 50 when unknown),',
    'location = fit vs the candidate\'s locations/remote preference, seniority = level fit.',
    'Reply ONLY as: {"results":[ ... ]} with one entry per job, same order.',
  ].join('\n')
}

/** Parse + defensively normalize the model's JSON into MatchResult[]. */
export function parseRerank(
  text: string,
  scoredAt: string,
  model: string,
  expectedJobIds?: readonly string[],
): MatchResult[] {
  const parsed = record(extractJson<unknown>(text))
  const rows = Array.isArray(parsed.results) ? parsed.results : []
  const expectedOrder = expectedJobIds
    ? uniqueStrings(expectedJobIds)
    : undefined
  const expected = expectedOrder ? new Set(expectedOrder) : undefined
  const byJobId = new Map<string, MatchResult>()
  const modelOrder: string[] = []

  for (const value of rows) {
    const row = record(value)
    const jobId = cleanText(row.jobId)
    const rawScore = finiteNumber(row.fitScore)
    // An omitted score is not an honest 0/100. Drop malformed rows so callers
    // never cache a provider/schema failure as a real weak match.
    if (!jobId || rawScore == null) continue
    if (expected && !expected.has(jobId)) continue
    if (byJobId.has(jobId)) continue

    const fitScore = clampScore(rawScore)
    byJobId.set(jobId, {
      jobId,
      fitScore,
      verdict: verdict(row.verdict) ?? verdictFromScore(fitScore),
      rationale: cleanText(row.rationale),
      matchedSkills: stringList(row.matchedSkills),
      missingSkills: stringList(row.missingSkills),
      salaryFit: salaryFit(row.salaryFit) ?? 'unknown',
      locationFit: locationFit(row.locationFit),
      seniorityFit: seniorityFit(row.seniorityFit),
      redFlags: stringList(row.redFlags),
      // Per-factor breakdown for the explainable score. If the model omitted it,
      // fall back to the holistic fitScore so the composite is always defined.
      factors: coerceFactors(row.factors, fitScore),
      confidence: clampUnit(row.confidence),
      scoredAt,
      modelVersion: model,
    })
    modelOrder.push(jobId)
  }

  // When a requested batch is supplied, preserve its order and reject invented
  // job IDs and duplicate rows. Without it, retain the model's original order
  // for backwards-compatible direct callers.
  const order = expectedOrder ?? modelOrder
  return order.flatMap((jobId) => {
    const match = byJobId.get(jobId)
    return match ? [match] : []
  })
}

/** Coerce a factors object to four 0–100 numbers, defaulting each to `fallback`. */
function coerceFactors(raw: unknown, fallback: number): MatchResult['factors'] {
  const f = record(raw)
  const one = (v: unknown) => (v == null ? fallback : clampScore(v))
  return {
    skills: one(f.skills),
    salary: one(f.salary),
    location: one(f.location),
    seniority: one(f.seniority),
  }
}

/** Clamp a confidence-like value into 0–1, or undefined if absent/invalid. */
function clampUnit(n: unknown): number | undefined {
  if (n == null) return undefined
  const v = typeof n === 'number' ? n : Number(n)
  if (!isFinite(v)) return undefined
  return Math.max(0, Math.min(1, v))
}

function clampScore(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return isFinite(value) ? value : undefined
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return isFinite(parsed) ? parsed : undefined
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueStrings(value)
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const item = cleanText(value)
    if (!item || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

function verdict(value: unknown): MatchResult['verdict'] | undefined {
  return value === 'strong' || value === 'good' || value === 'stretch' || value === 'weak'
    ? value
    : undefined
}

function salaryFit(value: unknown): MatchResult['salaryFit'] | undefined {
  return value === 'above' || value === 'in-range' || value === 'below' || value === 'unknown'
    ? value
    : undefined
}

function locationFit(value: unknown): MatchResult['locationFit'] | undefined {
  return value === 'exact' || value === 'commutable' || value === 'remote' || value === 'mismatch'
    ? value
    : undefined
}

function seniorityFit(value: unknown): MatchResult['seniorityFit'] | undefined {
  return value === 'under' || value === 'match' || value === 'over'
    ? value
    : undefined
}

function verdictFromScore(s: number): MatchResult['verdict'] {
  if (s >= 80) return 'strong'
  if (s >= 60) return 'good'
  if (s >= 40) return 'stretch'
  return 'weak'
}

/** Score one batch via the LLM. */
export async function rerankBatch(
  profile: Profile,
  prefs: Preferences,
  batch: NormalizedJob[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<MatchResult[]> {
  // v2.5 (B2 cost control): matching is the highest-volume LLM path in Klar —
  // up to MATCH.candidateLimit / MATCH.batchSize calls per search. A person on a
  // free tier can opt into the engine's smaller model for this path alone in
  // Settings › AI engine, without touching tailoring or letter quality.
  const engine = await loadEngineSettings()
  const text = await chatComplete({
    apiKey,
    system: SYSTEM,
    user: buildRerankPrompt(profile, prefs, batch),
    jsonSchema: RERANK_OUTPUT,
    fast: engine.fastMatching,
    temperature: 0,
    maxTokens: estimateRerankOutputTokens(batch.length),
    signal,
  })
  const parsed = parseRerank(
    text,
    new Date().toISOString(),
    resolveModel(engine, { fast: engine.fastMatching }),
    batch.map((job) => job.id),
  )
  if (batch.length && parsed.length === 0) {
    throw new Error('Scoring response contained no valid job results.')
  }
  return parsed
}

/** Score all candidates, batch by batch, invoking onProgress after each batch. */
export async function rerankAll(
  profile: Profile,
  prefs: Preferences,
  candidates: NormalizedJob[],
  apiKey: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  onDiagnostics?: (diagnostics: RerankDiagnostics) => void,
  onBatch?: (matches: MatchResult[]) => void,
): Promise<MatchResult[]> {
  const out: MatchResult[] = []
  const size = MATCH.batchSize
  let consecutiveFailures = 0
  const diagnostics: RerankDiagnostics = {
    requestedCount: candidates.length,
    completedCount: 0,
    missingCount: candidates.length,
    failedBatchCount: 0,
    partialBatchCount: 0,
    failuresByCategory: {},
  }
  for (let i = 0; i < candidates.length; i += size) {
    const batch = candidates.slice(i, i + size)
    try {
      const matches = await rerankBatch(profile, prefs, batch, apiKey, signal)
      out.push(...matches)
      onBatch?.(matches)
      if (matches.length < batch.length) diagnostics.partialBatchCount += 1
      consecutiveFailures = 0
    } catch (caught) {
      if (isAbortError(caught)) throw caught
      // A failed batch is not a real 0/100 match. Omit it so the UI can show a
      // partial-results notice and retry those jobs on the next run. Failed
      // placeholders would otherwise be cached and look like honest scores.
      consecutiveFailures += 1
      diagnostics.failedBatchCount += 1
      const category = scoringFailureCategory(caught)
      diagnostics.failuresByCategory[category] =
        (diagnostics.failuresByCategory[category] ?? 0) + 1
      // v2.4.3: a token or request limit will not clear inside one search, so
      // firing the remaining batches only burns the user's quota for nothing.
      const terminal =
        category === 'rate_limit' ||
        category === 'credentials' ||
        category === 'validation'
      if (terminal || consecutiveFailures >= MATCH.maxConsecutiveBatchFailures) {
        onProgress?.(Math.min(i + size, candidates.length), candidates.length)
        break
      }
    }
    onProgress?.(Math.min(i + size, candidates.length), candidates.length)
  }
  diagnostics.completedCount = out.length
  diagnostics.missingCount = Math.max(0, candidates.length - out.length)
  onDiagnostics?.(diagnostics)
  return out
}

function scoringFailureCategory(caught: unknown): ErrorCategory {
  if (caught instanceof AppError) return caught.category
  return caught instanceof SyntaxError ? 'parsing' : 'unknown'
}

function isAbortError(caught: unknown): boolean {
  return (
    (caught instanceof DOMException && caught.name === 'AbortError') ||
    (!!caught &&
      typeof caught === 'object' &&
      'name' in caught &&
      (caught as { name?: unknown }).name === 'AbortError')
  )
}