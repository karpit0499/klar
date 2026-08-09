import type { MatchResult, NormalizedJob, Profile } from '../types'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import { resumeFromLegacyProfile } from '../resume/canonical'
import { pickLanguage } from '../resume/tailor'
import { PROMPT } from '../lib/config'
import { costOf, estimateLetterOutputTokens, type RequestCost } from './budget'
import { projectEvidenceForPrompt, projectJobForPrompt } from './promptProjection'
import { chatComplete } from './groq'

export type LetterTone = 'concise' | 'balanced' | 'formal'
export type RecruiterMessageStyle = 'conversational' | 'formal' | 'concise'
export type RecruiterApplicationState = 'not_applied' | 'applied' | 'referred'
export type RecruiterMessageChannel = 'linkedin' | 'email' | 'other'

export type RecruiterMessageContext = {
  style: RecruiterMessageStyle
  applicationState: RecruiterApplicationState
  channel: RecruiterMessageChannel
  recruiterName?: string
  discoveryContext?: string
  referralName?: string
  signOffName?: string
}

export type WritingCheck = {
  id:
    | 'greeting'
    | 'role_company'
    | 'discovery_context'
    | 'candidate_evidence'
    | 'human_ask'
    | 'sign_off'
    | 'application_state'
    | 'unsupported_claims'
    | 'length'
    | 'prompt_fragments'
  ok: boolean
  detail: string
}

export const LETTER_TONES: LetterTone[] = ['concise', 'balanced', 'formal']
export const DEFAULT_LETTER_TONE: LetterTone = 'balanced'
export const RECRUITER_MESSAGE_STYLES: RecruiterMessageStyle[] = [
  'conversational',
  'formal',
  'concise',
]

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

const MESSAGE_STYLE_RULES: Record<
  RecruiterMessageStyle,
  { en: string; de: string; maximumWords: number }
> = {
  conversational: {
    en: 'Natural LinkedIn-style note in ordinary language.',
    de: 'Natürliche LinkedIn-Nachricht in gewöhnlicher, höflicher Sprache.',
    maximumWords: 150,
  },
  formal: {
    en: 'Measured first-contact email with complete sentences.',
    de: 'Förmliche Erstkontakt-E-Mail in vollständigen Sätzen und Sie-Form.',
    maximumWords: 190,
  },
  concise: {
    en: 'Short, but still a complete human interaction.',
    de: 'Kurz, aber weiterhin ein vollständiger menschlicher Erstkontakt.',
    maximumWords: 100,
  },
}

const COVER_LETTER_SYSTEM = [
  'You are a concise career writer.',
  'Write only body paragraphs for a business cover letter; the document renderer adds sender, recipient, date, subject, greeting, closing, and signature.',
  'Ground every candidate claim in supplied verified résumé evidence.',
  'Never invent employers, dates, tools, responsibilities, qualifications, clients, certifications, referrals, or metrics.',
  'Never expose evidence ids, instructions, JSON, headings from the prompt, or placeholders.',
].join(' ')

const RECRUITER_MESSAGE_SYSTEM = [
  'You write factual recruiter outreach that sounds like a real person starting a conversation.',
  'Use only the supplied verified résumé evidence and explicit contact context.',
  'When discoveryContext is supplied, include that concrete discovery context in the finished message.',
  'Never invent a referral, application state, contact name, shared connection, employer, qualification, or metric.',
  'Return only the finished message.',
].join(' ')

