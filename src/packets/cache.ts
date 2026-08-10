import { stableHash } from '../lib/hash'
import type { EngineSettings } from '../llm/provider'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import type { NormalizedJob } from '../types'

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
