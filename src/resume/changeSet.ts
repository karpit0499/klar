// ============================================================================
// v2.5 · C1 — the reviewable change set.
//
// The roadmap's v2.5 exit criterion is "users can understand and REVERSE every
// change". That is only possible if tailoring produces a list of discrete,
// addressable edits instead of one opaque new document. This module is that
// list, plus the pure function that replays it.
//
//   proposeChanges(...)  → ChangeRecord[]   (built once, right after generation)
//   applyChanges(...)    → ResumeData       (replayed on every accept/reject)
//
// Nothing here talks to a model or a database, so the whole review mechanic is
// unit-testable offline. Reason codes are machine values, translated in the UI,
// which keeps DE/EN parity a compile-time guarantee.
// ============================================================================
import type { ResumeBullet, ResumeData } from './types'
import { containsTerm } from './keywords'
import type { EvidenceFinding, FactualStatus } from '../llm/evidenceStatus'
import { isBulkAcceptable } from '../llm/evidenceStatus'

export type ChangeTarget =
  | { kind: 'summary' }
  | { kind: 'role-title'; roleIndex: number }
  | { kind: 'bullet'; roleIndex: number; bulletIndex: number }
  | { kind: 'bullet-removed'; roleIndex: number; sourceBulletIndex: number }
  | { kind: 'project-summary'; projectIndex: number }

export type ChangeReasonCode = 'keywords' | 'condensed' | 'reworded' | 'removed' | 'unchanged'

export type ChangeDecision = 'accepted' | 'rejected'

export type ChangeRecord = {
  id: string
  target: ChangeTarget
  /** Human-readable place, e.g. "Data Scientist · Acme". */
  location: string
  before: string
  after: string
  reason: ChangeReasonCode
  /** The exact source sentences this rewrite is allowed to rest on. */
  evidence: string[]
  /** Posting terms that `after` states and `before` did not. */
  keywordEffect: string[]
  finding: EvidenceFinding
  decision: ChangeDecision
  /** A person's manual wording; replaces `after` while the change is accepted. */
  edited?: string
}

/** The text a change contributes when it is accepted. */
export function effectiveText(change: ChangeRecord): string {
  return (change.edited ?? change.after).trim()
}

/** Terms `after` asserts that `before` did not — the honest "keyword effect". */
export function keywordEffect(before: string, after: string, jdTerms: string[]): string[] {
  return jdTerms.filter((term) => containsTerm(after, term) && !containsTerm(before, term))
}

function reasonFor(before: string, after: string, gained: string[], finding: EvidenceFinding): ChangeReasonCode {
  if (!after.trim()) return 'removed'
  if (finding.reasons.includes('identical')) return 'unchanged'
  if (gained.length) return 'keywords'
  if (after.length < before.length * 0.8) return 'condensed'
  return 'reworded'
}

/** A blocked change is never accepted by default; everything else is. */
export function defaultDecision(status: FactualStatus): ChangeDecision {
  return status === 'blocked' ? 'rejected' : 'accepted'
}

export type ProposedBullet = {
  roleIndex: number
  bulletIndex: number
  after: string
  /** Source bullet indexes, already validated against the role. */
  sourceBulletIndexes: number[]
  finding: EvidenceFinding
}

export type ProposedChanges = {
  summary?: { after: string; finding: EvidenceFinding }
  titles: { roleIndex: number; after: string; finding: EvidenceFinding }[]
  bullets: ProposedBullet[]
  projects: { projectIndex: number; after: string; finding: EvidenceFinding }[]
}

