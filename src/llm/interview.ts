import type { NormalizedJob, Profile } from '../types'
import type { ResumeData } from '../resume/types'
import { resumeFromLegacyProfile } from '../resume/canonical'
import { extractJson, groqChat } from './groq'
import { INTERVIEW_OUTPUT } from './jsonSchemas'

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

/**
 * Coerce a partial/schema-recovery response without inventing content.
 * Unknown evidence IDs are discarded so a malformed model row can never make
 * an answer look grounded in résumé evidence that was not actually supplied.
 */
export function coerceInterviewPrep(raw: unknown, source: ResumeData): InterviewPrep {
  const parsed = record(raw)
  const allowedEvidenceIds = new Set([
    ...source.experience.map((role) => role.id),
    ...source.experience.flatMap((role) => role.bullets.map((bullet) => bullet.id)),
    ...source.skills.flatMap((group) => group.items.map((item) => item.id)),
  ])
  const likelyQuestions = Array.isArray(parsed.likelyQuestions)
    ? parsed.likelyQuestions.flatMap((value) => {
        const row = record(value)
        const question = cleanText(row.question)
        if (!question) return []
        return [{
          question,
          evidenceIds: stringList(row.evidenceIds)
            .filter((id) => allowedEvidenceIds.has(id)),
          answerOutline: stringList(row.answerOutline),
        }]
      })
    : []

  return {
    likelyQuestions,
    questionsToAsk: stringList(parsed.questionsToAsk),
    gapsToPrepare: stringList(parsed.gapsToPrepare),
  }
}

export async function generateInterviewPrep(
  source: ResumeData | Profile,
  job: NormalizedJob,
  apiKey: string,
  signal?: AbortSignal,
): Promise<InterviewPrep> {
  // Convert a legacy profile only once. Its generated evidence IDs must be the
  // same IDs used in both the prompt and the response validation below.
  const resume = isResumeData(source) ? source : resumeFromLegacyProfile(source)
  const raw = await groqChat({ apiKey, system: SYSTEM, user: buildInterviewPrompt(resume, job), jsonSchema: INTERVIEW_OUTPUT, temperature: 0, maxTokens: 1800, signal })
  return coerceInterviewPrep(extractJson<unknown>(raw), resume)
}

function isResumeData(value: ResumeData | Profile): value is ResumeData {
  return 'experience' in value && 'contact' in value
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of value) {
    const item = cleanText(raw)
    if (!item || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}
