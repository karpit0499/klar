// ============================================================================
// v2.5 · WS2 — the job-requirement extractor.
//
// PROBLEM: `SKILL_DICTIONARY` in src/resume/keywords.ts is ~90 hard-tech terms.
// For a marketing, logistics, lab or admin posting it finds almost nothing, so
// coverage reads "No specific skills detected" and tailoring has nothing to
// mirror. That makes the whole coverage loop useless for exactly the
// career-changer Klar is built for.
//
// SOLUTION, with the watch-outs the ATS plan demands:
//   • The deterministic dictionary stays the TESTED FAST PATH. This module is
//     purely ADDITIVE — if it is flagged off, errors, or returns nothing, the
//     v2.4 behaviour is what happens.
//   • CI stays hermetic (Risk R6). The only network call lives in
//     `extractJdRequirements`; every judgement about what is a legitimate
//     requirement lives in the PURE `sanitizeJdTerms`, which the unit tests
//     exercise with fixtures and no key.
//   • The model may only SURFACE words the posting actually contains. Anything
//     it invents is dropped by the verbatim check — Klar will not tell a person
//     that a posting demands something it never mentioned.
//   • Results are cached (LRU in the settings store), so re-opening the same job
//     costs no extra tokens. That is the Risk-R4 cost mitigation.
// ============================================================================
import type { NormalizedJob } from '../types'
import { JD_TERMS } from '../lib/config'
import { getSetting, setSetting } from '../db/db'
import { stableHash } from '../lib/hash'
import { containsTerm } from '../resume/keywords'
import { chatComplete, extractJson } from './groq'
import { JD_REQUIREMENTS_OUTPUT } from './jsonSchemas'

export type JdRequirementSet = {
  terms: string[]
  source: 'llm' | 'cache' | 'dictionary-only'
  extractedAt: string
}

type CacheEntry = { key: string; terms: string[]; extractedAt: string }

const CACHE_KEY = 'jdTerms.v1'

/** Meta words that describe a posting rather than a requirement. */
const STOPLIST = new Set([
  'experience', 'erfahrung', 'years', 'jahre', 'job', 'role', 'rolle', 'position',
  'company', 'unternehmen', 'team', 'work', 'working', 'arbeit', 'tasks', 'aufgaben',
  'requirements', 'anforderungen', 'profile', 'profil', 'benefits', 'salary', 'gehalt',
  'full-time', 'part-time', 'vollzeit', 'teilzeit', 'candidate', 'bewerber', 'you', 'we',
  'wir', 'du', 'sie', 'the', 'and', 'und', 'oder', 'or', 'a', 'an',
])

/** A stable cache key for one posting's text. */
export function jdCacheKey(job: NormalizedJob): string {
  return stableHash(`${job.title}${job.company}${job.description}`)
}

/**
 * PURE. Turn a model reply into a trustworthy requirement list.
 *
 * Every rule here is a truth guard, not a style preference:
 *  1. strings only, trimmed, 2–40 characters
 *  2. the phrase must appear VERBATIM in the posting (no invented demands)
 *  3. no meta words, no bare numbers
 *  4. case-insensitive de-duplication, original order preserved
 *  5. hard cap, so one noisy reply cannot flood the coverage panel
 */
export function sanitizeJdTerms(
  raw: unknown,
  job: Pick<NormalizedJob, 'title' | 'description'>,
  limit: number = JD_TERMS.maxTerms,
): string[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { requirements?: unknown })?.requirements)
      ? (raw as { requirements: unknown[] }).requirements
      : []
  const haystack = `${job.title}\n${job.description}`
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of list) {
    if (typeof value !== 'string') continue
    const term = value.trim().replace(/\s+/g, ' ')
    if (term.length < 2 || term.length > 40) continue
    const lower = term.toLowerCase()
    if (seen.has(lower)) continue
    if (STOPLIST.has(lower)) continue
    if (/^[\d\s.,%+-]+$/.test(term)) continue
    if (!containsTerm(haystack, term)) continue
    seen.add(lower)
    out.push(term)
    if (out.length >= limit) break
  }
  return out
}

