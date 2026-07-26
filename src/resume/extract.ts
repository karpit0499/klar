import type { ResumeData } from './types'
import { normalizeResume } from './canonical'
import { groqChat, extractJson } from '../llm/groq'
import { RESUME_EXTRACTION_OUTPUT } from '../llm/jsonSchemas'

const SYSTEM = `You convert résumé text into structured JSON. Copy facts exactly as written. Never invent employers, dates, titles, tools, responsibilities, qualifications, or metrics. Leave absent fields empty. Reply with one JSON object only.`

export function buildResumeExtractionPrompt(rawText: string): string {
  return [
    'Extract this résumé into a JSON object with exactly these keys:',
    'contact: { name: string, email: string|null, phone: string|null, location: string|null, links: [{label: string, url: string}] },',
    'summary (string|null),',
    'experience: [{ title: string, company: string, city: string|null, start: string|null, end: string|null, current: boolean|null, bullets: string[] }],',
    'education: [{ degree: string|null, field: string|null, institution: string|null, city: string|null, start: string|null, end: string|null }],',
    'skills: [{ group: string|null, items: string[] }],',
    'languages: [{ lang: string, level: string|null }],',
    'projects: [{ name: string, summary: string|null, tech: string[]|null, link: string|null }],',
    'certifications: [{ name: string, issuer: string|null, issued: string|null }].',
    'Use MM/YYYY dates. Set current=true and end=null for an ongoing role.',
    'Preserve every dated role and every achievement bullet. Do not summarize away evidence.',
    'Every listed key is required. Use empty arrays or null for missing information. Do not guess.',
    '', 'RÉSUMÉ TEXT:', '"""', rawText.slice(0, 14000), '"""',
  ].join('\n')
}

export function coerceResumeData(raw: unknown): ResumeData {
  return normalizeResume(sanitizeExtractionPayload(raw), 'upload')
}

export async function extractResumeData(
  rawText: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ResumeData> {
  const text = await groqChat({
    apiKey, system: SYSTEM, user: buildResumeExtractionPrompt(rawText),
    jsonSchema: RESUME_EXTRACTION_OUTPUT, temperature: 0, maxTokens: 4096, signal,
  })
  return coerceResumeData(extractJson<unknown>(text))
}

/**
 * Remove only structurally empty or wrongly typed nested rows before canonical
 * normalization. Partial but meaningful source evidence is preserved; no text
 * is synthesized to fill provider omissions.
 */
function sanitizeExtractionPayload(value: unknown): Record<string, unknown> {
  const raw = record(value)
  const contact = record(raw.contact)
  const links = array(contact.links).filter((item) => {
    const link = record(item)
    return Boolean(cleanText(link.label) || cleanText(link.url))
  })

  const experience = array(raw.experience).flatMap((item) => {
    const row = record(item)
    const bullets = array(row.bullets).filter((bullet) => {
      if (typeof bullet === 'string') return Boolean(bullet.trim())
      return Boolean(cleanText(record(bullet).text))
    })
    const meaningful = ['title', 'company', 'city', 'start', 'end']
      .some((key) => Boolean(cleanText(row[key]))) || bullets.length > 0
    if (!meaningful) return []
    return [{
      ...row,
      current: typeof row.current === 'boolean' ? row.current : undefined,
      bullets,
    }]
  })

  const education = array(raw.education).filter((item) => {
    const row = record(item)
    return ['degree', 'field', 'institution', 'city', 'start', 'end']
      .some((key) => Boolean(cleanText(row[key])))
  })

  const skills = array(raw.skills).flatMap((item) => {
    const row = record(item)
    const items = array(row.items).filter((skill) => {
      if (typeof skill === 'string') return Boolean(skill.trim())
      return Boolean(cleanText(record(skill).name))
    })
    return items.length ? [{ ...row, items }] : []
  })

  const languages = array(raw.languages).filter((item) =>
    Boolean(cleanText(record(item).lang)),
  )

  const projects = array(raw.projects).flatMap((item) => {
    const row = record(item)
    const tech = array(row.tech).filter((entry) => Boolean(cleanText(entry)))
    const meaningful = Boolean(
      cleanText(row.name) || cleanText(row.summary) || cleanText(row.link) || tech.length,
    )
    return meaningful ? [{ ...row, tech }] : []
  })

  const certifications = array(raw.certifications).filter((item) => {
    if (typeof item === 'string') return Boolean(item.trim())
    return Boolean(cleanText(record(item).name))
  })

  return {
    ...raw,
    contact: { ...contact, links },
    experience,
    education,
    skills,
    languages,
    projects,
    certifications,
  }
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
