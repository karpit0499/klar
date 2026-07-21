// ============================================================================
// User-supplied Adzuna credentials (feature 4). Adzuna has no CORS, so these
// can't be called from the browser directly — the browser sends them to the
// Worker per request (as headers) and the Worker relays them to Adzuna. They're
// stored locally and, like the Groq key, are EXCLUDED from the JSON export so a
// backup file never contains a credential. Adzuna keys are low-sensitivity
// (read-only job data); the crown-jewel Groq key still never touches the Worker.
// ============================================================================
import { getSetting, setSetting, db } from '../db/db'

export type AdzunaKey = { appId: string; appKey: string }

const APP_ID = 'adzunaAppId'
const APP_KEY = 'adzunaAppKey'

export async function saveAdzunaKey(appId: string, appKey: string): Promise<void> {
  await setSetting(APP_ID, appId.trim())
  await setSetting(APP_KEY, appKey.trim())
}

export async function loadAdzunaKey(): Promise<AdzunaKey | undefined> {
  const appId = await getSetting<string>(APP_ID)
  const appKey = await getSetting<string>(APP_KEY)
  if (appId && appKey) return { appId, appKey }
  return undefined
}

export async function clearAdzunaKey(): Promise<void> {
  await db.settings.delete(APP_ID)
  await db.settings.delete(APP_KEY)
}