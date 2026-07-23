import type { ResumeData } from './types'
import { normalizeResume } from './canonical'
import { groqChat, extractJson } from '../llm/groq'

const SYSTEM = `You convert résumé text into structured JSON. Copy facts exactly as written. Never invent employers, dates, titles, tools, responsibilities, qualifications, or metrics. Leave absent fields empty. Reply with one JSON object only.`

export function buildResumeExtractionPrompt(rawText: string): string {
  return [
    'Extract this résumé into a JSON object with exactly these keys:',
    'contact: { name, email?, phone?, location?, links: [{label, url}] },',
    'summary (string|null),',
    'experience: [{ title, company, city?, start?, end?, current?, bullets: string[] }],',
    'education: [{ degree?, field?, institution?, city?, start?, end? }],',
    'skills: [{ group?, items: string[] }],',
    'languages: [{ lang, level? }],',
    'projects: [{ name, summary?, tech?: string[], link? }],',
    'certifications: [{ name, issuer?, issued? }].',
    'Use MM/YYYY dates. Set current=true and omit end for an ongoing role.',
    'Preserve every dated role and every achievement bullet. Do not summarize away evidence.',
    'Use empty arrays or null for missing information. Do not guess.',
    '', 'RÉSUMÉ TEXT:', '"""', rawText.slice(0, 14000), '"""',
  ].join('\n')
}

export function coerceResumeData(raw: unknown): ResumeData {
  return normalizeResume(raw, 'upload')
}

export async function extractResumeData(
  rawText: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ResumeData> {
  const text = await groqChat({
    apiKey, system: SYSTEM, user: buildResumeExtractionPrompt(rawText),
    json: true, temperature: 0, maxTokens: 4096, signal,
  })
  return normalizeResume(extractJson<unknown>(text), 'upload')
}