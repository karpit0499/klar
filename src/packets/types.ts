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
import type {
  RecruiterApplicationState,
  RecruiterMessageChannel,
  RecruiterMessageStyle,
  WritingCheck,
} from '../llm/coverLetter'
import type { CoverLetterDetails } from '../application/coverLetterDocx'
import { summarizeChanges } from '../resume/changeSet'

export type PacketKind = 'career' | 'flexible'

export type PacketFormatVersions = {
  packetSchema: string
  contentSchema: string
  writingPromptSchema: string
  resumeExporter: string
  coverLetterExporter: string
  archiveExporter: string
}

/** Row-level v2.6 storage and exporter defaults. Mixed-language artifact
 * provenance lives on each PacketLanguageState and each export record; a
 * legacy row is never globally relabelled just because one artifact changes.
 */
export const CURRENT_PACKET_FORMAT_VERSIONS: PacketFormatVersions = Object.freeze({
  packetSchema: 'klar-packet-v1',
  contentSchema: 'klar-application-content-v1',
  writingPromptSchema: 'klar-writing-v2.6.0',
  resumeExporter: 'klar-resume-docx-v2.6.0.1',
  coverLetterExporter: 'klar-cover-letter-docx-v1',
  archiveExporter: 'klar-application-packet-zip-v1',
})

export const LEGACY_PACKET_FORMAT_VERSIONS: PacketFormatVersions = Object.freeze({
  packetSchema: 'historical:unversioned',
  contentSchema: 'historical:unversioned',
  writingPromptSchema: 'historical:unversioned',
  resumeExporter: 'historical:unversioned',
  coverLetterExporter: 'historical:unversioned',
  archiveExporter: 'historical:unversioned',
})

export const ARTIFACT_GENERATOR_CONTRACTS = Object.freeze({
  aiResume: 'klar-ai-resume-v2.6.0',
  deterministicResume: 'klar-deterministic-resume-v2.6.0',
  coverLetter: 'klar-writing-cover-letter-v2.6.0',
  reviewedCoverLetter: 'klar-reviewed-cover-letter-body-v2.6.0',
  recruiterMessage: 'klar-writing-recruiter-message-v2.6.0',
  reviewedRecruiterMessage: 'klar-reviewed-recruiter-message-v2.6.0',
})

export type PacketArtifactProvenance = {
  packetSchema: string
  contentSchema: string
  generatorContract: string
}

export function currentArtifactProvenance(
  generatorContract: string,
): PacketArtifactProvenance {
  return {
    packetSchema: CURRENT_PACKET_FORMAT_VERSIONS.packetSchema,
    contentSchema: CURRENT_PACKET_FORMAT_VERSIONS.contentSchema,
    generatorContract,
  }
}

export const LEGACY_ARTIFACT_PROVENANCE: PacketArtifactProvenance = Object.freeze({
  packetSchema: 'historical:unversioned',
  contentSchema: 'historical:unversioned',
  generatorContract: 'historical:unversioned',
})

/**
 * A semantic cover-letter exporter may consume only body text created under
 * the current body-only prompt or explicitly reviewed against that contract.
 * Merely loading or editing a historical value never upgrades its provenance.
 */
export function isCurrentCoverLetterProvenance(
  provenance: PacketArtifactProvenance | undefined,
): provenance is PacketArtifactProvenance {
  if (!provenance) return false
  const generatorCurrent =
    provenance.generatorContract === ARTIFACT_GENERATOR_CONTRACTS.coverLetter ||
    provenance.generatorContract === ARTIFACT_GENERATOR_CONTRACTS.reviewedCoverLetter
  return (
    provenance.packetSchema === CURRENT_PACKET_FORMAT_VERSIONS.packetSchema &&
    provenance.contentSchema === CURRENT_PACKET_FORMAT_VERSIONS.contentSchema &&
    generatorCurrent
  )
}

export function requireCurrentCoverLetterProvenance(
  provenance: PacketArtifactProvenance | undefined,
): asserts provenance is PacketArtifactProvenance {
  if (!isCurrentCoverLetterProvenance(provenance)) {
    throw new TypeError(
      'Current v2.6 cover-letter provenance is required. Review the saved body-only text or regenerate the letter before export.',
    )
  }
}

/**
 * Editing a current AI body makes the saved text human-reviewed. Historical
 * provenance deliberately stays historical until the separate confirmation
 * action succeeds, so typing alone can never unlock semantic export.
 */
