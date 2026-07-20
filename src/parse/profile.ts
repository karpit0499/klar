// ============================================================================
// Résumé → structured Profile via the LLM. Deterministic prompt building is
// split out (buildProfilePrompt) so it can be unit-tested without a network call.
// ============================================================================
import type { Profile } from '../types'
import { groqChat, extractJson } from '../llm/groq'

const SYSTEM = `You extract structured data from résumés. You never invent facts not present in the text. Reply with ONE JSON object and nothing else.`

export function buildProfilePrompt(rawText: string): string {
  return [
    'Extract a candidate profile from this résumé text.',
    'Return a JSON object with EXACTLY these keys:',
    'summary (string, 1-2 sentences), titles (array of {title, seniority?, years?}),',
    'skills (array of {name, level?}), domains (string[]), totalYears (number|null),',
    'education (array of {degree?, field?, institution?}),',
    'languages (array of {lang, level?}), certifications (string[]).',
    'Use empty arrays/nulls where information is missing. Do NOT guess.',
    '',
    'RÉSUMÉ TEXT:',
    '"""',
    rawText.slice(0, 12000),
    '"""',
  ].join('\n')
}

type RawProfile = Partial<Omit<Profile, 'rawText'>>

/** Defensively coerce the model's JSON into a complete Profile. */
export function coerceProfile(raw: RawProfile, rawText: string): Profile {
  return {
    summary: raw.summary ?? '',
    titles: Array.isArray(raw.titles) ? raw.titles : [],
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    domains: Array.isArray(raw.domains) ? raw.domains : [],
    totalYears: typeof raw.totalYears === 'number' ? raw.totalYears : undefined,
    education: Array.isArray(raw.education) ? raw.education : [],
    languages: Array.isArray(raw.languages) ? raw.languages : [],
    certifications: Array.isArray(raw.certifications) ? raw.certifications : [],
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
    json: true,
    temperature: 0,
    maxTokens: 2048,
    signal,
  })
  const raw = extractJson<RawProfile>(text)
  return coerceProfile(raw, rawText)
}