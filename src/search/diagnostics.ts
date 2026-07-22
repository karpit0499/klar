import type { LocalFilterDiagnostics } from '../match/localFilters'
import type { GatherResult } from '../sources'

export type SearchDiagnostics = {
  sourcesRequested: GatherResult['sourcesRequested']
  sources: GatherResult['status']
  rawCount: number
  duplicatesRemoved: number
  filters: LocalFilterDiagnostics
  hardFilterRemoved: number
  unscoredCount: number
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
  | 'hard_filters'
  | 'no_raw_results'
  | 'unscored'
  | 'broaden'

export function buildSearchDiagnostics(
  gathered: GatherResult,
  filters: LocalFilterDiagnostics,
  update: { hardFilterRemoved?: number; unscoredCount?: number; finalCount?: number } = {},
): SearchDiagnostics {
  const diagnostics: SearchDiagnostics = {
    sourcesRequested: gathered.sourcesRequested,
    sources: gathered.status,
    rawCount: gathered.rawCount,
    duplicatesRemoved: gathered.duplicatesRemoved,
    filters,
    hardFilterRemoved: update.hardFilterRemoved ?? 0,
    unscoredCount: update.unscoredCount ?? 0,
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
    hard_filters: 'German-level or visa filters hid all scored roles. Review the hidden-results section or relax a filter.',
    no_raw_results: 'The sources returned no postings. Broaden the title or location, then try again.',
    unscored: 'Matching did not finish. Retry the search to score the remaining candidates.',
    broaden: 'Broaden the title, radius, or filters and run the search again.',
  }
  return messages[reason]
}