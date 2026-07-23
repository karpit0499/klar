// The core screen: gather live jobs → AI match → ranked, explainable, filterable
// results. Wires in aggregated gaps (1.1), correctable weights (1.3), semantic
// mode (1.4), German-market hard filters (2.1/2.2), and results export (3.1).
import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Spinner, Badge, Field, TextInput } from './atoms'
import { JobCard } from './JobCard'
import { JobDrawer } from './JobDrawer'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'
import { GapSummary } from './GapSummary'
import { WeightsPanel } from './WeightsPanel'
import { gatherJobs } from '../sources'
import { runMatching, type MatchProgress } from '../match'
import { addToTracker, useTracked } from '../tracker/store'
import { compositeScore, DEFAULT_WEIGHTS } from '../match/weights'
import { partitionByHardFilters } from '../match/germanMarket'
import { aggregateGaps } from '../match/gaps'
import { getActiveRegion, REGIONS } from '../regions'
import { loadAdzunaKey } from '../settings/adzunaKey'
import { jobsToRows, downloadCsv, downloadXlsx, printRowsAsPdf } from '../export/exporters'
import type {
  MatchResult, NormalizedJob, Preferences, Profile, Region, ScoreWeights, SearchQuery, SourceId,
} from '../types'
import type { ResumeData } from '../resume/types'
import type { SourceStatus } from '../sources/types'
import {
  applyLocalFiltersWithDiagnostics,
  validateHideTerms,
  type LocalFilterDiagnostics,
} from '../match/localFilters'
import { buildSearchDiagnostics, type SearchDiagnostics } from '../search/diagnostics'
import type { GatherResult } from '../sources'
import { SearchDiagnosticsPanel } from './SearchDiagnosticsPanel'
import { ErrorNotice } from './ErrorNotice'
import { toAppError, type AppErrorData } from '../errors/appError'
import { EMPLOYMENT_ORDER, type EmploymentCategory } from '../match/employment'
import { updatePreferenceWeights } from '../storage/careerData'
import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearch,
  recordRun,
  useSavedSearches,
} from '../search/savedSearches'

