import type { MatchResult, NormalizedJob, Profile } from '../types'
import type { ResumeData } from '../resume/types'
import { resumeFromLegacyProfile } from '../resume/canonical'
import { groqChat } from './groq'

const SYSTEM = `You are a concise career writer. Write a specific cover letter grounded only in the supplied verified résumé evidence and job description. Never invent employers, dates, tools, responsibilities, qualifications, clients, certifications, or metrics. Do not expose evidence ids in the letter.`

export function buildCoverLetterPrompt(
  source: ResumeData | Profile,
  job: NormalizedJob,
  match?: MatchResult,
): string {
  const resume = isResumeData(source) ? source : resumeFromLegacyProfile(source)
  const verifiedEvidence = {
    summary: resume.summary,
    roles: resume.experience.map((role) => ({
      evidenceId: role.id, title: role.title, company: role.company,
      start: role.start, end: role.end, current: role.current,
      achievements: role.bullets.map((bullet) => ({ evidenceId: bullet.id, text: bullet.text })),
    })),
    skills: resume.skills.flatMap((group) => group.items.map((item) => ({ evidenceId: item.id, name: item.name }))),
    projects: resume.projects.map((project) => ({ evidenceId: project.id, name: project.name, summary: project.summary, tech: project.tech })),
    education: resume.education.map((item) => ({ evidenceId: item.id, degree: item.degree, field: item.field, institution: item.institution })),
    certifications: resume.certifications.map((item) => ({ evidenceId: item.id, name: item.name, issuer: item.issuer })),
  }
  return [
    'Write a cover letter of 220–320 words.',
    'Open with the exact role and company. Use at least TWO concrete skills or achievements from verified evidence.',
    'Use the match overlap only as a relevance hint; it is not additional evidence.',
    'No clichés, generic enthusiasm, or unsupported claims.',
    'If evidence is thin, stay concise instead of filling gaps. End with a direct, calm close.',
    '', 'VERIFIED RÉSUMÉ EVIDENCE:', JSON.stringify(verifiedEvidence, null, 2),
    '', 'JOB:', JSON.stringify({ title: job.title, company: job.company, description: job.description }, null, 2),
    ...(match ? ['', 'MATCH CONTEXT (not additional evidence):', JSON.stringify({ matchedSkills: match.matchedSkills, missingSkills: match.missingSkills, rationale: match.rationale }, null, 2)] : []),
  ].join('\n')
}

export async function draftCoverLetter(
  source: ResumeData | Profile,
  job: NormalizedJob,
  apiKey: string,
  match?: MatchResult,
  signal?: AbortSignal,
): Promise<string> {
  return groqChat({
    apiKey, system: SYSTEM, user: buildCoverLetterPrompt(source, job, match),
    temperature: 0.3, maxTokens: 900, signal,
  })
}

function isResumeData(value: ResumeData | Profile): value is ResumeData {
  return 'experience' in value && 'contact' in value
}