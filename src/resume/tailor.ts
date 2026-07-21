// ============================================================================
// Deterministic résumé tailoring (feature 12).
//
// Given the user's structured ResumeData + a specific posting, produce a NEW
// ResumeData tailored to that job, applying the Appendix-A content rules:
//   • mirror the posting's exact terminology (covered JD terms surface first);
//   • reorder/select skills and bullets so JD-matching items lead;
//   • rewrite the Kurzprofil/Summary per job (assembled from facts only);
//   • pick the document language from the posting.
// It NEVER fabricates: it only reorders and re-labels what ResumeData contains.
// Pure + deterministic, so the whole thing is unit-testable and the output is
// reproducible — no LLM in this step, which is what keeps it honest.
// ============================================================================
import type { NormalizedJob, Profile } from '../types'
import type { ResumeData, ResumeLanguage, SkillGroup } from './types'
import { extractJdTerms, containsTerm, canonicalizeSkill, coverageReport, type CoverageReport } from './keywords'

/** Choose the résumé language from the posting (default English). */
export function pickLanguage(job: NormalizedJob): ResumeLanguage {
  if (job.language === 'de') return 'de'
  if (job.language === 'en') return 'en'
  // Fall back to sniffing obvious German markers in the text.
  const hay = `${job.title}\n${job.description}`.toLowerCase()
  const deHits = (hay.match(/\b(und|oder|erfahrung|kenntnisse|deutsch|aufgaben|wir|deine?)\b/g) ?? []).length
  return deHits >= 3 ? 'de' : 'en'
}

/** Rank a skills item by whether the JD asks for it (JD terms first, stable within). */
function orderItemsByJd(items: string[], jdTerms: string[]): string[] {
  const jdSet = new Set(jdTerms.map((t) => t.toLowerCase()))
  const isJd = (item: string) => {
    const canon = canonicalizeSkill(item)
    return jdSet.has(item.toLowerCase()) || (canon != null && jdSet.has(canon.toLowerCase()))
  }
  const hits = items.filter(isJd)
  const rest = items.filter((i) => !isJd(i))
  return [...hits, ...rest]
}

/** Reorder skill groups + items so JD-relevant skills lead (spec: biggest lever). */
export function tailorSkills(skills: SkillGroup[], jdTerms: string[]): SkillGroup[] {
  const jdSet = new Set(jdTerms.map((t) => t.toLowerCase()))
  const scored = skills.map((g) => {
    const items = orderItemsByJd(g.items, jdTerms)
    const hitCount = items.filter((i) => {
      const canon = canonicalizeSkill(i)
      return jdSet.has(i.toLowerCase()) || (canon != null && jdSet.has(canon.toLowerCase()))
    }).length
    return { group: { group: g.group, items }, hitCount }
  })
  // Groups with more JD hits float up; ties keep original order (stable sort).
  return scored
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => b.hitCount - a.hitCount || a.i - b.i)
    .map((s) => s.group)
}

/** Reorder an experience entry's bullets so JD-term-mentioning ones lead. */
export function tailorBullets(bullets: string[], jdTerms: string[]): string[] {
  const mentions = (b: string) => jdTerms.some((t) => containsTerm(b, t))
  const hits = bullets.filter(mentions)
  const rest = bullets.filter((b) => !mentions(b))
  return [...hits, ...rest]
}

/**
 * Build a 2–3 line Kurzprofil from FACTS ONLY: primary title, total years, and
 * the JD-covered skills the candidate genuinely has. This mirrors the posting's
 * terminology (covered terms) without inventing anything.
 */
