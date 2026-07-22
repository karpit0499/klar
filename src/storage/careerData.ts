// ============================================================================
// Vault-aware access to career-data stores that are shared by several features.
// Keeping these reads/writes here prevents matching, saved searches, and setup
// code from accidentally bypassing the encrypted-at-rest boundary.
// ============================================================================
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  type MatchRow,
  type PreferencesRow,
  type SavedSearchRow,
  type VectorRow,
} from '../db/db'
import {
  getVaultStatus,
  readSensitiveContent,
  updateSensitiveContent,
} from '../crypto/vault'
import type { Preferences, ScoreWeights } from '../types'

export async function loadPreferences(): Promise<PreferencesRow | null> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    return (await readSensitiveContent())?.preferences.find((row) => row.id === 'current') ?? null
  }
  if (status === 'locked') await readSensitiveContent()
  return (await db.preferences.get('current')) ?? null
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  const row: PreferencesRow = { ...preferences, id: 'current' }
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      content.preferences = [row]
    })
    return
  }
  if (status === 'locked') await readSensitiveContent()
  await db.preferences.put(row)
}

export async function updatePreferenceWeights(weights: ScoreWeights): Promise<void> {
  const current = await loadPreferences()
  if (!current) return
  await savePreferences({ ...current, weights })
}

export async function getMatchRows(cacheKeys: string[]): Promise<(MatchRow | undefined)[]> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    const content = await readSensitiveContent()
    const byKey = new Map((content?.matches ?? []).map((row) => [row.cacheKey, row]))
    return cacheKeys.map((key) => byKey.get(key))
  }
  if (status === 'locked') await readSensitiveContent()
  return db.matches.bulkGet(cacheKeys)
}

export async function deleteMatchRows(cacheKeys: string[]): Promise<void> {
  if (!cacheKeys.length) return
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    const remove = new Set(cacheKeys)
    await updateSensitiveContent((content) => {
      content.matches = content.matches.filter((row) => !remove.has(row.cacheKey))
    })
    return
  }
  if (status === 'locked') await readSensitiveContent()
  await db.matches.bulkDelete(cacheKeys)
}

export async function putMatchRows(rows: MatchRow[]): Promise<void> {
  if (!rows.length) return
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      const byKey = new Map(content.matches.map((row) => [row.cacheKey, row]))
      for (const row of rows) byKey.set(row.cacheKey, row)
      content.matches = [...byKey.values()]
    })
    return
  }
  if (status === 'locked') await readSensitiveContent()
  await db.matches.bulkPut(rows)
}

export async function getVectors(jobIds: string[]): Promise<(VectorRow | undefined)[]> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    const byId = new Map(((await readSensitiveContent())?.vectors ?? []).map((row) => [row.jobId, row]))
    return jobIds.map((jobId) => byId.get(jobId))
  }
  if (status === 'locked') await readSensitiveContent()
  return db.vectors.bulkGet(jobIds)
}

export async function putVectors(rows: VectorRow[]): Promise<void> {
  if (!rows.length) return
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      const byId = new Map(content.vectors.map((row) => [row.jobId, row]))
      for (const row of rows) byId.set(row.jobId, row)
      content.vectors = [...byId.values()]
    })
    return
  }
  if (status === 'locked') await readSensitiveContent()
  await db.vectors.bulkPut(rows)
}

export async function clearMatchAndVectorCaches(): Promise<void> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      content.matches = []
      content.vectors = []
    })
    return
  }
  if (status === 'locked') await readSensitiveContent()
  await Promise.all([db.matches.clear(), db.vectors.clear()])
}

export async function listSavedSearchRows(): Promise<SavedSearchRow[]> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    return [...((await readSensitiveContent())?.savedSearches ?? [])]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  if (status === 'locked') await readSensitiveContent()
  return db.savedSearches.orderBy('updatedAt').reverse().toArray()
}

export function useSavedSearchRows(): SavedSearchRow[] {
  return useLiveQuery(listSavedSearchRows, [], [])
}

export async function getSavedSearchRow(id: string): Promise<SavedSearchRow | undefined> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    return (await readSensitiveContent())?.savedSearches.find((row) => row.id === id)
  }
  if (status === 'locked') await readSensitiveContent()
  return db.savedSearches.get(id)
}

export async function putSavedSearchRow(row: SavedSearchRow): Promise<void> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      const index = content.savedSearches.findIndex((item) => item.id === row.id)
      if (index >= 0) content.savedSearches[index] = row
      else content.savedSearches.push(row)
    })
    return
  }
  if (status === 'locked') await readSensitiveContent()
  await db.savedSearches.put(row)
}

export async function deleteSavedSearchRow(id: string): Promise<void> {
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      content.savedSearches = content.savedSearches.filter((row) => row.id !== id)
    })
    return
  }
  if (status === 'locked') await readSensitiveContent()
  await db.savedSearches.delete(id)
}