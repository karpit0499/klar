import type { NormalizedJob } from '../types'
import { tailorResume, type TailoredResume } from '../resume/tailor'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import { extractJson, groqChat } from './groq'

type RewrittenBullet = {
  text: string
  sourceBulletIndexes: number[]
}

type RewrittenExperience = {
  sourceIndex: number
  title: string
  bullets: RewrittenBullet[]
}

type RewrittenProject = {
  sourceIndex: number
  summary: string
}

type ModelTailoringResponse = {
  summary: string
  experience: RewrittenExperience[]
  projects: RewrittenProject[]
  changeSummary: string[]
}

export type AiTailoredResume = TailoredResume & {
  changeSummary: string[]
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Some models occasionally return one-based bullet indexes:
 * 1, 2, 3 instead of the required 0, 1, 2.
 *
 * Only correct the response when it is clearly one-based.
 * Arbitrary invalid indexes are still rejected by the validator.
 */
function normalizeClearlyOneBasedEvidenceIndexes(
  value: unknown,
  source: ResumeData,
): void {
  if (!value || typeof value !== 'object') return

  const response = value as Partial<ModelTailoringResponse>
  if (!Array.isArray(response.experience)) return

  for (const item of response.experience) {
    if (!Number.isInteger(item?.sourceIndex)) continue

    if (
      item.sourceIndex < 0 ||
      item.sourceIndex >= source.experience.length ||
      !Array.isArray(item.bullets)
    ) {
      continue
    }

    const bulletCount =
      source.experience[item.sourceIndex].bullets.length

    const returnedIndexes = item.bullets.flatMap((bullet) =>
      Array.isArray(bullet?.sourceBulletIndexes)
        ? bullet.sourceBulletIndexes
        : [],
    )

    const clearlyOneBased =
      bulletCount > 0 &&
      returnedIndexes.length > 0 &&
      returnedIndexes.every(
        (index) =>
          Number.isInteger(index) &&
          index >= 1 &&
          index <= bulletCount,
      ) &&
      returnedIndexes.some((index) => index === bulletCount)

    if (!clearlyOneBased) continue

    for (const bullet of item.bullets) {
      bullet.sourceBulletIndexes =
        bullet.sourceBulletIndexes.map((index) => index - 1)
    }
  }
}

export function validateTailoringResponse(
  value: unknown,
  source: ResumeData,
): asserts value is ModelTailoringResponse {
  if (!value || typeof value !== 'object') throw new Error('Tailoring response is not an object.')
  const response = value as Partial<ModelTailoringResponse>
  if (!isNonEmptyString(response.summary)) throw new Error('Tailoring response has no summary.')
  if (!Array.isArray(response.experience)) throw new Error('Tailoring response has no experience list.')
  if (!Array.isArray(response.projects)) throw new Error('Tailoring response has no project list.')
  if (!Array.isArray(response.changeSummary)) throw new Error('Tailoring response has no change summary.')

  const seen = new Set<number>()
  for (const item of response.experience) {
    if (!Number.isInteger(item?.sourceIndex)) throw new Error('An experience entry has no valid sourceIndex.')
    if (item.sourceIndex < 0 || item.sourceIndex >= source.experience.length) {
      throw new Error('An experience entry references an unknown source role.')
    }
    if (seen.has(item.sourceIndex)) throw new Error('The same source role was returned more than once.')
    seen.add(item.sourceIndex)
    if (!isNonEmptyString(item.title)) throw new Error('An experience entry has no title.')
    if (!Array.isArray(item.bullets) || item.bullets.length === 0) {
      throw new Error('An experience entry has no bullets.')
    }

    const sourceBullets = source.experience[item.sourceIndex].bullets
    for (const bullet of item.bullets) {
      if (!isNonEmptyString(bullet?.text)) throw new Error('A rewritten bullet is empty.')
      if (!Array.isArray(bullet.sourceBulletIndexes) || bullet.sourceBulletIndexes.length === 0) {
        throw new Error('A rewritten bullet has no source evidence.')
      }
      if (
        bullet.sourceBulletIndexes.some(
          (index) => !Number.isInteger(index) || index < 0 || index >= sourceBullets.length,
        )
      ) {
        throw new Error('A rewritten bullet references unknown source evidence.')
      }
    }
  }

  if (seen.size !== source.experience.length) {
    throw new Error('Tailoring response did not return every source role.')
  }

  const seenProjects = new Set<number>()
  for (const project of response.projects) {
    if (!Number.isInteger(project?.sourceIndex)) throw new Error('A project has no valid sourceIndex.')
    if (project.sourceIndex < 0 || project.sourceIndex >= source.projects.length) {
      throw new Error('A project references an unknown source project.')
    }
    if (seenProjects.has(project.sourceIndex)) throw new Error('The same source project was returned more than once.')
    seenProjects.add(project.sourceIndex)
    if (typeof project.summary !== 'string') throw new Error('A project summary is not a string.')
    if (source.projects[project.sourceIndex].summary && !project.summary.trim()) {
      throw new Error('A source project summary was dropped.')
    }
    if (!source.projects[project.sourceIndex].summary && project.summary.trim()) {
      throw new Error('A project summary was invented without source text.')
    }
  }
  if (seenProjects.size !== source.projects.length) {
    throw new Error('Tailoring response did not return every source project.')
  }
  if (!response.changeSummary.every(isNonEmptyString)) {
    throw new Error('Tailoring response contains an empty change note.')
  }
}

function systemPrompt(language: ResumeLanguage): string {
  const languageName =
    language === 'de' ? 'German' : 'English'

  return `You are an expert ATS résumé editor. Rebuild the supplied résumé for the exact job posting.

Write all generated prose in ${languageName}.

Rules:
1. Aggressively rewrite the summary, every experience bullet that can be improved, and every existing project summary.
2. Lead with evidence that is most relevant to the job posting.
3. Prefer action + scope + outcome phrasing.
4. Mirror the job posting's terminology only when the source résumé supports it.
5. The input explicitly labels every role with sourceIndex and every source bullet with sourceBulletIndex.
6. Every rewritten bullet must cite one or more sourceBulletIndexes copied exactly from sourceBulletIndex values belonging to that SAME role.
7. Never count, renumber, guess, or invent an index. Never use one-based numbering.
8. You may combine or omit weak or repetitive bullets, but the cited sourceBulletIndexes must support the rewritten text.
9. Never invent employers, dates, tools, responsibilities, qualifications, clients, certifications, or metrics.
10. If the source has no number, do not add a number.
11. Return every source experience role exactly once using its supplied sourceIndex.
12. Return every source project exactly once using its supplied sourceIndex.
13. Rewrite a project summary only when a source summary exists. Otherwise return an empty summary.
14. Return valid JSON only using exactly this shape:

{
  "summary": "string",
  "experience": [
    {
      "sourceIndex": 0,
      "title": "string",
      "bullets": [
        {
          "text": "string",
          "sourceBulletIndexes": [0]
        }
      ]
    }
  ],
  "projects": [
    {
      "sourceIndex": 0,
      "summary": "string"
    }
  ],
  "changeSummary": ["string"]
}`
}

function userPrompt(
  source: ResumeData,
  job: NormalizedJob,
): string {
  const indexedSourceResume = {
    ...source,

    experience: source.experience.map((role, sourceIndex) => ({
      ...role,

      // The model must copy this exact role index.
      sourceIndex,

      // Explicitly label every bullet so the model does not
      // have to calculate or guess its position.
      bullets: role.bullets.map(
        (bullet, sourceBulletIndex) => ({
          sourceBulletIndex,
          evidenceId: bullet.id,
          text: bullet.text,
        }),
      ),
    })),

    projects: source.projects.map((project, sourceIndex) => ({
      ...project,
      sourceIndex,
    })),
  }

  return JSON.stringify(
    {
      job: {
        title: job.title,
        company: job.company,
        description: job.description,
      },

      candidateSkills: source.skills.flatMap((group) => group.items.map((skill) => skill.name)),

      sourceResume: indexedSourceResume,
    },
    null,
    2,
  )
}

export async function tailorResumeWithAi(
  source: ResumeData,
  job: NormalizedJob,
  apiKey: string,
  language: ResumeLanguage,
): Promise<AiTailoredResume> {
  const raw = await groqChat({
    apiKey,
    system: systemPrompt(language),
    user: userPrompt(source, job),
    json: true,
    temperature: 0,
    maxTokens: 4096,
  })
  const parsed = extractJson<unknown>(raw)

  // Correct a clearly one-based response before performing
  // the strict no-fabrication validation.
  normalizeClearlyOneBasedEvidenceIndexes(parsed, source)

  validateTailoringResponse(parsed, source)

  const deterministic = tailorResume(source, { ...job, language })
  const rewrites = new Map(parsed.experience.map((item) => [item.sourceIndex, item]))
  const experience = deterministic.data.experience.map((item, sourceIndex) => {
    const rewrite = rewrites.get(sourceIndex)
    if (!rewrite) throw new Error('A source role is missing from the tailoring response.')
    return {
      ...item,
      title: rewrite.title.trim(),
      bullets: rewrite.bullets.map((bullet, bulletIndex) => {
        const sources = bullet.sourceBulletIndexes.map((index) => source.experience[sourceIndex].bullets[index])
        return {
          id: `tailored-${item.id}-${bulletIndex}`,
          text: bullet.text.trim(),
          evidenceRefs: [...new Set(sources.flatMap((sourceBullet) => [sourceBullet.id, ...sourceBullet.evidenceRefs]))],
        }
      }),
    }
  })
  const projectRewrites = new Map(parsed.projects.map((item) => [item.sourceIndex, item]))
  const projects = source.projects.map((project, sourceIndex) => {
    const rewrite = projectRewrites.get(sourceIndex)
    if (!rewrite) throw new Error('A source project is missing from the tailoring response.')
    return {
      ...project,
      summary: rewrite.summary.trim() || project.summary,
    }
  })

  return {
    language,
    coverage: deterministic.coverage,
    changeSummary: parsed.changeSummary.map((item) => item.trim()),
    data: {
      ...deterministic.data,
      contact: source.contact,
      summary: parsed.summary.trim(),
      experience,
      education: source.education,
      languages: source.languages,
      projects,
      certifications: source.certifications,
    },
  }
}