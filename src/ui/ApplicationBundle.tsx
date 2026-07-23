import { useEffect, useState } from 'react'
import { Badge, Button, Spinner } from './atoms'
import { useScrollLock } from './useScrollLock'
import type { MatchResult, NormalizedJob, Region } from '../types'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import { pickLanguage } from '../resume/tailor'
import { tailorResumeWithAi, type AiTailoredResume } from '../llm/tailorResume'
import { downloadResumeDocx } from '../resume/docx'
import { printResumeAsPdf } from '../resume/pdf'
import { fetchSalaryBenchmark, salaryExpectationLine } from '../salary/adzuna'
import { loadAdzunaKey } from '../settings/adzunaKey'
import { getActiveRegion } from '../regions'
import { draftCoverLetter } from '../llm/coverLetter'
import { useT } from '../i18n/LocaleProvider'
import { ErrorNotice } from './ErrorNotice'
import { toAppError, type AppErrorData } from '../errors/appError'

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

  const suggestedLanguage = pickLanguage(job)
  const [resumeLanguage, setResumeLanguage] = useState<ResumeLanguage>(suggestedLanguage)
  const [tailoredByLanguage, setTailoredByLanguage] = useState<
    Partial<Record<ResumeLanguage, AiTailoredResume>>
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

  useEffect(() => {
    void getActiveRegion().then(setRegion)
  }, [])

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
      setTailoredByLanguage((current) => ({ ...current, [language]: result }))
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

  const currentTailored = tailoredByLanguage[resumeLanguage]
  const stem = fileStem(job)

  function downloadResume() {
    if (!currentTailored) return
    void downloadResumeDocx(
      currentTailored.data,
      currentTailored.language,
      `${stem}-${currentTailored.language}.docx`,
    )
  }

  function downloadResumePdf() {
    if (!currentTailored) return
    printResumeAsPdf(currentTailored.data, currentTailored.language)
  }

  function downloadLetter() {
    if (letter) downloadText(`${stem}-cover-letter.txt`, letter)
  }

  function downloadAll() {
    downloadResume()
    if (letter) setTimeout(downloadLetter, 300)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end overscroll-contain bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bundle-title"
        className="app-drawer w-full max-w-xl overflow-y-auto bg-surface p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-6"
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

        {(
          <>
            <section className="mt-5 rounded-lg border border-border p-4">
              <h3 className="text-base font-semibold text-ink">{t('bundle.languagePrompt')}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('bundle.languagePrompt')}>
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

              <div className="mt-4">
                <Button
                  onClick={() => void makeTailoredResume(resumeLanguage)}
                  disabled={tailoringLanguage !== null}
                >
                  {tailoringLanguage === resumeLanguage ? (
                    <Spinner label={t('bundle.generatingResume')} />
                  ) : currentTailored ? (
                    t('common.regenerate')
                  ) : (
                    t('bundle.generateResume')
                  )}
                </Button>
              </div>
              {tailoringError && <div className="mt-3"><ErrorNotice error={tailoringError} /></div>}
            </section>

            {currentTailored && (
              <>
                <section className="mt-5">
                  <h3 className="text-base font-semibold text-ink">{t('bundle.coverage')}</h3>
                  <p className="mt-1 wrap-anywhere text-base leading-relaxed text-muted">
                    {currentTailored.coverage.summary}
                  </p>
                  {currentTailored.coverage.missing.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {currentTailored.coverage.missing.slice(0, 8).map((skill) => (
                        <Badge key={skill} tone="outline">
                          {t('bundle.gap', { skill })}
                        </Badge>
                      ))}
                    </div>
                  )}
                </section>

                <section className="mt-5 rounded-lg border border-border p-4">
                  <h3 className="text-base font-semibold text-ink">
                    {t('bundle.tailoredResume', { lang: currentTailored.language.toUpperCase() })}
                  </h3>
                  <p className="mt-1 text-sm text-faint">{t('bundle.tailoredHint')}</p>
                  <p className="mt-3 text-base text-success">{t('bundle.resumeReady')}</p>
                  {currentTailored.changeSummary.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-sm font-semibold text-ink">{t('bundle.changeSummary')}</h4>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                        {currentTailored.changeSummary.map((change, index) => (
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

                <section className="mt-5 rounded-lg border border-border p-4">
                  <h3 className="text-base font-semibold text-ink">{t('bundle.salary')}</h3>
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

                <section className="mt-5 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-ink">{t('drawer.coverLetter')}</h3>
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
                      <textarea
                        className="h-48 w-full rounded-md border border-border bg-surface p-3 text-base text-ink outline-none focus:border-accent"
                        value={letter}
                        onChange={(event) => setLetter(event.target.value)}
                      />
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
          </>
        )}
      </div>
    </div>
  )
}