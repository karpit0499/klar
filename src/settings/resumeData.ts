// ============================================================================
// Persistence for the rich ResumeData (features 12 & 15). This is the detailed,
// structured résumé — contact block, dated experience with bullets, skill
// groups — that the tailored-résumé generator works from. It's distinct from
// the thin `Profile` used for matching: the Profile answers "how well does this
// job fit me?", ResumeData answers "what goes on the document?".
//
// Stored in the settings table (one JSON blob) rather than a dedicated Dexie
// store, so no schema migration is needed. It IS included in the JSON export —
// it's the user's own résumé and belongs in their backup. Feature 22 can wrap
// this blob in client-side encryption if the user opts in.
// ============================================================================
import { getSetting, setSetting, db } from '../db/db'
import type { ResumeData } from '../resume/types'
import { getVaultStatus, readSensitiveContent, updateSensitiveContent } from '../crypto/vault'

const RESUME_DATA_KEY = 'resumeDataV1'

export async function saveResumeData(data: ResumeData): Promise<void> {
  const vault = await getVaultStatus()
  if (vault === 'unlocked') {
    await updateSensitiveContent((content) => { content.resumeData = data })
    return
  }
  if (vault === 'locked') {
    await readSensitiveContent()
    return
  }
  await setSetting(RESUME_DATA_KEY, data)
}

export async function loadResumeData(): Promise<ResumeData | undefined> {
  const vault = await getVaultStatus()
  if (vault === 'unlocked') return (await readSensitiveContent())?.resumeData
  if (vault === 'locked') {
    await readSensitiveContent()
    return undefined
  }
  return getSetting<ResumeData>(RESUME_DATA_KEY)
}

export async function clearResumeData(): Promise<void> {
  const vault = await getVaultStatus()
  if (vault === 'unlocked') {
    await updateSensitiveContent((content) => { delete content.resumeData })
    return
  }
  if (vault === 'locked') {
    await readSensitiveContent()
    return
  }
  await db.settings.delete(RESUME_DATA_KEY)
}