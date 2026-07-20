// ============================================================================
// IndexedDB via Dexie. Six stores hold ALL of Klar's state — nothing about the
// user ever leaves the browser. Bump the version + add a migration when the
// schema changes.
// ============================================================================
import Dexie, { type Table } from 'dexie'
import type {
  NormalizedJob,
  Profile,
  Preferences,
  MatchResult,
  TrackedJob,
  Dashboard,
} from '../types'

/** Key/value settings row (e.g. active profile id, UI locale). Keys, not secrets. */
export type Setting = { key: string; value: unknown }

/** The single personal-dashboard row (feature 4.1). Always id 'me'. */
export type DashboardRow = Dashboard & { id: string }

/** A cached embedding vector for one job (feature 1.4 semantic pre-filter). */
export type VectorRow = { jobId: string; embedderId: string; dim: number; vec: number[] }

/** A cached job fetch, keyed by the search signature. */
export type JobCacheRow = {
  queryKey: string
  jobs: NormalizedJob[]
  fetchedAt: string
}

/** A profile row (we keep a history; `id` is a timestamp-ish string). */
export type ProfileRow = Profile & { id: string; createdAt: string }

/** A preferences row (usually just one, id 'current'). */
export type PreferencesRow = Preferences & { id: string }

/** A cached match score keyed by hash(profile+prefs)+jobId. */
export type MatchRow = MatchResult & { cacheKey: string }

export class KlarDB extends Dexie {
  settings!: Table<Setting, string>
  profiles!: Table<ProfileRow, string>
  preferences!: Table<PreferencesRow, string>
  jobs!: Table<JobCacheRow, string>
  matches!: Table<MatchRow, string>
  tracked!: Table<TrackedJob, string>
  dashboard!: Table<DashboardRow, string>
  vectors!: Table<VectorRow, string>

  constructor() {
    super('klar')
    // v1 — the original six stores.
    this.version(1).stores({
      // Only list INDEXED properties here (the primary key first).
      settings: 'key',
      profiles: 'id, createdAt',
      preferences: 'id',
      jobs: 'queryKey, fetchedAt',
      matches: 'cacheKey, jobId',
      tracked: 'jobId, status, updatedAt',
    })
    // v2 — adds the personal dashboard (feature 4.1) and the embedding-vector
    // cache (feature 1.4). Dexie migrates existing databases automatically:
    // the six stores above keep their data; the two new ones start empty.
    this.version(2).stores({
      settings: 'key',
      profiles: 'id, createdAt',
      preferences: 'id',
      jobs: 'queryKey, fetchedAt',
      matches: 'cacheKey, jobId',
      tracked: 'jobId, status, updatedAt',
      dashboard: 'id',
      vectors: 'jobId, embedderId',
    })
  }
}

export const db = new KlarDB()

// --- Small typed helpers ------------------------------------------------------

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key)
  return row?.value as T | undefined
}
export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

/** Setting keys that must NEVER be written to an export file (they hold secrets). */
const SECRET_SETTING_KEYS = new Set(['groqKey', 'groqKeyRemember'])

/**
 * Export the whole database to a plain object (for the Export button).
 * The Groq API key is deliberately stripped so a backup file never contains a
 * secret — the backup is your data, not your credentials.
 */
export async function exportAll(): Promise<Record<string, unknown[]>> {
  const [settings, profiles, preferences, jobs, matches, tracked, dashboard, vectors] =
    await Promise.all([
      db.settings.toArray(),
      db.profiles.toArray(),
      db.preferences.toArray(),
      db.jobs.toArray(),
      db.matches.toArray(),
      db.tracked.toArray(),
      db.dashboard.toArray(),
      db.vectors.toArray(),
    ])
  const safeSettings = settings.filter((s) => !SECRET_SETTING_KEYS.has(s.key))
  return { settings: safeSettings, profiles, preferences, jobs, matches, tracked, dashboard, vectors }
}

/**
 * Replace the database contents from an exported object (Import button).
 * The locally stored API key is preserved across the import (it isn't in the
 * file), so restoring a backup never signs you out.
 */
export async function importAll(data: Record<string, unknown[]>): Promise<void> {
  await db.transaction(
    'rw',
    [db.settings, db.profiles, db.preferences, db.jobs, db.matches, db.tracked, db.dashboard, db.vectors],
    async () => {
      // Keep the secret settings (the API key) that live only on this device.
      const preserved: Setting[] = []
      for (const key of SECRET_SETTING_KEYS) {
        const row = await db.settings.get(key)
        if (row) preserved.push(row)
      }
      await Promise.all([
        db.settings.clear(),
        db.profiles.clear(),
        db.preferences.clear(),
        db.jobs.clear(),
        db.matches.clear(),
        db.tracked.clear(),
        db.dashboard.clear(),
        db.vectors.clear(),
      ])
      if (data.settings) await db.settings.bulkPut(data.settings as Setting[])
      if (preserved.length) await db.settings.bulkPut(preserved)
      if (data.profiles) await db.profiles.bulkPut(data.profiles as ProfileRow[])
      if (data.preferences) await db.preferences.bulkPut(data.preferences as PreferencesRow[])
      if (data.jobs) await db.jobs.bulkPut(data.jobs as JobCacheRow[])
      if (data.matches) await db.matches.bulkPut(data.matches as MatchRow[])
      if (data.tracked) await db.tracked.bulkPut(data.tracked as TrackedJob[])
      if (data.dashboard) await db.dashboard.bulkPut(data.dashboard as DashboardRow[])
      if (data.vectors) await db.vectors.bulkPut(data.vectors as VectorRow[])
    },
  )
}

/** Wipe every store (feature 6.1 delete-all). Clears the new dashboard + vectors too. */
export async function wipeAllData(): Promise<void> {
  await Promise.all([
    db.settings.clear(),
    db.profiles.clear(),
    db.preferences.clear(),
    db.jobs.clear(),
    db.matches.clear(),
    db.tracked.clear(),
    db.dashboard.clear(),
    db.vectors.clear(),
  ])
}