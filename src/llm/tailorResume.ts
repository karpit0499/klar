// ============================================================================
// v2.5 · WS4a — evidence-bound AI tailoring, IN THE CURRENT SCHEMA.
//
// What changed from v2.4:
//   1. Principle P8 is now an explicit prompt rule AND a deterministic check.
//      The model may translate vocabulary; it may not import specifics.
//   2. Principle P9 (no title inflation, no keyword stuffing) is checked, not
//      merely requested.
//   3. The posting's own requirement vocabulary (WS2) is supplied, so reframing
//      has something concrete and truthful to mirror.
//   4. Exactly ONE targeted automatic retry. The second attempt is told exactly
//      which sentences failed and why. After that Klar stops and explains —
//      it never quietly ships an unsupported claim, and it never loops.
//   5. The result is a reviewable ChangeRecord[] rather than an opaque document.
//
// What deliberately did NOT change (ATS plan §3 — this is WS4b, v2.6):
//   project/thesis bullets, cross-section re-ranking, a projects-above-experience
//   layout, and the automatic coverage second pass. All of those need résumé
//   schemaVersion 3 and a coordinated Dexie migration.
// ============================================================================
import type { NormalizedJob } from '../types'
import { tailorResume } from '../resume/tailor'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import type { CoverageReport } from '../resume/keywords'
import { normalizeResume } from '../resume/canonical'
import {
  applyChanges, proposeChanges, type ChangeRecord, type ProposedChanges,
} from '../resume/changeSet'
import { GENERATION, PROMPT } from '../lib/config'
import {
  canAfford, costOf, estimateTailoringOutputTokens, loadTpmLimit, type RequestCost,
} from './budget'
import { projectJobForPrompt, projectResumeForPrompt, resumeShape } from './promptProjection'
import { AppError } from '../errors/appError'
import {
  auditBullet, auditRoleTitle, auditSummary,
  type EvidenceFinding, type UnresolvedIssue,
} from './evidenceStatus'
import { extractJson, chatComplete } from './groq'
import { TAILORING_OUTPUT } from './jsonSchemas'

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

export type ModelTailoringResponse = {
  summary: string
  experience: RewrittenExperience[]
  projects: RewrittenProject[]
  /** Derived locally. It is deliberately not part of the provider contract. */
  changeSummary: string[]
}

export type { UnresolvedIssue }

export type AiTailoredResume = {
  language: ResumeLanguage
  coverage: CoverageReport
  /** The merged posting vocabulary this run mirrored. */
  jdTerms: string[]
  /** Deterministic tailoring with the ORIGINAL sentences — the reject-all floor. */
  baseline: ResumeData
  /** The normalized source, kept so decisions can be replayed at any time. */
  source: ResumeData
  changes: ChangeRecord[]
  changeSummary: string[]
  /** 1 = first attempt succeeded, 2 = the single retry was used. */
  attempts: number
  unresolved: UnresolvedIssue[]
  /** Convenience: the résumé with the current decisions applied. */
  data: ResumeData
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Defensive compatibility for pre-v2.3 fixtures and restored legacy data. */
function sourceBulletText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  const row = objectValue(value)
  return typeof row?.text === 'string' ? row.text.trim() : ''
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

  const response = objectValue(value)
  if (!Array.isArray(response?.experience)) return

  for (const item of response.experience) {
    const role = objectValue(item)
    if (!role || !Number.isInteger(role.sourceIndex)) continue
    const sourceIndex = role.sourceIndex as number

    if (
      sourceIndex < 0 ||
      sourceIndex >= source.experience.length ||
      !Array.isArray(role.bullets)
    ) {
      continue
    }

    const bulletCount =
      source.experience[sourceIndex].bullets.length

    const returnedIndexes = role.bullets.flatMap((bullet) => {
      const row = objectValue(bullet)
      return Array.isArray(row?.sourceBulletIndexes)
        ? row.sourceBulletIndexes
        : []
    })

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

    for (const bullet of role.bullets) {
      const row = objectValue(bullet)
      if (!Array.isArray(row?.sourceBulletIndexes)) continue
      row.sourceBulletIndexes =
        row.sourceBulletIndexes.map((index) =>
          Number.isInteger(index) ? (index as number) - 1 : index,
        )
    }
  }
}