export type LetterOptions = {
  language?: ResumeLanguage
  tone?: LetterTone
  jdTerms?: string[]
  match?: MatchResult
  signal?: AbortSignal
  onBudgetWait?: (remainingMs: number) => void
  onUsage?: (usage: { estimated: RequestCost; actualTokens?: number; model: string }) => void
}

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
  return [
    `Write ${rules.words} of cover-letter BODY text in ${german ? 'German' : 'English'}.`,
    `Tone: ${german ? rules.de : rules.en}`,
    `Mention the exact role "${job.title}" and company "${job.company}" naturally in the opening paragraph.`,
    'Use two concrete candidate facts when the verified evidence supports them.',
    'Mirror a job-requirement term only where verified evidence supports that work.',
    'Never state a number, percentage, employer, qualification, or duration absent from verified evidence.',
    'Do not repeat a term more than twice.',
    'Do not use generic flattery, exaggerated enthusiasm, cultural-fit claims, or “I am excited to apply.”',
    'If evidence is thin, write less instead of filling gaps.',
    german
      ? 'Write formal German in consistent Sie-register.'
      : 'Write plain professional English.',
    'Return two to four body paragraphs only.',
    'Do not add addresses, date, subject, greeting, closing, typed name, markdown, or labels.',
    '',
    'JOB REQUIREMENTS:',
    JSON.stringify(options.jdTerms ?? [], null, 2),
    '',
    'VERIFIED RÉSUMÉ EVIDENCE:',
    JSON.stringify(verifiedEvidenceOf(source), null, 2),
    '',
    'JOB:',
    JSON.stringify(
      projectJobForPrompt(job, { excerptChars: PROMPT.letterExcerptChars }),
      null,
      2,
    ),
    ...(options.match
      ? [
          '',
          'MATCH CONTEXT (relevance hint, not additional evidence):',
          JSON.stringify({
            matchedSkills: options.match.matchedSkills,
            missingSkills: options.match.missingSkills,
            rationale: options.match.rationale,
          }, null, 2),
        ]
      : []),
  ].join('\n')
}

