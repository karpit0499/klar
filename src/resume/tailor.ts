// ============================================================================
// Deterministic (no-LLM) résumé tailoring. This is the floor every AI result is
// built on top of, and the path that still works with no API key at all.
//
// v2.5 (WS4a, in-schema only):
//   • `extraJdTerms` threads the optional LLM requirement extractor through,
//     additively (WS2).
//   • `tailorBullets` now RANKS by how many posting terms a bullet attests
//     instead of a two-way partition — the strongest evidence leads its role.
//   • `buildTailoredSummary` echoes the posting's exact title (WS4.5), phrased
//     as intent ("applying for …") so it can never read as a claimed job title.
//     P9's inflation guard lives in src/llm/evidenceStatus.ts.
//
// Deliberately NOT here (ATS plan §3, WS4b → v2.6): project/thesis bullets,
// cross-section re-ranking, a "Relevant Projects" lead section. Those need
// résumé schemaVersion 3 and are a separate, migrated release.
// ============================================================================
import type { NormalizedJob, Profile } from '../types'
import type { ResumeBullet, ResumeData, ResumeLanguage, SkillGroup } from './types'
import { deriveProfile } from './canonical'
import { normalizeResume } from './canonical'
import {
  extractJdTerms, containsTerm, canonicalizeSkill, coverageReport, mergeJdTerms,
  type CoverageReport,
} from './keywords'

export function pickLanguage(job: NormalizedJob): ResumeLanguage {
  if (job.language === 'de') return 'de'
  if (job.language === 'en') return 'en'
  const hay = `${job.title}\n${job.description}`.toLowerCase()
  const deHits = (hay.match(/\b(und|oder|erfahrung|kenntnisse|deutsch|aufgaben|wir|deine?)\b/g) ?? []).length
  return deHits >= 3 ? 'de' : 'en'
}

function orderItemsByJd(items: SkillGroup['items'], jdTerms: string[]): SkillGroup['items'] {
  const jdSet = new Set(jdTerms.map((term) => term.toLowerCase()))
  const isJd = (item: SkillGroup['items'][number]) => {
    const name = typeof item === 'string' ? item : item.name
    const canon = canonicalizeSkill(name)
    return jdSet.has(name.toLowerCase()) || (canon != null && jdSet.has(canon.toLowerCase()))
  }
  return [...items.filter(isJd), ...items.filter((item) => !isJd(item))]
}

export function tailorSkills(skills: SkillGroup[], jdTerms: string[]): SkillGroup[] {
  const jdSet = new Set(jdTerms.map((term) => term.toLowerCase()))
  return skills.map((group, index) => {
    const items = orderItemsByJd(group.items, jdTerms)
    const hitCount = items.filter((item) => {
      const name = typeof item === 'string' ? item : item.name
      const canon = canonicalizeSkill(name)
      return jdSet.has(name.toLowerCase()) || (canon != null && jdSet.has(canon.toLowerCase()))
    }).length
    return { group: { ...group, items }, hitCount, index }
  }).sort((a, b) => b.hitCount - a.hitCount || a.index - b.index).map((item) => item.group)
}

/** Text of a bullet, tolerating the legacy string shape. */
function bulletText(bullet: ResumeBullet | string): string {
  return typeof bullet === 'string' ? bullet : bullet.text
}

/**
 * Rank a role's bullets by how many posting terms they genuinely attest.
 * Stable: equal scores keep their original order, so nothing is lost or shuffled
 * unpredictably between runs.
 */
