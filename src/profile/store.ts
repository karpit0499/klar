import { db, type ProfileRow } from '../db/db'
import { getVaultStatus, readSensitiveContent, updateSensitiveContent } from '../crypto/vault'
import type { Profile } from '../types'

export async function loadCurrentProfile(): Promise<ProfileRow | null> {
  const status = await getVaultStatus()
  if (status === 'locked') {
    // readSensitiveContent deliberately throws the shared locked-vault error.
    await readSensitiveContent()
  }
  if (status === 'unlocked') {
    const content = await readSensitiveContent()
    return newest(content?.profiles ?? [])
  }
  const rows = await db.profiles.orderBy('createdAt').reverse().limit(1).toArray()
  return rows[0] ?? null
}

export async function persistProfile(profile: Profile): Promise<void> {
  const now = new Date().toISOString()
  const row: ProfileRow = {
    ...profile,
    // Raw résumé text is temporary extraction input. It is removed once the
    // structured profile is confirmed instead of being retained for debugging.
    rawText: undefined,
    id: `${Date.now()}`,
    createdAt: now,
  }
  const status = await getVaultStatus()
  if (status === 'unlocked') {
    await updateSensitiveContent((content) => {
      content.profiles.push(row)
      content.matches = []
      content.vectors = []
    })
  } else if (status === 'locked') {
    await readSensitiveContent()
  } else {
    await db.transaction('rw', [db.profiles, db.matches, db.vectors], async () => {
      await db.profiles.put(row)
      await Promise.all([db.matches.clear(), db.vectors.clear()])
    })
  }
}

function newest(rows: ProfileRow[]): ProfileRow | null {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}