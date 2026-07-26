// ============================================================================
// v2.4.3 · Prompt projections — send the model what it needs, nothing else.
//
// THE PROBLEM THIS SOLVES
// `userPrompt` in tailorResume.ts used to spread the whole `ResumeData` into the
// request. Measured on an ordinary 3-role student résumé with a 6,000-character
// German posting, that came to 5,368 input tokens, of which:
//
//   • 2,309 tokens were `sourceResume`, containing 71 `id` / `evidence` /
//     `evidenceRefs` / `evidenceId` / `links` / `schemaVersion` keys the model
//     never reads — the response contract only needs `sourceIndex` and
//     `sourceBulletIndex`;
//   • 1,694 tokens were the raw job description, while the whole posting had
//     already been reduced to what matters.
//
// So roughly two thirds of the request was waste, and that waste is what pushed
// a normal résumé past the free tier's 8,000-token minute.
//
// WHY AN ALLOW-LIST, NOT A DELETE-LIST
// These functions BUILD a minimal object rather than copying `ResumeData` and
// removing keys. That way adding a field to the résumé model can never silently
// re-inflate every prompt. It is an invariant a test can assert, and
// `test/v243-budget.test.ts` does exactly that.
//
// WHAT IS SAFE TO DROP, AND WHY
//   evidence ids / evidenceRefs  the model cites sourceBulletIndex; evidence ids
//                                are re-attached LOCALLY after the response
//   contact details              nothing in the response rewrites them, and not
//                                sending a phone number and email is also a
//                                privacy improvement
//   languages, certifications    never rewritten, never referenced by a rule
//   education                    not a rewrite target in this schema
//   skill group names and ids    only skill NAMES inform vocabulary mirroring
//   description beyond an excerpt the start of a German posting carries the role
//                                and duties; the tail is benefits and legal text
// ============================================================================
import type { NormalizedJob } from '../types'
import type { ResumeData } from '../resume/types'
import { PROMPT } from '../lib/config'

export type ProjectedRole = {
  /** The index the model must copy back. */
  sourceIndex: number
  title: string
  company: string
  /** "01/2022-present" as one string instead of three separate fields. */
  period?: string
  bullets: { sourceBulletIndex: number; text: string }[]
}

export type ProjectedResume = {
  summary?: string
  experience: ProjectedRole[]
  projects: { sourceIndex: number; name: string; summary: string }[]
  /** Flat skill names — no ids, no groups. */
  skills: string[]
}

export type ProjectedJob = {
  title: string
  company: string
  /** The distilled requirements, when the caller has them. */
  requirements?: string[]
  /** A bounded excerpt from the START of the description. */
  excerpt: string
}

/** Build the minimal résumé view a rewrite needs. Pure. */
export function projectResumeForPrompt(source: ResumeData): ProjectedResume {
  return {
    summary: source.summary || undefined,
    experience: source.experience.map((role, sourceIndex) => ({
      sourceIndex,
      title: role.title,
      company: role.company,
      period: formatPeriod(role.start, role.end, role.current),
      bullets: role.bullets.map((bullet, sourceBulletIndex) => ({
        sourceBulletIndex,
        text: bullet.text,
      })),
    })),
    projects: source.projects.map((project, sourceIndex) => ({
      sourceIndex,
      name: project.name,
      summary: project.summary ?? '',
    })),
    skills: source.skills.flatMap((group) => group.items.map((item) => item.name)),
  }
}

/** Build the minimal posting view. Pure. */
export function projectJobForPrompt(
  job: NormalizedJob,
  options: { requirements?: string[]; excerptChars?: number } = {},
): ProjectedJob {
  const excerptChars = options.excerptChars ?? PROMPT.jobExcerptChars
  return {
    title: job.title,
    company: job.company,
    requirements: options.requirements?.length ? options.requirements : undefined,
    excerpt: (job.description ?? '').slice(0, excerptChars),
  }
}

/**
 * The evidence a letter or a message may rest on. Keeps the evidence ids,
 * because the letter prompt tells the model to ground claims in them — but
 * drops contact details, links and internal bookkeeping.
 */
export function projectEvidenceForPrompt(source: ResumeData) {
  return {
    summary: source.summary || undefined,
    roles: source.experience.map((role) => ({
      evidenceId: role.id,
      title: role.title,
      company: role.company,
      period: formatPeriod(role.start, role.end, role.current),
      achievements: role.bullets.map((bullet) => ({ evidenceId: bullet.id, text: bullet.text })),
    })),
    skills: source.skills.flatMap((group) =>
      group.items.map((item) => ({ evidenceId: item.id, name: item.name })),
    ),
    projects: source.projects.map((project) => ({
      evidenceId: project.id,
      name: project.name,
      summary: project.summary,
      tech: project.tech,
    })),
    education: source.education.map((item) => ({
      evidenceId: item.id,
      degree: item.degree,
      field: item.field,
      institution: item.institution,
    })),
    certifications: source.certifications.map((item) => ({
      evidenceId: item.id,
      name: item.name,
      issuer: item.issuer,
    })),
  }
}

/** Counts the output estimator needs, without re-walking the résumé elsewhere. */
export function resumeShape(source: ResumeData): {
  bulletCount: number
  roleCount: number
  projectsWithSummary: number
} {
  return {
    bulletCount: source.experience.reduce((total, role) => total + role.bullets.length, 0),
    roleCount: source.experience.length,
    projectsWithSummary: source.projects.filter((project) => Boolean(project.summary)).length,
  }
}

function formatPeriod(start?: string, end?: string, current?: boolean): string | undefined {
  const to = current ? 'present' : end
  if (start && to) return `${start}-${to}`
  return start || to || undefined
}