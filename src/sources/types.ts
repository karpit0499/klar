// ============================================================================
// The adapter contract. Every source is a function with this shape.
// (The plan's `JobSource` interface is the same idea expressed functionally —
//  easier to test and tree-shake than a class hierarchy.)
// ============================================================================
import type { NormalizedJob, SearchQuery, SourceId } from '../types'

export type AdapterResult = {
  jobs: NormalizedJob[]
  /** Optional human note for the per-source status banner (e.g. "quota reached"). */
  note?: string
}

export type Adapter = (
  q: SearchQuery,
  opts?: { signal?: AbortSignal; page?: number },
) => Promise<AdapterResult>

/** One line in the per-source status banner shown to the user. */
export type SourceStatus = {
  source: SourceId | 'ats'
  ok: boolean
  count: number
  note?: string
}