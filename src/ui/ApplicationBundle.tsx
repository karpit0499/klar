// ============================================================================
// v2.6 — the application packet workspace.
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
//   4. semantic DOCX letter plus contract-checked recruiter outreach
//   5. download — editable DOCX files only inside a single packet ZIP
//
// Everything the person does is autosaved through src/packets/store.ts, so a
// reload, a crash or a closed tab loses nothing.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Field, Spinner, TextInput } from './atoms'
import { useScrollLock } from './useScrollLock'
import { CoveragePanel } from './CoveragePanel'
import { TailoringReview } from './TailoringReview'
import type { MatchResult, NormalizedJob, Region } from '../types'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import { pickLanguage, tailorResume } from '../resume/tailor'
import {
  acceptAll, applyChanges, restoreChange, setDecision, setEditedText, type ChangeRecord,
} from '../resume/changeSet'
import {
  deriveTailoringChangeSummary,
  estimateTailoringRequest,
  tailorResumeWithAi,
} from '../llm/tailorResume'
import { canAfford, loadBudget } from '../llm/budget'
import { extractJdRequirements } from '../llm/jdTerms'
import { loadAppFlags, DEFAULT_APP_FLAGS, type AppFlags } from '../lib/appFlags'
import { printResumeAsPdf } from '../resume/pdf'
import { fetchSalaryBenchmark, salaryExpectationLine } from '../salary/adzuna'
import { loadAdzunaKey } from '../settings/adzunaKey'
import { getActiveRegion } from '../regions'
import {
  checkRecruiterMessage,
  draftCoverLetter,
  draftRecruiterMessage,
  DEFAULT_LETTER_TONE,
  LETTER_TONES,
  RECRUITER_MESSAGE_STYLES,
  type LetterTone,
  type RecruiterApplicationState,
  type RecruiterMessageChannel,
  type RecruiterMessageContext,
  type RecruiterMessageStyle,
} from '../llm/coverLetter'
import {
  ARTIFACT_GENERATOR_CONTRACTS,
  coverLetterProvenanceAfterManualEdit,
  currentArtifactProvenance,
  emptyLanguageState,
  isCurrentCoverLetterProvenance,
  packetReadiness,
  recruiterMessageProvenanceAfterManualEdit,
  type PacketLanguageState,
  type PacketRow,
} from '../packets/types'
import {
  beginGeneration, endGeneration, openPacket, pushPacketVersion, recordPacketExport, updatePacket,
} from '../packets/store'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'
import { ErrorNotice } from './ErrorNotice'
import { toAppError, type AppErrorData } from '../errors/appError'
import { BudgetNotice } from './BudgetNotice'
import { generationCacheKey } from '../packets/cache'
import { loadEngineSettings } from '../llm/provider'
import {
  createCoverLetterModel,
  downloadCoverLetterDocx,
  localCalendarDateIso,
  validateCoverLetterModel,
} from '../application/coverLetterDocx'
import { recordOperationalEvent } from '../observability/events'

function fileStem(job: NormalizedJob, resume: ResumeData): string {
  const raw = `klar-${resume.contact.name}-${job.company}-${job.title}`
  return (
    raw.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) ||
    'klar-application'
  )
}

function mergeUsage(
  previous: PacketLanguageState['aiUsage'],
  next: PacketLanguageState['aiUsage'],
): PacketLanguageState['aiUsage'] {
  if (!next) return previous
  if (!previous) return next
  return {
    estimatedTokens: previous.estimatedTokens + next.estimatedTokens,
    actualTokens:
      previous.actualTokens != null && next.actualTokens != null
        ? previous.actualTokens + next.actualTokens
        : undefined,
    requests: previous.requests + next.requests,
    model: next.model ?? previous.model,
  }
}

function matchContext(match?: MatchResult): unknown {
  return match
    ? {
        matchedSkills: match.matchedSkills,
        missingSkills: match.missingSkills,
        rationale: match.rationale,
      }
    : null
}

const TONE_LABEL: Record<LetterTone, TranslationKey> = {
  concise: 'letter.tone.concise',
  balanced: 'letter.tone.balanced',
  formal: 'letter.tone.formal',
}

const MESSAGE_STYLE_LABEL: Record<RecruiterMessageStyle, string> = {
  conversational: 'Conversational',
  formal: 'Formal',
  concise: 'Concise',
}

const APPLICATION_STATE_LABEL: Record<RecruiterApplicationState, string> = {
  not_applied: 'Not yet applied',
  applied: 'Applied',
  referred: 'Referred or introduced',
}