export function coverLetterProvenanceAfterManualEdit(
  provenance: PacketArtifactProvenance | undefined,
): PacketArtifactProvenance | undefined {
  if (!isCurrentCoverLetterProvenance(provenance)) return provenance
  return currentArtifactProvenance(ARTIFACT_GENERATOR_CONTRACTS.reviewedCoverLetter)
}

export function isCurrentRecruiterMessageProvenance(
  provenance: PacketArtifactProvenance | undefined,
): provenance is PacketArtifactProvenance {
  if (!provenance) return false
  const generatorCurrent =
    provenance.generatorContract === ARTIFACT_GENERATOR_CONTRACTS.recruiterMessage ||
    provenance.generatorContract ===
      ARTIFACT_GENERATOR_CONTRACTS.reviewedRecruiterMessage
  return (
    provenance.packetSchema === CURRENT_PACKET_FORMAT_VERSIONS.packetSchema &&
    provenance.contentSchema === CURRENT_PACKET_FORMAT_VERSIONS.contentSchema &&
    generatorCurrent
  )
}

/**
 * Manual edits to a current generated recruiter message create an explicit
 * human-reviewed artifact. Historical provenance remains historical, and the
 * message remains workspace-only rather than being silently added to exports.
 */
export function recruiterMessageProvenanceAfterManualEdit(
  provenance: PacketArtifactProvenance | undefined,
): PacketArtifactProvenance | undefined {
  if (!isCurrentRecruiterMessageProvenance(provenance)) return provenance
  return currentArtifactProvenance(
    ARTIFACT_GENERATOR_CONTRACTS.reviewedRecruiterMessage,
  )
}

export type PacketExport = {
  at: string
  format: 'docx' | 'pdf' | 'txt' | 'zip' | 'card'
  artifact: 'resume' | 'cover_letter' | 'packet'
  filename?: string
  /** Exact code path that produced this individual downloaded artifact. */
  exporterContract: string
  language?: ResumeLanguage
  /** Exact saved-content contracts consumed by this export, per artifact. */
  sourceArtifactProvenance: {
    resume?: PacketArtifactProvenance
    coverLetter?: PacketArtifactProvenance
  }
  formatVersions: PacketFormatVersions
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
  /** v2.5.5: exact input/engine fingerprint for honest cache freshness. */
  resumeCacheKey?: string
  letterCacheKey?: string
  messageCacheKey?: string
  generationStrategy?: 'whole' | 'chunked'
  aiUsage?: {
    estimatedTokens: number
    actualTokens?: number
    requests: number
    model?: string
  }
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
  letterDetails?: CoverLetterDetails
  shortMessage?: string
  messageStyle?: RecruiterMessageStyle
  messageApplicationState?: RecruiterApplicationState
  messageChannel?: RecruiterMessageChannel
  recruiterName?: string
  messageDiscoveryContext?: string
  messageReferralName?: string
  messageChecks?: WritingCheck[]
  /** Per-language provenance survives mixed historical/current packets. */
  artifactProvenance?: {
    resume?: PacketArtifactProvenance
    coverLetter?: PacketArtifactProvenance
    recruiterMessage?: PacketArtifactProvenance
  }
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
    formatVersions?: PacketFormatVersions
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
  formatVersions: PacketFormatVersions
  createdAt: string
  updatedAt: string
}

export function packetId(kind: PacketKind, jobId: string): string {
  return `${kind}:${jobId}`
}

export function emptyLanguageState(tone: LetterTone = 'balanced'): PacketLanguageState {
  return {
    changes: [],
    changeSummary: [],
    jdTerms: [],
    unresolved: [],
    letterTone: tone,
    messageStyle: 'conversational',
    messageApplicationState: 'not_applied',
    messageChannel: 'linkedin',
  }
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
    formatVersions: { ...CURRENT_PACKET_FORMAT_VERSIONS },
    createdAt: now,
    updatedAt: now,
  }
}

/** Label pre-v2.6 rows without rewriting their historical artifacts. */
export function normalizePacketFormatVersions(row: PacketRow): PacketRow {
  const formatVersions = row.formatVersions ?? LEGACY_PACKET_FORMAT_VERSIONS
  const exportHistory = (row.exportHistory ?? []).map((entry) => ({
    ...entry,
    artifact: entry.artifact ?? 'packet',
    exporterContract: entry.exporterContract ?? 'historical:unversioned',
    sourceArtifactProvenance: entry.sourceArtifactProvenance ?? {},
    formatVersions: entry.formatVersions ?? { ...LEGACY_PACKET_FORMAT_VERSIONS },
  }))
  return {
    ...row,
    formatVersions: { ...formatVersions },
    exportHistory,
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