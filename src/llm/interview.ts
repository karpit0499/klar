// ============================================================================
// Per-job interview prep (feature 17). From the JD + profile, generate likely
// questions, how the candidate's background answers each, and talking points for
// the gaps. A natural extension of the existing Groq layer — the prompt builder
// is pure (testable); the call + defensive parse mirror the re-rank pattern.
// ============================================================================
import type { NormalizedJob, Profile } from '../types'
import { groqChat, extractJson } from './groq'

const SYSTEM = `You are an experienced interview coach. You prepare a candidate for a specific role using ONLY facts from their profile and the job description. You never invent experience. Reply with ONE JSON object and nothing else.`

export type InterviewQuestion = {
  question: string
  /** How the candidate's actual background answers it (or "" if it's a gap). */
  answer: string
  /** True when this probes a gap the candidate should prepare a story for. */
  isGap: boolean
}
export type InterviewPrep = {
  questions: InterviewQuestion[]
  talkingPoints: string[]  // strengths to steer toward
  gapStrategies: string[]  // how to handle the weak spots honestly
}

/** Deterministic, testable prompt for interview prep. */
export function buildInterviewPrompt(profile: Profile, job: NormalizedJob): string {
  const candidate = {
    titles: profile.titles.map((t) => t.title),
    skills: profile.skills.map((s) => s.name),
    totalYears: profile.totalYears,
    domains: profile.domains,
  }
  return [
    'Prepare this candidate for an interview for the role below.',
    '',
    'CANDIDATE:', JSON.stringify(candidate),
    '',
    'ROLE:', JSON.stringify({
      title: job.title, company: job.company,
      description: job.description.slice(0, 3000),
    }),
    '',
    'Return JSON with EXACTLY these keys:',
    'questions: array of 6-8 { question (string), answer (string: how THIS candidate answers it,',
    '  drawing on their real background; empty string if they lack the experience), isGap (boolean) },',
    'talkingPoints: string[] (3-5 strengths to steer the conversation toward),',
    'gapStrategies: string[] (2-4 honest ways to handle areas they are weak in).',
    'Mix behavioural and role-specific technical questions. Never fabricate experience.',
  ].join('\n')
}

type RawPrep = Partial<InterviewPrep>

/** Coerce the model JSON into a complete InterviewPrep (never throws on shape). */
export function coerceInterviewPrep(raw: RawPrep): InterviewPrep {
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  return {
    questions: arr<Partial<InterviewQuestion>>(raw.questions).map((q) => ({
      question: q.question ?? '',
      answer: q.answer ?? '',
      isGap: Boolean(q.isGap),
    })).filter((q) => q.question),
    talkingPoints: arr<string>(raw.talkingPoints),
    gapStrategies: arr<string>(raw.gapStrategies),
  }
}

/** Generate interview prep for one job. */
export async function generateInterviewPrep(
  profile: Profile, job: NormalizedJob, apiKey: string, signal?: AbortSignal,
): Promise<InterviewPrep> {
  const text = await groqChat({
    apiKey, system: SYSTEM, user: buildInterviewPrompt(profile, job),
    json: true, temperature: 0.3, maxTokens: 2048, signal,
  })
  return coerceInterviewPrep(extractJson<RawPrep>(text))
}