/** Build the reviewable list from a model proposal. Pure. */
export function proposeChanges(
  source: ResumeData,
  proposal: ProposedChanges,
  jdTerms: string[],
): ChangeRecord[] {
  const changes: ChangeRecord[] = []
  const roleLabel = (roleIndex: number) => {
    const role = source.experience[roleIndex]
    return role ? [role.title, role.company].filter(Boolean).join(' · ') : `Role ${roleIndex + 1}`
  }

  if (proposal.summary) {
    const before = source.summary ?? ''
    const after = proposal.summary.after.trim()
    const gained = keywordEffect(before, after, jdTerms)
    changes.push({
      id: 'summary',
      target: { kind: 'summary' },
      location: 'summary',
      before,
      after,
      reason: reasonFor(before, after, gained, proposal.summary.finding),
      evidence: source.experience.flatMap((role) => role.bullets.map((bullet) => bullet.text)),
      keywordEffect: gained,
      finding: proposal.summary.finding,
      decision: defaultDecision(proposal.summary.finding.status),
    })
  }

  for (const title of proposal.titles) {
    const role = source.experience[title.roleIndex]
    if (!role) continue
    const after = title.after.trim()
    if (after === role.title) continue
    changes.push({
      id: `title-${title.roleIndex}`,
      target: { kind: 'role-title', roleIndex: title.roleIndex },
      location: roleLabel(title.roleIndex),
      before: role.title,
      after,
      reason: reasonFor(role.title, after, [], title.finding),
      evidence: [role.title],
      keywordEffect: keywordEffect(role.title, after, jdTerms),
      finding: title.finding,
      decision: defaultDecision(title.finding.status),
    })
  }

  const citedByRole = new Map<number, Set<number>>()
  for (const bullet of proposal.bullets) {
    const role = source.experience[bullet.roleIndex]
    if (!role) continue
    const sources = bullet.sourceBulletIndexes
      .map((index) => role.bullets[index])
      .filter((item): item is ResumeBullet => Boolean(item))
    const before = sources.map((item) => item.text).join(' ')
    const after = bullet.after.trim()
    const gained = keywordEffect(before, after, jdTerms)
    const cited = citedByRole.get(bullet.roleIndex) ?? new Set<number>()
    for (const index of bullet.sourceBulletIndexes) cited.add(index)
    citedByRole.set(bullet.roleIndex, cited)
    changes.push({
      id: `bullet-${bullet.roleIndex}-${bullet.bulletIndex}`,
      target: { kind: 'bullet', roleIndex: bullet.roleIndex, bulletIndex: bullet.bulletIndex },
      location: roleLabel(bullet.roleIndex),
      before,
      after,
      reason: reasonFor(before, after, gained, bullet.finding),
      evidence: sources.map((item) => item.text),
      keywordEffect: gained,
      finding: bullet.finding,
      decision: defaultDecision(bullet.finding.status),
    })
  }

  // Every source bullet the rewrite dropped is itself a reversible change.
  source.experience.forEach((role, roleIndex) => {
    const cited = citedByRole.get(roleIndex)
    if (!cited) return
    role.bullets.forEach((bullet, sourceBulletIndex) => {
      if (cited.has(sourceBulletIndex)) return
      changes.push({
        id: `removed-${roleIndex}-${sourceBulletIndex}`,
        target: { kind: 'bullet-removed', roleIndex, sourceBulletIndex },
        location: roleLabel(roleIndex),
        before: bullet.text,
        after: '',
        reason: 'removed',
        evidence: [bullet.text],
        keywordEffect: [],
        finding: {
          status: 'rephrased',
          reasons: ['reworded'],
          addedNumbers: [],
          addedTerms: [],
          repeatedTerms: [],
        },
        decision: 'accepted',
      })
    })
  })

  for (const project of proposal.projects) {
    const item = source.projects[project.projectIndex]
    if (!item) continue
    const before = item.summary ?? ''
    const after = project.after.trim()
    if (!before || after === before) continue
    const gained = keywordEffect(before, after, jdTerms)
    changes.push({
      id: `project-${project.projectIndex}`,
      target: { kind: 'project-summary', projectIndex: project.projectIndex },
      location: item.name,
      before,
      after,
      reason: reasonFor(before, after, gained, project.finding),
      evidence: [before],
      keywordEffect: gained,
      finding: project.finding,
      decision: defaultDecision(project.finding.status),
    })
  }

  return changes
}

/**
 * Replay the decisions onto the deterministic baseline. `baseline` already has
 * v2.4's ordering applied (skills and bullets sorted toward the posting) and
 * still carries the ORIGINAL bullet text, so rejecting everything returns
 * exactly the deterministic, no-AI résumé.
 */
