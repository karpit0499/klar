// ============================================================================
// v2.4.3 · The application packet drawer, with two additions and no removals.
//
//  1. PRE-FLIGHT. Before offering the AI action, Klar prices the request and
//     compares it to the plan's per-minute allowance. If it cannot possibly
//     succeed, the AI button is disabled and Klar says so plainly — instead of
//     letting someone click into a guaranteed error, wait a minute, and click
//     into the same error again. That was the reported bug.
//
//  2. "TAILOR WITHOUT AI". `tailorResume()` has existed and been tested since
//     v2.3: it reorders bullets and skills toward the posting and writes an
//     honest summary, using only the person's own sentences, with no API key and
//     no tokens. It was never offered in the interface. Now it is a first-class
//     action, always available, and it is what the pre-flight refusal points at.
//     A student with no quota left is never stranded again.
//
// Both modes produce the same downloadable DOCX and PDF, and the drawer always
// states WHICH mode produced the document — a deterministic reorder must never
// be presented as an AI rewrite.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Spinner } from './atoms'
import { useScrollLock } from './useScrollLock'
import type { MatchResult, NormalizedJob, Region } from '../types'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import { pickLanguage, tailorResume, type TailoredResume } from '../resume/tailor'
import { estimateTailoringRequest, tailorResumeWithAi } from '../llm/tailorResume'
import { canAfford, loadTpmLimit } from '../llm/budget'
import { downloadResumeDocx } from '../resume/docx'
import { printResumeAsPdf } from '../resume/pdf'
import { fetchSalaryBenchmark, salaryExpectationLine } from '../salary/adzuna'
import { loadAdzunaKey } from '../settings/adzunaKey'
import { getActiveRegion } from '../regions'
import { draftCoverLetter } from '../llm/coverLetter'
import { useT } from '../i18n/LocaleProvider'
import { ErrorNotice } from './ErrorNotice'
import { toAppError, type AppErrorData } from '../errors/appError'

/** One prepared résumé, and whether AI produced it. */
type PreparedResume = {
  mode: 'ai' | 'deterministic'
  result: TailoredResume
  changeSummary: string[]
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function fileStem(job: NormalizedJob): string {
  const raw = `klar-${job.company}-${job.title}`
  return (
    raw.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) ||
    'klar-application'
  )
}

