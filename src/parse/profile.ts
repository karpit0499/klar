// ============================================================================
// Résumé → structured Profile via the LLM. Deterministic prompt building is
// split out (buildProfilePrompt) so it can be unit-tested without a network call.
// ============================================================================
import type { Profile } from '../types'
import { groqChat, extractJson } from '../llm/groq'
import { PROFILE_OUTPUT } from '../llm/jsonSchemas'

const SYSTEM = `You extract structured data from résumés. You never invent facts not present in the text. Reply with ONE JSON object and nothing else.`

export function buildProfilePrompt(rawText: string, asOf = new Date()): string {
  const today = asOf.toISOString().slice(0, 10)
  return [
    'Extract a candidate profile from this résumé text.',
    `Treat ${today} as today's date when a role ends in Present, Current, Heute, or Jetzt.`,
    'Return a JSON object with EXACTLY these keys:',
    'summary (string, 1-2 sentences), titles (array of {title, seniority?, years?}),',
    'skills (array of {name, level?}), domains (string[]), totalYears (number|null),',
    'education (array of {degree?, field?, institution?}),',
    'languages (array of {lang, level?}), certifications (string[]).',
    'For each title, calculate years from its own date range to one decimal place; do not confuse role tenure with total experience.',
    'Use empty arrays/nulls where information is missing. Do NOT guess.',
    '',
    'RÉSUMÉ TEXT:',
    '"""',
    rawText.slice(0, 12000),
    '"""',
  ].join('\n')
}

/** Defensively coerce the model's JSON into a complete Profile. */
export function coerceProfile(raw: unknown, rawText: string): Profile {
  const parsed = record(raw)
  const totalYears = nonNegativeNumber(parsed.totalYears)
  return {
    summary: cleanText(parsed.summary),
    titles: array(parsed.titles).flatMap((value) => {
      const row = record(value)
      const title = cleanText(row.title)
      if (!title) return []
      const seniority = cleanText(row.seniority)
      const years = nonNegativeNumber(row.years)
      return [{
        title,
        ...(seniority ? { seniority } : {}),
        ...(years != null ? { years } : {}),
      }]
    }),
    skills: array(parsed.skills).flatMap((value) => {
      const row = record(value)
      const name = cleanText(row.name)
      if (!name) return []
      const level = cleanText(row.level)
      return [{ name, ...(level ? { level } : {}) }]
    }),
    domains: stringList(parsed.domains),
    totalYears,
    education: array(parsed.education).flatMap((value) => {
      const row = record(value)
      const degree = cleanText(row.degree)
      const field = cleanText(row.field)
      const institution = cleanText(row.institution)
      if (!degree && !field && !institution) return []
      return [{
        ...(degree ? { degree } : {}),
        ...(field ? { field } : {}),
        ...(institution ? { institution } : {}),
      }]
    }),
    languages: array(parsed.languages).flatMap((value) => {
      const row = record(value)
      const lang = cleanText(row.lang)
      if (!lang) return []
      const level = cleanText(row.level)
      return [{ lang, ...(level ? { level } : {}) }]
    }),
    certifications: stringList(parsed.certifications),
    rawText,
  }
}

export async function parseProfile(
  rawText: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Profile> {
  const text = await groqChat({
    apiKey,
    system: SYSTEM,
    user: buildProfilePrompt(rawText),
    jsonSchema: PROFILE_OUTPUT,
    temperature: 0,
    maxTokens: 2048,
    signal,
  })
  const raw = extractJson<unknown>(text)
  return coerceProfile(raw, rawText)
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const valueItem of array(value)) {
    const item = cleanText(valueItem)
    if (!item || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

function nonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !isFinite(value) || value < 0) return undefined
  return value
}
