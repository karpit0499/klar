import { stableHash } from '../lib/hash'
import type { EngineSettings } from '../llm/provider'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import type { NormalizedJob } from '../types'

export type GenerationKind = 'resume' | 'letter' | 'message'

/**
 * Content-addressed cache key. No résumé or posting text is stored in the key:
 * stableHash is one-way and the packet already owns the generated output.
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
    version: 'v2.5.5',
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