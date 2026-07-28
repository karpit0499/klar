import type { LocalFilterDiagnostics } from '../match/localFilters'
import type { GatherResult } from '../sources'

export type SearchDiagnostics = {
  sourcesRequested: GatherResult['sourcesRequested']
  sources: GatherResult['status']
  rawCount: number
  duplicatesRemoved: number
  filters: LocalFilterDiagnostics
  relevanceRemoved: number
  relevanceRemovedBy: { role: number; market: number; seniority: number }
  hardFilterRemoved: number
  unscoredCount: number
  candidateCount: number
  notPrioritizedCount: number
  aiCompletedCount: number
  localFallbackCount: number
  aiBatchFailureCount: number
  aiFailureCategories: string[]
  finalCount: number
  zeroResultReason?: ZeroResultReason
  zeroResultNextStep?: string
}

export type ZeroResultReason =
  | 'all_sources_failed'
  | 'hide_list'
  | 'employment'
  | 'recency'
  | 'distance'
  | 'relevance'
  | 'hard_filters'
  | 'no_raw_results'
  | 'unscored'
  | 'broaden'

export type ResultDisplayState<T> = {
  shown: T[]
  hasShown: boolean
  hasAny: boolean
}

/**
 * Keep the main grid/export set separate from explicitly hard-filtered rows.
 * Hidden rows still count as inspectable search state, but an empty main set
 * must stay empty rather than falling back to every pre-filtered job.
 */
export function buildResultDisplayState<T>(
  rankedShown: readonly T[],
  hiddenCount: number,
): ResultDisplayState<T> {
  const shown = [...rankedShown]
  return {
    shown,
    hasShown: shown.length > 0,
    hasAny: shown.length + Math.max(0, hiddenCount) > 0,
  }
}

export function buildSearchDiagnostics(
  gathered: GatherResult,
  filters: LocalFilterDiagnostics,
  update: {
    relevanceRemoved?: number
    relevanceRemovedBy?: { role: number; market: number; seniority: number }
    hardFilterRemoved?: number
    unscoredCount?: number
    candidateCount?: number
    notPrioritizedCount?: number
    aiCompletedCount?: number
    localFallbackCount?: number
    aiBatchFailureCount?: number
    aiFailureCategories?: string[]
    finalCount?: number
  } = {},
): SearchDiagnostics {
  const diagnostics: SearchDiagnostics = {
    sourcesRequested: gathered.sourcesRequested,
    sources: gathered.status,
    rawCount: gathered.rawCount,
    duplicatesRemoved: gathered.duplicatesRemoved,
    filters,
    relevanceRemoved: update.relevanceRemoved ?? 0,
    relevanceRemovedBy: update.relevanceRemovedBy ?? { role: 0, market: 0, seniority: 0 },
    hardFilterRemoved: update.hardFilterRemoved ?? 0,
    unscoredCount: update.unscoredCount ?? 0,
    candidateCount: update.candidateCount ?? 0,
    notPrioritizedCount: update.notPrioritizedCount ?? 0,
    aiCompletedCount: update.aiCompletedCount ?? 0,
    localFallbackCount: update.localFallbackCount ?? 0,
    aiBatchFailureCount: update.aiBatchFailureCount ?? 0,
    aiFailureCategories: update.aiFailureCategories ?? [],
    finalCount: update.finalCount ?? filters.finalCount,
  }
  if (diagnostics.finalCount === 0) {
    diagnostics.zeroResultReason = zeroResultReason(diagnostics)
    diagnostics.zeroResultNextStep = zeroResultNextStep(diagnostics.zeroResultReason)
  }
  return diagnostics
}

export function zeroResultReason(diagnostics: SearchDiagnostics): ZeroResultReason {
  const failed = diagnostics.sources.filter((source) => !source.ok)
  if (failed.length === diagnostics.sources.length && failed.length > 0) {
    return 'all_sources_failed'
  }
  if (diagnostics.filters.removedAllBy === 'hideList') return 'hide_list'
  if (diagnostics.filters.removedAllBy === 'employment') return 'employment'
  if (diagnostics.filters.removedAllBy === 'recency') return 'recency'
  if (diagnostics.filters.removedAllBy === 'distance') return 'distance'
  if (
    diagnostics.relevanceRemoved > 0
    && diagnostics.filters.finalCount - diagnostics.relevanceRemoved <= 0
  ) return 'relevance'
  if (diagnostics.hardFilterRemoved > 0) return 'hard_filters'
  if (diagnostics.rawCount === 0) return 'no_raw_results'
  if (diagnostics.unscoredCount > 0) return 'unscored'
  return 'broaden'
}

export function zeroResultNextStep(reason: ZeroResultReason): string {
  const messages: Record<ZeroResultReason, string> = {
    all_sources_failed: 'All requested sources failed. Open the source details, fix credentials or connectivity, then retry.',
    hide_list: 'The company hide list removed every result. Remove or narrow a hide term.',
    employment: 'The employment-type filter removed every result. Select more employment types.',
    recency: 'The age filter removed every result. Increase the maximum age or turn it off.',
    distance: 'The distance filter removed every result. Increase the radius or search a different city.',
    relevance: 'No posting matched both the requested role and its job market. Review the target title or field.',
    hard_filters: 'German-level or visa filters hid all scored roles. Review the hidden-results section or relax a filter.',
    no_raw_results: 'The sources returned no postings. Broaden the title or location, then try again.',
    unscored: 'Matching did not finish. Retry the search to score the remaining candidates.',
    broaden: 'Broaden the title, radius, or filters and run the search again.',
  }
  return messages[reason]
}