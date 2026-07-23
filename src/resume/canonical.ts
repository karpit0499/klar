import type { Profile } from '../types'
import type {
  EvidenceRef,
  ResumeBullet,
  ResumeCertification,
  ResumeData,
  ResumeEducation,
  ResumeExperience,
  ResumeLanguageEntry,
  ResumeProject,
  SkillGroup,
} from './types'

let sequence = 0

export function newResumeId(prefix: string): string {
  sequence += 1
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`
}

export function emptyResume(): ResumeData {
  return {
    schemaVersion: 2,
    contact: { name: '', links: [] },
    experience: [], education: [], skills: [], languages: [], projects: [],
    certifications: [], evidence: [],
  }
}

/** Accept v2.2 ResumeData, v2.3 ResumeData, or defensive parser output. */
export function normalizeResume(value: unknown, source: EvidenceRef['source'] = 'manual'): ResumeData {
  const raw = object(value)
  const contact = object(raw.contact)
  const evidence: EvidenceRef[] = array(raw.evidence).map((item) => {
    const row = object(item)
    return {
      id: text(row.id) || newResumeId('evidence'),
      kind: evidenceKind(row.kind), source: evidenceSource(row.source) ?? source,
      note: optionalText(row.note),
    }
  })

  const resume: ResumeData = {
    schemaVersion: 2,
    contact: {
      name: text(contact.name), email: optionalText(contact.email),
      phone: optionalText(contact.phone), location: optionalText(contact.location),
      links: array(contact.links).map((item) => {
        const link = object(item)
        return { id: text(link.id) || newResumeId('link'), label: text(link.label), url: text(link.url) }
      }).filter((item) => item.label || item.url),
    },
    summary: optionalText(raw.summary),
    experience: array(raw.experience).map((item) => normalizeExperience(item, source, evidence)),
    education: array(raw.education).map((item) => normalizeEducation(item, source, evidence)),
    skills: array(raw.skills).map((item) => normalizeSkillGroup(item, source, evidence)),
    languages: array(raw.languages).map((item) => normalizeLanguage(item, source, evidence)),
    projects: array(raw.projects).map((item) => normalizeProject(item, source, evidence)),
    certifications: array(raw.certifications).map((item) => normalizeCertification(item, source, evidence)),
    evidence,
    reviewedAt: optionalText(raw.reviewedAt),
  }
  if (resume.summary && !resume.evidence.some((item) => item.kind === 'summary')) {
    const ref = addEvidence(resume.evidence, 'summary', source)
    void ref
  }
  return resume
}

export function deriveProfile(resume: ResumeData): Profile {
  const roles = resume.experience.filter((role) => role.title.trim())
  const titles = roles.map((role) => ({
    title: role.title.trim(),
    years: durationYears(role.start, role.end, role.current),
  }))
  const skills = unique(resume.skills.flatMap((group) => group.items.map((item) => item.name)))
    .map((name) => ({ name }))
  const domains = unique([
    ...resume.skills.map((group) => group.group ?? ''),
    ...resume.projects.flatMap((project) => project.tech ?? []),
  ])
  const totalMonths = roles.reduce((sum, role) => sum + durationMonths(role.start, role.end, role.current), 0)
  return {
    summary: resume.summary ?? '',
    titles,
    skills,
    domains,
    totalYears: totalMonths ? Math.round(totalMonths / 12 * 10) / 10 : undefined,
    education: resume.education.map(({ degree, field, institution }) => ({ degree, field, institution })),
    languages: resume.languages.map(({ lang, level }) => ({ lang, level })),
    certifications: resume.certifications.map((item) => item.name),
  }
}

export type CompletenessIssue = {
  code: string
  section: 'contact' | 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'languages'
  message: string
  count: number
}

export type ResumeCompleteness = {
  percentage: number
  issues: CompletenessIssue[]
  roleCount: number
  missingDateCount: number
  rolesWithoutAchievements: number
  summary: string
}

/** Structural readiness only: no points depend on career length or credentials. */
export function analyzeResume(resume: ResumeData): ResumeCompleteness {
  const issues: CompletenessIssue[] = []
  const requiredChecks = [
    Boolean(resume.contact.name.trim()),
    Boolean(resume.contact.email?.trim() || resume.contact.phone?.trim()),
    Boolean(resume.summary?.trim()),
    resume.experience.every((role) => Boolean(role.title.trim() && role.company.trim())),
    resume.experience.every((role) => Boolean(role.start && (role.current || role.end))),
    resume.experience.every((role) => role.bullets.some((bullet) => bullet.text.trim())),
    resume.skills.some((group) => group.items.some((item) => item.name.trim())),
    resume.languages.every((language) => Boolean(language.lang.trim())),
  ]
  const missingDateCount = resume.experience.filter((role) => !role.start || (!role.current && !role.end)).length
  const rolesWithoutAchievements = resume.experience.filter(
    (role) => !role.bullets.some((bullet) => bullet.text.trim()),
  ).length
  pushIssue(issues, !resume.contact.name.trim(), 'contact-name', 'contact', 'Add your name.', 1)
  pushIssue(issues, !resume.contact.email?.trim() && !resume.contact.phone?.trim(), 'contact-route', 'contact', 'Add an email address or phone number.', 1)
  pushIssue(issues, !resume.summary?.trim(), 'summary', 'summary', 'Add a short professional summary.', 1)
  pushIssue(issues, missingDateCount > 0, 'role-dates', 'experience', 'Add missing role dates.', missingDateCount)
  pushIssue(issues, rolesWithoutAchievements > 0, 'role-achievements', 'experience', 'Add at least one evidence-based bullet to each role.', rolesWithoutAchievements)
  const incompleteRoles = resume.experience.filter((role) => !role.title.trim() || !role.company.trim()).length
  pushIssue(issues, incompleteRoles > 0, 'role-basics', 'experience', 'Add a title and company to each role.', incompleteRoles)
  pushIssue(issues, !requiredChecks[6], 'skills', 'skills', 'Add at least one skill.', 1)
  const percentage = Math.round(requiredChecks.filter(Boolean).length / requiredChecks.length * 100)
  const roleCount = resume.experience.length
  return {
    percentage, issues, roleCount, missingDateCount, rolesWithoutAchievements,
    summary: `${percentage}% complete · ${roleCount} role${roleCount === 1 ? '' : 's'} · ${missingDateCount} missing date${missingDateCount === 1 ? '' : 's'} · ${rolesWithoutAchievements} role${rolesWithoutAchievements === 1 ? '' : 's'} without achievements`,
  }
}

export function isMeaningfulResume(resume: ResumeData): boolean {
  return Boolean(
    resume.contact.name.trim() || resume.summary?.trim() || resume.experience.length ||
    resume.education.length || resume.skills.length || resume.projects.length ||
    resume.certifications.length || resume.languages.length,
  )
}

/** Lossy legacy conversion is explicit and produces completeness warnings. */
export function resumeFromLegacyProfile(profile: Profile): ResumeData {
  const resume = emptyResume()
  resume.summary = profile.summary || undefined
  resume.experience = profile.titles.map((item) => {
    const evidenceId = addEvidence(resume.evidence, 'role', 'migration')
    return {
      id: newResumeId('role'), title: item.title, company: '', bullets: [],
      evidenceRefs: [evidenceId],
    }
  })
  resume.education = profile.education.map((item) => ({
    id: newResumeId('education'), ...item,
    evidenceRefs: [addEvidence(resume.evidence, 'education', 'migration')],
  }))
  resume.skills = [{
    id: newResumeId('skills'), group: 'Skills',
    items: profile.skills.map((item) => ({
      id: newResumeId('skill'), name: item.name,
      evidenceRefs: [addEvidence(resume.evidence, 'skill', 'migration')],
    })),
  }].filter((group) => group.items.length)
  resume.languages = profile.languages.map((item) => ({
    id: newResumeId('language'), ...item,
    evidenceRefs: [addEvidence(resume.evidence, 'language', 'migration')],
  }))
  resume.certifications = profile.certifications.map((name) => ({
    id: newResumeId('certification'), name,
    evidenceRefs: [addEvidence(resume.evidence, 'certification', 'migration')],
  }))
  return resume
}

export function sampleResume(): ResumeData {
  return normalizeResume({
    contact: { name: 'Mira Novak', email: 'mira@example.invalid', location: 'Berlin', links: [] },
    summary: 'Product operations specialist connecting customer evidence, delivery teams, and measurable workflow improvements.',
    experience: [{
      title: 'Product Operations Manager', company: 'Example Labs', city: 'Berlin',
      start: '04/2022', current: true,
      bullets: [
        'Built a customer-feedback workflow used by four product squads.',
        'Reduced weekly reporting preparation from two hours to 30 minutes.',
      ],
    }],
    education: [{ degree: 'MSc', field: 'Information Systems', institution: 'Example University' }],
    skills: [{ group: 'Product operations', items: ['Roadmapping', 'SQL', 'Customer research'] }],
    languages: [{ lang: 'English', level: 'C1' }, { lang: 'German', level: 'B2' }],
    projects: [], certifications: [],
  }, 'manual')
}

function normalizeExperience(value: unknown, source: EvidenceRef['source'], evidence: EvidenceRef[]): ResumeExperience {
  const raw = object(value)
  const id = text(raw.id) || newResumeId('role')
  const refs = stringArray(raw.evidenceRefs)
  if (!refs.length) refs.push(addEvidence(evidence, 'role', source))
  return {
    id, title: text(raw.title), company: text(raw.company), city: optionalText(raw.city),
    start: optionalText(raw.start), end: optionalText(raw.end), current: Boolean(raw.current),
    bullets: array(raw.bullets).map((item) => normalizeBullet(item, source, evidence)),
    evidenceRefs: refs,
  }
}

function normalizeBullet(value: unknown, source: EvidenceRef['source'], evidence: EvidenceRef[]): ResumeBullet {
  const raw = typeof value === 'string' ? { text: value } : object(value)
  const refs = stringArray(raw.evidenceRefs)
  if (!refs.length) refs.push(addEvidence(evidence, 'bullet', source))
  return { id: text(raw.id) || newResumeId('bullet'), text: text(raw.text), evidenceRefs: refs }
}

function normalizeEducation(value: unknown, source: EvidenceRef['source'], evidence: EvidenceRef[]): ResumeEducation {
  const raw = object(value); const refs = stringArray(raw.evidenceRefs)
  if (!refs.length) refs.push(addEvidence(evidence, 'education', source))
  return {
    id: text(raw.id) || newResumeId('education'), degree: optionalText(raw.degree),
    field: optionalText(raw.field), institution: optionalText(raw.institution), city: optionalText(raw.city),
    start: optionalText(raw.start), end: optionalText(raw.end), evidenceRefs: refs,
  }
}

function normalizeSkillGroup(value: unknown, source: EvidenceRef['source'], evidence: EvidenceRef[]): SkillGroup {
  const raw = object(value)
  return {
    id: text(raw.id) || newResumeId('skills'), group: optionalText(raw.group),
    items: array(raw.items).map((item) => {
      const row = typeof item === 'string' ? { name: item } : object(item)
      const refs = stringArray(row.evidenceRefs)
      if (!refs.length) refs.push(addEvidence(evidence, 'skill', source))
      return { id: text(row.id) || newResumeId('skill'), name: text(row.name), evidenceRefs: refs }
    }),
  }
}

function normalizeLanguage(value: unknown, source: EvidenceRef['source'], evidence: EvidenceRef[]): ResumeLanguageEntry {
  const raw = object(value); const refs = stringArray(raw.evidenceRefs)
  if (!refs.length) refs.push(addEvidence(evidence, 'language', source))
  return { id: text(raw.id) || newResumeId('language'), lang: text(raw.lang), level: optionalText(raw.level), evidenceRefs: refs }
}

function normalizeProject(value: unknown, source: EvidenceRef['source'], evidence: EvidenceRef[]): ResumeProject {
  const raw = object(value); const refs = stringArray(raw.evidenceRefs)
  if (!refs.length) refs.push(addEvidence(evidence, 'project', source))
  return {
    id: text(raw.id) || newResumeId('project'), name: text(raw.name), summary: optionalText(raw.summary),
    tech: stringArray(raw.tech), link: optionalText(raw.link), evidenceRefs: refs,
  }
}

function normalizeCertification(value: unknown, source: EvidenceRef['source'], evidence: EvidenceRef[]): ResumeCertification {
  const raw = typeof value === 'string' ? { name: value } : object(value)
  const refs = stringArray(raw.evidenceRefs)
  if (!refs.length) refs.push(addEvidence(evidence, 'certification', source))
  return {
    id: text(raw.id) || newResumeId('certification'), name: text(raw.name),
    issuer: optionalText(raw.issuer), issued: optionalText(raw.issued), evidenceRefs: refs,
  }
}

function addEvidence(list: EvidenceRef[], kind: EvidenceRef['kind'], source: EvidenceRef['source']): string {
  const id = newResumeId('evidence')
  list.push({ id, kind, source })
  return id
}

function durationYears(start?: string, end?: string, current?: boolean): number | undefined {
  const months = durationMonths(start, end, current)
  return months ? Math.round(months / 12 * 10) / 10 : undefined
}

function durationMonths(start?: string, end?: string, current?: boolean): number {
  const first = parseMonth(start)
  const last = current ? new Date() : parseMonth(end)
  if (!first || !last || last < first) return 0
  return Math.max(1, (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth() + 1)
}

function parseMonth(value?: string): Date | undefined {
  const match = /^(0?[1-9]|1[0-2])\/(\d{4})$/.exec(value ?? '')
  return match ? new Date(Number(match[2]), Number(match[1]) - 1, 1) : undefined
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }
function optionalText(value: unknown): string | undefined { const valueText = text(value); return valueText || undefined }
function stringArray(value: unknown): string[] { return array(value).map(text).filter(Boolean) }
function unique(values: string[]): string[] { return [...new Set(values.map((item) => item.trim()).filter(Boolean))] }
function evidenceKind(value: unknown): EvidenceRef['kind'] {
  const kinds: EvidenceRef['kind'][] = ['summary', 'role', 'bullet', 'education', 'skill', 'project', 'certification', 'language']
  return kinds.includes(value as EvidenceRef['kind']) ? value as EvidenceRef['kind'] : 'summary'
}
function evidenceSource(value: unknown): EvidenceRef['source'] | undefined {
  return value === 'upload' || value === 'manual' || value === 'migration' ? value : undefined
}
function pushIssue(
  issues: CompletenessIssue[], condition: boolean, code: string,
  section: CompletenessIssue['section'], message: string, count: number,
): void {
  if (condition) issues.push({ code, section, message, count })
}