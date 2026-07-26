// ============================================================================
// v2.5 — the application packet.
//
// A packet is everything Klar produced for ONE opportunity: the job snapshot,
// the tailored résumé and its review decisions, the letter, the short message,
// notes, readiness, export history and a bounded version history. It survives a
// reload, and it records an in-flight generation so an interrupted run can be
// recognised instead of silently lost.
//
// Two rules the shape enforces:
//   • Per-language state is INDEPENDENT (roadmap v2.5: "Independent bilingual
//     generation … separate review state"). EN and DE never share decisions.
//   • A flexible packet never requires a résumé. It carries a message, an
//     availability line and a status — nothing more.
// ============================================================================
import type { NormalizedJob } from '../types'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import type { ChangeRecord } from '../resume/changeSet'
import type { UnresolvedIssue } from '../llm/evidenceStatus'
import type { LetterTone } from '../llm/coverLetter'
import { summarizeChanges } from '../resume/changeSet'

export type PacketKind = 'career' | 'flexible'

export type PacketExport = {
  at: string
  format: 'docx' | 'pdf' | 'txt' | 'zip' | 'card'
  filename?: string
}

export type PacketCoverage = {
  summary: string
  covered: string[]
  missing: string[]
  ratio: number
}

export type PacketLanguageState = {
  /**
   * v2.4.3: which path produced this résumé. A deterministic reorder must never
   * be presented as an AI rewrite, so the mode is stored, not inferred.
   */
  mode?: 'ai' | 'deterministic'
  /** Deterministic tailoring with original sentences — the reject-all floor. */
  baseline?: ResumeData
  /** The normalized source the decisions replay against. */
  source?: ResumeData
  changes: ChangeRecord[]
  changeSummary: string[]
  coverage?: PacketCoverage
  jdTerms: string[]
  unresolved: UnresolvedIssue[]
  attempts?: number
  letter?: string
  letterTone: LetterTone
  shortMessage?: string
  reviewedAt?: string
  generatedAt?: string
}

export type PacketFlexibleState = {
  message?: string
  availability?: string
  /** Whether the person opened the employer's official route from Klar. */
  officialRouteOpenedAt?: string
}

export type PacketVersion = {
  at: string
  label: string
  snapshot: {
    notes: string
    languages: Partial<Record<ResumeLanguage, PacketLanguageState>>
    flexible?: PacketFlexibleState
  }
}

export type PacketGeneration = {
  stage: 'resume' | 'letter' | 'message'
  language?: ResumeLanguage
  startedAt: string
}

export type PacketRow = {
  /** `${kind}:${jobId}` — stable, so re-opening a job re-opens its packet. */
  id: string
  kind: PacketKind
  jobId: string
  job: NormalizedJob
  notes: string
  languages: Partial<Record<ResumeLanguage, PacketLanguageState>>
  flexible?: PacketFlexibleState
  exportHistory: PacketExport[]
  versions: PacketVersion[]
  generation?: PacketGeneration
  createdAt: string
  updatedAt: string
}

export function packetId(kind: PacketKind, jobId: string): string {
  return `${kind}:${jobId}`
}

export function emptyLanguageState(tone: LetterTone = 'balanced'): PacketLanguageState {
  return { changes: [], changeSummary: [], jdTerms: [], unresolved: [], letterTone: tone }
}

export function newPacket(kind: PacketKind, job: NormalizedJob): PacketRow {
  const now = new Date().toISOString()
  return {
    id: packetId(kind, job.id),
    kind,
    jobId: job.id,
    job,
    notes: '',
    languages: {},
    exportHistory: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
  }
}

export type PacketReadiness = {
  resume: boolean
  letter: boolean
  message: boolean
  reviewed: boolean
  blocked: number
  confirmationRequired: number
  /** Exportable = a résumé exists and nothing unsupported is still accepted. */
  ready: boolean
}

/** Pure readiness check for one language of a career packet. */
export function packetReadiness(
  packet: PacketRow | null,
  language: ResumeLanguage,
): PacketReadiness {
  const state = packet?.languages[language]
  const stats = summarizeChanges(state?.changes ?? [])
  const acceptedBlocked = (state?.changes ?? []).filter(
    (change) => change.decision === 'accepted' && change.finding.status === 'blocked',
  ).length
  const resume = Boolean(state?.baseline)
  return {
    resume,
    letter: Boolean(state?.letter?.trim()),
    message: Boolean(state?.shortMessage?.trim()),
    reviewed: Boolean(state?.reviewedAt),
    blocked: stats.blocked,
    confirmationRequired: stats.confirmationRequired,
    ready: resume && acceptedBlocked === 0,
  }
}

/** Pure readiness check for a flexible packet (no résumé is ever required). */
export function flexibleReadiness(packet: PacketRow | null): {
  message: boolean
  availability: boolean
  ready: boolean
} {
  const message = Boolean(packet?.flexible?.message?.trim())
  const availability = Boolean(packet?.flexible?.availability?.trim())
  return { message, availability, ready: message && availability }
}
