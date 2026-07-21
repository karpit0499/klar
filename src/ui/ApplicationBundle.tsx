// ============================================================================
// ApplicationBundle (feature 15). For one job, assembles everything you'd attach
// to an application, reusing features already built:
//   • the tailored résumé (feature 12)  → DOCX + text-based PDF
//   • a cover letter (feature 7)         → editable, downloadable
//   • a salary expectation line (feature 14, needs an Adzuna key)
//   • a JD-coverage summary (feature 13) → what the résumé does / doesn't hit
//
// Tailoring needs the RICH ResumeData (feature 12), which is separate from the
// thin matching Profile. If the user hasn't provided one yet, the panel first
// walks them through a one-time detailed extraction and caches it.
//
// Localized in feature 20. Left NOT translated (generated output):
// tailored.coverage.summary and the salary line (both come from helpers).
// ============================================================================
import { useEffect, useState } from 'react'
import { Button, Spinner, Badge } from './atoms'
import type { MatchResult, NormalizedJob, Profile, Region } from '../types'
import type { ResumeData } from '../resume/types'
import { tailorResume } from '../resume/tailor'
import { downloadResumeDocx } from '../resume/docx'
import { printResumeAsPdf } from '../resume/pdf'
import { extractResumeData } from '../resume/extract'
import { extractText } from '../parse/extract'
import { loadResumeData, saveResumeData } from '../settings/resumeData'
import { fetchSalaryBenchmark, salaryExpectationLine } from '../salary/adzuna'
import { loadAdzunaKey } from '../settings/adzunaKey'
import { getActiveRegion } from '../regions'
import { draftCoverLetter } from '../llm/coverLetter'
import { useT } from '../i18n/LocaleProvider'

/** Trigger a plain-text download without any library. */
function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** A filesystem-safe stem like "klar-Company-Title". */
function fileStem(job: NormalizedJob): string {
  const raw = `klar-${job.company}-${job.title}`
  return raw.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'klar-application'
}

