import { db } from '../db/db'
import { getVaultStatus, readSensitiveContent, updateSensitiveContent } from '../crypto/vault'
import type { CanonicalResumeRow, ResumeData, ResumeDraftRow, ResumeSnapshotRow } from './types'
import { deriveProfile, isMeaningfulResume, normalizeResume } from './canonical'

const HISTORY_LIMIT = 10
const HISTORY_DAYS = 90

export async function loadCanonicalResume(): Promise<CanonicalResumeRow | null> {
  const status = await getVaultStatus()
  if (status === 'unlocked') return (await readSensitiveContent())?.canonicalResume ?? null
  if (status === 'locked') await readSensitiveContent()
  return (await db.resumes.get('current')) ?? null
}

export async function saveCanonicalResume(
  value: ResumeData,
  options: { reason?: ResumeSnapshotRow['reason']; snapshotCurrent?: boolean } = {},
): Promise<CanonicalResumeRow> {
  const data = normalizeResume(value)
  data.reviewedAt = new Date().toISOString()
  const now = new Date().toISOString()
  const current = await loadCanonicalResume()
  const row: CanonicalResumeRow = {
    id: 'current', data,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    revision: (current?.revision ?? 0) + 1,
  }
  const snapshot = current && options.snapshotCurrent !== false && isMeaningfulResume(current.data)
    ? makeSnapshot(current.data, options.reason ?? 'edit')
    : undefined
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      content.canonicalResume = row
      if (snapshot) content.resumeHistory = pruneHistory([...content.resumeHistory, snapshot])
      content.matches = []
      content.vectors = []
      delete content.resumeDraft
    })
  } else if (status === 'locked') {
    await readSensitiveContent()
  } else {
    await db.transaction('rw', [db.resumes, db.resumeHistory, db.resumeDrafts, db.matches, db.vectors], async () => {
      await db.resumes.put(row)
      if (snapshot) await db.resumeHistory.put(snapshot)
      await Promise.all([db.resumeDrafts.delete('onboarding'), db.matches.clear(), db.vectors.clear()])
      await prunePlaintextHistory()
    })
  }
  return row
}

export async function replaceCanonicalResume(value: ResumeData): Promise<CanonicalResumeRow> {
  return saveCanonicalResume(value, { reason: 'reupload', snapshotCurrent: true })
}

export async function loadResumeHistory(): Promise<ResumeSnapshotRow[]> {
  const status = await getVaultStatus()
  const rows = status === 'unlocked'
    ? (await readSensitiveContent())?.resumeHistory ?? []
    : status === 'locked'
      ? (await readSensitiveContent(), [])
      : await db.resumeHistory.toArray()
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createManualSnapshot(name: string): Promise<void> {
  const current = await loadCanonicalResume()
  if (!current) return
  const snapshot = { ...makeSnapshot(current.data, 'manual'), name: name.trim() || 'Saved profile' }
  await putSnapshot(snapshot)
}

export async function renameSnapshot(id: string, name: string): Promise<void> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      const row = content.resumeHistory.find((item) => item.id === id)
      if (row) row.name = name.trim() || undefined
      content.resumeHistory = pruneHistory(content.resumeHistory)
    })
  } else if (status === 'locked') await readSensitiveContent()
  else await db.resumeHistory.update(id, { name: name.trim() || undefined })
}

export async function deleteSnapshot(id: string): Promise<void> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      content.resumeHistory = content.resumeHistory.filter((item) => item.id !== id)
    })
  } else if (status === 'locked') await readSensitiveContent()
  else await db.resumeHistory.delete(id)
}

export async function restoreSnapshot(id: string): Promise<CanonicalResumeRow> {
  const snapshot = (await loadResumeHistory()).find((item) => item.id === id)
  if (!snapshot) throw new Error('That résumé snapshot no longer exists.')
  return saveCanonicalResume(snapshot.data, { reason: 'edit', snapshotCurrent: true })
}

export async function saveResumeDraft(value: ResumeData): Promise<void> {
  const row: ResumeDraftRow = { id: 'onboarding', data: normalizeResume(value), updatedAt: new Date().toISOString() }
  const status = await getVaultStatus()
  if (status === 'unlocked') await updateSensitiveContent((content) => { content.resumeDraft = row })
  else if (status === 'locked') await readSensitiveContent()
  else await db.resumeDrafts.put(row)
}

export async function loadResumeDraft(): Promise<ResumeDraftRow | null> {
  const status = await getVaultStatus()
  if (status === 'unlocked') return (await readSensitiveContent())?.resumeDraft ?? null
  if (status === 'locked') await readSensitiveContent()
  return (await db.resumeDrafts.get('onboarding')) ?? null
}

export async function clearResumeDraft(): Promise<void> {
  const status = await getVaultStatus()
  if (status === 'unlocked') await updateSensitiveContent((content) => { delete content.resumeDraft })
  else if (status === 'locked') await readSensitiveContent()
  else await db.resumeDrafts.delete('onboarding')
}

export async function preserveDraftBeforeRestart(): Promise<void> {
  const draft = await loadResumeDraft()
  if (draft && isMeaningfulResume(draft.data)) await putSnapshot(makeSnapshot(draft.data, 'restart'))
  await clearResumeDraft()
}

export async function loadDerivedProfile() {
  const resume = await loadCanonicalResume()
  return resume ? deriveProfile(resume.data) : null
}

function makeSnapshot(data: ResumeData, reason: ResumeSnapshotRow['reason']): ResumeSnapshotRow {
  return { id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, data: structuredClone(data), createdAt: new Date().toISOString(), reason }
}

async function putSnapshot(snapshot: ResumeSnapshotRow): Promise<void> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      content.resumeHistory = pruneHistory([...content.resumeHistory, snapshot])
    })
  } else if (status === 'locked') await readSensitiveContent()
  else {
    await db.resumeHistory.put(snapshot)
    await prunePlaintextHistory()
  }
}

export function pruneHistory(rows: ResumeSnapshotRow[], now = new Date()): ResumeSnapshotRow[] {
  const cutoff = now.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000
  const named = rows.filter((row) => Boolean(row.name))
  const automatic = rows
    .filter((row) => !row.name && new Date(row.createdAt).getTime() >= cutoff && isMeaningfulResume(row.data))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, HISTORY_LIMIT)
  return [...named, ...automatic].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function prunePlaintextHistory(): Promise<void> {
  const rows = await db.resumeHistory.toArray()
  const keep = new Set(pruneHistory(rows).map((row) => row.id))
  await db.resumeHistory.bulkDelete(rows.filter((row) => !keep.has(row.id)).map((row) => row.id))
}