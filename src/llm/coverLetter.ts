// ============================================================================
// v2.4.3: same treatment as the résumé rewrite — a projected evidence block
// instead of the whole stored résumé, a bounded posting excerpt instead of the
// full description, and a computed output reservation instead of a flat 900.
// The letter's RULES are untouched; only the payload shrank.
// Measured: 4,010 → about 2,000 billed tokens.
// ============================================================================
import type { MatchResult, NormalizedJob, Profile } from '../types'
import type { ResumeData } from '../resume/types'
import { resumeFromLegacyProfile } from '../resume/canonical'
import { PROMPT } from '../lib/config'
import { costOf, estimateLetterOutputTokens, type RequestCost } from './budget'
import { projectEvidenceForPrompt, projectJobForPrompt } from './promptProjection'
import { groqChat } from './groq'

const SYSTEM = `You are a concise career writer. Write a specific cover letter grounded only in the supplied verified résumé evidence and job description. Never invent employers, dates, tools, responsibilities, qualifications, clients, certifications, or metrics. Do not expose evidence ids in the letter.`

export function buildCoverLetterPrompt(
  source: ResumeData | Profile,
  job: NormalizedJob,
  match?: MatchResult,
): string {
  const resume = isResumeData(source) ? source : resumeFromLegacyProfile(source)
  const verifiedEvidence = projectEvidenceForPrompt(resume)
  return [
    'Write a cover letter of 220–320 words.',
    'Open with the exact role and company. Use at least TWO concrete skills or achievements from verified evidence.',
    'Use the match overlap only as a relevance hint; it is not additional evidence.',
    'No clichés, generic enthusiasm, or unsupported claims.',
    'If evidence is thin, stay concise instead of filling gaps. End with a direct, calm close.',
    '', 'VERIFIED RÉSUMÉ EVIDENCE:', JSON.stringify(verifiedEvidence, null, 2),
    '', 'JOB:', JSON.stringify(projectJobForPrompt(job, { excerptChars: PROMPT.letterExcerptChars }), null, 2),
    ...(match ? ['', 'MATCH CONTEXT (not additional evidence):', JSON.stringify({ matchedSkills: match.matchedSkills, missingSkills: match.missingSkills, rationale: match.rationale }, null, 2)] : []),
  ].join('\n')
}

/** Price the letter request, so the UI can show the cost before spending it. */
export function estimateLetterRequest(
  source: ResumeData | Profile,
  job: NormalizedJob,
  match?: MatchResult,
): { system: string; user: string; maxTokens: number; cost: RequestCost } {
  const user = buildCoverLetterPrompt(source, job, match)
  const maxTokens = estimateLetterOutputTokens()
  return { system: SYSTEM, user, maxTokens, cost: costOf({ system: SYSTEM, user, maxTokens }) }
}

export async function draftCoverLetter(
  source: ResumeData | Profile,
  job: NormalizedJob,
  apiKey: string,
  match?: MatchResult,
  signal?: AbortSignal,
): Promise<string> {
  const request = estimateLetterRequest(source, job, match)
  return groqChat({
    apiKey, system: request.system, user: request.user,
    temperature: 0.3, maxTokens: request.maxTokens, signal,
  })
}

function isResumeData(value: ResumeData | Profile): value is ResumeData {
  return 'experience' in value && 'contact' in value
}