// ============================================================================
// The progressive Flexible Work search screen (roadmap §2.4). It replaces the
// blocking spinner with stable result cards, a determinate progress bar, a live
// "N jobs ready · checking M more sources · up to Xs remaining" line, a Stop
// action, frozen pagination, a source-status expander, and a terminal complete /
// partial / limited state — never "No jobs found" while sources are unfinished.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, Badge, TextInput } from './atoms'
import { OpportunityCard } from './OpportunityCard'
import { FlexiblePrepare } from './FlexiblePrepare'
import { useLocale } from '../i18n/LocaleProvider'
import type { FlexibleWorkPreferences, NormalizedJob } from '../types'
import { openPacket, updatePacket } from '../packets/store'
import { useFlexibleSearch } from '../flexible/useFlexibleSearch'
import { createFlexibleSearch, recordFlexibleRun, getFlexibleSearch, splitFlexibleFresh } from '../flexible/savedFlexibleSearches'
import type { SearchSessionSnapshot, SourceStatus } from '../flexible/searchSession'
import { loadAllHealth } from '../flexible/resilience'
import { FLEXIBLE_REGISTRY_DE } from '../flexible/connectors/registry.de'
import type { ConnectorConfig, ConnectorType } from '../flexible/connectors/types'

export function FlexibleSearch({
  active,
  preferences,
  savedSearchId,
  onEdit,
  switcher,
  onSavePreferences,
}: {
  /** Hidden results stay mounted, while any preparation overlay is suspended. */
  active: boolean
  preferences: FlexibleWorkPreferences
  savedSearchId?: string
  onEdit?: () => void
  /** v2.4.1: the career/flexible segmented control, rendered above the results. */
  switcher?: React.ReactNode
  /**
   * v2.5: persists the optional contact details the prepare drawer collects.
   * Omit it and the prepare action is hidden — Klar never shows a surface it
   * cannot honestly save.
   */
  onSavePreferences?: (value: FlexibleWorkPreferences) => void | Promise<void>
}) {
  const { locale, t } = useLocale()
  const de = locale === 'de'
  const { snapshot, running, usingFixtures, page, setPage, start, stop } = useFlexibleSearch(preferences, { auto: true })
  // v2.5: which opportunity the résumé-free prepare drawer is open for.
  const [preparing, setPreparing] = useState<NormalizedJob | null>(null)
  const [preparedMessage, setPreparedMessage] = useState<string | undefined>(undefined)

  async function openPrepare(job: NormalizedJob) {
    const packet = await openPacket('flexible', job)
    setPreparedMessage(packet.flexible?.message)
    setPreparing(job)
  }
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const recordedRef = useRef<string | null>(null)

  // On completion of a saved search, compute the "new since last check" set.
  useEffect(() => {
    if (!snapshot || running || !savedSearchId) return
    if (recordedRef.current === savedSearchId) return
    recordedRef.current = savedSearchId
    void (async () => {
      const row = await getFlexibleSearch(savedSearchId)
      const published = snapshot.pages.flat()
      if (row) setFreshIds(new Set(splitFlexibleFresh(published, row).fresh.map((j) => j.id)))
      await recordFlexibleRun(savedSearchId, published)
    })()
  }, [snapshot, running, savedSearchId])

  const pages = snapshot?.pages ?? []
  const current = pages[page] ?? []
  const totalPages = snapshot?.totalPages ?? 0
  const remainingSec = snapshot
    ? Math.max(0, Math.ceil((snapshot.deadlineAt - snapshot.startedAt - snapshot.elapsedMs) / 1000))
    : 0
  const progress = snapshot ? Math.min(1, snapshot.elapsedMs / Math.max(1, snapshot.deadlineAt - snapshot.startedAt)) : 0
  const laterAvailable = totalPages > page + 1

  return (
    <div className="page-container">
      {switcher && <div className="mb-4">{switcher}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{t('flexible.search.title')}</h1>
        {onEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            {t('flexible.home.edit')}
          </Button>
        )}
      </div>

      {usingFixtures && (
        <p className="mt-2 rounded-md border border-border bg-surface-2 p-2 text-sm text-muted">
          {t('flexible.search.fixturesNote')}
        </p>
      )}

      {/* Progress / terminal banner — a reserved region so results never jump. */}
      <div className="mt-4" aria-live="polite">
        {running ? (
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-base text-ink">
                {snapshot && snapshot.publishedCount > 0
                  ? remainingSec > 0
                    ? t('flexible.search.progress', {
                        ready: snapshot.publishedCount,
                        sources: snapshot.activeCount,
                        seconds: remainingSec,
                      })
                    : t('flexible.search.progressFinishing', { ready: snapshot.publishedCount })
                  : t('flexible.search.searching')}
              </p>
              <Button variant="ghost" size="sm" onClick={stop}>
                {t('flexible.search.stop')}
              </Button>
            </div>
            <div
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label={t('flexible.search.searching')}
            >
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </Card>
        ) : (
          snapshot && <TerminalBanner snapshot={snapshot} onRetry={start} />
        )}
      </div>

      {snapshot && snapshot.totalSources > 0 && <SourceStatusPanel snapshot={snapshot} onRefresh={start} />}

      {/* Results */}
      {current.length > 0 ? (
        <>
          <ul className="mt-4 grid gap-3" aria-label={t('flexible.search.resultsAria')}>
            {current.map((job) => (
              <li key={job.id} className="min-w-0">
                <OpportunityCard
                  job={job}
                  isNew={freshIds.has(job.id)}
                  onPrepare={onSavePreferences ? (item) => void openPrepare(item) : undefined}
                />
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t('flexible.search.resultsAria')}>
              <Button variant="ghost" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
                {t('flexible.search.prev')}
              </Button>
              <span className="text-sm text-muted">
                {t('flexible.search.pageLabel', { page: page + 1, total: totalPages })}
                {laterAvailable && (
                  <span className="ml-2 inline-flex">
                    <Badge tone="accent">
                      {t('flexible.search.moreReady', { count: snapshot!.publishedCount - (page + 1) * snapshot!.pageSize })}
                    </Badge>
                  </span>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>
                {t('flexible.search.next')}
              </Button>
            </nav>
          )}

          {!savedSearchId && <SaveSearch preferences={preferences} />}
        </>
      ) : (
        !running && snapshot && (
          <p className="mt-4 text-base text-muted">{de ? 'Keine Ergebnisse.' : 'No results.'} {t('flexible.search.emptyHint')}</p>
        )
      )}

      {active && preparing && onSavePreferences && (
        <FlexiblePrepare
          job={preparing}
          preferences={preferences}
          initialMessage={preparedMessage}
          onSavePreferences={onSavePreferences}
          onSaveDraft={(draft) =>
            void updatePacket(`flexible:${preparing.id}`, (packet) => {
              packet.flexible = { ...packet.flexible, message: draft.message, availability: draft.availability }
            })
          }
          onClose={() => setPreparing(null)}
        />
      )}
    </div>
  )
}

function TerminalBanner({ snapshot, onRetry }: { snapshot: SearchSessionSnapshot; onRetry: () => void }) {
  const { t } = useLocale()
  const failed = snapshot.sources.filter((s) => s.status === 'error' || s.status === 'timeout' || s.status === 'skipped').length
  const message =
    snapshot.phase === 'limited'
      ? t('flexible.search.limitedState')
      : snapshot.phase === 'partial'
        ? t('flexible.search.partialState', { jobs: snapshot.totalCount, failed })
        : t('flexible.search.completeState', { jobs: snapshot.totalCount, sources: snapshot.finishedCount })
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-ink">{message}</p>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {t('flexible.search.retry')}
        </Button>
      </div>
    </Card>
  )
}

function SourceStatusPanel({
  snapshot,
  onRefresh,
}: {
  snapshot: SearchSessionSnapshot
  onRefresh: () => void
}) {
  const { locale, t } = useLocale()
  const de = locale === 'de'
  const health = useLiveQuery(loadAllHealth, [], [])
  const healthById = new Map((health ?? []).map((row) => [row.connectorId, row]))
  // v2.4.2: say plainly how much the relevance gate removed, rather than
  // silently shrinking the result set.
  const hiddenTotal = Object.values(snapshot.filtered ?? {}).reduce((sum, n) => sum + n, 0)
  const duplicateFamilies = new Set(
    snapshot.pages.flat()
      .filter((job) => (job.also_on?.length ?? 0) > 0)
      .map((job) => job.duplicateFamily),
  ).size
  return (
    <details className="mt-3 rounded-md border border-border bg-surface">
      <summary className="min-h-tap cursor-pointer list-none px-4 py-2 text-sm font-medium text-ink">
        {t('flexible.search.sourcesHeading')} · {t('flexible.search.sourcesSummary', { done: snapshot.finishedCount, total: snapshot.totalSources })}
      </summary>
      {hiddenTotal > 0 && (
        <p className="border-t border-border px-4 py-2 text-sm text-muted">
          {t('flexible.search.hidden', { count: hiddenTotal })}
        </p>
      )}
      <p className="border-t border-border px-4 py-2 text-xs text-faint">
        {de ? 'Zusammengeführte Duplikatfamilien' : 'Merged duplicate families'}: {duplicateFamilies}
      </p>
      <ul className="border-t border-border px-4 py-2">
        {snapshot.sources.map((source) => {
          const config = CONFIG_BY_ID.get(source.connectorId)
          const row = healthById.get(source.connectorId)
          const sourceUrl = config ? sourceUrlFor(config) : undefined
          return (
            <li key={source.connectorId} className="border-b border-border py-3 text-sm last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{source.employerFamily}</span>
                  <p className="mt-1 text-xs text-faint">
                    {de ? 'Abruf' : 'Fetched'}: {source.fetchedAt ? formatHealthTime(source.fetchedAt, de) : '—'}
                    {' · '}
                    {de ? 'Letzter Erfolg' : 'Last success'}: {row?.lastSuccessAt
                      ? formatHealthTime(row.lastSuccessAt, de)
                      : '—'}
                    {' · '}
                    {de ? 'Extraktionssicherheit' : 'Extraction confidence'}: {confidenceForType(source.type)}
                  </p>
                  {sourceUrl && (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block max-w-full truncate text-xs text-accent underline"
                    >
                      {sourceUrl}
                    </a>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-2 text-muted">
                  {source.count > 0 && <span className="tabular-nums">{source.count}</span>}
                  <SourceBadge status={source.status} />
                </span>
              </div>
              <div className="mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    sessionStorage.setItem('klar-source-report.v26', source.connectorId)
                    window.dispatchEvent(new CustomEvent('klar:report-source'))
                  }}
                >
                  {de ? 'Quelle melden' : 'Report source'}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="border-t border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          {de ? 'Quellen jetzt aktualisieren' : 'Refresh sources now'}
        </Button>
      </div>
    </details>
  )
}

const CONFIG_BY_ID = new Map(FLEXIBLE_REGISTRY_DE.map((config) => [config.id, config]))

function sourceUrlFor(config: ConnectorConfig): string | undefined {
  if (config.fallback.kind === 'open_entry') return config.fallback.officialUrl
  if (config.fallback.kind === 'official_search') return config.fallback.url
  if (config.fallback.officialSearchUrl) return config.fallback.officialSearchUrl
  const host = config.allowedHosts[0]
  return host ? `https://${host}/` : undefined
}

function confidenceForType(type: ConnectorType): 'published' | 'structured' | 'unknown' {
  if (type === 'api' || type === 'feed' || type === 'open_entry') return 'published'
  if (type === 'portal' || type === 'sitemap') return 'structured'
  return 'unknown'
}

function formatHealthTime(value: string, de: boolean): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(de ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function SourceBadge({ status }: { status: SourceStatus }) {
  const { t } = useLocale()
  const map: Record<SourceStatus, { key: Parameters<typeof t>[0]; tone: 'neutral' | 'success' | 'danger' | 'outline' }> = {
    ok: { key: 'flexible.source.ok', tone: 'success' },
    fallback: { key: 'flexible.source.fallback', tone: 'outline' },
    error: { key: 'flexible.source.error', tone: 'danger' },
    timeout: { key: 'flexible.source.timeout', tone: 'danger' },
    skipped: { key: 'flexible.source.skipped', tone: 'outline' },
    pending: { key: 'flexible.source.pending', tone: 'neutral' },
    running: { key: 'flexible.source.running', tone: 'neutral' },
  }
  const entry = map[status]
  return <Badge tone={entry.tone}>{t(entry.key)}</Badge>
}

function SaveSearch({ preferences }: { preferences: FlexibleWorkPreferences }) {
  const { t, locale } = useLocale()
  const de = locale === 'de'
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(() => preferences.locations.map((l) => l.city).join(', ') || (de ? 'Flexible Suche' : 'Flexible search'))

  if (saved) {
    return <p className="mt-4 text-sm text-success">{t('flexible.search.saved')}</p>
  }
  if (!editing) {
    return (
      <div className="mt-4">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          {t('flexible.search.save')}
        </Button>
      </div>
    )
  }
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void createFlexibleSearch({ name, preferences }).then(() => setSaved(true))
      }}
    >
      <label className="flex-1">
        <span className="mb-1 block text-sm font-medium text-ink">{t('flexible.search.save')}</span>
        <TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </label>
      <Button type="submit" size="sm">
        {t('flexible.search.save')}
      </Button>
    </form>
  )
}