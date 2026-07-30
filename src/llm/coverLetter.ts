// ============================================================================
// v2.5 · WS5 — the keyword-aware cover letter, plus the short recruiter message.
//
// v2.4 produced ONE 220–320-word Anglo letter with no posting vocabulary and no
// register control. v2.5 adds, in the current schema:
//   • the posting's requirement vocabulary (WS2), used only where the résumé
//     genuinely supports it — the same P8 rule the résumé engine follows;
//   • the exact role title, stated once;
//   • Concise / Balanced / Formal tones, Balanced by default (roadmap v2.5);
//   • independent EN and DE generation from the same canonical facts, with the
//     German letter written in correct Sie-form.
//   • a separate 4–6 line short message for email or LinkedIn.
//
// DELIBERATELY NOT HERE (ATS plan §3, WS5 → v2.6): the full DIN-5008 Anschreiben
// with address blocks, Betreff line and Gehaltsvorstellung, and the Sie/du
// register slider. Those are a formatting release of their own, and the letter
// must stay ATS-safe and left-aligned by default until then.
// ============================================================================
import type { MatchResult, NormalizedJob, Profile } from '../types'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import { resumeFromLegacyProfile } from '../resume/canonical'
import { pickLanguage } from '../resume/tailor'
import { PROMPT } from '../lib/config'
import { costOf, estimateLetterOutputTokens, type RequestCost } from './budget'
import { projectEvidenceForPrompt, projectJobForPrompt } from './promptProjection'
import { chatComplete } from './groq'

export type LetterTone = 'concise' | 'balanced' | 'formal'

export const LETTER_TONES: LetterTone[] = ['concise', 'balanced', 'formal']
export const DEFAULT_LETTER_TONE: LetterTone = 'balanced'

const TONE_RULES: Record<LetterTone, { en: string; de: string; words: string }> = {
  concise: {
    en: 'Direct and economical. Short sentences, no warm-up paragraph.',
    de: 'Direkt und knapp. Kurze Sätze, keine Einleitungsfloskeln. Durchgehend Sie-Form.',
    words: '150–200 words',
  },
  balanced: {
    en: 'Professional and readable. Plain sentences, no corporate filler.',
    de: 'Professionell und gut lesbar. Klare Sätze, keine Floskeln. Durchgehend Sie-Form.',
    words: '220–320 words',
  },
  formal: {
    en: 'Formal business register. Complete sentences, measured wording, no contractions.',
    de: 'Förmliches Geschäftsdeutsch. Vollständige Sätze, Sie-Form, keine Umgangssprache.',
    words: '280–380 words',
  },
}

const SYSTEM = `You are a concise career writer. Write a specific cover letter grounded only in the supplied verified résumé evidence and job description. Never invent employers, dates, tools, responsibilities, qualifications, clients, certifications, or metrics. Do not expose evidence ids in the letter.`

export type LetterOptions = {
  /** Defaults to the posting's own language, exactly as v2.4 behaved. */
  language?: ResumeLanguage
  tone?: LetterTone
  /** Posting requirement vocabulary from WS2 + the term dictionary. */
  jdTerms?: string[]
  match?: MatchResult
  signal?: AbortSignal
  onBudgetWait?: (remainingMs: number) => void
  onUsage?: (usage: { estimated: RequestCost; actualTokens?: number; model: string }) => void
}

/**
 * v2.4.3: the evidence block is a projection — it keeps the evidence ids the
 * letter grounds its claims in, and drops the contact details, links and
 * internal bookkeeping that were being sent for no reason.
 */
function verifiedEvidenceOf(source: ResumeData | Profile) {
  const resume = isResumeData(source) ? source : resumeFromLegacyProfile(source)
  return projectEvidenceForPrompt(resume)
}

