import type { SearchDiagnostics, ZeroResultReason } from '../search/diagnostics'
import { ErrorNotice } from './ErrorNotice'
import { Button } from './atoms'
import { useLocale } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'

export function SearchDiagnosticsPanel({
  diagnostics,
  onRefresh,
  refreshDisabled = false,
}: {
  diagnostics: SearchDiagnostics
  onRefresh?: () => void
  refreshDisabled?: boolean
}) {
  const { locale, t } = useLocale()
  const de = locale === 'de'
  return (
    <details className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-sm">
      <summary className="min-h-tap cursor-pointer font-semibold leading-[44px] text-ink">
        {t('search.diagnosticsSummary', { count: diagnostics.finalCount })}
      </summary>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <Diagnostic label={t('search.sourcesRequested')} value={diagnostics.sourcesRequested.join(', ') || '—'} />
        <Diagnostic label={t('search.rawResults')} value={diagnostics.rawCount} />
        <Diagnostic label={t('search.duplicatesRemoved')} value={diagnostics.duplicatesRemoved} />
        <Diagnostic label={t('search.employmentRemoved')} value={diagnostics.filters.removed.employment} />
        <Diagnostic label={t('search.companyRemoved')} value={diagnostics.filters.removed.hideList} />
        <Diagnostic label={t('search.ageRemoved')} value={diagnostics.filters.removed.recency} />
        <Diagnostic label={t('search.distanceRemoved')} value={diagnostics.filters.removed.distance} />
        <Diagnostic label={t('search.couldNotDistance')} value={diagnostics.filters.unlocatableCount} />
        <Diagnostic label={t('search.relevanceRemoved')} value={diagnostics.relevanceRemoved} />
        <Diagnostic label={t('search.roleRemoved')} value={diagnostics.relevanceRemovedBy.role} />
        <Diagnostic label={t('search.marketRemoved')} value={diagnostics.relevanceRemovedBy.market} />
        <Diagnostic label={t('search.seniorityRemoved')} value={diagnostics.relevanceRemovedBy.seniority} />
        <Diagnostic label={t('search.hardRemoved')} value={diagnostics.hardFilterRemoved} />
        <Diagnostic label={t('search.candidatesSelected')} value={diagnostics.candidateCount} />
        <Diagnostic label={t('search.notPrioritized')} value={diagnostics.notPrioritizedCount} />
        <Diagnostic label={t('search.aiCompleted')} value={diagnostics.aiCompletedCount} />
        <Diagnostic label={t('search.localFallback')} value={diagnostics.localFallbackCount} />
        <Diagnostic label={t('search.aiBatchFailures')} value={diagnostics.aiBatchFailureCount} />
        <Diagnostic
          label={t('search.aiFailureCategories')}
          value={diagnostics.aiFailureCategories.join(', ') || '—'}
        />
        <Diagnostic label={t('search.finalCount')} value={diagnostics.finalCount} />
      </dl>
      {diagnostics.filters.distanceMessage && (
        <p className="mt-3 rounded-md border border-border bg-surface p-3 leading-relaxed text-ink">
          {diagnostics.filters.distanceMessage}
        </p>
      )}
      <div className="mt-3 space-y-2">
        {diagnostics.sources.map((source) => (
          <div key={source.source} className="rounded-md border border-border bg-surface p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">
                  {source.source}: {source.ok ? t('search.sourceSuccess', { count: source.count }) : t('search.failed')}
                </p>
                <p className="mt-1 text-xs text-faint">
                  {de ? 'Abruf' : 'Fetched'}: {source.fetchedAt ? formatTime(source.fetchedAt, locale) : '—'}
                  {' · '}
                  {de ? 'Letzter Erfolg' : 'Last success'}: {source.lastSuccessfulRefresh
                    ? formatTime(source.lastSuccessfulRefresh, locale)
                    : '—'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  sessionStorage.setItem('klar-source-report.v26', source.source)
                  window.dispatchEvent(new CustomEvent('klar:report-source'))
                }}
              >
                {de ? 'Quelle melden' : 'Report source'}
              </Button>
            </div>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2">
              <Diagnostic
                label={de ? 'Extraktionssicherheit' : 'Extraction confidence'}
                value={source.extractionConfidence ?? 'unknown'}
              />
              <Diagnostic
                label={de ? 'Duplikatfamilien' : 'Duplicate families'}
                value={source.duplicateFamilies ?? 0}
              />
            </dl>
            {source.sourceUrl && (
              <a
                className="mt-2 inline-block break-all text-xs text-accent underline"
                href={source.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {source.sourceUrl}
              </a>
            )}
            {source.note && <p className="mt-1 wrap-anywhere text-muted">{source.note}</p>}
            {source.error && <div className="mt-2"><ErrorNotice error={source.error} /></div>}
          </div>
        ))}
      </div>
      {onRefresh && (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshDisabled}>
            {de ? 'Quellen jetzt aktualisieren' : 'Refresh sources now'}
          </Button>
        </div>
      )}
      {diagnostics.zeroResultNextStep && (
        <p className="mt-3 rounded-md border border-accent/40 bg-accent-tint p-3 font-medium text-ink">
          {t('search.next', {
            action: diagnostics.zeroResultReason
              ? t(zeroResultTranslation(diagnostics.zeroResultReason))
              : diagnostics.zeroResultNextStep,
          })}
        </p>
      )}
    </details>
  )
}

function formatTime(value: string, locale: 'en' | 'de'): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function zeroResultTranslation(reason: ZeroResultReason): TranslationKey {
  const keys: Record<ZeroResultReason, TranslationKey> = {
    all_sources_failed: 'search.zero.allSourcesFailed',
    hide_list: 'search.zero.hideList',
    employment: 'search.zero.employment',
    recency: 'search.zero.recency',
    distance: 'search.zero.distance',
    relevance: 'search.zero.relevance',
    hard_filters: 'search.zero.hardFilters',
    no_raw_results: 'search.zero.noRawResults',
    unscored: 'search.zero.unscored',
    broaden: 'search.zero.broaden',
  }
  return keys[reason]
}

function Diagnostic({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 border-b border-border py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="shrink-0 font-medium tabular-nums text-ink">{value}</dd>
    </div>
  )
}