// Tracker persistence — thin helpers over the Dexie `tracked` table, plus a
// live-query hook so the board re-renders automatically on any change.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { MatchResult, NormalizedJob, TrackedJob, TrackStatus } from '../types'

export function useTracked(): TrackedJob[] {
  return useLiveQuery(() => db.tracked.toArray(), [], [] as TrackedJob[])
}

export async function addToTracker(job: NormalizedJob, match?: MatchResult): Promise<void> {
  const now = new Date().toISOString()
  const existing = await db.tracked.get(job.id)
  if (existing) return // already tracked
  const row: TrackedJob = {
    jobId: job.id,
    job,
    match,
    status: 'interested',
    notes: '',
    reminders: [],
    contacts: [],
    history: [{ status: 'interested', at: now }],
    createdAt: now,
    updatedAt: now,
  }
  await db.tracked.put(row)
}

export async function setStatus(jobId: string, status: TrackStatus): Promise<void> {
  const row = await db.tracked.get(jobId)
  if (!row) return
  const now = new Date().toISOString()
  row.status = status
  row.updatedAt = now
  row.history.push({ status, at: now })
  if (status === 'applied' && !row.appliedAt) row.appliedAt = now
  await db.tracked.put(row)
}

export async function setNotes(jobId: string, notes: string): Promise<void> {
  const row = await db.tracked.get(jobId)
  if (!row) return
  row.notes = notes
  row.updatedAt = new Date().toISOString()
  await db.tracked.put(row)
}

// --- Reminders & contacts (feature 5.5) --------------------------------------

/** Add a "follow up on <date>" reminder to a tracked job. */
export async function addReminder(jobId: string, date: string, text: string): Promise<void> {
  const row = await db.tracked.get(jobId)
  if (!row || !date) return
  row.reminders = [...row.reminders, { date, text: text.trim() }].sort((a, b) =>
    a.date.localeCompare(b.date),
  )
  row.updatedAt = new Date().toISOString()
  await db.tracked.put(row)
}

/** Remove the reminder at `index` from a tracked job. */
export async function removeReminder(jobId: string, index: number): Promise<void> {
  const row = await db.tracked.get(jobId)
  if (!row) return
  row.reminders = row.reminders.filter((_, i) => i !== index)
  row.updatedAt = new Date().toISOString()
  await db.tracked.put(row)
}

/** Add a contact (recruiter / hiring manager) to a tracked job. */
export async function addContact(
  jobId: string,
  contact: { name: string; role?: string; email?: string },
): Promise<void> {
  const row = await db.tracked.get(jobId)
  if (!row || !contact.name.trim()) return
  row.contacts = [...row.contacts, contact]
  row.updatedAt = new Date().toISOString()
  await db.tracked.put(row)
}

export async function removeTracked(jobId: string): Promise<void> {
  await db.tracked.delete(jobId)
}

export async function isTracked(jobId: string): Promise<boolean> {
  return (await db.tracked.get(jobId)) != null
}