export function buildCoverLetterPrompt(
  source: ResumeData | Profile,
  job: NormalizedJob,
  options: LetterOptions = {},
): string {
  const tone = options.tone ?? DEFAULT_LETTER_TONE
  const rules = TONE_RULES[tone]
  const german = (options.language ?? pickLanguage(job)) === 'de'
  const verifiedEvidence = verifiedEvidenceOf(source)
  return [
    `Write a cover letter of ${rules.words} in ${german ? 'German' : 'English'}.`,
    `Tone: ${german ? rules.de : rules.en}`,
    `Name the exact role "${job.title}" and the company "${job.company}" once, in the opening.`,
    'Use at least TWO concrete skills or achievements from verified evidence.',
    'Mirror the posting vocabulary listed under JOB REQUIREMENTS only where the verified evidence already shows that work. Never claim a requirement the evidence does not support; if a requirement is missing, simply leave it out.',
    'Never state a number, percentage or duration that the verified evidence does not contain.',
    'Do not repeat any single term more than twice.',
    'Use the match overlap only as a relevance hint; it is not additional evidence.',
    'No clichés, generic enthusiasm, or unsupported claims.',
    'If evidence is thin, stay concise instead of filling gaps. End with a direct, calm close.',
    ...(german
      ? ['Left-aligned plain text. Do not add an address block, a Betreff line or a date line — those come later, outside the letter body.']
      : ['Left-aligned plain text with no letterhead.']),
    '', 'JOB REQUIREMENTS:', JSON.stringify(options.jdTerms ?? [], null, 2),
    '', 'VERIFIED RÉSUMÉ EVIDENCE:', JSON.stringify(verifiedEvidence, null, 2),
    '', 'JOB:', JSON.stringify(projectJobForPrompt(job, { excerptChars: PROMPT.letterExcerptChars }), null, 2),
    ...(options.match ? ['', 'MATCH CONTEXT (not additional evidence):', JSON.stringify({ matchedSkills: options.match.matchedSkills, missingSkills: options.match.missingSkills, rationale: options.match.rationale }, null, 2)] : []),
  ].join('\n')
}

/** v2.4.3: price the letter request, so the UI can show the cost before spending. */
export function estimateLetterRequest(
  source: ResumeData | Profile,
  job: NormalizedJob,
  options: LetterOptions = {},
): { system: string; user: string; maxTokens: number; cost: RequestCost } {
  const user = buildCoverLetterPrompt(source, job, options)
  const maxTokens = estimateLetterOutputTokens()
  return { system: SYSTEM, user, maxTokens, cost: costOf({ system: SYSTEM, user, maxTokens }) }
}

export async function draftCoverLetter(
  source: ResumeData | Profile,
  job: NormalizedJob,
  apiKey: string,
  options: LetterOptions = {},
): Promise<string> {
  const request = estimateLetterRequest(source, job, options)
  return chatComplete({
    apiKey,
    system: request.system,
    user: request.user,
    temperature: 0.3,
    maxTokens: request.maxTokens,
    signal: options.signal,
    onBudgetWait: options.onBudgetWait,
    onUsage: options.onUsage,
  })
}

// --- The short recruiter message ---------------------------------------------

const SHORT_SYSTEM = `You write very short, factual outreach messages. Use only the supplied verified evidence. Never invent anything and never use an evidence id in the text.`

export function buildShortMessagePrompt(
  source: ResumeData | Profile,
  job: NormalizedJob,
  options: LetterOptions = {},
): string {
  const german = (options.language ?? pickLanguage(job)) === 'de'
  const verifiedEvidence = verifiedEvidenceOf(source)
  return [
    `Write a ${german ? 'German' : 'English'} message of 4 to 6 short lines for email or LinkedIn.`,
    german ? 'Use the formal Sie-form.' : 'Use plain, direct English.',
    `Line 1 names the exact role "${job.title}" at "${job.company}".`,
    'Two lines give the single strongest piece of verified evidence for that role.',
    'One closing line offers to send the full application. No greeting flourishes, no bullet points, no subject line.',
    'Never state a number the verified evidence does not contain.',
    '', 'JOB REQUIREMENTS:', JSON.stringify(options.jdTerms ?? [], null, 2),
    '', 'VERIFIED RÉSUMÉ EVIDENCE:', JSON.stringify(verifiedEvidence, null, 2),
    '', 'JOB:', JSON.stringify({ title: job.title, company: job.company }, null, 2),
  ].join('\n')
}

export async function draftShortMessage(
  source: ResumeData | Profile,
  job: NormalizedJob,
  apiKey: string,
  options: LetterOptions = {},
): Promise<string> {
  return chatComplete({
    apiKey,
    system: SHORT_SYSTEM,
    user: buildShortMessagePrompt(source, job, options),
    temperature: 0.3,
    maxTokens: 400,
    signal: options.signal,
    onBudgetWait: options.onBudgetWait,
    onUsage: options.onUsage,
  })
}

function isResumeData(value: ResumeData | Profile): value is ResumeData {
  return 'experience' in value && 'contact' in value
}