// ============================================================================
// v2.5 — the application packet workspace.
//
// v2.4 generated a résumé and a letter and forgot them the moment the drawer
// closed. v2.5 turns this drawer into a PERSISTENT PACKET: job snapshot,
// tailored résumé + review decisions, letter, short message, notes, readiness,
// export history and a bounded version history — per language, independently.
//
// The flow, in the order a person meets it:
//   1. choose the language (EN/DE are separate packets-within-a-packet)
//   2. generate → coverage panel (C2) → change review (C1)
//   3. accept / reject / edit each change; blocked changes cannot be accepted
//   4. letter with a tone, and a short message
//   5. download — DOCX first (WS1: DOCX is the default), PDF as the alternative
//
// Everything the person does is autosaved through src/packets/store.ts, so a
// reload, a crash or a closed tab loses nothing.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Spinner } from './atoms'
import { useScrollLock } from './useScrollLock'
import { CoveragePanel } from './CoveragePanel'
import { TailoringReview } from './TailoringReview'
import type { MatchResult, NormalizedJob, Region } from '../types'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import { pickLanguage, tailorResume } from '../resume/tailor'
import {
  acceptAll, applyChanges, restoreChange, setDecision, setEditedText, type ChangeRecord,
} from '../resume/changeSet'
import { estimateTailoringRequest, tailorResumeWithAi } from '../llm/tailorResume'
import { canAfford, loadTpmLimit } from '../llm/budget'
import { extractJdRequirements } from '../llm/jdTerms'
import { loadAppFlags, DEFAULT_APP_FLAGS, type AppFlags } from '../lib/appFlags'
import { downloadResumeDocx } from '../resume/docx'
import { printResumeAsPdf } from '../resume/pdf'
import { fetchSalaryBenchmark, salaryExpectationLine } from '../salary/adzuna'
import { loadAdzunaKey } from '../settings/adzunaKey'
import { getActiveRegion } from '../regions'
import {
  draftCoverLetter, draftShortMessage, DEFAULT_LETTER_TONE, LETTER_TONES, type LetterTone,
} from '../llm/coverLetter'
import {
  emptyLanguageState, packetReadiness, type PacketRow,
} from '../packets/types'
import {
  beginGeneration, endGeneration, openPacket, pushPacketVersion, recordPacketExport, updatePacket,
} from '../packets/store'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'
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

const TONE_LABEL: Record<LetterTone, TranslationKey> = {
  concise: 'letter.tone.concise',
  balanced: 'letter.tone.balanced',
  formal: 'letter.tone.formal',
}

