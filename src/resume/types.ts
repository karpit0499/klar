// ============================================================================
// Canonical résumé contracts (v2.3).
//
// ResumeData is the only authoritative career-fact model. Matching receives a
// derived Profile at runtime; it is never an independently editable record.
// Stable ids let generators retain evidence references when entries move.
// ============================================================================

export type EvidenceRef = {
  id: string
  kind: 'summary' | 'role' | 'bullet' | 'education' | 'skill' | 'project' | 'certification' | 'language'
  source?: 'upload' | 'manual' | 'migration'
  note?: string
}

export type ResumeContact = {
  name: string
  email?: string
  phone?: string
  location?: string
  links: { id: string; label: string; url: string }[]
}

export type ResumeBullet = {
  id: string
  text: string
  evidenceRefs: string[]
}

export type ResumeExperience = {
  id: string
  title: string
  company: string
  city?: string
  start?: string
  end?: string
  current?: boolean
  bullets: ResumeBullet[]
  evidenceRefs: string[]
}

export type ResumeEducation = {
  id: string
  degree?: string
  field?: string
  institution?: string
  city?: string
  start?: string
  end?: string
  evidenceRefs: string[]
}

export type ResumeProject = {
  id: string
  name: string
  summary?: string
  tech?: string[]
  link?: string
  evidenceRefs: string[]
}

export type ResumeCertification = {
  id: string
  name: string
  issuer?: string
  issued?: string
  evidenceRefs: string[]
}

export type ResumeLanguageEntry = {
  id: string
  lang: string
  level?: string
  evidenceRefs: string[]
}

export type SkillGroup = {
  id: string
  group?: string
  items: { id: string; name: string; evidenceRefs: string[] }[]
}

export type ResumeData = {
  schemaVersion: 2
  contact: ResumeContact
  summary?: string
  experience: ResumeExperience[]
  education: ResumeEducation[]
  skills: SkillGroup[]
  languages: ResumeLanguageEntry[]
  projects: ResumeProject[]
  certifications: ResumeCertification[]
  evidence: EvidenceRef[]
  reviewedAt?: string
}

export type CanonicalResumeRow = {
  id: 'current'
  data: ResumeData
  createdAt: string
  updatedAt: string
  revision: number
}

export type ResumeSnapshotRow = {
  id: string
  data: ResumeData
  createdAt: string
  reason: 'edit' | 'reupload' | 'migration' | 'manual' | 'restart'
  name?: string
}

export type ResumeDraftRow = {
  id: 'onboarding'
  data: ResumeData
  updatedAt: string
}

export type ResumeLanguage = 'de' | 'en'

export const SECTION_HEADINGS: Record<ResumeLanguage, Record<string, string>> = {
  de: {
    summary: 'Kurzprofil', experience: 'Berufserfahrung', education: 'Ausbildung',
    skills: 'Kenntnisse', languages: 'Sprachen', projects: 'Projekte', certifications: 'Zertifikate',
  },
  en: {
    summary: 'Summary', experience: 'Experience', education: 'Education',
    skills: 'Skills', languages: 'Languages', projects: 'Projects', certifications: 'Certifications',
  },
}

export const PRESENT_LABEL: Record<ResumeLanguage, string> = { de: 'heute', en: 'Present' }

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