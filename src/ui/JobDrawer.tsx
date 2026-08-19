import { useEffect, useRef, useState } from 'react'
import { Button, Badge, Spinner } from './atoms'
import { ApplicationBundle } from './ApplicationBundle'
import type {
  MatchResult,
  NormalizedJob,
  Preferences,
  Profile,
  RankingEligibilityKey,
} from '../types'
import type { ResumeData } from '../resume/types'
import { fetchBaDetail } from '../sources/ba'
import { addToTracker } from '../tracker/store'
import { FACTOR_KEYS } from '../match/weights'
import { draftCoverLetter } from '../llm/coverLetter'
import { useLocale } from '../i18n/LocaleProvider'
import { useScrollLock } from './useScrollLock'
import type { TranslationKey } from '../i18n/translations'
import { explainMatchWithAi } from '../match'
import { formatCurrency } from '../i18n/format'

// Factor label → translation key. FACTOR_KEYS drives the set; the keys live in
// the shared `factor.*` namespace so WeightsPanel and this drawer read the same
// labels in both languages.
const FACTOR_LABEL_KEY: Record<string, TranslationKey> = {
  skills: 'factor.skills',
  salary: 'factor.salary',
  location: 'factor.location',
  seniority: 'factor.seniority',
}

/** A labelled 0–100 bar for one score factor (feature 1.3). */
function FactorBar({ label, value }: { label: string; value: number }) {
  // Brand: one accent, and tier is never read from hue — the bar LENGTH is the
  // signal, so every bar is cobalt regardless of value.
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-muted">{label}</span>
      <div
        className="h-2 flex-1 rounded-full bg-border"
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-2 rounded-full bg-accent" style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs tabular-nums font-display text-faint">{value}</span>
    </div>
  )
}

const ELIGIBILITY_LABEL: Record<
  'en' | 'de',
  Record<RankingEligibilityKey, string>
> = {
  en: {
    work_authorization: 'Work authorization',
    location: 'Location boundary',
    language: 'Required language',
    employment_type: 'Employment type',
    working_hours: 'Working hours',
    start_date: 'Start date',
    certification: 'Required certification',
    dealbreaker: 'Dealbreaker',
  },
  de: {
    work_authorization: 'Arbeitserlaubnis',
    location: 'Ortsgrenze',
    language: 'Erforderliche Sprache',
    employment_type: 'Beschäftigungsart',
    working_hours: 'Arbeitszeit',
    start_date: 'Startdatum',
    certification: 'Erforderlicher Nachweis',
    dealbreaker: 'Ausschlusskriterium',
  },
}