/** The extractor's system prompt. Exported so a test can assert its guardrails. */
export const JD_TERMS_SYSTEM = `You extract the concrete requirements a job posting asks for.

Rules:
1. Return only skills, tools, methods, qualifications, certificates, languages or domain knowledge the posting explicitly names.
2. Copy each requirement using words that appear VERBATIM in the posting. Never paraphrase and never add a requirement the posting does not state.
3. Prefer short noun phrases of one to four words.
4. Do not return generic words such as "experience", "team", "tasks" or "requirements".
5. Return at most 12 items, most important first.
6. Return valid JSON only, exactly: {"requirements": ["string"]}`

function buildUserPrompt(job: NormalizedJob): string {
  return JSON.stringify(
    {
      title: job.title,
      company: job.company,
      description: job.description.slice(0, JD_TERMS.descriptionChars),
    },
    null,
    2,
  )
}

// --- Cache (LRU in the plaintext settings store; job text is not stored) ------

async function readCache(): Promise<CacheEntry[]> {
  try {
    const rows = await getSetting<CacheEntry[]>(CACHE_KEY)
    if (!Array.isArray(rows)) return []
    return rows.flatMap((value) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
      const row = value as Record<string, unknown>
      const key = typeof row.key === 'string' ? row.key.trim() : ''
      const extractedAt = typeof row.extractedAt === 'string' ? row.extractedAt : ''
      const terms = Array.isArray(row.terms)
        ? row.terms.filter((term): term is string => typeof term === 'string' && Boolean(term.trim()))
        : []
      // Old builds could cache an empty malformed provider response forever.
      // Ignore those rows so a later request can recover.
      return key && terms.length ? [{ key, terms, extractedAt }] : []
    })
  } catch {
    return []
  }
}

async function writeCache(entry: CacheEntry): Promise<void> {
  try {
    const rows = (await readCache()).filter((row) => row.key !== entry.key)
    rows.unshift(entry)
    await setSetting(CACHE_KEY, rows.slice(0, JD_TERMS.cacheLimit))
  } catch {
    // A cache miss is never a user-visible failure.
  }
}

export async function readCachedJdTerms(job: NormalizedJob): Promise<string[] | null> {
  const key = jdCacheKey(job)
  const hit = (await readCache()).find((row) => row.key === key)
  if (!hit) return null
  const terms = sanitizeJdTerms(hit.terms, job)
  return terms.length ? terms : null
}

export async function clearJdTermCache(): Promise<void> {
  await setSetting(CACHE_KEY, [])
}

// --- The one network call -----------------------------------------------------

/**
 * Ask the engine which requirements this posting states. Never throws: on any
 * failure the caller transparently keeps the deterministic dictionary result.
 */
export async function extractJdRequirements(
  job: NormalizedJob,
  apiKey: string | undefined,
  options: { signal?: AbortSignal; force?: boolean } = {},
): Promise<JdRequirementSet> {
  const now = new Date().toISOString()
  if (!options.force) {
    const cached = await readCachedJdTerms(job)
    if (cached) return { terms: cached, source: 'cache', extractedAt: now }
  }
  if (!apiKey) return { terms: [], source: 'dictionary-only', extractedAt: now }
  try {
    const raw = await chatComplete({
      apiKey,
      system: JD_TERMS_SYSTEM,
      user: buildUserPrompt(job),
      jsonSchema: JD_REQUIREMENTS_OUTPUT,
      fast: true,
      temperature: 0,
      maxTokens: 512,
      signal: options.signal,
    })
    const terms = sanitizeJdTerms(extractJson<unknown>(raw), job)
    // An empty sanitized result may be a partial schema-recovery payload or a
    // hallucinated list rejected by the verbatim guard. Do not persist it as a
    // durable "nothing required" answer; keep the deterministic path and allow
    // a future request to recover.
    if (!terms.length) {
      return { terms: [], source: 'dictionary-only', extractedAt: now }
    }
    await writeCache({ key: jdCacheKey(job), terms, extractedAt: now })
    return { terms, source: 'llm', extractedAt: now }
  } catch {
    return { terms: [], source: 'dictionary-only', extractedAt: now }
  }
}
