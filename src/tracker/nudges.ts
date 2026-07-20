// ============================================================================
// Reminders & follow-up nudges (feature 5.5).
//
// TrackedJob already carries `reminders` and `history`; these helpers surface
// them: which reminders are due, and which applications have gone quiet. Pure
// and deterministic, so they're unit-testable and the UI stays a thin renderer.
// ============================================================================
import type { TrackedJob } from '../types'

/** An application is "quiet" if it's still in `applied` with no update for N days. */
export const NUDGE_AFTER_DAYS = 7

/** Whole days since `iso`, or a large number if the date is missing/invalid. */
function daysSince(iso: string | undefined, now: number): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const t = new Date(iso).getTime()
  if (isNaN(t)) return Number.POSITIVE_INFINITY
  return Math.floor((now - t) / 86_400_000)
}

export type Nudge = { row: TrackedJob; quietDays: number }

/**
 * Applications that need a nudge: status `applied`, last touched more than
 * `days` ago. Most-overdue first.
 */
export function applicationsNeedingNudge(
  rows: TrackedJob[],
  days: number = NUDGE_AFTER_DAYS,
  now: number = Date.now(),
): Nudge[] {
  return rows
    .filter((r) => r.status === 'applied')
    .map((r) => ({ row: r, quietDays: daysSince(r.appliedAt ?? r.updatedAt, now) }))
    .filter((n) => n.quietDays >= days)
    .sort((a, b) => b.quietDays - a.quietDays)
}

export type DueReminder = { row: TrackedJob; index: number; date: string; text: string }

/**
 * Reminders whose date is on/before `asOf`, flattened across all tracked jobs.
 * Soonest first. `index` is the reminder's position in that job's array (so the
 * UI can remove it).
 */
export function dueReminders(rows: TrackedJob[], asOf: Date = new Date()): DueReminder[] {
  const cutoff = asOf.getTime()
  const out: DueReminder[] = []
  for (const row of rows) {
    row.reminders.forEach((r, index) => {
      const t = new Date(r.date).getTime()
      if (!isNaN(t) && t <= cutoff) out.push({ row, index, date: r.date, text: r.text })
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}