function RankingEvidencePanel({
  match,
  locale,
}: {
  match: MatchResult
  locale: 'en' | 'de'
}) {
  const ranking = match.ranking
  if (!ranking) return null
  const de = locale === 'de'
  const { features } = ranking
  const strong = features.requirements.filter((requirement) =>
    requirement.status === 'met' || requirement.status === 'partial')
  const missing = features.requirements.filter((requirement) =>
    requirement.priority === 'required' && requirement.status === 'missing')
  const uncertain = features.eligibility.filter((fact) => fact.status === 'unknown')
  const mismatches = features.eligibility.filter((fact) => fact.status === 'known_mismatch')
  const preferenceSignals = [
    [de ? 'Gehalt' : 'Salary', features.preferenceSignals.salary],
    [de ? 'Ort' : 'Location', features.preferenceSignals.location],
    [de ? 'Arbeitsmodell' : 'Work mode', features.preferenceSignals.workMode],
    [de ? 'Vertrag' : 'Contract', features.preferenceSignals.contract],
  ] as const
  const postingSignals = [
    [de ? 'Quelle' : 'Source', features.postingSignals.source],
    [de ? 'Vollständigkeit' : 'Completeness', features.postingSignals.completeness],
    [de ? 'Aktualität' : 'Freshness', features.postingSignals.freshness],
    [de ? 'Duplikat-Sicherheit' : 'Duplicate confidence', features.postingSignals.duplicateConfidence],
  ] as const

  return (
    <details className="mt-3 rounded-lg border border-border bg-surface p-3" open>
      <summary className="cursor-pointer font-medium text-ink">
        {de ? 'Begründung der Rangfolge' : 'Why this job ranked here'}
      </summary>
      <p className="mt-2 text-xs text-faint">
        {ranking.rank != null ? `${de ? 'Rang' : 'Rank'} ${ranking.rank} · ` : ''}
        {ranking.rankingVersion} · {ranking.historical
          ? (de ? 'historischer Stand' : 'historical snapshot')
          : (de ? 'reproduzierbarer Stand' : 'reproducible snapshot')}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RankingMetric
          label={de ? 'Kernpassung' : 'Core fit'}
          value={features.scores.coreFit}
        />
        <RankingMetric
          label={de ? 'Präferenz-Effekt' : 'Preference effect'}
          value={features.scores.preferenceAdjustment}
          signed
        />
        <RankingMetric
          label={de ? 'Anzeigenvertrauen' : 'Posting confidence'}
          value={features.scores.postingConfidence}
        />
        <RankingMetric
          label={de ? 'Endwert' : 'Final score'}
          value={features.scores.final}
        />
      </dl>

      <RankingList
        title={de ? 'Starke oder teilweise belegte Signale' : 'Strong or partly evidenced signals'}
        empty={de ? 'Keine belegte Muss- oder Wunsch-Anforderung erkannt.' : 'No evidenced required or preferred requirement was detected.'}
        items={strong.map((requirement) => {
          const evidence = requirement.evidence.map((item) => item.value).join(', ')
          const state = requirement.status === 'partial'
            ? (de ? 'teilweise' : 'partial')
            : (de ? 'belegt' : 'evidenced')
          return `${requirement.text} — ${state}${evidence ? `: ${evidence}` : ''}`
        })}
      />
      <RankingList
        title={de ? 'Fehlende Muss-Anforderungen' : 'Missing must-haves'}
        empty={de ? 'Keine bekannte fehlende Muss-Anforderung.' : 'No known missing must-have.'}
        items={missing.map((requirement) => requirement.text)}
        danger={missing.length > 0}
      />
      <RankingList
        title={de ? 'Unbekannte Angaben' : 'Uncertain facts'}
        empty={de ? 'Keine unbekannte harte Angabe erkannt.' : 'No uncertain hard fact was detected.'}
        items={uncertain.map((fact) => ELIGIBILITY_LABEL[locale][fact.key])}
      />
      {mismatches.length > 0 && (
        <RankingList
          title={de ? 'Bekannte harte Konflikte' : 'Known hard mismatches'}
          empty=""
          items={mismatches.map((fact) =>
            `${ELIGIBILITY_LABEL[locale][fact.key]}${fact.sourceText ? ` — ${fact.sourceText}` : ''}`)}
          danger
        />
      )}
      <RankingList
        title={de ? 'Begrenzter Präferenz-Effekt' : 'Bounded preference effect'}
        empty=""
        items={preferenceSignals.map(([label, value]) => `${label}: ${value}/100`)}
      />
      <RankingList
        title={de ? 'Qualität der Anzeige' : 'Posting quality'}
        empty=""
        items={[
          ...postingSignals.map(([label, value]) => `${label}: ${value}/100`),
          `${de ? 'Getrennter Abzug' : 'Separate penalty'}: ${features.scores.postingPenalty}`,
        ]}
      />
      <p className="mt-3 rounded-md border border-border bg-surface-2 p-2 text-xs leading-relaxed text-muted">
        {de
          ? 'Dieser Wert ist eine lokale, reproduzierbare Sortierhilfe und keine Einstellungswahrscheinlichkeit.'
          : 'This score is a local, reproducible ranking aid—not a probability of being hired.'}
      </p>
    </details>
  )
}

function RankingMetric({
  label,
  value,
  signed = false,
}: {
  label: string
  value: number
  signed?: boolean
}) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-2">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold tabular-nums text-ink">
        {signed && value > 0 ? '+' : ''}{value}
      </dd>
    </div>
  )
}