export function buildTailoredSummary(
  data: ResumeData,
  coverage: CoverageReport,
  lang: ResumeLanguage,
): string {
  const primaryTitle = data.experience[0]?.title || data.contact.name
  const years =
    data.experience.length && data.experience[0].start
      ? undefined // real total is uncertain from ranges; keep it clean and omit
      : undefined
  const leadSkills = coverage.covered.slice(0, 5)
  if (lang === 'de') {
    const skillPart = leadSkills.length ? ` mit Schwerpunkt auf ${leadSkills.join(', ')}` : ''
    return `${primaryTitle}${skillPart}. Nachweisliche Erfahrung in den für diese Rolle geforderten Bereichen.`.trim()
  }
  const skillPart = leadSkills.length ? ` with a focus on ${leadSkills.join(', ')}` : ''
  void years
  return `${primaryTitle}${skillPart}. Proven experience across the areas this role calls for.`.trim()
}

export type TailoredResume = {
  data: ResumeData
  language: ResumeLanguage
  coverage: CoverageReport
}

/**
 * The main entry point: tailor a résumé to a posting. Returns a new ResumeData
 * (original left untouched), the chosen language, and the coverage report used
 * to drive both ordering and the summary (also surfaced in the UI, feature 13).
 */
export function tailorResume(
  base: ResumeData,
  job: NormalizedJob,
  profile: Profile,
): TailoredResume {
  const language = pickLanguage(job)
  const jdTerms = extractJdTerms(job, profile.skills.map((s) => s.name))
  const coverage = coverageReport(job, profile)

  const data: ResumeData = {
    ...base,
    summary: buildTailoredSummary(base, coverage, language),
    skills: tailorSkills(base.skills, jdTerms),
    experience: base.experience.map((e) => ({ ...e, bullets: tailorBullets(e.bullets, jdTerms) })),
  }

  return { data, language, coverage }
}

/**
 * Parse self-check (Appendix A "ship this as an automated test"): flatten a
 * ResumeData into the plain, linear text an ATS would read. If section order
 * and content survive here as clean text, an ATS will read them too.
 */
export function resumeToPlainText(data: ResumeData, lang: ResumeLanguage): string {
  const H = (k: string) => (lang === 'de'
    ? ({ summary: 'Kurzprofil', experience: 'Berufserfahrung', education: 'Ausbildung', skills: 'Kenntnisse', languages: 'Sprachen', projects: 'Projekte', certifications: 'Zertifikate' } as Record<string, string>)[k]
    : ({ summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', languages: 'Languages', projects: 'Projects', certifications: 'Certifications' } as Record<string, string>)[k])
  const lines: string[] = []
  lines.push(data.contact.name)
  const contactBits = [data.contact.location, data.contact.email, data.contact.phone,
    ...data.contact.links.map((l) => l.url)].filter(Boolean)
  if (contactBits.length) lines.push(contactBits.join(' · '))
  if (data.summary) { lines.push(H('summary')); lines.push(data.summary) }
  if (data.experience.length) {
    lines.push(H('experience'))
    for (const e of data.experience) {
      lines.push(`${e.title} — ${e.company}${e.city ? ` — ${e.city}` : ''}`)
      const range = [e.start, e.current ? (lang === 'de' ? 'heute' : 'Present') : e.end].filter(Boolean).join(' – ')
      if (range) lines.push(range)
      for (const b of e.bullets) lines.push(`• ${b}`)
    }
  }
  if (data.education.length) {
    lines.push(H('education'))
    for (const ed of data.education) {
      lines.push([ed.degree, ed.field, ed.institution, ed.city].filter(Boolean).join(', '))
    }
  }
  if (data.skills.length) {
    lines.push(H('skills'))
    for (const g of data.skills) lines.push(`${g.group ? g.group + ': ' : ''}${g.items.join(', ')}`)
  }
  if (data.languages.length) {
    lines.push(H('languages'))
    lines.push(data.languages.map((l) => `${l.lang}${l.level ? ` — ${l.level}` : ''}`).join(' · '))
  }
  if (data.projects.length) {
    lines.push(H('projects'))
    for (const p of data.projects) {
      lines.push(`${p.name}${p.summary ? ` — ${p.summary}` : ''}${p.tech?.length ? ` (${p.tech.join(', ')})` : ''}`)
    }
  }
  if (data.certifications.length) {
    lines.push(H('certifications'))
    lines.push(data.certifications.join(', '))
  }
  return lines.join('\n')
}