export function applyChanges(
  baseline: ResumeData,
  source: ResumeData,
  changes: ChangeRecord[],
): ResumeData {
  const byId = new Map(changes.map((change) => [change.id, change]))
  const summaryChange = byId.get('summary')

  const experience = baseline.experience.map((role, roleIndex) => {
    const sourceRole = source.experience[roleIndex]
    if (!sourceRole) return role

    const titleChange = byId.get(`title-${roleIndex}`)
    const title =
      titleChange && titleChange.decision === 'accepted'
        ? effectiveText(titleChange) || role.title
        : sourceRole.title

    const rewritten = changes
      .filter(
        (change): change is ChangeRecord & { target: { kind: 'bullet'; roleIndex: number; bulletIndex: number } } =>
          change.target.kind === 'bullet' && change.target.roleIndex === roleIndex,
      )
      .sort((a, b) => a.target.bulletIndex - b.target.bulletIndex)

    const bullets: ResumeBullet[] = []
    const restored = new Set<string>()
    rewritten.forEach((change, position) => {
      if (change.decision === 'accepted') {
        const text = effectiveText(change)
        if (!text) return
        bullets.push({
          id: `tailored-${role.id}-${position}`,
          text,
          evidenceRefs: evidenceRefsFor(sourceRole.bullets, change.evidence),
        })
        return
      }
      // Rejected: put the person's own sentences back, once each.
      for (const original of change.evidence) {
        if (restored.has(original)) continue
        restored.add(original)
        const match = sourceRole.bullets.find((bullet) => bullet.text === original)
        if (match) bullets.push({ ...match })
      }
    })

    // A rejected removal brings the dropped sentence back at the end.
    for (const change of changes) {
      if (change.target.kind !== 'bullet-removed' || change.target.roleIndex !== roleIndex) continue
      if (change.decision !== 'rejected') continue
      const match = sourceRole.bullets[change.target.sourceBulletIndex]
      if (match && !bullets.some((bullet) => bullet.text === match.text)) bullets.push({ ...match })
    }

    return { ...role, title, bullets: bullets.length ? bullets : sourceRole.bullets.map((b) => ({ ...b })) }
  })

  const projects = baseline.projects.map((project, projectIndex) => {
    const change = byId.get(`project-${projectIndex}`)
    if (!change || change.decision !== 'accepted') {
      return { ...project, summary: source.projects[projectIndex]?.summary ?? project.summary }
    }
    return { ...project, summary: effectiveText(change) || project.summary }
  })

  return {
    ...baseline,
    summary:
      summaryChange && summaryChange.decision === 'accepted'
        ? effectiveText(summaryChange)
        : baseline.summary,
    experience,
    projects,
  }
}

function evidenceRefsFor(sourceBullets: ResumeBullet[], evidence: string[]): string[] {
  const refs = new Set<string>()
  for (const text of evidence) {
    const match = sourceBullets.find((bullet) => bullet.text === text)
    if (!match) continue
    refs.add(match.id)
    for (const ref of match.evidenceRefs) refs.add(ref)
  }
  return [...refs]
}

// --- Summaries the UI needs ---------------------------------------------------

export type ChangeSetStats = {
  total: number
  accepted: number
  blocked: number
  confirmationRequired: number
  canBulkAccept: boolean
  /** Posting terms gained across every accepted change. */
  keywordsGained: string[]
}

export function summarizeChanges(changes: ChangeRecord[]): ChangeSetStats {
  const statuses = changes.map((change) => change.finding.status)
  const accepted = changes.filter((change) => change.decision === 'accepted')
  return {
    total: changes.length,
    accepted: accepted.length,
    blocked: statuses.filter((status) => status === 'blocked').length,
    confirmationRequired: statuses.filter((status) => status === 'confirmation_required').length,
    canBulkAccept: isBulkAcceptable(statuses),
    keywordsGained: [...new Set(accepted.flatMap((change) => change.keywordEffect))],
  }
}

export function setDecision(
  changes: ChangeRecord[],
  id: string,
  decision: ChangeDecision,
): ChangeRecord[] {
  return changes.map((change) => (change.id === id ? { ...change, decision } : change))
}

export function setEditedText(changes: ChangeRecord[], id: string, text: string): ChangeRecord[] {
  return changes.map((change) =>
    change.id === id ? { ...change, edited: text, decision: 'accepted' as const } : change,
  )
}

/** Restore one change to its generated state (drops a manual edit). */
export function restoreChange(changes: ChangeRecord[], id: string): ChangeRecord[] {
  return changes.map((change) =>
    change.id === id
      ? { ...change, edited: undefined, decision: defaultDecision(change.finding.status) }
      : change,
  )
}

/** Accept everything — offered only when nothing needs a human decision. */
export function acceptAll(changes: ChangeRecord[]): ChangeRecord[] {
  if (!summarizeChanges(changes).canBulkAccept) return changes
  return changes.map((change) => ({ ...change, decision: 'accepted' as const }))
}