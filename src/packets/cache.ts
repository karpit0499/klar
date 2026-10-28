import { stableHash } from '../lib/hash'
import type { LetterTone, RecruiterMessageContext } from '../llm/coverLetter'
import type { EngineSettings } from '../llm/provider'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import type { MatchResult, NormalizedJob } from '../types'

export type GenerationKind = 'resume' | 'letter' | 'message'

export const GENERATION_CACHE_CONTRACT = 'klar-generation-cache-v2.6.0'

/**
 * Content-addressed cache key. No resume or posting text is stored in the key:
 * stableHash provides a deterministic fingerprint so raw text does not appear
 * in the key. It is non-cryptographic and is not a privacy or security boundary.
 */
export function generationCacheKey(input: {
  kind: GenerationKind
  source: ResumeData
  job: NormalizedJob
  language: ResumeLanguage
  engine: EngineSettings
  jdTerms?: readonly string[]
  variant?: string
  /** Any extra prompt input, projected by the caller to non-secret data. */
  context?: unknown
}): string {
  return stableHash(JSON.stringify({
    version: GENERATION_CACHE_CONTRACT,
    kind: input.kind,
    source: input.source,
    jobId: input.job.id,
    jobText: `${input.job.title}\0${input.job.company}\0${input.job.description}`,
    language: input.language,
    model: input.engine.model,
    baseUrl: input.engine.baseUrl,
    terms: input.jdTerms ?? [],
    variant: input.variant ?? '',
    context: input.context ?? null,
  }))
}

// Artifact keys. Each one is built in exactly one place, so the packet's
// "outputs are current" check fingerprints exactly what generation used.

export type ArtifactCacheKeyInput = {
  resume: ResumeData
  job: NormalizedJob
  language: ResumeLanguage
  engine: EngineSettings
  jdTerms?: readonly string[]
}

export function resumeCacheKey(input: ArtifactCacheKeyInput): string {
  return generationCacheKey({
    kind: 'resume',
    source: input.resume,
    job: input.job,
    language: input.language,
    engine: input.engine,
    jdTerms: input.jdTerms,
  })
}

/** The match fields a cover-letter prompt receives as relevance context. */
function letterMatchContext(match?: MatchResult): unknown {
  return match
    ? {
        matchedSkills: match.matchedSkills,
        missingSkills: match.missingSkills,
        rationale: match.rationale,
      }
    : null
}

export function letterCacheKey(
  input: ArtifactCacheKeyInput & { tone?: LetterTone; match?: MatchResult },
): string {
  return generationCacheKey({
    kind: 'letter',
    source: input.resume,
    job: input.job,
    language: input.language,
    engine: input.engine,
    jdTerms: input.jdTerms,
    variant: input.tone,
    context: letterMatchContext(input.match),
  })
}

/** The sign-off name is not a key input; every other message input is. */
export function recruiterMessageCacheKey(
  input: ArtifactCacheKeyInput & { context: RecruiterMessageContext },
): string {
  return generationCacheKey({
    kind: 'message',
    source: input.resume,
    job: input.job,
    language: input.language,
    engine: input.engine,
    jdTerms: input.jdTerms,
    variant: input.context.style,
    context: {
      applicationState: input.context.applicationState,
      channel: input.context.channel,
      recruiterName: input.context.recruiterName ?? null,
      discoveryContext: input.context.discoveryContext ?? null,
      referralName: input.context.referralName ?? null,
    },
  })
}