const MESSAGE_CHANNEL_LABEL: Record<RecruiterMessageChannel, string> = {
  linkedin: 'LinkedIn',
  email: 'Email',
  other: 'Other',
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
  const [exportError, setExportError] = useState<AppErrorData | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [salaryLine, setSalaryLine] = useState<string | null>(null)
  const [salaryBusy, setSalaryBusy] = useState(true)
  const [hasSalaryKey, setHasSalaryKey] = useState(false)
  const [interrupted, setInterrupted] = useState<string | null>(null)
  // v2.4.3 pre-flight: what the AI request would cost, and whether it can run.
  const [affordable, setAffordable] = useState<{
    ok: boolean
    billed: number
    limit: number
    reason?: 'exceeds_budget' | 'no_headroom_now'
    retryAfterMs?: number
    cost: ReturnType<typeof estimateTailoringRequest>['cost']
  } | null>(null)
  const [budgetWaitMs, setBudgetWaitMs] = useState(0)
  const [chunkProgress, setChunkProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [cacheFresh, setCacheFresh] = useState<boolean | null>(null)

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
        const budget = await loadBudget()
        const verdict = canAfford(request.cost, budget)
        if (!alive) return
        setAffordable({
          ok: verdict.ok,
          billed: request.cost.billedTokens,
          limit: budget.tpm,
          reason: verdict.ok ? undefined : verdict.reason,
          retryAfterMs: !verdict.ok && verdict.reason === 'no_headroom_now'
            ? verdict.retryAfterMs
            : undefined,
          cost: request.cost,
        })
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
  useEffect(() => {
    let alive = true
    const hasGeneratedArtifact =
      (state?.baseline != null && state.mode === 'ai') ||
      Boolean(state?.letter) ||
      Boolean(state?.shortMessage)
    if (!state || !hasGeneratedArtifact) {
      setCacheFresh(null)
      return () => {
        alive = false
      }
    }
    void loadEngineSettings().then((engine) => {
      const current = generationCacheKey({
        kind: 'resume',
        source: resume,
        job,
        language: resumeLanguage,
        engine,
        jdTerms: state.jdTerms,
      })
      const resumeCurrent =
        state.mode !== 'ai' ||
        !state.baseline ||
        Boolean(state.resumeCacheKey && state.resumeCacheKey === current)
      const letterCurrent =
        !state.letter ||
        state.letterCacheKey === generationCacheKey({
          kind: 'letter',
          source: resume,
          job,
          language: resumeLanguage,
          engine,
          jdTerms: state.jdTerms,
          variant: state.letterTone,
          context: matchContext(match),
        })
      const messageCurrent =
        !state.shortMessage ||
        state.messageCacheKey === generationCacheKey({
          kind: 'message',
          source: resume,
          job,
          language: resumeLanguage,
          engine,
          jdTerms: state.jdTerms,
          variant: state.messageStyle ?? 'conversational',
          context: {
            applicationState: state.messageApplicationState ?? 'not_applied',
            channel: state.messageChannel ?? 'linkedin',
            recruiterName: state.recruiterName?.trim() || null,
            discoveryContext: state.messageDiscoveryContext?.trim() || null,
            referralName: state.messageReferralName?.trim() || null,
          },
        })
      if (alive) setCacheFresh(resumeCurrent && letterCurrent && messageCurrent)
    })
    return () => {
      alive = false
    }
  }, [
    job,
    match,
    resume,
    resumeLanguage,
    state?.baseline,
    state?.jdTerms,
    state?.letter,
    state?.letterCacheKey,
    state?.letterTone,
    state?.messageCacheKey,
    state?.messageApplicationState,
    state?.messageChannel,
    state?.messageDiscoveryContext,
    state?.messageReferralName,
    state?.messageStyle,
    state?.mode,
    state?.recruiterName,
    state?.resumeCacheKey,
    state?.shortMessage,
  ])
  const changeSummary = useMemo(
    () => state ? deriveTailoringChangeSummary(state.changes, resumeLanguage) : [],
    [state, resumeLanguage],
  )

  const tailored = useMemo(() => {
    if (!state?.baseline || !state.source) return null
    return applyChanges(state.baseline, state.source, state.changes)
  }, [state])

  const messageContext = useMemo<RecruiterMessageContext>(() => ({
    style: state?.messageStyle ?? 'conversational',
    applicationState: state?.messageApplicationState ?? 'not_applied',
    channel: state?.messageChannel ?? 'linkedin',
    recruiterName: state?.recruiterName?.trim() || undefined,
    discoveryContext: state?.messageDiscoveryContext?.trim() || undefined,
    referralName: state?.messageReferralName?.trim() || undefined,
    signOffName: resume.contact.name,
  }), [
    resume.contact.name,
    state?.messageApplicationState,
    state?.messageChannel,
    state?.messageDiscoveryContext,
    state?.messageReferralName,
    state?.messageStyle,
    state?.recruiterName,
  ])

  const letterModel = useMemo(() => {
    if (!state?.letter?.trim()) return null
    return createCoverLetterModel({
      body: state.letter,
      resume,
      job,
      language: resumeLanguage,
      details: state.letterDetails,
    })
  }, [job, resume, resumeLanguage, state?.letter, state?.letterDetails])

  const letterDocumentChecks = useMemo(
    () => letterModel ? validateCoverLetterModel(letterModel) : [],
    [letterModel],
  )
  const letterProvenance = state?.artifactProvenance?.coverLetter
  const letterProvenanceCurrent = isCurrentCoverLetterProvenance(letterProvenance)
  const letterBodyChecksReady = Boolean(
    letterModel &&
    letterDocumentChecks.every((check) => check.severity !== 'error' || check.ok),
  )
  const letterExportReady = Boolean(
    letterBodyChecksReady && letterProvenanceCurrent,
  )
  const letterNeedsMigration = Boolean(state?.letter?.trim() && !letterProvenanceCurrent)

  const messageChecks = useMemo(
    () => state?.shortMessage?.trim()
      ? checkRecruiterMessage(
          state.shortMessage,
          resume,
          job,
          messageContext,
          resumeLanguage,
        )
      : [],
    [job, messageContext, resume, resumeLanguage, state?.shortMessage],
  )
  const messagePrerequisitesReady =
    messageContext.applicationState !== 'referred' ||
    Boolean(messageContext.referralName)

  const stem = fileStem(job, resume)
  const aiBlocked = affordable?.reason === 'exceeds_budget' && !flags.tailoringChunking

  async function runTailoring(language: ResumeLanguage, focusMissing = false) {
    // Opening the persistent packet is asynchronous. Never spend tokens before
    // there is a row in which the result can be saved.
    if (!packet) return
    setTailoringError(null)
    if (focusMissing) setImproving(true)
    else setTailoringLanguage(language)
    setChunkProgress(null)
    setBudgetWaitMs(0)
    try {
      const key = apiKey ?? (await requireGroq(t('bundle.generateResume')))
      if (!key) return
      await beginGeneration(packet.id, { stage: 'resume', language, startedAt: new Date().toISOString() })

      const extracted = flags.jdRequirementExtractor
        ? await extractJdRequirements(job, key, { force: focusMissing })
        : { terms: [] as string[] }

      const engine = await loadEngineSettings()
      const cacheKey = generationCacheKey({
        kind: 'resume',
        source: resume,
        job,
        language,
        engine,
        jdTerms: extracted.terms,
      })
      const result = await tailorResumeWithAi(resume, job, key, language, {
        jdTerms: extracted.terms,
        allowChunking: flags.tailoringChunking,
        onProgress: setChunkProgress,
        onBudgetWait: setBudgetWaitMs,
      })

      if (state?.baseline) await pushPacketVersion(packet.id, `regenerate-${language}`)
      await mutate((row) => {
        const previous = row.languages[language] ?? emptyLanguageState()
        row.languages[language] = {
          ...previous,
          mode: 'ai',
          resumeCacheKey: cacheKey,
          generationStrategy: result.strategy,
          aiUsage: mergeUsage(previous.aiUsage, result.usage),
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
          artifactProvenance: {
            ...previous.artifactProvenance,
            resume: currentArtifactProvenance(ARTIFACT_GENERATOR_CONTRACTS.aiResume),
          },
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
      await endGeneration(packet.id)
    } finally {
      setTailoringLanguage(null)
      setImproving(false)
      setChunkProgress(null)
      setBudgetWaitMs(0)
    }
  }

  async function makeLetter() {
    if (!packet) return
    setLetterError(null)
    setLetterBusy(true)
    try {
      const key = apiKey ?? (await requireGroq(t('bundle.draft')))
      if (!key) return
      const engine = await loadEngineSettings()
      const cacheKey = generationCacheKey({
        kind: 'letter',
        source: resume,
        job,
        language: resumeLanguage,
        engine,
        jdTerms: state?.jdTerms,
        variant: state?.letterTone ?? DEFAULT_LETTER_TONE,
        context: matchContext(match),
      })
      let usage: { estimatedTokens: number; actualTokens?: number; requests: number; model?: string } | undefined
      if (packet) await beginGeneration(packet.id, { stage: 'letter', language: resumeLanguage, startedAt: new Date().toISOString() })
      const text = await draftCoverLetter(resume, job, key, {
        language: resumeLanguage,
        tone: state?.letterTone ?? DEFAULT_LETTER_TONE,
        jdTerms: state?.jdTerms ?? [],
        match,
        onBudgetWait: setBudgetWaitMs,
        onUsage: (event) => {
          usage = {
            estimatedTokens: event.estimated.billedTokens,
            actualTokens: event.actualTokens,
            requests: 1,
            model: event.model,
          }
        },
      })
      await mutate((row) => {
        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
        row.languages[resumeLanguage] = {
          ...previous,
          letter: text,
          letterCacheKey: cacheKey,
          letterDetails: previous.letterDetails ?? {
            dateIso: localCalendarDateIso(),
            place: resume.contact.location?.split(',')[0]?.trim(),
          },
          artifactProvenance: {
            ...previous.artifactProvenance,
            coverLetter: currentArtifactProvenance(
              ARTIFACT_GENERATOR_CONTRACTS.coverLetter,
            ),
          },
          aiUsage: mergeUsage(previous.aiUsage, usage),
        }
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
      setBudgetWaitMs(0)
    }
  }

  async function makeShortMessage() {
    if (!packet) return
    setLetterError(null)
    setMessageBusy(true)
    try {
      const key = apiKey ?? (await requireGroq(t('message.draft')))
      if (!key) return
      const engine = await loadEngineSettings()
      const cacheKey = generationCacheKey({
        kind: 'message',
        source: resume,
        job,
        language: resumeLanguage,
        engine,
        jdTerms: state?.jdTerms,
        variant: messageContext.style,
        context: {
          applicationState: messageContext.applicationState,
          channel: messageContext.channel,
          recruiterName: messageContext.recruiterName ?? null,
          discoveryContext: messageContext.discoveryContext ?? null,
          referralName: messageContext.referralName ?? null,
        },
      })
      let usage: { estimatedTokens: number; actualTokens?: number; requests: number; model?: string } | undefined
      if (packet) await beginGeneration(packet.id, { stage: 'message', language: resumeLanguage, startedAt: new Date().toISOString() })
      const text = await draftRecruiterMessage(resume, job, key, messageContext, {
        language: resumeLanguage,
        jdTerms: state?.jdTerms ?? [],
        onBudgetWait: setBudgetWaitMs,
        onUsage: (event) => {
          usage = {
            estimatedTokens: event.estimated.billedTokens,
            actualTokens: event.actualTokens,
            requests: 1,
            model: event.model,
          }
        },
      })
      await mutate((row) => {
        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
        row.languages[resumeLanguage] = {
          ...previous,
          shortMessage: text,
          messageCacheKey: cacheKey,
          messageStyle: messageContext.style,
          messageApplicationState: messageContext.applicationState,
          messageChannel: messageContext.channel,
          recruiterName: messageContext.recruiterName,
          messageDiscoveryContext: messageContext.discoveryContext,
          messageReferralName: messageContext.referralName,
          messageChecks: checkRecruiterMessage(
            text,
            resume,
            job,
            messageContext,
            resumeLanguage,
          ),
          artifactProvenance: {
            ...previous.artifactProvenance,
            recruiterMessage: currentArtifactProvenance(
              ARTIFACT_GENERATOR_CONTRACTS.recruiterMessage,
            ),
          },
          aiUsage: mergeUsage(previous.aiUsage, usage),
        }
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
      setBudgetWaitMs(0)
    }
  }

  async function approveHistoricalLetterBody() {
    if (!packet || !letterModel || !letterBodyChecksReady || letterProvenanceCurrent) return
    await pushPacketVersion(packet.id, `before-cover-letter-review-${resumeLanguage}`)
    await mutate((row) => {
      const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
      row.languages[resumeLanguage] = {
        ...previous,
        artifactProvenance: {
          ...previous.artifactProvenance,
          coverLetter: currentArtifactProvenance(
            ARTIFACT_GENERATOR_CONTRACTS.reviewedCoverLetter,
          ),
        },
      }
    })
  }

  /**
   * v2.4.3 · The zero-token path. `tailorResume()` reorders the person's own
   * bullets and skills toward the posting and writes an honest summary — no key,
   * no tokens, no rewriting. Stored with an EMPTY change list, because nothing
   * was rewritten and there is therefore nothing to review.
   */
  async function runDeterministicTailoring(language: ResumeLanguage) {
    if (!packet) return
    setTailoringError(null)
    const result = tailorResume(resume, { ...job, language })
    if (state?.baseline) await pushPacketVersion(packet.id, `no-ai-${language}`)
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
        artifactProvenance: {
          ...previous.artifactProvenance,
          resume: currentArtifactProvenance(
            ARTIFACT_GENERATOR_CONTRACTS.deterministicResume,
          ),
        },
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

  async function downloadResume() {
    if (!tailored || !readiness.ready) return
    setExportError(null)
    try {
      const { downloadResumeDocx } = await import('../resume/docx')
      const filename = `${stem}-${resumeLanguage}.docx`
      await downloadResumeDocx(tailored, resumeLanguage, filename)
      if (packet) await recordPacketExport(packet.id, {
        at: new Date().toISOString(),
        format: 'docx',
        artifact: 'resume',
        language: resumeLanguage,
        filename,
      })
    } catch (error) {
      void recordOperationalEvent({
        name: 'export_failure',
        outcome: 'error',
        documentKind: 'resume',
      }).catch(() => undefined)
      setExportError(toAppError(error, {
        category: 'export',
        message: 'Klar could not prepare the résumé download.',
        dataSafe: true,
        available: 'The tailored résumé and application packet remain saved.',
        action: { label: 'Try the download again', kind: 'retry' },
      }))
    }
  }

  async function downloadResumePdf() {
    if (!tailored || !readiness.ready) return
    setExportError(null)
    try {
      printResumeAsPdf(tailored, resumeLanguage)
      if (packet) await recordPacketExport(packet.id, {
        at: new Date().toISOString(),
        format: 'pdf',
        artifact: 'resume',
        language: resumeLanguage,
      })
    } catch (error) {
      void recordOperationalEvent({
        name: 'export_failure',
        outcome: 'error',
        documentKind: 'resume',
      }).catch(() => undefined)
      setExportError(toAppError(error, {
        category: 'export',
        message: 'Klar could not prepare the résumé PDF.',
        dataSafe: true,
        available: 'The tailored résumé and application packet remain saved.',
        action: { label: 'Try the PDF again', kind: 'retry' },
      }))
    }
  }

  async function downloadLetter() {
    if (!letterModel || !letterExportReady || !isCurrentCoverLetterProvenance(letterProvenance)) return
    setExportError(null)
    try {
      const filename = await downloadCoverLetterDocx(letterModel, letterProvenance, job)
      if (packet) await recordPacketExport(packet.id, {
        at: new Date().toISOString(),
        format: 'docx',
        artifact: 'cover_letter',
        language: resumeLanguage,
        filename,
      })
    } catch (error) {
      void recordOperationalEvent({
        name: 'export_failure',
        outcome: 'error',
        documentKind: 'cover_letter',
      }).catch(() => undefined)
      setExportError(toAppError(error, {
        category: 'export',
        message: 'Klar could not prepare the cover-letter download.',
        dataSafe: true,
        available: 'The cover letter remains saved in this packet.',
        action: { label: 'Try the download again', kind: 'retry' },
      }))
    }
  }

  async function downloadAll() {
    if (
      !tailored ||
      !letterModel ||
      !letterExportReady ||
      !isCurrentCoverLetterProvenance(letterProvenance) ||
      !readiness.ready ||
      exportBusy
    ) return
    setExportBusy(true)
    setExportError(null)
    try {
      const { downloadApplicationPacket } = await import('../packets/download')
      const filename = await downloadApplicationPacket(
        tailored,
        resumeLanguage,
        stem,
        letterModel,
        letterProvenance,
        job,
      )
      if (packet) await recordPacketExport(packet.id, {
        at: new Date().toISOString(),
        format: 'zip',
        artifact: 'packet',
        language: resumeLanguage,
        filename,
      })
    } catch (error) {
      void recordOperationalEvent({
        name: 'export_failure',
        outcome: 'error',
        documentKind: 'packet',
      }).catch(() => undefined)
      setExportError(toAppError(error, {
        category: 'export',
        message: 'Klar could not prepare the application packet download.',
        dataSafe: true,
        available: 'The tailored résumé, cover letter, and saved packet remain unchanged.',
        action: { label: 'Try the download again', kind: 'retry' },
      }))
    } finally {
      setExportBusy(false)
    }
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

          {affordable && (
            <div className="mt-3">
              <BudgetNotice pending={affordable.cost} waitingMs={budgetWaitMs || affordable.retryAfterMs} compact />
            </div>
          )}

          {affordable?.reason === 'exceeds_budget' && flags.tailoringChunking && (
            <p className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-sm text-muted" role="status">
              {t('bundle.willChunk', {
                tokens: affordable.billed.toLocaleString(),
                limit: affordable.limit.toLocaleString(),
              })}
            </p>
          )}

          {chunkProgress && (
            <p className="mt-3 text-sm text-muted" role="status" aria-live="polite">
              {chunkProgress.label} · {chunkProgress.done}/{chunkProgress.total}
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

        {cacheFresh != null && (
          <p
            className={`mt-3 rounded-md border border-border p-3 text-sm ${
              cacheFresh ? 'bg-surface-2 text-muted' : 'bg-surface-2 text-danger'
            }`}
            role="status"
          >
            {cacheFresh ? t('bundle.cacheFresh') : t('bundle.cacheStale')}
          </p>
        )}

        {state?.aiUsage && (
          <section className="mt-3 rounded-md border border-border bg-surface-2 p-3" aria-labelledby="bundle-ai-usage">
            <h3 id="bundle-ai-usage" className="text-sm font-semibold text-ink">{t('bundle.usageTitle')}</h3>
            <div className="mt-1 grid gap-1 text-sm text-muted">
              <p>{t('bundle.usageEstimated', { tokens: state.aiUsage.estimatedTokens.toLocaleString() })}</p>
              {state.aiUsage.actualTokens != null && (
                <p>{t('bundle.usageActual', { tokens: state.aiUsage.actualTokens.toLocaleString() })}</p>
              )}
              <p>{t('bundle.usageRequests', { count: state.aiUsage.requests })}</p>
              {state.aiUsage.model && <p>{t('bundle.usageModel', { model: state.aiUsage.model })}</p>}
              {state.generationStrategy && (
                <p>
                  {t(
                    state.generationStrategy === 'chunked'
                      ? 'bundle.usageChunked'
                      : 'bundle.usageWhole',
                  )}
                </p>
              )}
            </div>
          </section>
        )}

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

              {changeSummary.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-semibold text-ink">{t('bundle.changeSummary')}</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                    {changeSummary.map((change, index) => (
                      <li key={`${index}-${change}`} className="wrap-anywhere">{change}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!readiness.ready}
                  onClick={() => void downloadResume()}
                >
                  {t('bundle.downloadDocx')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!readiness.ready}
                  onClick={() => void downloadResumePdf()}
                >
                  {t('bundle.printPdf')}
                </Button>
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
                <Button size="sm" onClick={() => void makeLetter()} disabled={letterBusy || !packet}>
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

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label={resumeLanguage === 'de' ? 'Empfängername (optional)' : 'Recipient name (optional)'} htmlFor="bundle-letter-recipient">
                  <TextInput
                    id="bundle-letter-recipient"
                    value={state?.letterDetails?.recipientName ?? ''}
                    onChange={(event) => {
                      const recipientName = event.target.value
                      void mutate((row) => {
                        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                        row.languages[resumeLanguage] = {
                          ...previous,
                          letterDetails: {
                            ...previous.letterDetails,
                            recipientName,
                          },
                        }
                      })
                    }}
                  />
                </Field>
                <Field label={resumeLanguage === 'de' ? 'Ort' : 'Place'} htmlFor="bundle-letter-place">
                  <TextInput
                    id="bundle-letter-place"
                    value={state?.letterDetails?.place ?? resume.contact.location?.split(',')[0] ?? ''}
                    onChange={(event) => {
                      const place = event.target.value
                      void mutate((row) => {
                        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                        row.languages[resumeLanguage] = {
                          ...previous,
                          letterDetails: { ...previous.letterDetails, place },
                        }
                      })
                    }}
                  />
                </Field>
                <Field label={resumeLanguage === 'de' ? 'Empfängeradresse (optional)' : 'Recipient address (optional)'} htmlFor="bundle-letter-address">
                  <textarea
                    id="bundle-letter-address"
                    className="min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink outline-none focus:border-accent"
                    value={state?.letterDetails?.recipientAddress ?? ''}
                    placeholder={resumeLanguage === 'de'
                      ? 'Straße und Hausnummer\nPLZ Ort'
                      : 'Street and number\nPostal code and city'}
                    onChange={(event) => {
                      const recipientAddress = event.target.value
                      void mutate((row) => {
                        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                        row.languages[resumeLanguage] = {
                          ...previous,
                          letterDetails: {
                            ...previous.letterDetails,
                            recipientAddress,
                          },
                        }
                      })
                    }}
                  />
                </Field>
                <Field label={resumeLanguage === 'de' ? 'Datum' : 'Date'} htmlFor="bundle-letter-date">
                  <TextInput
                    id="bundle-letter-date"
                    type="date"
                    value={state?.letterDetails?.dateIso ?? localCalendarDateIso()}
                    onChange={(event) => {
                      const dateIso = event.target.value
                      void mutate((row) => {
                        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                        row.languages[resumeLanguage] = {
                          ...previous,
                          letterDetails: { ...previous.letterDetails, dateIso },
                        }
                      })
                    }}
                  />
                </Field>
              </div>

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
                          const editedProvenance = coverLetterProvenanceAfterManualEdit(
                            previous.artifactProvenance?.coverLetter,
                          )
                          row.languages[resumeLanguage] = {
                            ...previous,
                            letter: value,
                            ...(editedProvenance
                              ? {
                                  artifactProvenance: {
                                    ...previous.artifactProvenance,
                                    coverLetter: editedProvenance,
                                  },
                                }
                              : {}),
                          }
                        })
                      }}
                  />
                  </label>
                  {letterNeedsMigration && (
                    <div
                      className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-ink"
                      role="status"
                    >
                      <p>
                        {resumeLanguage === 'de'
                          ? 'Dieses gespeicherte Anschreiben stammt aus einem älteren Klar-Format. Der Text bleibt bearbeitbar, aber DOCX- und Paket-Export sind pausiert, damit Anrede, Adresse, Datum oder Grußformel nicht doppelt erscheinen.'
                          : 'This saved letter comes from an earlier Klar format. The text remains editable, but DOCX and packet export are paused so the greeting, address, date, or sign-off cannot be duplicated.'}
                      </p>
                      <p className="mt-2">
                        {resumeLanguage === 'de'
                          ? 'Entferne diese Rahmenelemente aus dem Text und bestätige dann den geprüften Fließtext – oder erstelle das Anschreiben oben neu.'
                          : 'Remove those wrapper elements from the text, then confirm the reviewed body below—or use Regenerate above.'}
                      </p>
                      <div className="mt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void approveHistoricalLetterBody()}
                          disabled={!letterBodyChecksReady}
                        >
                          {resumeLanguage === 'de'
                            ? 'Geprüften Fließtext bestätigen'
                            : 'Confirm reviewed body-only text'}
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2" aria-label={resumeLanguage === 'de' ? 'Dokumentprüfungen' : 'Document checks'}>
                    <Badge tone={letterProvenanceCurrent ? 'success' : 'danger'}>
                      <span
                        data-check-id="provenance"
                        data-check-ok={letterProvenanceCurrent ? 'true' : 'false'}
                      >
                        {letterProvenanceCurrent ? '✓' : '×'} {resumeLanguage === 'de'
                          ? (letterProvenanceCurrent ? 'Aktuelles Anschreibenformat' : 'Formatprüfung erforderlich')
                          : (letterProvenanceCurrent ? 'Current cover-letter format' : 'Format review required')}
                      </span>
                    </Badge>
                    {letterDocumentChecks.map((check) => (
                      <Badge key={check.id} tone={check.ok ? 'success' : check.severity === 'error' ? 'danger' : 'outline'}>
                        <span
                          data-check-id={check.id}
                          data-check-ok={check.ok ? 'true' : 'false'}
                        >
                          {check.ok ? '✓' : '×'} {check.detail}
                        </span>
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void downloadLetter()}
                      disabled={!letterExportReady}
                    >
                      {resumeLanguage === 'de' ? 'Anschreiben als DOCX herunterladen' : 'Download cover letter DOCX'}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="bundle-message">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="bundle-message" className="text-base font-semibold text-ink">{t('message.title')}</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void makeShortMessage()}
                  disabled={messageBusy || !messagePrerequisitesReady || !packet}
                >
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
              <fieldset className="mt-4 border-0 p-0">
                <legend className="mb-1 text-sm font-medium text-ink">
                  {resumeLanguage === 'de' ? 'Stil' : 'Style'}
                </legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {RECRUITER_MESSAGE_STYLES.map((style) => {
                    const selected = messageContext.style === style
                    const germanLabel: Record<RecruiterMessageStyle, string> = {
                      conversational: 'Natürlich',
                      formal: 'Förmlich',
                      concise: 'Knapp',
                    }
                    return (
                      <button
                        key={style}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => void mutate((row) => {
                          const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                          row.languages[resumeLanguage] = { ...previous, messageStyle: style }
                        })}
                        className={`min-h-tap rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                          selected
                            ? 'border-accent bg-accent-tint text-accent'
                            : 'border-border bg-surface text-ink hover:bg-surface-2'
                        }`}
                      >
                        {resumeLanguage === 'de' ? germanLabel[style] : MESSAGE_STYLE_LABEL[style]}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label={resumeLanguage === 'de' ? 'Bewerbungsstatus' : 'Application state'} htmlFor="bundle-message-state">
                  <select
                    id="bundle-message-state"
                    className="min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
                    value={messageContext.applicationState}
                    onChange={(event) => {
                      const messageApplicationState = event.target.value as RecruiterApplicationState
                      void mutate((row) => {
                        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                        row.languages[resumeLanguage] = { ...previous, messageApplicationState }
                      })
                    }}
                  >
                    {(Object.keys(APPLICATION_STATE_LABEL) as RecruiterApplicationState[]).map((value) => (
                      <option key={value} value={value}>
                        {resumeLanguage === 'de'
                          ? ({
                              not_applied: 'Noch nicht beworben',
                              applied: 'Beworben',
                              referred: 'Empfohlen oder vorgestellt',
                            } as const)[value]
                          : APPLICATION_STATE_LABEL[value]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={resumeLanguage === 'de' ? 'Kanal' : 'Channel'} htmlFor="bundle-message-channel">
                  <select
                    id="bundle-message-channel"
                    className="min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
                    value={messageContext.channel}
                    onChange={(event) => {
                      const messageChannel = event.target.value as RecruiterMessageChannel
                      void mutate((row) => {
                        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                        row.languages[resumeLanguage] = { ...previous, messageChannel }
                      })
                    }}
                  >
                    {(Object.keys(MESSAGE_CHANNEL_LABEL) as RecruiterMessageChannel[]).map((value) => (
                      <option key={value} value={value}>{MESSAGE_CHANNEL_LABEL[value]}</option>
                    ))}
                  </select>
                </Field>
                <Field label={resumeLanguage === 'de' ? 'Name der Kontaktperson (optional)' : 'Recruiter name (optional)'} htmlFor="bundle-message-recruiter">
                  <TextInput
                    id="bundle-message-recruiter"
                    value={state?.recruiterName ?? ''}
                    onChange={(event) => {
                      const recruiterName = event.target.value
                      void mutate((row) => {
                        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                        row.languages[resumeLanguage] = { ...previous, recruiterName }
                      })
                    }}
                  />
                </Field>
                <Field label={resumeLanguage === 'de' ? 'Wie du die Stelle gefunden hast (optional)' : 'How you found the role (optional)'} htmlFor="bundle-message-discovery">
                  <TextInput
                    id="bundle-message-discovery"
                    value={state?.messageDiscoveryContext ?? ''}
                    onChange={(event) => {
                      const messageDiscoveryContext = event.target.value
                      void mutate((row) => {
                        const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                        row.languages[resumeLanguage] = { ...previous, messageDiscoveryContext }
                      })
                    }}
                  />
                </Field>
                {messageContext.applicationState === 'referred' && (
                  <Field label={resumeLanguage === 'de' ? 'Name der empfehlenden Person' : 'Referrer or introducer name'} htmlFor="bundle-message-referrer">
                    <TextInput
                      id="bundle-message-referrer"
                      required
                      value={state?.messageReferralName ?? ''}
                      onChange={(event) => {
                        const messageReferralName = event.target.value
                        void mutate((row) => {
                          const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                          row.languages[resumeLanguage] = { ...previous, messageReferralName }
                        })
                      }}
                    />
                  </Field>
                )}
              </div>
              {!messagePrerequisitesReady && (
                <p className="mt-2 text-sm text-danger" role="status">
                  {resumeLanguage === 'de'
                    ? 'Gib den Namen der empfehlenden oder vorstellenden Person an, damit Klar keine Verbindung erfindet.'
                    : 'Enter the referrer or introducer name so Klar cannot invent the connection.'}
                </p>
              )}
              {state?.shortMessage && (
                <>
                  <label className="mt-3 block" htmlFor="bundle-message-text">
                    <span className="sr-only">{t('message.title')}</span>
                    <textarea
                      id="bundle-message-text"
                      className="h-44 w-full rounded-md border border-border bg-surface p-3 text-base text-ink outline-none focus:border-accent"
                      value={state.shortMessage}
                      onChange={(event) => {
                        const value = event.target.value
                        void mutate((row) => {
                          const previous = row.languages[resumeLanguage] ?? emptyLanguageState()
                          row.languages[resumeLanguage] = {
                            ...previous,
                            shortMessage: value,
                            messageChecks: checkRecruiterMessage(
                              value,
                              resume,
                              job,
                              messageContext,
                              resumeLanguage,
                            ),
                            artifactProvenance: {
                              ...previous.artifactProvenance,
                              recruiterMessage:
                                recruiterMessageProvenanceAfterManualEdit(
                                  previous.artifactProvenance?.recruiterMessage,
                                ),
                            },
                          }
                        })
                      }}
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2" aria-label={resumeLanguage === 'de' ? 'Nachrichtenprüfungen' : 'Message checks'}>
                    {messageChecks.map((check) => (
                      <Badge key={check.id} tone={check.ok ? 'success' : 'danger'}>
                        <span
                          data-check-id={check.id}
                          data-check-ok={check.ok ? 'true' : 'false'}
                        >
                          {check.ok ? '✓' : '×'} {check.detail}
                        </span>
                      </Badge>
                    ))}
                  </div>
                </>
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
              <Button
                variant="accent"
                onClick={() => void downloadAll()}
                disabled={exportBusy || !letterExportReady || !readiness.ready}
              >
                {exportBusy ? <Spinner label={t('bundle.downloadPacket')} /> : t('bundle.downloadPacket')}
              </Button>
              <span className="text-sm text-faint">
                {!readiness.ready
                  ? (resumeLanguage === 'de'
                      ? 'Lehne zuerst jede blockierte Lebenslaufänderung ab. Nicht belegte Formulierungen können nicht exportiert werden.'
                      : 'Reject every blocked résumé change first. Unsupported wording cannot be exported.')
                  : letterExportReady
                  ? t('bundle.packetNoteWithLetter')
                  : resumeLanguage === 'de'
                    ? 'Erstelle und prüfe zuerst das Anschreiben. Neue Pakete enthalten immer Lebenslauf und DOCX-Anschreiben.'
                    : 'Draft and pass the cover-letter checks first. Every new packet contains the résumé and a DOCX cover letter.'}
              </span>
            </div>
            {exportError && <div className="mt-3"><ErrorNotice error={exportError} /></div>}
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