// ============================================================================
// Structured résumé data for the tailored-résumé generator (feature 12).
//
// This is RICHER than the matching `Profile`: the generator needs contact
// details, dated experience with achievement bullets, and projects — things
// the matcher never used. It's extracted from the user's OWN résumé text (see
// resume/extract.ts), so nothing here is fabricated; the generator only
// selects, reorders, and rewords what the résumé already contains, into the
// fixed ATS-safe "Klar Standard" template (Appendix A of the v2 spec).
// ============================================================================

export type ResumeContact = {
  name: string
  email?: string
  phone?: string
  location?: string            // "Berlin, Deutschland"
  links: { label: string; url: string }[]  // GitHub / LinkedIn as visible text
}

export type ResumeExperience = {
  title: string
  company: string
  city?: string
  start?: string               // "MM/YYYY"
  end?: string                 // "MM/YYYY" (omitted when current)
  current?: boolean
  bullets: string[]            // achievement bullets (action + what + result)
}

export type ResumeEducation = {
  degree?: string
  field?: string
  institution?: string
  city?: string
  start?: string               // "MM/YYYY"
  end?: string                 // "MM/YYYY"
}

export type ResumeProject = {
  name: string
  summary?: string
  tech?: string[]
  link?: string
}

/** A skills group, e.g. { group: "Programming", items: ["Python", "SQL"] }. */
export type SkillGroup = { group?: string; items: string[] }

export type ResumeData = {
  contact: ResumeContact
  summary?: string             // Kurzprofil (rewritten per job for the tailored version)
  experience: ResumeExperience[]
  education: ResumeEducation[]
  skills: SkillGroup[]
  languages: { lang: string; level?: string }[]
  projects: ResumeProject[]
  certifications: string[]
}

export type ResumeLanguage = 'de' | 'en'

/** Canonical section headings in both languages (Appendix A section order). */
export const SECTION_HEADINGS: Record<ResumeLanguage, Record<string, string>> = {
  de: {
    summary: 'Kurzprofil',
    experience: 'Berufserfahrung',
    education: 'Ausbildung',
    skills: 'Kenntnisse',
    languages: 'Sprachen',
    projects: 'Projekte',
    certifications: 'Zertifikate',
  },
  en: {
    summary: 'Summary',
    experience: 'Experience',
    education: 'Education',
    skills: 'Skills',
    languages: 'Languages',
    projects: 'Projects',
    certifications: 'Certifications',
  },
}

/** "Present" / "heute" for a current role. */
export const PRESENT_LABEL: Record<ResumeLanguage, string> = { de: 'heute', en: 'Present' }

/** Format an MM/YYYY range as text (never in a table cell). */
export function formatDateRange(
  start: string | undefined,
  end: string | undefined,
  current: boolean | undefined,
  lang: ResumeLanguage,
): string {
  const endLabel = current ? PRESENT_LABEL[lang] : end
  if (start && endLabel) return `${start} – ${endLabel}`
  return start || endLabel || ''
}