// ============================================================================
// LLM re-rank — the "smart" matching pass. Sends small BATCHES of pre-filtered
// jobs to Groq with the profile + preferences and asks for a structured score,
// rationale, and skill-gap analysis per job. Batching keeps each prompt small
// and lets us show progress.
// ============================================================================
import type { MatchResult, NormalizedJob, Preferences, Profile } from '../types'
import { MATCH, GROQ } from '../lib/config'
import { groqChat, extractJson } from '../llm/groq'

const SYSTEM = `You are a precise technical recruiter. You compare a candidate profile to job postings and score fit HONESTLY. You never inflate scores. You must reply with a single JSON object and nothing else.`

/** Build the (deterministic, testable) user prompt for one batch. */
export function buildRerankPrompt(
  profile: Profile,
  prefs: Preferences,
  batch: NormalizedJob[],
): string {
  const profileBlock = {
    titles: profile.titles,
    skills: profile.skills.map((s) => s.name),
    totalYears: profile.totalYears,
    domains: profile.domains,
    languages: profile.languages,
  }
  const prefsBlock = {
    targetTitles: prefs.targetTitles,
    seniority: prefs.seniority,
    salary: prefs.salary,
    locations: prefs.locations,
    remoteOnly: prefs.remoteOnly,
    mustHaves: prefs.mustHaves,
    dealbreakers: prefs.dealbreakers,
  }
  const jobsBlock = batch.map((j) => ({
    jobId: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    salary: j.salary,
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
    'salary = fit vs the candidate\'s salary preference (use 50 when unknown),',
    'location = fit vs the candidate\'s locations/remote preference, seniority = level fit.',
    'Reply ONLY as: {"results":[ ... ]} with one entry per job, same order.',
  ].join('\n')
}

type RawScore = Partial<MatchResult> & { jobId: string }

/** Parse + defensively normalize the model's JSON into MatchResult[]. */
export function parseRerank(text: string, scoredAt: string, model: string): MatchResult[] {
  const parsed = extractJson<{ results?: RawScore[] }>(text)
  const rows = parsed.results ?? []
  return rows.map((r) => {
    const fitScore = clampScore(r.fitScore)
    return {
      jobId: r.jobId,
      fitScore,
      verdict: r.verdict ?? verdictFromScore(fitScore),
      rationale: r.rationale ?? '',
      matchedSkills: r.matchedSkills ?? [],
      missingSkills: r.missingSkills ?? [],
      salaryFit: r.salaryFit ?? 'unknown',
      locationFit: r.locationFit,
      seniorityFit: r.seniorityFit,
      redFlags: r.redFlags ?? [],
      // Per-factor breakdown for the explainable score. If the model omitted it,
      // fall back to the holistic fitScore so the composite is always defined.
      factors: coerceFactors(r.factors, fitScore),
      confidence: clampUnit(r.confidence),
      scoredAt,
      modelVersion: model,
    }
  })
}

/** Coerce a factors object to four 0–100 numbers, defaulting each to `fallback`. */
function coerceFactors(raw: unknown, fallback: number): MatchResult['factors'] {
  const f = (raw ?? {}) as Record<string, unknown>
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
  const text = await groqChat({
    apiKey,
    system: SYSTEM,
    user: buildRerankPrompt(profile, prefs, batch),
    json: true,
    temperature: 0,
    maxTokens: 2048,
    signal,
  })
  return parseRerank(text, new Date().toISOString(), GROQ.model)
}

/** Score all candidates, batch by batch, invoking onProgress after each batch. */
export async function rerankAll(
  profile: Profile,
  prefs: Preferences,
  candidates: NormalizedJob[],
  apiKey: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<MatchResult[]> {
  const out: MatchResult[] = []
  const size = MATCH.batchSize
  for (let i = 0; i < candidates.length; i += size) {
    const batch = candidates.slice(i, i + size)
    try {
      out.push(...(await rerankBatch(profile, prefs, batch, apiKey, signal)))
    } catch {
      // A failed batch shouldn't kill the run — emit neutral placeholders.
      for (const j of batch) {
        out.push({
          jobId: j.id, fitScore: 0, verdict: 'weak', rationale: 'Scoring failed for this batch.',
          matchedSkills: [], missingSkills: [], salaryFit: 'unknown', redFlags: [],
          scoredAt: new Date().toISOString(), modelVersion: GROQ.model,
        })
      }
    }
    onProgress?.(Math.min(i + size, candidates.length), candidates.length)
  }
  return out
}