export function SearchStep({
  resume,
  profile,
  prefs,
  apiKey,
  requireGroq,
}: {
  resume: ResumeData
  profile: Profile
  prefs: Preferences
  apiKey?: string
  requireGroq: (action: string) => Promise<string | null>
}) {
  const [jobs, setJobs] = useState<NormalizedJob[]>([])
  const t = useT()
  const [matches, setMatches] = useState<Record<string, MatchResult>>({})
  const [status, setStatus] = useState<SourceStatus[]>([])
  const [phase, setPhase] = useState<'idle' | 'gathering' | 'matching' | 'done'>('idle')
  const [progress, setProgress] = useState<MatchProgress | null>(null)
  const tracked = useTracked()
  const [open, setOpen] = useState<NormalizedJob | null>(null)
  const [error, setError] = useState<AppErrorData | null>(null)
  const [region, setRegion] = useState<Region | undefined>(undefined)
  const [hideCompanies, setHideCompanies] = useState('')
  const [maxAgeDays, setMaxAgeDays] = useState('')
  const [diagnosticBase, setDiagnosticBase] = useState<{
    gathered: GatherResult
    filters: LocalFilterDiagnostics
  } | null>(null)
  const [savedName, setSavedName] = useState('')
  const [activeSavedSearchId, setActiveSavedSearchId] = useState('')
  const [newJobIds, setNewJobIds] = useState<Set<string>>(new Set())
  const savedSearches = useSavedSearches()

  // Feature 1.3 — user-correctable weights.
  const [weights, setWeights] = useState<ScoreWeights>(prefs.weights ?? DEFAULT_WEIGHTS)
  // Feature 2.1 / 2.2 — hard filters (default from preferences).
  const [hideGerman, setHideGerman] = useState(Boolean(prefs.hideGermanAboveLevel))
  const [hideNoVisa, setHideNoVisa] = useState(Boolean(prefs.hideNoVisaSponsorship))
  // Feature 1.4 — candidate-selection mode.
  const [mode, setMode] = useState<'keyword' | 'semantic'>('keyword')

  useEffect(() => {
    void getActiveRegion().then(setRegion)
  }, [])

  const query: SearchQuery = useMemo(
    () => ({
      what: prefs.targetTitles.length ? prefs.targetTitles : [''],
      where: prefs.locations[0],
      remote: prefs.remoteOnly,
    }),
    [prefs],
  )
  const activeSavedSearch = savedSearches.find((saved) => saved.id === activeSavedSearchId)
  const displayQuery = activeSavedSearch?.query ?? query

  async function saveCurrentSearch() {
    setError(null)
    try {
      const hideTerms = validateHideTerms(hideCompanies.split(',')).accepted
      const id = await createSavedSearch({
        name: savedName,
        query,
        region: region?.code,
        employment: (prefs.contractType ?? []).filter((value): value is EmploymentCategory =>
          EMPLOYMENT_ORDER.includes(value as EmploymentCategory),
        ),
        hideList: hideTerms,
        maxDistanceKm: query.where?.radius_km,
        maxAgeDays: maxAgeDays ? Number(maxAgeDays) : undefined,
      })
      setActiveSavedSearchId(id)
      setSavedName('')
      setNewJobIds(new Set())
    } catch (caught) {
      setError(toAppError(caught, {
        category: 'storage',
        message: 'Klar could not save this search.',
        dataSafe: true,
        available: 'The current results and workspace remain available.',
        action: { label: 'Try saving again', kind: 'retry' },
      }))
    }
  }

  async function removeSelectedSearch() {
    if (!activeSavedSearchId) return
    setError(null)
    try {
      await deleteSavedSearch(activeSavedSearchId)
      setActiveSavedSearchId('')
      setNewJobIds(new Set())
    } catch (caught) {
      setError(toAppError(caught, {
        category: 'storage',
        message: 'Klar could not delete this saved search.',
        dataSafe: true,
        available: 'Your current results and other saved searches remain available.',
        action: { label: 'Try again', kind: 'retry' },
      }))
    }
  }

  async function run() {
    setError(null)
    setProgress(null)
    setPhase('gathering')
    setMatches({})
    setNewJobIds(new Set())
    try {
      const adzunaKey = await loadAdzunaKey()
      const saved = activeSavedSearchId ? await getSavedSearch(activeSavedSearchId) : undefined
      const searchQuery = saved?.query ?? query
      const searchRegion = saved?.region ? (REGIONS[saved.region] ?? region) : region

      const gathered = await gatherJobs(searchQuery, {
        region: searchRegion,
        adzunaKey,
      })
      setStatus(gathered.status)

      const requestedHideTerms = saved?.hideList ?? hideCompanies.split(',')
      const hideValidation = validateHideTerms(requestedHideTerms)
      const resolvedOrigin = searchQuery.where && searchRegion
        ? searchRegion.resolveLocation(searchQuery.where.city)
        : undefined
      const origin = resolvedOrigin?.lat != null && resolvedOrigin.lng != null
        ? { lat: resolvedOrigin.lat, lng: resolvedOrigin.lng }
        : undefined
      const filtered = applyLocalFiltersWithDiagnostics(gathered.jobs, {
        employment: (saved?.employment ?? prefs.contractType ?? []).filter((value): value is EmploymentCategory =>
          EMPLOYMENT_ORDER.includes(value as EmploymentCategory),
        ),
        hideList: hideValidation.accepted,
        maxAgeDays: saved?.maxAgeDays ?? (maxAgeDays ? Number(maxAgeDays) : undefined),
        maxDistanceKm: saved?.maxDistanceKm ?? searchQuery.where?.radius_km,
        origin,
      })
      if (filtered.diagnostics.distanceRequested && !filtered.diagnostics.distanceEnforced) {
        filtered.diagnostics.distanceMessage = t('search.distanceUnenforced')
      }
      if (hideValidation.rejected.length) {
        filtered.diagnostics.distanceMessage = [
          filtered.diagnostics.distanceMessage,
          t('search.unsafeHideTerms', { terms: hideValidation.rejected.map((item) => item.term).join(', ') }),
        ].filter(Boolean).join(' ')
      }
      setJobs(filtered.jobs)
      setDiagnosticBase({ gathered, filters: filtered.diagnostics })
      if (saved) {
        const fresh = await recordRun(saved.id, filtered.jobs)
        setNewJobIds(new Set(fresh.map((job) => job.id)))
      }

      if (filtered.jobs.length === 0) {
        setPhase('done')
        return
      }

      setPhase('matching')
      const results = await runMatching(filtered.jobs, profile, prefs, apiKey, {
        onProgress: setProgress,
        prefilterMode: mode,
      })
      const map: Record<string, MatchResult> = {}
      for (const m of results) map[m.jobId] = m
      setMatches(map)
      setPhase('done')
    } catch (e) {
      setError(toAppError(e, {
        message: 'Klar could not complete this search.',
        dataSafe: true,
        available: 'Saved jobs and your workspace remain available.',
        action: { label: 'Review diagnostics and retry', kind: 'retry' },
      }))
      setPhase('idle')
    }
  }

  async function save(job: NormalizedJob) {
    await addToTracker(job, matches[job.id])
  }

  function updateWeights(nextWeights: ScoreWeights) {
    setWeights(nextWeights)
    // Persist the correction so Tracker uses the same composite formula and a
    // returning visit does not silently revert to a different score.
    void updatePreferenceWeights(nextWeights).catch((caught) => {
      setError(toAppError(caught, {
        category: 'storage',
        message: 'Klar could not save these score weights.',
        dataSafe: true,
        available: 'The current result list remains available with the selected weights.',
        action: { label: 'Try the adjustment again', kind: 'retry' },
      }))
    })
  }

  // Derived view: score with current weights, apply hard filters, sort, roll up gaps.
  const view = useMemo(() => {
    const scored = jobs.filter((j) => matches[j.id])
    const { shown, hidden } = partitionByHardFilters(scored, prefs, {
      hideGermanAboveLevel: hideGerman,
      hideNoVisaSponsorship: hideNoVisa,
    })
    const withScore = shown
      .map((job) => ({ job, match: matches[job.id]!, score: compositeScore(matches[job.id]!, weights) }))
      .sort((a, b) => b.score - a.score)
    const gap = aggregateGaps(withScore.map((x) => x.match), 20)
    return { withScore, hidden, gap }
  }, [jobs, matches, weights, hideGerman, hideNoVisa, prefs])

  const finished = phase === 'done'
  const hasMatches = finished && view.withScore.length + view.hidden.length > 0
  const shownJobs = finished ? view.withScore.map((x) => x.job) : jobs
  const savedIds = useMemo(() => new Set(tracked.map((row) => row.jobId)), [tracked])
  const partial = finished && progress?.phase === 'done' && progress.done < progress.total
  const diagnostics: SearchDiagnostics | null = useMemo(() => {
    if (!diagnosticBase) return null
    return buildSearchDiagnostics(diagnosticBase.gathered, diagnosticBase.filters, {
      hardFilterRemoved: finished ? view.hidden.length : 0,
      unscoredCount: finished ? Math.max(0, jobs.length - Object.keys(matches).length) : 0,
      finalCount: finished ? view.withScore.length : diagnosticBase.filters.finalCount,
    })
  }, [diagnosticBase, finished, jobs.length, matches, view.hidden.length, view.withScore.length])

  function exportResults(kind: 'csv' | 'xlsx' | 'pdf') {
    const rows = jobsToRows(shownJobs, matches)
    const stamp = new Date().toISOString().slice(0, 10)
    if (kind === 'csv') downloadCsv(`klar-jobs-${stamp}.csv`, rows)
    else if (kind === 'xlsx') void downloadXlsx(`klar-jobs-${stamp}.xlsx`, 'Jobs', rows)
    else printRowsAsPdf('Klar — job matches', rows)
  }

  return (
    <div className="page-container">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t('search.title')}</h2>
            <p className="text-sm text-muted">
              {t('search.searching', {
                roles: displayQuery.what.filter(Boolean).join(', ') || t('search.allRoles'),
              })}
              {displayQuery.where ? ` ${t('search.near', { city: displayQuery.where.city })}` : ''}
              {region ? ` · ${t(regionLabelKey(region.code))}` : ''}
            </p>
          </div>
          <Button onClick={run} disabled={phase === 'gathering' || phase === 'matching'}>
            {phase === 'gathering' ? (
              <Spinner label={t('search.gathering')} />
            ) : phase === 'matching' ? (
              <Spinner label={t('search.matching')} />
            ) : (
              t('search.run')
            )}
          </Button>
        </div>

        {/* Candidate-selection mode (feature 1.4). */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted">{t('search.prefilter')}</span>
          {(['keyword', 'semantic'] as const).map((m) => (
            <label key={m} className="flex items-center gap-1.5">
              <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
              <span>{m === 'keyword' ? t('search.mode.keyword') : t('search.mode.semantic')}</span>
            </label>
          ))}
          <span className="text-xs text-faint">{t('search.mode.hint')}</span>
        </div>

        {/* Hard filters (features 2.1 & 2.2). */}
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={hideGerman} onChange={(e) => setHideGerman(e.target.checked)} />
            {t('search.hideGerman')}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={hideNoVisa} onChange={(e) => setHideNoVisa(e.target.checked)} />
            {t('search.hideNoVisa')}
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t('search.hideCompanies')} hint={t('search.hideCompaniesHint')}>
            <TextInput value={hideCompanies} onChange={(event) => setHideCompanies(event.target.value)} placeholder={t('search.hideCompaniesPlaceholder')} />
          </Field>
          <Field label={t('search.maxAge')} hint={t('search.maxAgeHint')}>
            <TextInput type="number" min="1" inputMode="numeric" value={maxAgeDays} onChange={(event) => setMaxAgeDays(event.target.value)} placeholder="30" />
          </Field>
        </div>

        <section className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
          <h3 className="font-semibold text-ink">{t('search.savedTitle')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('search.savedHint')}</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Field label={t('search.chooseSaved')}>
              <select
                className="w-full min-h-tap rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
                value={activeSavedSearchId}
                onChange={(event) => {
                  setActiveSavedSearchId(event.target.value)
                  setNewJobIds(new Set())
                }}
              >
                <option value="">{t('search.noSaved')}</option>
                {savedSearches.map((saved) => <option key={saved.id} value={saved.id}>{saved.name}</option>)}
              </select>
            </Field>
            <Field label={t('search.savedName')}>
              <TextInput value={savedName} onChange={(event) => setSavedName(event.target.value)} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" disabled={!savedName.trim()} onClick={() => void saveCurrentSearch()}>
              {t('search.saveCurrent')}
            </Button>
            <Button variant="danger" size="sm" disabled={!activeSavedSearchId} onClick={() => void removeSelectedSearch()}>
              {t('search.deleteSaved')}
            </Button>
          </div>
          {newJobIds.size > 0 && (
            <p className="mt-3 text-sm font-medium text-success">{t('search.newJobs', { count: newJobIds.size })}</p>
          )}
        </section>

        {status.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {status.map((s) => (
              <Badge key={s.source} tone={s.ok ? 'success' : 'danger'}>
                {t(sourceLabelKey(s.source))}: {s.ok ? `${s.count}` : t('search.failed')}
                {s.note ? ` (${s.note})` : ''}
              </Badge>
            ))}
          </div>
        )}

        {phase === 'matching' && progress && (
          <p className="mt-2 text-sm text-muted">
            {progress.phase === 'score'
              ? t('search.scoring', { done: progress.done, total: progress.total })
              : `${progress.phase}…`}
          </p>
        )}
        {error && <div className="mt-3"><ErrorNotice error={error} /></div>}
        {partial && (
          <p className="mt-2 text-sm text-muted">
            {t('search.partialScores', { done: progress.done, total: progress.total })}
          </p>
        )}

        {/* Export the current results (feature 3.1). */}
        {hasMatches && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{t('search.export')}</span>
            <Button variant="ghost" size="sm" onClick={() => exportResults('csv')}>CSV</Button>
            <Button variant="ghost" size="sm" onClick={() => exportResults('xlsx')}>XLSX</Button>
            <Button variant="ghost" size="sm" onClick={() => exportResults('pdf')}>PDF</Button>
          </div>
        )}

        {diagnostics && <SearchDiagnosticsPanel diagnostics={diagnostics} />}
      </Card>

      {hasMatches && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <GapSummary data={view.gap} />
          <WeightsPanel weights={weights} onChange={updateWeights} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {(finished ? view.withScore : shownJobs.map((job) => ({ job, match: undefined, score: undefined }))).map(
          (row) => (
            <div key={row.job.id} className="min-w-0">
              {newJobIds.has(row.job.id) && <div className="mb-1"><Badge tone="success">{t('search.newBadge')}</Badge></div>}
              <JobCard
                job={row.job}
                match={row.match}
                score={row.score}
                saved={savedIds.has(row.job.id)}
                onOpen={() => setOpen(row.job)}
                onSave={() => void save(row.job)}
              />
            </div>
          ),
        )}
      </div>

      {/* Roles hidden by the hard filters, kept visible but segregated (2.1/2.2). */}
      {hasMatches && view.hidden.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-muted">
            {view.hidden.length === 1
              ? t('search.hiddenCountOne')
              : t('search.hiddenCount', { n: view.hidden.length })}
          </summary>
          <div className="mt-3 space-y-2">
            {view.hidden.map(({ item, reasons }) => (
              <div key={item.id} className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-ink">
                    {item.title} · {item.company}
                  </span>
                  <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0 text-accent underline">
                    {t('card.open')}
                  </a>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {reasons.map((r) => (
                    <Badge key={r} tone="danger">{r}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {finished && shownJobs.length === 0 && !partial && (
        <p className="mt-6 text-center text-sm text-faint">
          {t('search.noMatches')}
        </p>
      )}

      {open && (
        <JobDrawer
          job={open}
          match={matches[open.id]}
          score={matches[open.id] ? compositeScore(matches[open.id], weights) : undefined}
          resume={resume}
          apiKey={apiKey}
          requireGroq={requireGroq}
          saved={savedIds.has(open.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function regionLabelKey(code: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    de: 'region.de',
    at: 'region.at',
    ch: 'region.ch',
    nl: 'region.nl',
    lu: 'region.lu',
    li: 'region.li',
  }
  return keys[code] ?? 'region.de'
}

function sourceLabelKey(s: SourceId | 'ats'): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    ba: 'source.ba',
    arbeitnow: 'source.arbeitnow',
    adzuna: 'source.adzuna',
    ats: 'source.ats',
  }
  return keys[s] ?? 'source.ats'
}