export function tailorBullets(bullets: ResumeBullet[], jdTerms: string[]): ResumeBullet[] {
  return bullets
    .map((bullet, index) => ({
      bullet,
      index,
      score: jdTerms.filter((term) => containsTerm(bulletText(bullet), term)).length,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.bullet)
}

/**
 * The deterministic summary. `jobTitle` (v2.5) makes the posting's exact wording
 * appear verbatim for title-matching ATS, phrased as an application intent so it
 * never asserts a title the person has not held.
 */
export function buildTailoredSummary(
  data: ResumeData,
  coverage: CoverageReport,
  lang: ResumeLanguage,
  jobTitle?: string,
): string {
  const primaryTitle = data.experience[0]?.title || data.contact.name
  const leadSkills = coverage.covered.slice(0, 5)
  const target = (jobTitle ?? '').trim()
  const echo =
    target && target.toLowerCase() !== primaryTitle.toLowerCase() ? target : ''
  if (lang === 'de') {
    const head = echo ? `${primaryTitle}, Bewerbung als ${echo}.` : `${primaryTitle}.`
    const skillPart = leadSkills.length ? ` Schwerpunkt: ${leadSkills.join(', ')}.` : ''
    return `${head}${skillPart} Nachweisliche Erfahrung in den für diese Rolle geforderten Bereichen.`.trim()
  }
  const head = echo ? `${primaryTitle} applying for ${echo}.` : `${primaryTitle}.`
  const skillPart = leadSkills.length ? ` Focus: ${leadSkills.join(', ')}.` : ''
  return `${head}${skillPart} Proven experience across the areas this role calls for.`.trim()
}

export type TailoredResume = { data: ResumeData; language: ResumeLanguage; coverage: CoverageReport }

export function tailorResume(
  base: ResumeData,
  job: NormalizedJob,
  compatibilityProfile?: Profile,
  extraJdTerms: string[] = [],
): TailoredResume {
  base = normalizeResume(base)
  const profile = compatibilityProfile ?? deriveProfile(base)
  const language = pickLanguage(job)
  const jdTerms = mergeJdTerms(
    extractJdTerms(job, profile.skills.map((skill) => skill.name)),
    extraJdTerms,
  )
  const coverage = coverageReport(job, profile, extraJdTerms)
  return {
    language, coverage,
    data: {
      ...base,
      summary: buildTailoredSummary(base, coverage, language, job.title),
      skills: tailorSkills(base.skills, jdTerms),
      experience: base.experience.map((role) => ({ ...role, bullets: tailorBullets(role.bullets, jdTerms) })),
    },
  }
}

export function resumeToPlainText(data: ResumeData, lang: ResumeLanguage): string {
  const H = lang === 'de'
    ? { summary: 'Kurzprofil', experience: 'Berufserfahrung', education: 'Ausbildung', skills: 'Kenntnisse', languages: 'Sprachen', projects: 'Projekte', certifications: 'Zertifikate' }
    : { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', languages: 'Languages', projects: 'Projects', certifications: 'Certifications' }
  const lines: string[] = [data.contact.name]
  const contactBits = [data.contact.location, data.contact.email, data.contact.phone, ...data.contact.links.map((link) => link.url)].filter(Boolean)
  if (contactBits.length) lines.push(contactBits.join(' · '))
  if (data.summary) lines.push(H.summary, data.summary)
  if (data.experience.length) {
    lines.push(H.experience)
    for (const role of data.experience) {
      lines.push(`${role.title} — ${role.company}${role.city ? ` — ${role.city}` : ''}`)
      const range = [role.start, role.current ? (lang === 'de' ? 'heute' : 'Present') : role.end].filter(Boolean).join(' – ')
      if (range) lines.push(range)
      for (const bullet of role.bullets) lines.push(`• ${bullet.text}`)
    }
  }
  if (data.education.length) {
    lines.push(H.education)
    for (const education of data.education) lines.push([education.degree, education.field, education.institution, education.city].filter(Boolean).join(', '))
  }
  if (data.skills.length) {
    lines.push(H.skills)
    for (const group of data.skills) lines.push(`${group.group ? `${group.group}: ` : ''}${group.items.map((item) => item.name).join(', ')}`)
  }
  if (data.languages.length) {
    lines.push(H.languages, data.languages.map((item) => `${item.lang}${item.level ? ` — ${item.level}` : ''}`).join(' · '))
  }
  if (data.projects.length) {
    lines.push(H.projects)
    for (const project of data.projects) lines.push(`${project.name}${project.summary ? ` — ${project.summary}` : ''}${project.tech?.length ? ` (${project.tech.join(', ')})` : ''}`)
  }
  if (data.certifications.length) lines.push(H.certifications, data.certifications.map((item) => item.name).join(', '))
  return lines.join('\n')
}