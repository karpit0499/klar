// ============================================================================
// Structured résumé extraction for the generator (feature 12).
//
// The matching Profile is intentionally thin. To GENERATE a résumé we need the
// richer ResumeData (contact, dated experience with bullets, education dates,
// projects). We extract that from the user's OWN résumé text with one LLM pass —
// so it's the user's real content, restructured, never invented. The prompt
// builder is pure (unit-testable); the call reuses the same direct-to-Groq
// client as everything else. `coerceResumeData` defensively fills every field.
// ============================================================================
import type { ResumeData } from './types'
import { groqChat, extractJson } from '../llm/groq'

const SYSTEM = `You convert résumé text into structured JSON. You copy facts EXACTLY as written and NEVER invent employers, dates, titles, or skills. If a field is absent in the text, leave it empty. Reply with ONE JSON object and nothing else.`

/** Deterministic, testable prompt to structure a résumé into ResumeData JSON. */
export function buildResumeExtractionPrompt(rawText: string): string {
  return [
    'Extract this résumé into a JSON object with EXACTLY these keys:',
    'contact: { name (string), email?, phone?, location?, links: [{label, url}] },',
    'summary (string|null), experience: [{ title, company, city?, start?, end?, current?(bool), bullets: string[] }],',
    'education: [{ degree?, field?, institution?, city?, start?, end? }],',
    'skills: [{ group?, items: string[] }], languages: [{ lang, level? }],',
    'projects: [{ name, summary?, tech?: string[], link? }], certifications: string[].',
    'Dates MUST be formatted as "MM/YYYY". Set current=true (and omit end) for an ongoing role.',
    'Group skills sensibly (e.g. "Programming", "Cloud", "ML"). Copy bullet achievements verbatim.',
    'Use empty arrays / null where information is missing. Do NOT guess or embellish.',
    '',
    'RÉSUMÉ TEXT:',
    '"""',
    rawText.slice(0, 14000),
    '"""',
  ].join('\n')
}

type RawResume = Partial<ResumeData>

/** Coerce the model's JSON into a complete ResumeData (never throws on shape). */
export function coerceResumeData(raw: RawResume): ResumeData {
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  const c = (raw.contact ?? {}) as Partial<ResumeData['contact']>
  return {
    contact: {
      name: typeof c.name === 'string' ? c.name : '',
      email: typeof c.email === 'string' ? c.email : undefined,
      phone: typeof c.phone === 'string' ? c.phone : undefined,
      location: typeof c.location === 'string' ? c.location : undefined,
      links: arr<{ label: string; url: string }>(c.links).filter((l) => l && l.url),
    },
    summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    experience: arr<ResumeData['experience'][number]>(raw.experience).map((e) => ({
      title: e.title ?? '', company: e.company ?? '', city: e.city,
      start: e.start, end: e.end, current: Boolean(e.current),
      bullets: arr<string>(e.bullets),
    })),
    education: arr<ResumeData['education'][number]>(raw.education),
    skills: arr<ResumeData['skills'][number]>(raw.skills).map((g) => ({ group: g.group, items: arr<string>(g.items) })),
    languages: arr<ResumeData['languages'][number]>(raw.languages),
    projects: arr<ResumeData['projects'][number]>(raw.projects),
    certifications: arr<string>(raw.certifications),
  }
}

/** Extract structured ResumeData from résumé text via the LLM. */
export async function extractResumeData(
  rawText: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ResumeData> {
  const text = await groqChat({
    apiKey, system: SYSTEM, user: buildResumeExtractionPrompt(rawText),
    json: true, temperature: 0, maxTokens: 4096, signal,
  })
  return coerceResumeData(extractJson<RawResume>(text))
}