/**
 * Treat the model response as a partial edit proposal, never as a replacement
 * document. Anything absent, empty, duplicated, or tied to invalid/blank
 * evidence falls back to the person's source text. This keeps a truncated
 * English or German completion usable without weakening the evidence audit.
 */
export function normalizeTailoringResponse(
  value: unknown,
  source: ResumeData,
  deterministicSummary?: string,
): ModelTailoringResponse {
  normalizeClearlyOneBasedEvidenceIndexes(value, source)
  const response = objectValue(value)

  const summary = [
    response?.summary,
    deterministicSummary,
    source.summary,
    source.experience.find((role) => role.title.trim())?.title,
    source.contact.name,
  ].find(isNonEmptyString)?.trim() ?? ''

  const rawRoles = Array.isArray(response?.experience)
    ? response.experience
    : []
  const rolesBySourceIndex = new Map<number, Record<string, unknown>>()
  for (const value of rawRoles) {
    const role = objectValue(value)
    if (!role || !Number.isInteger(role.sourceIndex)) continue
    const sourceIndex = role.sourceIndex as number
    if (
      sourceIndex < 0 ||
      sourceIndex >= source.experience.length ||
      rolesBySourceIndex.has(sourceIndex)
    ) {
      continue
    }
    rolesBySourceIndex.set(sourceIndex, role)
  }

  const experience = source.experience.map((sourceRole, sourceIndex) => {
    const proposal = rolesBySourceIndex.get(sourceIndex)
    const bullets: RewrittenBullet[] = []
    const covered = new Set<number>()
    const rawBullets = Array.isArray(proposal?.bullets)
      ? proposal.bullets
      : []

    for (const value of rawBullets) {
      const bullet = objectValue(value)
      if (!bullet || !isNonEmptyString(bullet.text)) continue
      if (!Array.isArray(bullet.sourceBulletIndexes) || bullet.sourceBulletIndexes.length === 0) {
        continue
      }

      const indexes = [...new Set(bullet.sourceBulletIndexes)]
      if (
        indexes.some(
          (index) =>
            !Number.isInteger(index) ||
            (index as number) < 0 ||
            (index as number) >= sourceRole.bullets.length ||
            !sourceBulletText(sourceRole.bullets[index as number]),
        )
      ) {
        continue
      }

      const sourceBulletIndexes = indexes as number[]
      bullets.push({ text: bullet.text.trim(), sourceBulletIndexes })
      sourceBulletIndexes.forEach((index) => covered.add(index))
    }

    // A partial/malformed proposal must not silently delete source facts.
    sourceRole.bullets.forEach((bullet, sourceBulletIndex) => {
      const text = sourceBulletText(bullet)
      if (!text || covered.has(sourceBulletIndex)) return
      bullets.push({ text, sourceBulletIndexes: [sourceBulletIndex] })
    })

    return {
      sourceIndex,
      title: sourceRole.title.trim() && isNonEmptyString(proposal?.title)
        ? proposal.title.trim()
        : sourceRole.title.trim(),
      bullets,
    }
  })

  const rawProjects = Array.isArray(response?.projects)
    ? response.projects
    : []
  const projectsBySourceIndex = new Map<number, Record<string, unknown>>()
  for (const value of rawProjects) {
    const project = objectValue(value)
    if (!project || !Number.isInteger(project.sourceIndex)) continue
    const sourceIndex = project.sourceIndex as number
    if (
      sourceIndex < 0 ||
      sourceIndex >= source.projects.length ||
      projectsBySourceIndex.has(sourceIndex)
    ) {
      continue
    }
    projectsBySourceIndex.set(sourceIndex, project)
  }

  const projects = source.projects.map((sourceProject, sourceIndex) => {
    const proposal = projectsBySourceIndex.get(sourceIndex)
    const original = sourceProject.summary?.trim() ?? ''
    return {
      sourceIndex,
      // No source text means there is no evidence from which to invent a rewrite.
      summary:
        original && isNonEmptyString(proposal?.summary)
          ? proposal.summary.trim()
          : original,
    }
  })

  return {
    summary,
    experience,
    projects,
    // Cosmetic notes are derived after audited ChangeRecords exist.
    changeSummary: [],
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
    if (typeof item.title !== 'string' || (source.experience[item.sourceIndex].title.trim() && !item.title.trim())) {
      throw new Error('An experience entry has no title.')
    }
    if (!Array.isArray(item.bullets)) {
      throw new Error('An experience entry has no bullets.')
    }

    const sourceBullets = source.experience[item.sourceIndex].bullets
    const hasUsableSourceBullet = sourceBullets.some((bullet) => sourceBulletText(bullet))
    if (hasUsableSourceBullet && item.bullets.length === 0) {
      throw new Error('An experience entry has no bullets.')
    }
    for (const bullet of item.bullets) {
      if (!isNonEmptyString(bullet?.text)) throw new Error('A rewritten bullet is empty.')
      if (!Array.isArray(bullet.sourceBulletIndexes) || bullet.sourceBulletIndexes.length === 0) {
        throw new Error('A rewritten bullet has no source evidence.')
      }
      if (
        bullet.sourceBulletIndexes.some(
          (index) =>
            !Number.isInteger(index) ||
            index < 0 ||
            index >= sourceBullets.length ||
            !sourceBulletText(sourceBullets[index]),
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

export function systemPrompt(language: ResumeLanguage): string {
  const languageName =
    language === 'de' ? 'German' : 'English'

  return `You are an expert ATS résumé editor. Rebuild the supplied résumé for the exact job posting.

Write all generated prose in ${languageName}.

Rules:
1. Rewrite the summary, supported experience bullets, and existing project summaries concisely.
2. Lead with evidence that is most relevant to the job posting.
3. Prefer action + scope + outcome phrasing.
4. Mirror the job posting's terminology only when the source résumé supports it. The posting's key requirements are supplied as job.requirements — use that exact wording where, and only where, the source bullet already describes that work.
5. The input explicitly labels every role with sourceIndex and every source bullet with sourceBulletIndex.
6. Every rewritten bullet must cite one or more sourceBulletIndexes copied exactly from sourceBulletIndex values belonging to that SAME role.
7. Never count, renumber, guess, or invent an index. Never use one-based numbering.
8. You may combine or omit weak or repetitive bullets, but the cited sourceBulletIndexes must support the rewritten text.
9. Never invent employers, dates, tools, responsibilities, qualifications, clients, certifications, or metrics.
10. REFRAMING RULE: you may re-describe a real task in the posting's vocabulary using ONLY the tools, data, cadence and numbers that already appear in the cited source bullet. Translating wording is allowed. Adding a specific that is not in the evidence is not, even when the posting asks for it.
11. If the source has no number, do not add a number. Never introduce a percentage, count, amount or duration that the cited source does not state.
12. Keep every role title truthful. You may tidy a title, but never add a seniority word (senior, lead, head, principal, chief, director, manager) that the source title does not already contain.
13. The summary may name the posting's exact job title once, as the role being applied for. Do not repeat any term more than twice anywhere — natural prose beats keyword stuffing, which modern ATS penalise.
14. Return every source experience role exactly once using its supplied sourceIndex.
15. Return every source project exactly once using its supplied sourceIndex.
16. Rewrite a project summary only when a source summary exists. Otherwise return an empty summary.
17. If a source role has no supplied bullets, return "bullets": [] for that role. Never invent a bullet.
18. Keep the summary to at most 55 words, each bullet to at most 32 words, and each project summary to at most 40 words. Do not write change notes or explanations.
19. Return compact valid JSON only, with no markdown, using exactly this shape. When the input has no projects, return "projects": []:

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
  ]
}`
}

export function userPrompt(
  source: ResumeData,
  job: NormalizedJob,
  jdTerms: string[] = [],
  corrections: string[] = [],
): string {
  // v2.4.3: send a minimal PROJECTION, not the stored objects. Every
  // sourceIndex / sourceBulletIndex the response contract needs survives; the
  // internal ids, evidence references, contact details and the tail of a long
  // posting do not. See src/llm/promptProjection.ts.
  const payload = JSON.stringify(
    {
      job: projectJobForPrompt(job, { requirements: jdTerms, excerptChars: PROMPT.jobExcerptChars }),
      sourceResume: projectResumeForPrompt(source),
    },
    null,
    1,
  )

  if (!corrections.length) return payload

  return [
    payload,
    '',
    'CORRECTIONS REQUIRED — your previous answer broke a rule. Fix exactly these, keep everything else, and return the same JSON shape:',
    ...corrections.map((line, index) => `${index + 1}. ${line}`),
  ].join('\n')
}

// --- Auditing a parsed response ----------------------------------------------

type AuditedResponse = {
  proposal: ProposedChanges
  blockers: { location: string; instruction: string; issue: UnresolvedIssue }[]
}

function describeAdditions(finding: EvidenceFinding): string {
  const bits: string[] = []
  if (finding.addedNumbers.length) bits.push(`numbers ${finding.addedNumbers.join(', ')}`)
  if (finding.addedTerms.length) bits.push(`terms ${finding.addedTerms.join(', ')}`)
  if (finding.repeatedTerms.length) bits.push(`over-repeated ${finding.repeatedTerms.join(', ')}`)
  return bits.join('; ')
}

export function auditTailoringResponse(
  response: ModelTailoringResponse,
  source: ResumeData,
  job: NormalizedJob,
  jdTerms: string[],
): AuditedResponse {
  const blockers: AuditedResponse['blockers'] = []
  const allBullets = source.experience
    .flatMap((role) => role.bullets.map(sourceBulletText))
    .filter(Boolean)
  const sourceTitles = source.experience.map((role) => role.title)
  const summarySources = [
    source.summary ?? '',
    ...allBullets,
    ...source.skills.flatMap((group) => group.items.map((item) => item.name)),
  ].filter((text) => text.trim())

  const summaryFinding = auditSummary(response.summary.trim(), {
    jobTitle: job.title,
    sourceTitles,
    sources: summarySources,
    jdTerms,
  })
  if (summaryFinding.status === 'blocked') {
    blockers.push({
      location: 'summary',
      instruction: `The summary adds ${describeAdditions(summaryFinding)} that the résumé does not support. Rewrite it using only facts already present.`,
      issue: { location: 'summary', code: summaryFinding.reasons[0], detail: describeAdditions(summaryFinding) },
    })
  }

  const titles: ProposedChanges['titles'] = []
  const bullets: ProposedChanges['bullets'] = []
  for (const role of response.experience) {
    const sourceRole = source.experience[role.sourceIndex]
    const label = [sourceRole.title, sourceRole.company].filter(Boolean).join(' · ')

    const titleFinding = auditRoleTitle(sourceRole.title, role.title.trim())
    titles.push({ roleIndex: role.sourceIndex, after: role.title.trim(), finding: titleFinding })
    if (titleFinding.status === 'blocked') {
      blockers.push({
        location: label,
        instruction: `The title "${role.title.trim()}" adds seniority the source title "${sourceRole.title}" does not have. Return the source title.`,
        issue: { location: label, code: 'title_inflation', detail: titleFinding.addedTerms.join(', ') },
      })
    }

    role.bullets.forEach((bullet, bulletIndex) => {
      const sources = bullet.sourceBulletIndexes.map((index) =>
        sourceBulletText(sourceRole.bullets[index]),
      )
      const finding = auditBullet({ after: bullet.text.trim(), sources, jdTerms })
      bullets.push({
        roleIndex: role.sourceIndex,
        bulletIndex,
        after: bullet.text.trim(),
        sourceBulletIndexes: bullet.sourceBulletIndexes,
        finding,
      })
      if (finding.status === 'blocked') {
        blockers.push({
          location: label,
          instruction: `The bullet "${bullet.text.trim()}" states ${describeAdditions(finding)} that its cited evidence does not contain. Rewrite it without that.`,
          issue: { location: label, code: finding.reasons[0], detail: describeAdditions(finding) },
        })
      }
    })
  }

  const projects: ProposedChanges['projects'] = []
  for (const project of response.projects) {
    const sourceProject = source.projects[project.sourceIndex]
    const before = sourceProject.summary ?? ''
    if (!before) continue
    const finding = auditBullet({ after: project.summary.trim(), sources: [before], jdTerms })
    projects.push({ projectIndex: project.sourceIndex, after: project.summary.trim(), finding })
    if (finding.status === 'blocked') {
      blockers.push({
        location: sourceProject.name,
        instruction: `The project summary "${project.summary.trim()}" adds ${describeAdditions(finding)}. Rewrite it from the original summary only.`,
        issue: { location: sourceProject.name, code: finding.reasons[0], detail: describeAdditions(finding) },
      })
    }
  }

  return {
    proposal: { summary: { after: response.summary.trim(), finding: summaryFinding }, titles, bullets, projects },
    blockers,
  }
}

// --- Pre-flight (v2.4.3) ------------------------------------------------------

export type TailoringRequest = {
  system: string
  user: string
  maxTokens: number
  cost: RequestCost
}

/**
 * Build the exact request that will be sent, and price it. The UI calls this
 * before offering the action, so a request that cannot possibly succeed is never
 * sent — and the person is offered the no-AI path instead of an error.
 */
export function estimateTailoringRequest(
  source: ResumeData,
  job: NormalizedJob,
  language: ResumeLanguage,
  jdTerms: string[] = [],
): TailoringRequest {
  const system = systemPrompt(language)
  const user = userPrompt(source, job, jdTerms)
  const maxTokens = estimateTailoringOutputTokens(resumeShape(source))
  return { system, user, maxTokens, cost: costOf({ system, user, maxTokens }) }
}

/** The honest refusal for a request that is over the limit on its own. */
export function tooLargeError(cost: RequestCost, limit: number): AppError {
  return new AppError({
    category: 'validation',
    message: 'This résumé and job description are too long for one AI request on your current plan.',
    dataSafe: true,
    available:
      `The request needs about ${cost.billedTokens.toLocaleString()} tokens and your plan allows ` +
      `${limit.toLocaleString()} at once, so waiting will not help. ` +
      'Use "Tailor without AI" to build this résumé now, or shorten the job description.',
    action: { label: 'Continue without AI', kind: 'none' },
    technical: `estimated ${cost.billedTokens} billed tokens (input ${cost.inputTokens} + reserved ${cost.reservedTokens}) vs limit ${limit}`,
  })
}

/** Build cosmetic review notes from accepted, audited changes — never from AI. */
export function deriveTailoringChangeSummary(
  changes: ChangeRecord[],
  language: ResumeLanguage,
): string[] {
  const accepted = changes.filter(
    (change) =>
      change.decision === 'accepted' &&
      change.target.kind !== 'bullet-removed' &&
      change.before.trim() !== (change.edited ?? change.after).trim(),
  )
  const summaryChanged = accepted.some((change) => change.target.kind === 'summary')
  const experienceChanges = accepted.filter(
    (change) => change.target.kind === 'role-title' || change.target.kind === 'bullet',
  ).length
  const projectChanges = accepted.filter(
    (change) => change.target.kind === 'project-summary',
  ).length

  if (language === 'de') {
    return [
      ...(summaryChanged ? ['Kurzprofil auf die Stelle ausgerichtet.'] : []),
      ...(experienceChanges
        ? [`${experienceChanges} Formulierung${experienceChanges === 1 ? '' : 'en'} aus belegter Erfahrung angepasst.`]
        : []),
      ...(projectChanges
        ? [`${projectChanges} Projektbeschreibung${projectChanges === 1 ? '' : 'en'} aus dem Ausgangstext angepasst.`]
        : []),
    ]
  }

  return [
    ...(summaryChanged ? ['Professional summary aligned to the role.'] : []),
    ...(experienceChanges
      ? [`${experienceChanges} experience statement${experienceChanges === 1 ? '' : 's'} reframed from source evidence.`]
      : []),
    ...(projectChanges
      ? [`${projectChanges} project summar${projectChanges === 1 ? 'y' : 'ies'} reframed from source text.`]
      : []),
  ]
}

// --- The public entry point ---------------------------------------------------

export async function tailorResumeWithAi(
  rawSource: ResumeData,
  job: NormalizedJob,
  apiKey: string,
  language: ResumeLanguage,
  options: { jdTerms?: string[]; signal?: AbortSignal } = {},
): Promise<AiTailoredResume> {
  const source = normalizeResume(rawSource)
  const extraJdTerms = options.jdTerms ?? []
  const deterministic = tailorResume(source, { ...job, language }, undefined, extraJdTerms)
  // The vocabulary the run mirrors: dictionary terms plus extractor terms.
  const jdTerms = [...new Set([...deterministic.coverage.covered, ...deterministic.coverage.missing])]

  // v2.4.3: price the request and refuse honestly if it cannot possibly succeed.
  // This is a backstop — the UI checks first so it can offer the no-AI path
  // instead of showing an error at all.
  const priced = estimateTailoringRequest(source, job, language, jdTerms)
  const { tpm } = await loadTpmLimit()
  const affordable = canAfford(priced.cost, tpm)
  if (!affordable.ok) throw tooLargeError(priced.cost, affordable.limit)

  let corrections: string[] = []
  let audited: AuditedResponse | null = null
  let parsed: ModelTailoringResponse | null = null
  let attempts = 0

  while (attempts < GENERATION.maxTailoringAttempts) {
    attempts += 1
    const raw = await chatComplete({
      apiKey,
      system: priced.system,
      user: userPrompt(source, job, jdTerms, corrections),
      jsonSchema: TAILORING_OUTPUT,
      temperature: 0,
      maxTokens: priced.maxTokens,
      signal: options.signal,
    })
    let candidate: ModelTailoringResponse
    try {
      candidate = normalizeTailoringResponse(
        extractJson<unknown>(raw),
        source,
        deterministic.data.summary,
      )
      validateTailoringResponse(candidate, source)
    } catch (error) {
      // Invalid/truncated JSON burns the same single retry, then surfaces
      // honestly. Structurally partial valid JSON is repaired locally above.
      if (attempts >= GENERATION.maxTailoringAttempts) throw error
      corrections = [error instanceof Error ? error.message : String(error)]
      continue
    }

    parsed = candidate
    audited = auditTailoringResponse(candidate, source, job, jdTerms)
    if (!audited.blockers.length) break
    if (attempts >= GENERATION.maxTailoringAttempts) break
    corrections = audited.blockers.map((blocker) => blocker.instruction)
  }

  if (!parsed || !audited) throw new Error('Tailoring produced no usable response.')

  const changes = proposeChanges(source, audited.proposal, jdTerms)
  const baseline: ResumeData = {
    ...deterministic.data,
    contact: source.contact,
    summary: source.summary,
    education: source.education,
    languages: source.languages,
    projects: source.projects.map((project) => ({ ...project })),
    certifications: source.certifications,
  }

  return {
    language,
    coverage: deterministic.coverage,
    jdTerms,
    baseline,
    source,
    changes,
    changeSummary: deriveTailoringChangeSummary(changes, language),
    attempts,
    unresolved: audited.blockers.map((blocker) => blocker.issue),
    data: applyChanges(baseline, source, changes),
  }
}

/** Re-apply decisions without calling the model again. */
export function withDecisions(result: AiTailoredResume, changes: ChangeRecord[]): AiTailoredResume {
  return { ...result, changes, data: applyChanges(result.baseline, result.source, changes) }
}
