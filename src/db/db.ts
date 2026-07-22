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
  SearchQuery,
} from '../types'
import type { CipherEnvelope } from '../crypto/resumeCrypto'

/** Key/value settings row (e.g. active profile id, UI locale). Keys, not secrets. */
export type Setting = { key: string; value: unknown }

/** The single personal-dashboard row (feature 4.1). Always id 'me'. */
export type DashboardRow = Dashboard & { id: string }

/** A cached embedding vector for one job (feature 1.4 semantic pre-filter). */
export type VectorRow = { jobId: string; embedderId: string; dim: number; vec: number[] }

/** A persisted saved search + the job ids already seen, for "new since last check" (feature 10). */
export type SavedSearchRow = {
  id: string
  name: string
  query: SearchQuery
  region?: string
  employment?: string[]
  hideList?: string[]
  maxDistanceKm?: number
  maxAgeDays?: number
  seenJobIds: string[]
  /** v2.2 identities include merged sources and a content fingerprint. */
  seenIdentities?: { value: string; lastSeenAt: string }[]
  createdAt: string
  updatedAt: string
  lastRunAt?: string
}

/**
 * The encrypted-at-rest boundary. Content and credentials use separate
 * ciphertexts so a standard backup can preserve encrypted content while
 * excluding credentials byte-for-byte.
 */
export type VaultRow = {
  id: 'primary'
  version: 1
  content: CipherEnvelope
  credentials?: CipherEnvelope
  createdAt: string
  updatedAt: string
}

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
  savedSearches!: Table<SavedSearchRow, string>
  vault!: Table<VaultRow, string>

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
    // v3 — adds saved searches for "new since last check" (feature 10). Existing
    // stores keep their data; the new one starts empty.
    this.version(3).stores({
      settings: 'key',
      profiles: 'id, createdAt',
      preferences: 'id',
      jobs: 'queryKey, fetchedAt',
      matches: 'cacheKey, jobId',
      tracked: 'jobId, status, updatedAt',
      dashboard: 'id',
      vectors: 'jobId, embedderId',
      savedSearches: 'id, updatedAt',
    })
    // v4 — v2.2 encrypted vault. Existing plaintext data is not moved until
    // the user explicitly enables encryption and confirms the warning.
    this.version(4).stores({
      settings: 'key',
      profiles: 'id, createdAt',
      preferences: 'id',
      jobs: 'queryKey, fetchedAt',
      matches: 'cacheKey, jobId',
      tracked: 'jobId, status, updatedAt',
      dashboard: 'id',
      vectors: 'jobId, embedderId',
      savedSearches: 'id, updatedAt',
      vault: 'id, updatedAt',
    }).upgrade(async (transaction) => {
      // Raw résumé text was a v2.1 debugging convenience. v2.2 removes it from
      // every confirmed stored profile during the in-place upgrade.
      await transaction.table('profiles').toCollection().modify((row: Record<string, unknown>) => {
        delete row.rawText
      })
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

/** Wipe every store (feature 6.1 delete-all), including v2.2 vault data. */
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
    db.savedSearches.clear(),
    db.vault.clear(),
  ])
}