export function ApplicationBundle({
  job,
  profile,
  apiKey,
  match,
  onClose,
}: {
  job: NormalizedJob
  profile: Profile
  apiKey: string
  match?: MatchResult
  onClose: () => void
}) {
  const t = useT()

  const [resume, setResume] = useState<ResumeData | null | undefined>(undefined) // undefined = loading
  const [region, setRegion] = useState<Region | undefined>(undefined)

  // Detailed-résumé extraction (only shown when no ResumeData is cached yet).
  const [exBusy, setExBusy] = useState<'' | 'reading' | 'parsing'>('')
  const [exErr, setExErr] = useState('')

  // Cover letter.
  const [letter, setLetter] = useState('')
  const [letterBusy, setLetterBusy] = useState(false)
  const [letterErr, setLetterErr] = useState('')

  // Salary line (feature 14).
  const [salaryLine, setSalaryLine] = useState<string | null>(null)
  const [salaryBusy, setSalaryBusy] = useState(true)

  useEffect(() => {
    void loadResumeData().then((d) => setResume(d ?? null))
    void getActiveRegion().then(setRegion)
  }, [])

  // Once we know the region, try the salary benchmark (graceful without a key).
  useEffect(() => {
    let alive = true
    async function run() {
      setSalaryBusy(true)
      const key = await loadAdzunaKey()
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

  async function extractDetailed(text: string) {
    setExErr('')
    if (text.trim().length < 30) {
      setExErr(t('bundle.tooShort'))
      return
    }
    setExBusy('parsing')
    try {
      const data = await extractResumeData(text, apiKey)
      await saveResumeData(data)
      setResume(data)
    } catch (e) {
      setExErr(e instanceof Error ? e.message : t('bundle.extractionFailed'))
    } finally {
      setExBusy('')
    }
  }

  async function onFile(file: File) {
    setExErr('')
    setExBusy('reading')
    try {
      const { text } = await extractText(file)
      setExBusy('')
      await extractDetailed(text)
    } catch (e) {
      setExBusy('')
      setExErr(e instanceof Error ? e.message : t('bundle.readFailed'))
    }
  }

  async function makeLetter() {
    setLetterErr('')
    setLetterBusy(true)
    try {
      setLetter(await draftCoverLetter(profile, job, apiKey, match))
    } catch (e) {
      setLetterErr(e instanceof Error ? e.message : t('bundle.letterFailed'))
    } finally {
      setLetterBusy(false)
    }
  }

  // The tailored résumé is pure + cheap, so derive it on each render.
  const tailored = resume ? tailorResume(resume, job, profile) : null
  const stem = fileStem(job)

  function downloadResume() {
    if (!tailored) return
    void downloadResumeDocx(tailored.data, tailored.language, `${stem}.docx`)
  }
  function downloadResumePdf() {
    if (!tailored) return
    printResumeAsPdf(tailored.data, tailored.language)
  }
  function downloadLetter() {
    if (letter) downloadText(`${stem}-anschreiben.txt`, letter)
  }
  function downloadAll() {
    downloadResume()
    if (letter) setTimeout(downloadLetter, 300) // stagger so both saves fire
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bundle-title"
        className="h-full w-full max-w-xl overflow-y-auto bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="bundle-title" className="text-xl font-semibold text-ink">
              {t('bundle.title')}
            </h2>
            <p className="text-sm text-muted">
              {job.title} · {job.company}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('common.close')}>
            {t('common.close')}
          </Button>
        </div>

        {resume === undefined && (
          <div className="mt-6">
            <Spinner label={t('common.loading')} />
          </div>
        )}

        {/* One-time detailed extraction when we don't have a rich résumé yet. */}
        {resume === null && (
          <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4 text-sm">
            <p className="font-medium text-ink">{t('bundle.needResumeTitle')}</p>
            <p className="mt-1 text-muted">{t('bundle.needResumeBody')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex">
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void onFile(f)
                  }}
                />
                <span className="inline-flex min-h-tap cursor-pointer items-center rounded-md border border-border bg-surface px-4 py-2.5 font-medium text-ink hover:bg-surface-2">
                  {t('bundle.chooseFile')}
                </span>
              </label>
              {exBusy === 'reading' && <Spinner label={t('bundle.readingFile')} />}
              {exBusy === 'parsing' && <Spinner label={t('bundle.extractingResume')} />}
            </div>
            {exErr && <p className="mt-2 text-danger">{exErr}</p>}
          </div>
        )}

        {tailored && (
          <>
            {/* Coverage (feature 13). */}
            <section className="mt-5">
              <h3 className="text-sm font-semibold text-ink">{t('bundle.coverage')}</h3>
              <p className="mt-1 text-sm text-muted">{tailored.coverage.summary}</p>
              {tailored.coverage.missing.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tailored.coverage.missing.slice(0, 8).map((m) => (
                    <Badge key={m} tone="outline">
                      {t('bundle.gap', { skill: m })}
                    </Badge>
                  ))}
                </div>
              )}
            </section>

            {/* Tailored résumé (feature 12). */}
            <section className="mt-5 rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold text-ink">
                {t('bundle.tailoredResume', { lang: tailored.language.toUpperCase() })}
              </h3>
              <p className="mt-1 text-xs text-faint">{t('bundle.tailoredHint')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={downloadResume}>
                  {t('bundle.downloadDocx')}
                </Button>
                <Button variant="ghost" size="sm" onClick={downloadResumePdf}>
                  {t('bundle.printPdf')}
                </Button>
              </div>
            </section>

            {/* Salary (feature 14). */}
            <section className="mt-5 rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold text-ink">{t('bundle.salary')}</h3>
              {salaryBusy ? (
                <div className="mt-2">
                  <Spinner label={t('bundle.checkingBenchmark')} />
                </div>
              ) : salaryLine ? (
                <p className="mt-1 text-sm text-muted">{salaryLine}</p>
              ) : (
                <p className="mt-1 text-sm text-faint">{t('bundle.noBenchmark')}</p>
              )}
            </section>

            {/* Cover letter (feature 7). */}
            <section className="mt-5 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">{t('drawer.coverLetter')}</h3>
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
              {letterErr && <p className="mt-2 text-sm text-danger">{letterErr}</p>}
              {letter && (
                <div className="mt-2">
                  <textarea
                    className="h-48 w-full rounded-md border border-border bg-surface p-3 text-sm text-ink outline-none focus:border-accent"
                    value={letter}
                    onChange={(e) => setLetter(e.target.value)}
                  />
                  <div className="mt-2">
                    <Button variant="ghost" size="sm" onClick={downloadLetter}>
                      {t('bundle.downloadTxt')}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* One action to grab the whole packet. */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="accent" onClick={downloadAll}>
                {t('bundle.downloadPacket')}
              </Button>
              <span className="text-xs text-faint">
                {letter ? t('bundle.packetNoteWithLetter') : t('bundle.packetNote')}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}