const UNRESOLVED_LABEL: Record<string, TranslationKey> = {
  unsupported_number: 'review.unresolved.number',
  unsupported_term: 'review.unresolved.term',
  repetition: 'review.unresolved.repetition',
  title_inflation: 'review.unresolved.title',
  identical: 'review.unresolved.other',
  reworded: 'review.unresolved.other',
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
  const [packet, setPacket] = useState<PacketRow | null>(null)
  const [flags, setFlags] = useState<AppFlags>(DEFAULT_APP_FLAGS)
  const [tailoringLanguage, setTailoringLanguage] = useState<ResumeLanguage | null>(null)
  const [improving, setImproving] = useState(false)
  const [tailoringError, setTailoringError] = useState<AppErrorData | null>(null)
  const [region, setRegion] = useState<Region | undefined>(undefined)
  const [letterBusy, setLetterBusy] = useState(false)
  const [messageBusy, setMessageBusy] = useState(false)
  const [letterError, setLetterError] = useState<AppErrorData | null>(null)
  const [salaryLine, setSalaryLine] = useState<string | null>(null)
  const [salaryBusy, setSalaryBusy] = useState(true)
  const [hasSalaryKey, setHasSalaryKey] = useState(false)
  const [interrupted, setInterrupted] = useState<string | null>(null)
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
    void loadAppFlags().then(setFlags)
  }, [])

  // v2.4.3: price the AI request for the selected language before anything is
  // spent, so a request that cannot succeed is never offered.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const request = estimateTailoringRequest(resume, job, resumeLanguage, state?.jdTerms ?? [])
        const { tpm } = await loadTpmLimit()
        const verdict = canAfford(request.cost, tpm)
        if (!alive) return
        setAffordable({ ok: verdict.ok, billed: request.cost.billedTokens, limit: tpm })
      } catch {
        if (alive) setAffordable(null)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, job, resumeLanguage])

  // Open (or create) this job's packet, and notice an interrupted generation.
  useEffect(() => {
    let alive = true
    void (async () => {
      const row = await openPacket('career', job)
      if (!alive) return
      setPacket(row)
      if (row.generation) {
        setInterrupted(row.generation.stage)
        await endGeneration(row.id)
      }
    })()
    return () => {
      alive = false
    }
  }, [job])

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

  const mutate = useCallback(
    async (mutator: (row: PacketRow) => void) => {
      if (!packet) return
      const next = await updatePacket(packet.id, mutator)
      if (next) setPacket(next)
    },
    [packet],
  )

  const state = packet?.languages[resumeLanguage]
  const readiness = packetReadiness(packet, resumeLanguage)

  const tailored = useMemo(() => {
    if (!state?.baseline || !state.source) return null
    return applyChanges(state.baseline, state.source, state.changes)
  }, [state])

  const stem = fileStem(job)
  const aiBlocked = affordable != null && !affordable.ok

  async function runTailoring(language: ResumeLanguage, focusMissing = false) {
    setTailoringError(null)
    if (focusMissing) setImproving(true)
    else setTailoringLanguage(language)
    try {
      const key = apiKey ?? (await requireGroq(t('bundle.generateResume')))
      if (!key) return
      if (packet) await beginGeneration(packet.id, { stage: 'resume', language, startedAt: new Date().toISOString() })

      const extracted = flags.jdRequirementExtractor
        ? await extractJdRequirements(job, key, { force: focusMissing })
        : { terms: [] as string[] }

      const result = await tailorResumeWithAi(resume, job, key, language, { jdTerms: extracted.terms })

      if (packet && state?.baseline) await pushPacketVersion(packet.id, `regenerate-${language}`)
      await mutate((row) => {
        const previous = row.languages[language] ?? emptyLanguageState()
        row.languages[language] = {
          ...previous,
          mode: 'ai',
          baseline: result.baseline,
          source: result.source,
          changes: result.changes,
          changeSummary: result.changeSummary,
          coverage: {
            summary: result.coverage.summary,
            covered: result.coverage.covered,
            missing: result.coverage.missing,
            ratio: result.coverage.ratio,
          },
          jdTerms: result.jdTerms,
          unresolved: result.unresolved,
          attempts: result.attempts,
          generatedAt: new Date().toISOString(),
          reviewedAt: undefined,
        }
        delete row.generation
      })
    } catch (error) {
      setTailoringError(toAppError(error, {
        category: 'parsing',
        message: t('bundle.resumeFailed', { error: '' }).replace(/:\s*$/, ''),
        dataSafe: true,
        available: 'Your source résumé and previous output remain unchanged.',
        action: { label: t('common.regenerate'), kind: 'retry' },
      }))
      if (packet) await endGeneration(packet.id)
    } finally {
      setTailoringLanguage(null)
      setImproving(false)
    }
  }

  async function makeLetter() {
    setLetterError(null)
    setLetterBusy(true)
    try {
      const key = apiKey ?? (await requireGroq(t('bundle.draft')))
      if (!key) return
      if (packet) await beginGeneration(packet.id, { stage: 'letter', language: resumeLanguage, startedAt: new Date().toISOString() })
      const text = await draftCoverLetter(resume, job, key, {
        language: resumeLanguage,
        tone: state?.letterTone ?? DEFAULT_LETTER_TONE,
        jdTerms: state?.jdTerms ?? [],
        match,
      })
      await mutate((row) => {
        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
        row.languages[resumeLanguage] = { ...previous, letter: text }
        delete row.generation
      })
    } catch (error) {
      setLetterError(toAppError(error, {
        category: 'parsing', message: t('bundle.letterFailed'), dataSafe: true,
        available: 'Your résumé and saved workspace remain unchanged.',
        action: { label: t('common.regenerate'), kind: 'retry' },
      }))
      if (packet) await endGeneration(packet.id)
    } finally {
      setLetterBusy(false)
    }
  }

  async function makeShortMessage() {
    setLetterError(null)
    setMessageBusy(true)
    try {
      const key = apiKey ?? (await requireGroq(t('message.draft')))
      if (!key) return
      if (packet) await beginGeneration(packet.id, { stage: 'message', language: resumeLanguage, startedAt: new Date().toISOString() })
      const text = await draftShortMessage(resume, job, key, {
        language: resumeLanguage,
        jdTerms: state?.jdTerms ?? [],
      })
      await mutate((row) => {
        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
        row.languages[resumeLanguage] = { ...previous, shortMessage: text }
        delete row.generation
      })
    } catch (error) {
      setLetterError(toAppError(error, {
        category: 'parsing', message: t('message.failed'), dataSafe: true,
        available: 'Your résumé and saved workspace remain unchanged.',
        action: { label: t('common.regenerate'), kind: 'retry' },
      }))
      if (packet) await endGeneration(packet.id)
    } finally {
      setMessageBusy(false)
    }
  }

  /**
   * v2.4.3 · The zero-token path. `tailorResume()` reorders the person's own
   * bullets and skills toward the posting and writes an honest summary — no key,
   * no tokens, no rewriting. Stored with an EMPTY change list, because nothing
   * was rewritten and there is therefore nothing to review.
   */
  async function runDeterministicTailoring(language: ResumeLanguage) {
    setTailoringError(null)
    const result = tailorResume(resume, { ...job, language })
    if (packet && state?.baseline) await pushPacketVersion(packet.id, `no-ai-${language}`)
    await mutate((row) => {
      const previous = row.languages[language] ?? emptyLanguageState()
      row.languages[language] = {
        ...previous,
        mode: 'deterministic',
        baseline: result.data,
        source: result.data,
        changes: [],
        changeSummary: [],
        coverage: {
          summary: result.coverage.summary,
          covered: result.coverage.covered,
          missing: result.coverage.missing,
          ratio: result.coverage.ratio,
        },
        jdTerms: [...result.coverage.covered, ...result.coverage.missing],
        unresolved: [],
        attempts: 0,
        generatedAt: new Date().toISOString(),
        reviewedAt: undefined,
      }
      delete row.generation
    })
  }

  function updateChanges(next: ChangeRecord[]) {
    void mutate((row) => {
      const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
      row.languages[resumeLanguage] = { ...previous, changes: next }
    })
  }

  function downloadResume() {
    if (!tailored) return
    const filename = `${stem}-${resumeLanguage}.docx`
    void downloadResumeDocx(tailored, resumeLanguage, filename)
    if (packet) void recordPacketExport(packet.id, { at: new Date().toISOString(), format: 'docx', filename })
  }

  function downloadResumePdf() {
    if (!tailored) return
    printResumeAsPdf(tailored, resumeLanguage)
    if (packet) void recordPacketExport(packet.id, { at: new Date().toISOString(), format: 'pdf' })
  }

  function downloadLetter() {
    const letter = state?.letter
    if (!letter) return
    const filename = `${stem}-cover-letter-${resumeLanguage}.txt`
    downloadText(filename, letter)
    if (packet) void recordPacketExport(packet.id, { at: new Date().toISOString(), format: 'txt', filename })
  }

  function downloadAll() {
    downloadResume()
    if (state?.letter) setTimeout(downloadLetter, 300)
  }

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

        {interrupted && (
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3" role="status">
            <p className="wrap-anywhere text-base text-ink">
              {t('packet.interrupted', { stage: t(stageLabel(interrupted)) })}
            </p>
            <div className="mt-2">
              <Button size="sm" variant="ghost" onClick={() => setInterrupted(null)}>
                {t('packet.interruptedDismiss')}
              </Button>
            </div>
          </div>
        )}

        <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-language">
          <h3 id="bundle-language" className="text-base font-semibold text-ink">{t('bundle.languagePrompt')}</h3>
          <p className="mt-1 text-sm text-faint">{t('bundle.languageIndependent')}</p>
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="bundle-language">
            {(['en', 'de'] as const).map((language) => {
              const selected = resumeLanguage === language
              const suggested = suggestedLanguage === language
              const done = Boolean(packet?.languages[language]?.baseline)
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
                  <span className="mt-0.5 text-xs leading-tight text-muted">
                    {done ? t('bundle.languageReady') : suggested ? t('bundle.suggested') : ''}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => void runTailoring(resumeLanguage)}
              disabled={tailoringLanguage !== null || improving || aiBlocked}
            >
              {tailoringLanguage === resumeLanguage ? (
                <Spinner label={t('bundle.generatingResume')} />
              ) : state?.mode === 'ai' ? (
                t('common.regenerate')
              ) : (
                t('bundle.generateResume')
              )}
            </Button>
            {/* v2.4.3: the zero-token path, always available, never gated on a key. */}
            <Button
              variant="ghost"
              onClick={() => void runDeterministicTailoring(resumeLanguage)}
              disabled={tailoringLanguage !== null || improving}
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

        {state?.coverage && (
          <CoveragePanel
            coverage={state.coverage}
            extraTermCount={Math.max(0, state.jdTerms.length - (state.coverage.covered.length + state.coverage.missing.length))}
            onImprove={() => void runTailoring(resumeLanguage, true)}
            improving={improving}
            disabled={tailoringLanguage !== null}
          />
        )}

        {state && state.unresolved.length > 0 && (
          <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-unresolved">
            <h3 id="bundle-unresolved" className="text-base font-semibold text-ink">
              {t('review.unresolvedTitle')}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {t('review.unresolvedIntro', { attempts: state.attempts ?? 1 })}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {state.unresolved.map((issue, index) => (
                <li key={`${issue.location}-${index}`} className="wrap-anywhere">
                  {t(UNRESOLVED_LABEL[issue.code] ?? 'review.unresolved.other', {
                    location: issue.location,
                    detail: issue.detail,
                  })}
                </li>
              ))}
            </ul>
          </section>
        )}

        {state?.baseline && state.mode === 'ai' && flags.tailoringReview && (
          <TailoringReview
            changes={state.changes}
            onDecision={(id, decision) => updateChanges(setDecision(state.changes, id, decision))}
            onEdit={(id, text) => updateChanges(setEditedText(state.changes, id, text))}
            onRestore={(id) => updateChanges(restoreChange(state.changes, id))}
            onAcceptAll={() => updateChanges(acceptAll(state.changes))}
          />
        )}

        {tailored && (
          <>
            <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-resume">
              <h3 id="bundle-resume" className="text-base font-semibold text-ink">
                {t('bundle.tailoredResume', { lang: resumeLanguage.toUpperCase() })}
              </h3>
              <div className="mt-2">
                <Badge tone={state?.mode === 'ai' ? 'accent' : 'neutral'}>
                  {state?.mode === 'ai' ? t('bundle.modeAi') : t('bundle.modeDeterministic')}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-faint">
                {state?.mode === 'ai' ? t('bundle.tailoredHint') : t('bundle.modeDeterministicHint')}
              </p>
              <p className="mt-3 text-base text-success">{t('bundle.resumeReady')}</p>

              <ul className="mt-3 flex list-none flex-wrap gap-1.5 p-0">
                <li>
                  <Badge tone={readiness.ready ? 'success' : 'outline'}>
                    {readiness.ready ? t('packet.readyYes') : t('packet.readyNo')}
                  </Badge>
                </li>
                {readiness.confirmationRequired > 0 && (
                  <li>
                    <Badge tone="outline">
                      {t('packet.needsConfirmation', { count: readiness.confirmationRequired })}
                    </Badge>
                  </li>
                )}
                {readiness.blocked > 0 && (
                  <li>
                    <Badge tone="danger">{t('packet.blockedCount', { count: readiness.blocked })}</Badge>
                  </li>
                )}
              </ul>

              {state && state.changeSummary.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-semibold text-ink">{t('bundle.changeSummary')}</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                    {state.changeSummary.map((change, index) => (
                      <li key={`${index}-${change}`} className="wrap-anywhere">{change}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={downloadResume}>{t('bundle.downloadDocx')}</Button>
                <Button variant="ghost" size="sm" onClick={downloadResumePdf}>{t('bundle.printPdf')}</Button>
              </div>
              <p className="mt-2 text-sm text-faint">{t('bundle.docxDefaultHint')}</p>

              {!state?.reviewedAt && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void mutate((row) => {
                        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                        row.languages[resumeLanguage] = { ...previous, reviewedAt: new Date().toISOString() }
                      })
                    }
                  >
                    {t('packet.markReviewed')}
                  </Button>
                </div>
              )}
            </section>

            <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-salary">
              <h3 id="bundle-salary" className="text-base font-semibold text-ink">{t('bundle.salary')}</h3>
              {salaryBusy ? (
                <div className="mt-2"><Spinner label={t('bundle.checkingBenchmark')} /></div>
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
                <h3 id="bundle-letter" className="text-base font-semibold text-ink">{t('drawer.coverLetter')}</h3>
                <Button size="sm" onClick={() => void makeLetter()} disabled={letterBusy}>
                  {letterBusy ? (
                    <Spinner label={t('common.drafting')} />
                  ) : state?.letter ? (
                    t('common.regenerate')
                  ) : (
                    t('bundle.draft')
                  )}
                </Button>
              </div>

              <fieldset className="mt-3 border-0 p-0">
                <legend className="mb-1 text-sm font-medium text-ink">{t('letter.toneLabel')}</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('letter.toneLabel')}>
                  {LETTER_TONES.map((tone) => {
                    const selected = (state?.letterTone ?? DEFAULT_LETTER_TONE) === tone
                    return (
                      <button
                        key={tone}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() =>
                          void mutate((row) => {
                            const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                            row.languages[resumeLanguage] = { ...previous, letterTone: tone }
                          })
                        }
                        className={`min-h-tap rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                          selected
                            ? 'border-accent bg-accent-tint text-accent'
                            : 'border-border bg-surface text-ink hover:bg-surface-2'
                        }`}
                      >
                        {t(TONE_LABEL[tone])}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {letterError && <div className="mt-2"><ErrorNotice error={letterError} /></div>}

              {state?.letter && (
                <div className="mt-3">
                  <label className="block" htmlFor="bundle-letter-text">
                    <span className="sr-only">{t('drawer.coverLetter')}</span>
                    <textarea
                      id="bundle-letter-text"
                      className="h-48 w-full rounded-md border border-border bg-surface p-3 text-base text-ink outline-none focus:border-accent"
                      value={state.letter}
                      onChange={(event) => {
                        const value = event.target.value
                        void mutate((row) => {
                          const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                          row.languages[resumeLanguage] = { ...previous, letter: value }
                        })
                      }}
                    />
                  </label>
                  <div className="mt-2">
                    <Button variant="ghost" size="sm" onClick={downloadLetter}>{t('bundle.downloadTxt')}</Button>
                  </div>
                </div>
              )}
            </section>

            <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-message">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="bundle-message" className="text-base font-semibold text-ink">{t('message.title')}</h3>
                <Button size="sm" variant="ghost" onClick={() => void makeShortMessage()} disabled={messageBusy}>
                  {messageBusy ? (
                    <Spinner label={t('common.drafting')} />
                  ) : state?.shortMessage ? (
                    t('common.regenerate')
                  ) : (
                    t('message.draft')
                  )}
                </Button>
              </div>
              <p className="mt-1 text-sm text-faint">{t('message.hint')}</p>
              {state?.shortMessage && (
                <label className="mt-3 block" htmlFor="bundle-message-text">
                  <span className="sr-only">{t('message.title')}</span>
                  <textarea
                    id="bundle-message-text"
                    className="h-32 w-full rounded-md border border-border bg-surface p-3 text-base text-ink outline-none focus:border-accent"
                    value={state.shortMessage}
                    onChange={(event) => {
                      const value = event.target.value
                      void mutate((row) => {
                        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                        row.languages[resumeLanguage] = { ...previous, shortMessage: value }
                      })
                    }}
                  />
                </label>
              )}
            </section>

            <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-notes">
              <h3 id="bundle-notes" className="text-base font-semibold text-ink">{t('packet.notes')}</h3>
              <label className="mt-2 block" htmlFor="bundle-notes-text">
                <span className="sr-only">{t('packet.notes')}</span>
                <textarea
                  id="bundle-notes-text"
                  className="h-24 w-full rounded-md border border-border bg-surface p-3 text-base text-ink outline-none focus:border-accent"
                  value={packet?.notes ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    void mutate((row) => {
                      row.notes = value
                    })
                  }}
                />
              </label>
              <p className="mt-2 text-sm text-faint">{t('packet.autosave')}</p>
              {packet && packet.exportHistory.length > 0 && (
                <p className="mt-2 text-sm text-muted">
                  {t('packet.lastExport', {
                    format: packet.exportHistory[0].format.toUpperCase(),
                    when: new Date(packet.exportHistory[0].at).toLocaleString(),
                  })}
                </p>
              )}
            </section>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="accent" onClick={downloadAll}>{t('bundle.downloadPacket')}</Button>
              <span className="text-sm text-faint">
                {state?.letter ? t('bundle.packetNoteWithLetter') : t('bundle.packetNote')}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function stageLabel(stage: string): TranslationKey {
  if (stage === 'letter') return 'packet.stage.letter'
  if (stage === 'message') return 'packet.stage.message'
  return 'packet.stage.resume'
}