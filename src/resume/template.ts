import type { ResumeData, ResumeLanguage } from './types'

export const RESUME_TEMPLATE_COLORS = Object.freeze({
  ink: '18202A',
  muted: '5C6673',
  rule: 'DCE2E8',
  data: '2357A5',
  industrial: '14796F',
  editorial: '9B3D55',
})

export const RESUME_TEMPLATE_HEADINGS: Record<
  ResumeLanguage,
  {
    experience: string
    projects: string
    education: string
    certifications: string
    skillsAndLanguages: string
    languages: string
  }
> = {
  en: {
    experience: 'Experience',
    projects: 'Selected Projects',
    education: 'Education',
    certifications: 'Certifications',
    skillsAndLanguages: 'Skills & Languages',
    languages: 'Languages',
  },
  de: {
    experience: 'Berufserfahrung',
    projects: 'Ausgewählte Projekte',
    education: 'Ausbildung & Weiterbildung',
    certifications: 'Zertifikate',
    skillsAndLanguages: 'Kenntnisse & Sprachen',
    languages: 'Sprachen',
  },
}

/**
 * Schema v2 has no evidence-backed profile-headline field. Use the newest held
 * role instead of presenting the target vacancy title as a role the person has
 * already held. A future schema migration can add an independently reviewed
 * professional headline.
 */
export function resumeHeadline(data: ResumeData): string {
  return data.experience.find((role) => role.title.trim())?.title.trim() ?? ''
}

/**
 * v2.6.0.1 promotes one stable production base. The CRM and industrial colours
 * remain recorded reference tokens, but Klar does not guess a person's visual
 * category from résumé keywords. An explicit user-selected palette can be
 * added later without silently changing otherwise identical applications.
 */
export function resumeAccent(_data: ResumeData): string {
  return RESUME_TEMPLATE_COLORS.data
}

/** Keep the complete source URL as plain text so no evidence is lost. */
export function displayResumeUrl(value: string): string {
  return value.trim()
}

/** The cross-compatible samples use a simple ASCII date separator. */
export function crossCompatibleDateRange(
  start: string | undefined,
  end: string | undefined,
  current: boolean | undefined,
  lang: ResumeLanguage,
): string {
  const endLabel = current ? (lang === 'de' ? 'heute' : 'present') : end
  if (start && endLabel) return `${start} - ${endLabel}`
  return start || endLabel || ''
}