export function ApplicationBundle({
  job,
  resume,
  apiKey,
  requireGroq,
  match,
  onClose,
}: {
  job: NormalizedJob
  resume: ResumeData
  apiKey?: string
  requireGroq: (action: string) => Promise<string | null>
  match?: MatchResult
  onClose: () => void
}) {
  const t = useT()
  useScrollLock()
  const panelRef = useRef<HTMLDivElement>(null)

  const suggestedLanguage = pickLanguage(job)
  const [resumeLanguage, setResumeLanguage] = useState<ResumeLanguage>(suggestedLanguage)
  const [preparedByLanguage, setPreparedByLanguage] = useState<
    Partial<Record<ResumeLanguage, PreparedResume>>
  >({})
  const [tailoringLanguage, setTailoringLanguage] = useState<ResumeLanguage | null>(null)
  const [tailoringError, setTailoringError] = useState<AppErrorData | null>(null)
  const [region, setRegion] = useState<Region | undefined>(undefined)
  const [letter, setLetter] = useState('')
  const [letterBusy, setLetterBusy] = useState(false)
  const [letterError, setLetterError] = useState<AppErrorData | null>(null)
  const [salaryLine, setSalaryLine] = useState<string | null>(null)
  const [salaryBusy, setSalaryBusy] = useState(true)
  const [hasSalaryKey, setHasSalaryKey] = useState(false)
  // v2.4.3 pre-flight: what the AI request would cost, and whether it can run.
  const [affordable, setAffordable] = useState<{ ok: boolean; billed: number; limit: number } | null>(null)

  // Dialog a11y: focus the panel on open and close on Escape (WCAG 2.1.2).
  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    void getActiveRegion().then(setRegion)
  }, [])

  // Price the AI request for the selected language, before anything is spent.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const request = estimateTailoringRequest(resume, job, resumeLanguage)
        const { tpm } = await loadTpmLimit()
        const verdict = canAfford(request.cost, tpm)
        if (!alive) return
        setAffordable({ ok: verdict.ok, billed: request.cost.billedTokens, limit: tpm })
      } catch {
        // If the estimate itself fails, do not block the user — let the request
        // through and rely on the honest error from the client.
        if (alive) setAffordable(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [resume, job, resumeLanguage])

  useEffect(() => {
    let alive = true

    async function run() {
      setSalaryBusy(true)
      const key = await loadAdzunaKey()
      setHasSalaryKey(Boolean(key))
      if (!key) {
        if (alive) {
          setSalaryLine(null)
          setSalaryBusy(false)
        }
        return
      }
      const city = job.location.city ?? ''
      const summary = await fetchSalaryBenchmark(
        { title: job.title, city, country: region?.adzunaCountry },
        key,
      )
      if (!alive) return
      setSalaryLine(summary ? salaryExpectationLine(summary, city, job.title) : null)
      setSalaryBusy(false)
    }

    void run()
    return () => {
      alive = false
    }
  }, [job, region])

  async function makeTailoredResume(language: ResumeLanguage) {
    setTailoringError(null)
    setTailoringLanguage(language)
    try {
      const key = apiKey ?? await requireGroq(t('bundle.generateResume'))
      if (!key) return
      const result = await tailorResumeWithAi(resume, job, key, language)
      setPreparedByLanguage((current) => ({
        ...current,
        [language]: { mode: 'ai', result, changeSummary: result.changeSummary },
      }))
    } catch (error) {
      setTailoringError(toAppError(error, {
        category: 'parsing',
        message: t('bundle.resumeFailed', { error: '' }).replace(/:\s*$/, ''),
        dataSafe: true,
        available: 'Your source résumé and previous output remain unchanged.',
        action: { label: t('common.regenerate'), kind: 'retry' },
      }))
    } finally {
      setTailoringLanguage(null)
    }
  }

  /**
   * The zero-token path. Deterministic, offline, no key: reorders the person's
   * own bullets and skills toward the posting and writes an honest summary.
   */
  function makeDeterministicResume(language: ResumeLanguage) {
    setTailoringError(null)
    const result = tailorResume(resume, { ...job, language })
    setPreparedByLanguage((current) => ({
      ...current,
      [language]: { mode: 'deterministic', result, changeSummary: [] },
    }))
  }

  async function makeLetter() {
    setLetterError(null)
    setLetterBusy(true)
    try {
      const key = apiKey ?? await requireGroq(t('bundle.draft'))
      if (!key) return
      setLetter(await draftCoverLetter(resume, job, key, match))
    } catch (error) {
      setLetterError(toAppError(error, {
        category: 'parsing', message: t('bundle.letterFailed'), dataSafe: true,
        available: 'Your résumé and saved workspace remain unchanged.',
        action: { label: t('common.regenerate'), kind: 'retry' },
      }))
    } finally {
      setLetterBusy(false)
    }
  }

  const current = preparedByLanguage[resumeLanguage]
  const stem = fileStem(job)

  function downloadResume() {
    if (!current) return
    void downloadResumeDocx(
      current.result.data,
      current.result.language,
      `${stem}-${current.result.language}.docx`,
    )
  }

  function downloadResumePdf() {
    if (!current) return
    printResumeAsPdf(current.result.data, current.result.language)
  }

  function downloadLetter() {
    if (letter) downloadText(`${stem}-cover-letter.txt`, letter)
  }

  function downloadAll() {
    downloadResume()
    if (letter) setTimeout(downloadLetter, 300)
  }

  const aiBlocked = affordable != null && !affordable.ok

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end overscroll-contain bg-black/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bundle-title"
        tabIndex={-1}
        className="app-drawer w-full max-w-xl overflow-y-auto bg-surface p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none sm:p-6 sm:pb-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="bundle-title" className="wrap-anywhere text-xl font-semibold text-ink">
              {t('bundle.title')}
            </h2>
            <p className="wrap-anywhere text-base text-muted">
              {job.title} · {job.company}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={onClose} aria-label={t('common.close')}>
            {t('common.close')}
          </Button>
        </div>

        <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-language">
          <h3 id="bundle-language" className="text-base font-semibold text-ink">
            {t('bundle.languagePrompt')}
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="bundle-language">
            {(['en', 'de'] as const).map((language) => {
              const selected = resumeLanguage === language
              const suggested = suggestedLanguage === language
              return (
                <button
                  key={language}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setResumeLanguage(language)
                    setTailoringError(null)
                  }}
                  className={`flex min-h-[64px] flex-col items-center justify-center rounded-md border px-2 py-2 text-sm font-medium transition ${
                    selected
                      ? 'border-accent bg-accent-tint text-accent'
                      : 'border-border bg-surface text-ink hover:bg-surface-2'
                  }`}
                >
                  <span>{language === 'en' ? t('bundle.english') : t('bundle.german')}</span>
                  {suggested && (
                    <span className="mt-0.5 text-xs leading-tight text-muted">{t('bundle.suggested')}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* v2.4.3: the two ways to build a résumé, side by side. */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => void makeTailoredResume(resumeLanguage)}
              disabled={tailoringLanguage !== null || aiBlocked}
            >
              {tailoringLanguage === resumeLanguage ? (
                <Spinner label={t('bundle.generatingResume')} />
              ) : current?.mode === 'ai' ? (
                t('common.regenerate')
              ) : (
                t('bundle.generateResume')
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => makeDeterministicResume(resumeLanguage)}
              disabled={tailoringLanguage !== null}
            >
              {t('bundle.noAi')}
            </Button>
          </div>

          {affordable && affordable.ok && (
            <p className="mt-2 text-sm text-faint">
              {t('bundle.costEstimate', { tokens: affordable.billed.toLocaleString() })}
            </p>
          )}

          {aiBlocked && affordable && (
            <div className="mt-3 rounded-md border border-border bg-surface-2 p-3" role="status">
              <p className="wrap-anywhere text-base text-ink">
                {t('bundle.tooLarge', {
                  tokens: affordable.billed.toLocaleString(),
                  limit: affordable.limit.toLocaleString(),
                })}
              </p>
              <p className="mt-1 wrap-anywhere text-sm text-muted">{t('bundle.tooLargeAction')}</p>
            </div>
          )}

          <p className="mt-2 text-sm text-faint">{t('bundle.noAiHint')}</p>

          {tailoringError && <div className="mt-3"><ErrorNotice error={tailoringError} /></div>}
        </section>

        {current && (
          <>
            <section className="mt-5" aria-labelledby="bundle-coverage">
              <h3 id="bundle-coverage" className="text-base font-semibold text-ink">
                {t('bundle.coverage')}
              </h3>
              <p className="mt-1 wrap-anywhere text-base leading-relaxed text-muted">
                {current.result.coverage.summary}
              </p>
              {current.result.coverage.missing.length > 0 && (
                <ul className="mt-2 flex list-none flex-wrap gap-1.5 p-0">
                  {current.result.coverage.missing.slice(0, 8).map((skill) => (
                    <li key={skill}>
                      <Badge tone="outline">{t('bundle.gap', { skill })}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-resume">
              <h3 id="bundle-resume" className="text-base font-semibold text-ink">
                {t('bundle.tailoredResume', { lang: current.result.language.toUpperCase() })}
              </h3>
              <div className="mt-2">
                <Badge tone={current.mode === 'ai' ? 'accent' : 'neutral'}>
                  {current.mode === 'ai' ? t('bundle.modeAi') : t('bundle.modeDeterministic')}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-faint">
                {current.mode === 'ai' ? t('bundle.tailoredHint') : t('bundle.modeDeterministicHint')}
              </p>
              <p className="mt-3 text-base text-success">{t('bundle.resumeReady')}</p>

              {current.changeSummary.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-semibold text-ink">{t('bundle.changeSummary')}</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                    {current.changeSummary.map((change, index) => (
                      <li key={`${index}-${change}`} className="wrap-anywhere">
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={downloadResume}>
                  {t('bundle.downloadDocx')}
                </Button>
                <Button variant="ghost" size="sm" onClick={downloadResumePdf}>
                  {t('bundle.printPdf')}
                </Button>
              </div>
            </section>

            <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-salary">
              <h3 id="bundle-salary" className="text-base font-semibold text-ink">{t('bundle.salary')}</h3>
              {salaryBusy ? (
                <div className="mt-2">
                  <Spinner label={t('bundle.checkingBenchmark')} />
                </div>
              ) : salaryLine ? (
                <p className="mt-1 wrap-anywhere text-base text-muted">{salaryLine}</p>
              ) : (
                <p className="mt-1 text-sm text-faint">
                  {hasSalaryKey ? t('bundle.benchmarkUnavailable') : t('bundle.noBenchmark')}
                </p>
              )}
            </section>

            <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-letter">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="bundle-letter" className="text-base font-semibold text-ink">
                  {t('drawer.coverLetter')}
                </h3>
                <Button size="sm" onClick={makeLetter} disabled={letterBusy}>
                  {letterBusy ? (
                    <Spinner label={t('common.drafting')} />
                  ) : letter ? (
                    t('common.regenerate')
                  ) : (
                    t('bundle.draft')
                  )}
                </Button>
              </div>
              {letterError && <div className="mt-2"><ErrorNotice error={letterError} /></div>}
              {letter && (
                <div className="mt-2">
                  <label className="block" htmlFor="bundle-letter-text">
                    <span className="sr-only">{t('drawer.coverLetter')}</span>
                    <textarea
                      id="bundle-letter-text"
                      className="h-48 w-full rounded-md border border-border bg-surface p-3 text-base text-ink outline-none focus:border-accent"
                      value={letter}
                      onChange={(event) => setLetter(event.target.value)}
                    />
                  </label>
                  <div className="mt-2">
                    <Button variant="ghost" size="sm" onClick={downloadLetter}>
                      {t('bundle.downloadTxt')}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="accent" onClick={downloadAll}>
                {t('bundle.downloadPacket')}
              </Button>
              <span className="text-sm text-faint">
                {letter ? t('bundle.packetNoteWithLetter') : t('bundle.packetNote')}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}