import type { NormalizedJob, Profile } from '../types'
import type { ResumeData } from '../resume/types'
import { resumeFromLegacyProfile } from '../resume/canonical'
import { extractJson, groqChat } from './groq'

const SYSTEM = `You are an interview coach. Use only the supplied verified résumé achievements and the job description. Never invent experience. Return one JSON object only.`

export type InterviewPrep = {
  likelyQuestions: { question: string; evidenceIds: string[]; answerOutline: string[] }[]
  questionsToAsk: string[]
  gapsToPrepare: string[]
}

export function buildInterviewPrompt(source: ResumeData | Profile, job: NormalizedJob): string {
  const resume = isResumeData(source) ? source : resumeFromLegacyProfile(source)
  const evidence = resume.experience.map((role) => ({
    id: role.id, title: role.title, company: role.company, start: role.start, end: role.end, current: role.current,
    achievements: role.bullets.map((bullet) => ({ id: bullet.id, text: bullet.text })),
  }))
  return [
    'Prepare this candidate for the role.',
    'Return { likelyQuestions: [{ question, evidenceIds, answerOutline }], questionsToAsk, gapsToPrepare }.',
    'Every answer outline must cite only evidenceIds present below. Keep unsupported gaps explicit.',
    '', 'VERIFIED EVIDENCE:', JSON.stringify(evidence, null, 2),
    '', 'SKILLS:', JSON.stringify(resume.skills.flatMap((group) => group.items.map((item) => ({ id: item.id, name: item.name })))),
    '', 'JOB:', JSON.stringify({ title: job.title, company: job.company, description: job.description }, null, 2),
  ].join('\n')
}

export async function generateInterviewPrep(
  source: ResumeData | Profile,
  job: NormalizedJob,
  apiKey: string,
  signal?: AbortSignal,
): Promise<InterviewPrep> {
  const raw = await groqChat({ apiKey, system: SYSTEM, user: buildInterviewPrompt(source, job), json: true, temperature: 0, maxTokens: 1800, signal })
  const parsed = extractJson<Partial<InterviewPrep>>(raw)
  return {
    likelyQuestions: Array.isArray(parsed.likelyQuestions) ? parsed.likelyQuestions : [],
    questionsToAsk: Array.isArray(parsed.questionsToAsk) ? parsed.questionsToAsk : [],
    gapsToPrepare: Array.isArray(parsed.gapsToPrepare) ? parsed.gapsToPrepare : [],
  }
}

function isResumeData(value: ResumeData | Profile): value is ResumeData {
  return 'experience' in value && 'contact' in value
}