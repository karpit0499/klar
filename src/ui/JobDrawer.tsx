import { useEffect, useRef, useState } from 'react'
import { Button, Badge, Spinner } from './atoms'
import { ApplicationBundle } from './ApplicationBundle'
import type { MatchResult, NormalizedJob, Profile } from '../types'
import { fetchBaDetail } from '../sources/ba'
import { addToTracker } from '../tracker/store'
import { FACTOR_KEYS } from '../match/weights'
import { draftCoverLetter } from '../llm/coverLetter'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'

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

export function JobDrawer({
  job,
  match,
  score,
  profile,
  apiKey,
  onClose,
}: {
  job: NormalizedJob
  match?: MatchResult
  /** Composite (re-weighted) headline score; falls back to fitScore. */
  score?: number
  profile: Profile
  apiKey: string
  onClose: () => void
}) {
  const t = useT()

  const [description, setDescription] = useState(job.description)
  const [loadingDesc, setLoadingDesc] = useState(false)
  const [added, setAdded] = useState(false)
  const [showBundle, setShowBundle] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Cover-letter state (feature 7.1).
  const [letter, setLetter] = useState('')
  const [letterBusy, setLetterBusy] = useState(false)
  const [letterErr, setLetterErr] = useState('')
  const [copied, setCopied] = useState(false)

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

  async function makeLetter() {
    setLetterErr('')
    setLetterBusy(true)
    try {
      const text = await draftCoverLetter(profile, { ...job, description }, apiKey, match)
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

  const headline = score ?? match?.fitScore

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-drawer-title"
        tabIndex={-1}
        className="h-full w-full max-w-xl overflow-y-auto bg-surface p-6 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="job-drawer-title" className="text-xl font-semibold text-ink">
              {job.title}
            </h2>
            <p className="text-sm text-muted">
              {job.company} · {job.location.city ?? (job.location.remote ? t('card.remote') : '—')}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('common.close')}>
            {t('common.close')}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="neutral">{job.source}</Badge>
          {job.location.remote && <Badge tone="neutral">{t('card.remote')}</Badge>}
          {job.salary.min != null && (
            <Badge tone="neutral">
              <span className="font-display tabular-nums">
                €{job.salary.min.toLocaleString()}
                {job.salary.max ? `–${job.salary.max.toLocaleString()}` : '+'}
              </span>
            </Badge>
          )}
          {job.employment_type && <Badge>{job.employment_type}</Badge>}
        </div>

        {match && (
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-display text-3xl font-bold tabular-nums text-accent">{headline}</span>
              <span className="text-faint">{t('drawer.scoreOutOf')} · {match.verdict}</span>
              {match.confidence != null && (
                <span className="ml-auto text-xs text-faint">
                  {t('drawer.confidence', { pct: Math.round(match.confidence * 100) })}
                </span>
              )}
            </div>
            {/* The signature cobalt bar — its length equals the score (never hue). */}
            {headline != null && (
              <div className="mt-2 h-1.5 w-full rounded-full bg-border" role="progressbar" aria-label={t('drawer.matchScoreAria')} aria-valuenow={headline} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${headline}%` }} />
              </div>
            )}
            <p className="mt-2 text-muted">{match.rationale}</p>

            {/* Per-factor breakdown — what drove the score (feature 1.3). */}
            {match.factors && (
              <div className="mt-3 space-y-1.5">
                {FACTOR_KEYS.map((k) => (
                  <FactorBar key={k} label={t(FACTOR_LABEL_KEY[k])} value={match.factors![k]} />
                ))}
              </div>
            )}

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
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
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
          profile={profile}
          apiKey={apiKey}
          match={match}
          onClose={() => setShowBundle(false)}
        />
      )}
    </>
  )
}