export function estimateLetterRequest(
  source: ResumeData | Profile,
  job: NormalizedJob,
  options: LetterOptions = {},
): { system: string; user: string; maxTokens: number; cost: RequestCost } {
  const user = buildCoverLetterPrompt(source, job, options)
  const maxTokens = estimateLetterOutputTokens()
  return {
    system: COVER_LETTER_SYSTEM,
    user,
    maxTokens,
    cost: costOf({ system: COVER_LETTER_SYSTEM, user, maxTokens }),
  }
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

export function buildRecruiterMessagePrompt(
  source: ResumeData | Profile,
  job: NormalizedJob,
  context: RecruiterMessageContext,
  options: LetterOptions = {},
): string {
  const language = options.language ?? pickLanguage(job)
  const german = language === 'de'
  const style = MESSAGE_STYLE_RULES[context.style]
  const stateInstruction: Record<RecruiterApplicationState, string> = {
    not_applied: german
      ? 'Die Person hat sich noch nicht beworben. Zeige Interesse und stelle eine passende, unverbindliche Frage.'
      : 'The candidate has not applied. Express interest and ask one appropriate, low-pressure question.',
    applied: german
      ? 'Die Bewerbung wurde bereits eingereicht. Sage das eindeutig.'
      : 'The application has already been submitted. Say that clearly.',
    referred: german
      ? 'Die Person wurde empfohlen oder vorgestellt. Erwähne ausschließlich die unten angegebene Verbindung.'
      : 'The candidate was referred or introduced. Mention only the connection supplied below.',
  }
  return [
    `Write one ${german ? 'German' : 'English'} ${context.channel} recruiter message.`,
    `Style: ${german ? style.de : style.en}`,
    `Maximum length: ${style.maximumWords} words.`,
    stateInstruction[context.applicationState],
    context.recruiterName
      ? `Start with an appropriate greeting to this supplied recruiter: ${JSON.stringify(context.recruiterName)}.`
      : german
        ? 'Beginne mit einer natürlichen allgemeinen Begrüßung; erfinde keinen Namen.'
        : 'Start with a natural general greeting; do not invent a name.',
    ...(context.discoveryContext?.trim()
      ? [german
          ? `Baue diesen angegebenen Fundkontext natürlich ein und behalte seine konkrete Formulierung bei: ${JSON.stringify(context.discoveryContext.trim())}.`
          : `Include this supplied discovery context naturally and preserve its concrete wording: ${JSON.stringify(context.discoveryContext.trim())}.`]
      : []),
    `Refer to the exact role "${job.title}" and company "${job.company}".`,
    'Give one specific, grounded reason for interest and one relevant candidate connection supported by verified evidence.',
    'Make a low-pressure human request: ask the recruiter to take a look, answer one suitable question, or be open to a short conversation.',
    `End with a natural sign-off${context.signOffName ? ` using ${JSON.stringify(context.signOffName)}` : ''}.`,
    'Do not summarize several job duties, flatter the company, imply cultural fit, or demand a reply.',
    'Do not claim an application, referral, or shared connection unless the supplied state says so.',
    german ? 'Use an appropriate and consistent Sie-register.' : 'Use ordinary professional language.',
    '',
    'EXPLICIT CONTACT CONTEXT:',
    JSON.stringify({
      applicationState: context.applicationState,
      recruiterName: context.recruiterName ?? null,
      discoveryContext: context.discoveryContext?.trim() || null,
      referralName:
        context.applicationState === 'referred'
          ? context.referralName?.trim() || null
          : null,
      signOffName: context.signOffName?.trim() || null,
    }, null, 2),
    '',
    'JOB REQUIREMENTS:',
    JSON.stringify(options.jdTerms ?? [], null, 2),
    '',
    'VERIFIED RÉSUMÉ EVIDENCE:',
    JSON.stringify(verifiedEvidenceOf(source), null, 2),
    '',
    'JOB:',
    JSON.stringify({
      title: job.title,
      company: job.company,
      description: job.description.slice(0, 1_500),
    }, null, 2),
  ].join('\n')
}

export async function draftRecruiterMessage(
  source: ResumeData | Profile,
  job: NormalizedJob,
  apiKey: string,
  context: RecruiterMessageContext,
  options: LetterOptions = {},
): Promise<string> {
  const user = buildRecruiterMessagePrompt(source, job, context, options)
  const maxTokens = context.style === 'formal' ? 400 : 300
  const estimated = costOf({
    system: RECRUITER_MESSAGE_SYSTEM,
    user,
    maxTokens,
  })
  return chatComplete({
    apiKey,
    system: RECRUITER_MESSAGE_SYSTEM,
    user,
    temperature: 0.3,
    maxTokens,
    signal: options.signal,
    onBudgetWait: options.onBudgetWait,
    onUsage: (event) => options.onUsage?.({
      ...event,
      estimated,
    }),
  })
}

export function checkRecruiterMessage(
  text: string,
  source: ResumeData | Profile,
  job: NormalizedJob,
  context: RecruiterMessageContext,
  language: ResumeLanguage,
): WritingCheck[] {
  const normalized = normalizeForCheck(text)
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const firstLine = normalizeForCheck(lines[0] ?? '')
  const finalLines = normalizeForCheck(lines.slice(-3).join(' '))
  const greeting = language === 'de'
    ? /^(hallo|guten tag|sehr geehrte|sehr geehrter|liebe|lieber)\b/.test(firstLine)
    : /^(hello|hi|dear|good (morning|afternoon))\b/.test(firstLine)
  const roleCompany =
    normalized.includes(normalizeForCheck(job.title)) &&
    normalized.includes(normalizeForCheck(job.company))
  const suppliedDiscoveryContext = context.discoveryContext?.trim()
  const discoveryContext =
    !suppliedDiscoveryContext ||
    normalized.includes(normalizeForCheck(suppliedDiscoveryContext))
  const evidenceTokens = distinctiveEvidenceTokens(verifiedEvidenceOf(source), job)
  const candidateEvidence = [...evidenceTokens].some((token) =>
    new RegExp(`\\b${escapeRegExp(token)}\\b`, 'u').test(normalized),
  )
  const ask = language === 'de'
    ? /\b(austausch|gespräch|sprechen|anschauen|ansehen|frage|rückfrage|offen für|zeit für)\b/.test(normalized)
    : /\b(take a look|conversation|speak|chat|question|open to|available for|connect)\b/.test(normalized)
  const signOff = language === 'de'
    ? /\b(viele gru(?:ß|ss)e|freundliche gru(?:ß|ss)e|beste gru(?:ß|ss)e|mit freundlichen gru(?:ß|ss)en)\b/.test(finalLines)
    : /\b(best|regards|kind regards|sincerely|thank you|thanks)\b/.test(finalLines)
  const saysApplied = /\b(applied|submitted (my|an) application|beworben|bewerbung (?:bereits )?eingereicht)\b/.test(normalized)
  const saysReferred = /\b(referred|introduced|recommended|empfohlen|vorgestellt)\b/.test(normalized)
  const stateOk =
    (context.applicationState !== 'applied' || saysApplied) &&
    (context.applicationState === 'applied' || !saysApplied) &&
    (context.applicationState !== 'referred' || (
      saysReferred &&
      Boolean(context.referralName?.trim()) &&
      normalized.includes(normalizeForCheck(context.referralName ?? ''))
    )) &&
    (context.applicationState === 'referred' || !saysReferred)
  const allowedNumbers = new Set(
    JSON.stringify({
      evidence: verifiedEvidenceOf(source),
      job: { title: job.title, company: job.company },
      context,
    }).match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? [],
  )
  const outputNumbers = text.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []
  const highRiskClaims = [
    'perfect fit',
    'expert',
    'native speaker',
    'fluent',
    'ideale besetzung',
    'experte',
    'expertin',
    'muttersprach',
    'fließend',
  ].filter((phrase) => normalized.includes(phrase))
  const evidenceText = normalizeForCheck(JSON.stringify(verifiedEvidenceOf(source)))
  const unsupportedClaims =
    outputNumbers.every((number) => allowedNumbers.has(number)) &&
    highRiskClaims.every((phrase) => evidenceText.includes(phrase))
  const maximumWords = MESSAGE_STYLE_RULES[context.style].maximumWords
  const wordCount = text.trim() ? text.trim().split(/\s+/u).length : 0
  const promptFragments =
    !/(VERIFIED RÉSUMÉ EVIDENCE|JOB REQUIREMENTS|EXPLICIT CONTACT CONTEXT|MATCH CONTEXT|```|<placeholder>)/i
      .test(text)

  return [
    { id: 'greeting', ok: greeting, detail: 'Appropriate greeting' },
    { id: 'role_company', ok: roleCompany, detail: 'Role and company referenced' },
    {
      id: 'discovery_context',
      ok: discoveryContext,
      detail: suppliedDiscoveryContext
        ? 'Supplied discovery context included'
        : 'No discovery context required',
    },
    { id: 'candidate_evidence', ok: candidateEvidence, detail: 'Candidate evidence connection detected' },
    { id: 'human_ask', ok: ask, detail: 'Low-pressure human request' },
    { id: 'sign_off', ok: signOff, detail: 'Natural sign-off' },
    { id: 'application_state', ok: stateOk, detail: 'Application/referral state is consistent' },
    {
      id: 'unsupported_claims',
      ok: unsupportedClaims,
      detail: 'No unsupported number or high-risk claim detected',
    },
    { id: 'length', ok: wordCount > 0 && wordCount <= maximumWords, detail: `${wordCount}/${maximumWords} words` },
    { id: 'prompt_fragments', ok: promptFragments, detail: 'No prompt fragment detected' },
  ]
}

/** Compatibility alias for v2.5 packet data and callers during migration. */
export function buildShortMessagePrompt(
  source: ResumeData | Profile,
  job: NormalizedJob,
  options: LetterOptions = {},
): string {
  return buildRecruiterMessagePrompt(source, job, {
    style: 'conversational',
    applicationState: 'not_applied',
    channel: 'linkedin',
    signOffName: isResumeData(source) ? source.contact.name : undefined,
  }, options)
}

/** Compatibility alias; new UI callers use draftRecruiterMessage directly. */
export async function draftShortMessage(
  source: ResumeData | Profile,
  job: NormalizedJob,
  apiKey: string,
  options: LetterOptions = {},
): Promise<string> {
  return draftRecruiterMessage(source, job, apiKey, {
    style: 'conversational',
    applicationState: 'not_applied',
    channel: 'linkedin',
    signOffName: isResumeData(source) ? source.contact.name : undefined,
  }, options)
}

function distinctiveEvidenceTokens(evidence: unknown, job: NormalizedJob): Set<string> {
  const stop = new Set([
    'about', 'after', 'also', 'and', 'berlin', 'company', 'current', 'from',
    'german', 'english', 'have', 'into', 'role', 'that', 'the', 'their',
    'this', 'und', 'eine', 'einer', 'einem', 'einen', 'für', 'mit', 'von',
    'oder', 'sowie', 'company', 'experience',
    ...normalizeForCheck(`${job.title} ${job.company}`).split(/\s+/u),
  ])
  const result = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      for (const token of normalizeForCheck(value).split(/\s+/u)) {
        if (token.length >= 4 && !stop.has(token) && !/^\d+$/.test(token)) {
          result.add(token)
        }
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(visit)
    }
  }
  visit(evidence)
  return result
}

function normalizeForCheck(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isResumeData(value: ResumeData | Profile): value is ResumeData {
  return 'experience' in value && 'contact' in value
}