function RankingList({
  title,
  items,
  empty,
  danger = false,
}: {
  title: string
  items: string[]
  empty: string
  danger?: boolean
}) {
  return (
    <section className="mt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-faint">{title}</h4>
      {items.length ? (
        <ul className={`mt-1 list-disc space-y-1 pl-5 text-sm ${danger ? 'text-danger' : 'text-muted'}`}>
          {items.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">{empty}</p>
      )}
    </section>
  )
}

export function JobDrawer({
  job,
  match,
  score,
  resume,
  apiKey,
  profile,
  prefs,
  requireGroq,
  onMatchUpdated,
  saved,
  onClose,
}: {
  job: NormalizedJob
  match?: MatchResult
  /** Composite (re-weighted) headline score; falls back to fitScore. */
  score?: number
  resume: ResumeData
  apiKey?: string
  profile: Profile
  prefs: Preferences
  requireGroq: (action: string) => Promise<string | null>
  onMatchUpdated: (match: MatchResult) => void
  saved: boolean
  onClose: () => void
}) {
  const { locale, t } = useLocale()
  useScrollLock()

  const [description, setDescription] = useState(job.description)
  const [loadingDesc, setLoadingDesc] = useState(false)
  const [added, setAdded] = useState(saved)
  const [showBundle, setShowBundle] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Cover-letter state (feature 7.1).
  const [letter, setLetter] = useState('')
  const [letterBusy, setLetterBusy] = useState(false)
  const [letterErr, setLetterErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [explainBusy, setExplainBusy] = useState(false)
  const [explainError, setExplainError] = useState('')

  // Dialog a11y: focus the panel on open and close on Escape (WCAG 2.1.2).
  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    // BA list results have no description — fetch it lazily when the drawer opens.
    if (!job.description && job.source === 'ba') {
      setLoadingDesc(true)
      fetchBaDetail(job.source_id)
        .then((d) => setDescription(d.description))
        .catch(() => setDescription(t('drawer.descriptionFailed')))
        .finally(() => setLoadingDesc(false))
    }
  }, [job])

  useEffect(() => {
    setAdded(saved)
  }, [saved])

  async function makeLetter() {
    setLetterErr('')
    setLetterBusy(true)
    try {
      const key = apiKey ?? await requireGroq(t('drawer.draftCoverLetter'))
      if (!key) return
      // v2.5: the letter API now takes an options object. The drawer keeps its
      // quick draft — posting language, default tone, no extractor call. The full
      // tone + coverage controls live in the packet drawer.
      const text = await draftCoverLetter(resume, { ...job, description }, key, { match })
      setLetter(text)
    } catch (e) {
      setLetterErr(e instanceof Error ? e.message : t('drawer.letterFailed'))
    } finally {
      setLetterBusy(false)
    }
  }

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(letter)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — the user can still select the text */
    }
  }

  async function explainWithAi() {
    setExplainError('')
    setExplainBusy(true)
    try {
      const key = apiKey ?? await requireGroq(t('match.explainAction'))
      if (!key) return
      onMatchUpdated(await explainMatchWithAi(
        { ...job, description },
        profile,
        prefs,
        key,
        undefined,
        locale,
      ))
    } catch (caught) {
      setExplainError(caught instanceof Error ? caught.message : t('match.explainFailed'))
    } finally {
      setExplainBusy(false)
    }
  }

  const headline = score ?? match?.fitScore

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end overscroll-contain bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-drawer-title"
        tabIndex={-1}
        className="app-drawer w-full max-w-xl overflow-y-auto bg-surface p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none sm:p-6 sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="job-drawer-title" className="wrap-anywhere text-xl font-semibold text-ink">
              {job.title}
            </h2>
            <p className="wrap-anywhere text-base text-muted">
              {job.company} · {job.location.city ?? (job.location.remote ? t('card.remote') : '—')}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={onClose} aria-label={t('common.close')}>
            {t('common.close')}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="neutral">{job.source}</Badge>
          {job.location.remote && <Badge tone="neutral">{t('card.remote')}</Badge>}
          {job.salary.min != null && (
            <Badge tone="neutral">
              <span className="font-display tabular-nums">
                {formatCurrency(job.salary.min, job.salary.currency ?? 'EUR', locale)}
                {job.salary.max
                  ? `–${formatCurrency(job.salary.max, job.salary.currency ?? 'EUR', locale)}`
                  : '+'}
              </span>
            </Badge>
          )}
          {job.employment_type && <Badge>{job.employment_type}</Badge>}
        </div>

        {match && (
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-display text-3xl font-bold tabular-nums text-accent">{headline}</span>
              <span className="text-faint">{t('drawer.scoreOutOf')} · {match.verdict}</span>
              {match.aiAssessment?.confidence != null && (
                <span className="w-full text-sm text-faint sm:ml-auto sm:w-auto">
                  {t('drawer.confidence', { pct: Math.round(match.aiAssessment.confidence * 100) })}
                </span>
              )}
            </div>
            {/* The signature cobalt bar — its length equals the score (never hue). */}
            {headline != null && (
              <div className="mt-2 h-1.5 w-full rounded-full bg-border" role="progressbar" aria-label={t('drawer.matchScoreAria')} aria-valuenow={headline} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${headline}%` }} />
              </div>
            )}
            <p className="mt-2 text-xs font-medium text-faint">
              {t('match.klarScore')} · {t('match.usedForOrder')}
            </p>
            <p className="mt-2 wrap-anywhere text-base leading-relaxed text-muted">{match.rationale}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="outline">{t('match.originLocal')}</Badge>
              {!match.aiAssessment && (
                <Button size="sm" variant="ghost" onClick={() => void explainWithAi()} disabled={explainBusy}>
                  {explainBusy ? <Spinner label={t('match.explaining')} /> : t('match.explainAction')}
                </Button>
              )}
            </div>
            {explainError && <p className="mt-2 text-sm text-danger" role="alert">{explainError}</p>}

            {match.aiAssessment && (
              <section className="mt-3 rounded-lg border border-border bg-surface p-3" aria-labelledby="ai-assessment-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 id="ai-assessment-heading" className="font-semibold text-ink">{t('match.aiScore')}</h3>
                    <p className="text-xs text-faint">{t('match.advisoryOnly')}</p>
                  </div>
                  <span className="font-display text-2xl font-bold tabular-nums text-ink">
                    {match.aiAssessment.fitScore}/100
                  </span>
                </div>
                <p className="mt-2 text-xs text-faint">
                  {t('match.scoreDifference', {
                    delta: `${match.aiAssessment.fitScore - match.fitScore > 0 ? '+' : ''}${match.aiAssessment.fitScore - match.fitScore}`,
                  })}
                  {' · '}{match.aiAssessment.modelVersion}
                </p>
                <p className="mt-1 break-words text-xs text-faint">
                  {t('match.aiProvenance', {
                    scorer: match.aiAssessment.provenance.scorerVersion,
                    prompt: match.aiAssessment.provenance.promptVersion,
                    schema: match.aiAssessment.provenance.responseSchemaVersion,
                  })}
                  <br />
                  {t('match.aiDelivery', {
                    host: match.aiAssessment.provenance.engineHost,
                    cache: t(match.aiAssessment.provenance.cacheStatus === 'cached'
                      ? 'match.cacheCached'
                      : 'match.cacheFresh'),
                    locale: match.aiAssessment.provenance.locale.toUpperCase(),
                  })}
                </p>
                <p className="mt-2 wrap-anywhere text-base leading-relaxed text-muted">
                  {match.aiAssessment.rationale}
                </p>
                {match.aiAssessment.factors && (
                  <div className="mt-3 space-y-1.5">
                    {FACTOR_KEYS.map((key) => (
                      <FactorBar key={key} label={t(FACTOR_LABEL_KEY[key])} value={match.aiAssessment!.factors![key]} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {match.ranking ? (
              <RankingEvidencePanel match={match} locale={locale} />
            ) : match.factors ? (
              <div className="mt-3 space-y-1.5">
                {FACTOR_KEYS.map((k) => (
                  <FactorBar key={k} label={t(FACTOR_LABEL_KEY[k])} value={match.factors![k]} />
                ))}
              </div>
            ) : null}

            {match.missingSkills.length > 0 && (
              <p className="mt-2 text-muted">
                <span className="font-medium text-ink">{t('drawer.gaps')}</span> {match.missingSkills.join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <h3 className="text-sm font-semibold text-ink">{t('drawer.description')}</h3>
          {loadingDesc ? (
            <div className="mt-2">
              <Spinner label={t('drawer.loadingDescription')} />
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap wrap-anywhere text-base leading-relaxed text-muted">
              {description || t('drawer.noDescription')}
            </p>
          )}
        </div>

        {/* Cover-letter draft builder (feature 7.1). */}
        <div className="mt-5 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">{t('drawer.coverLetter')}</h3>
            <Button size="sm" onClick={makeLetter} disabled={letterBusy}>
              {letterBusy ? (
                <Spinner label={t('common.drafting')} />
              ) : letter ? (
                t('common.regenerate')
              ) : (
                t('drawer.draftCoverLetter')
              )}
            </Button>
          </div>
          {letterErr && <p className="mt-2 text-sm text-danger">{letterErr}</p>}
          {letter && (
            <div className="mt-2">
              <textarea
                className="h-56 w-full rounded-md border border-border bg-surface p-3 text-sm text-ink outline-none focus:border-accent"
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
              />
              <div className="mt-2">
                <Button variant="ghost" size="sm" onClick={copyLetter}>
                  {copied ? t('common.copied') : t('common.copy')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex">
            <Button variant="accent">{t('drawer.openOriginal')}</Button>
          </a>
          <Button variant="ghost" onClick={() => setShowBundle(true)}>
            {t('drawer.buildPacket')}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await addToTracker({ ...job, description }, match)
              setAdded(true)
            }}
            disabled={added}
          >
            {added ? t('drawer.added') : t('drawer.saveToTracker')}
          </Button>
        </div>

        {job.also_on && job.also_on.length > 0 && (
          <p className="mt-4 text-xs text-faint">
            {t('drawer.alsoPostedOn')}{' '}
            {job.also_on.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-accent underline">
                {a.source}
                {i < job.also_on!.length - 1 ? ', ' : ''}
              </a>
            ))}
          </p>
        )}
        </div>
      </div>

      {showBundle && (
        <ApplicationBundle
          job={{ ...job, description }}
          resume={resume}
          apiKey={apiKey}
          requireGroq={requireGroq}
          match={match}
          onClose={() => setShowBundle(false)}
        />
      )}
    </>
  )
}
