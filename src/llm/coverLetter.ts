// ============================================================================
// Cover-letter draft builder (feature 7.1). Everything it needs is already in
// scope: the parsed profile and the full job description in the drawer. We ask
// the LLM for a concise, specific letter that cites two concrete matching
// skills and avoids clichés. The prompt builder is pure (unit-testable); the
// call reuses the same direct-to-Groq client as résumé parsing and matching.
// ============================================================================
import type { MatchResult, NormalizedJob, Profile } from '../types'
import { groqChat } from './groq'

const SYSTEM = `You are a concise career writer. You write specific, non-generic cover letters grounded ONLY in facts from the candidate's profile and the job description. You never invent employers, dates, or skills the candidate doesn't have. You avoid clichés like "I am a hard-working team player" and "I am excited about this opportunity".`

/** Build the (deterministic, testable) cover-letter prompt for one job. */
export function buildCoverLetterPrompt(
  profile: Profile,
  job: NormalizedJob,
  match?: MatchResult,
): string {
  const candidate = {
    summary: profile.summary,
    titles: profile.titles.map((t) => t.title),
    skills: profile.skills.map((s) => s.name),
    totalYears: profile.totalYears,
    domains: profile.domains,
  }
  return [
    'Write a cover letter for this candidate and this specific role.',
    '',
    'CANDIDATE PROFILE:',
    JSON.stringify(candidate),
    '',
    'JOB:',
    JSON.stringify({
      title: job.title,
      company: job.company,
      location: job.location.city ?? (job.location.remote ? 'Remote' : ''),
      description: job.description.slice(0, 3000),
    }),
    match?.matchedSkills?.length
      ? `\nSkills already known to overlap: ${match.matchedSkills.join(', ')}`
      : '',
    '',
    'REQUIREMENTS:',
    '- 180–260 words, 3 short paragraphs.',
    '- Cite at least TWO concrete skills the candidate has that this role needs.',
    '- Reference the company and role by name.',
    '- No clichés, no filler, no invented facts.',
    '- Plain text only. Start with "Dear Hiring Team," and end with "Best regards,".',
    '- Do NOT include a date or postal addresses.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Generate a cover-letter draft. Returns editable plain text. */
export async function draftCoverLetter(
  profile: Profile,
  job: NormalizedJob,
  apiKey: string,
  match?: MatchResult,
  signal?: AbortSignal,
): Promise<string> {
  const text = await groqChat({
    apiKey,
    system: SYSTEM,
    user: buildCoverLetterPrompt(profile, job, match),
    temperature: 0.4,
    maxTokens: 700,
    signal,
  })
  return text.trim()
}