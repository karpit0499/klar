// ============================================================================
// User-supplied Adzuna credentials (feature 4). Adzuna has no CORS, so these
// can't be called from the browser directly — the browser sends them to the
// Worker per request (as headers) and the Worker relays them to Adzuna. They're
// stored locally and, like the Groq key, are EXCLUDED from the JSON export so a
// backup file never contains a credential. Adzuna keys are low-sensitivity
// (read-only job data); the crown-jewel Groq key still never touches the Worker.
// ============================================================================
import { getSetting, db } from '../db/db'
import {
  getVaultStatus,
  readVaultCredentials,
  updateVaultCredentials,
} from '../crypto/vault'
import { AppError } from '../errors/appError'

export type AdzunaKey = { appId: string; appKey: string }

const APP_ID = 'adzunaAppId'
const APP_KEY = 'adzunaAppKey'

export async function saveAdzunaKey(appId: string, appKey: string): Promise<void> {
  const pair = validateAdzunaPair(appId, appKey)
  const vault = await getVaultStatus()
  if (vault === 'unlocked') {
    await updateVaultCredentials((credentials) => { credentials.adzuna = pair })
    return
  }
  if (vault === 'locked') {
    await readVaultCredentials()
    return
  }
  // The two rows change atomically; readers can never observe half a user pair.
  await db.transaction('rw', db.settings, async () => {
    await db.settings.bulkPut([
      { key: APP_ID, value: pair.appId },
      { key: APP_KEY, value: pair.appKey },
    ])
  })
}

export async function loadAdzunaKey(): Promise<AdzunaKey | undefined> {
  const vault = await getVaultStatus()
  if (vault === 'unlocked') return (await readVaultCredentials())?.adzuna
  if (vault === 'locked') {
    await readVaultCredentials()
    return undefined
  }
  const appId = await getSetting<string>(APP_ID)
  const appKey = await getSetting<string>(APP_KEY)
  if (appId && appKey) return { appId, appKey }
  if (appId || appKey) throw partialCredentialsError()
  return undefined
}

export async function clearAdzunaKey(): Promise<void> {
  const vault = await getVaultStatus()
  if (vault === 'unlocked') {
    await updateVaultCredentials((credentials) => { delete credentials.adzuna })
    return
  }
  if (vault === 'locked') {
    await readVaultCredentials()
    return
  }
  await db.transaction('rw', db.settings, () => db.settings.bulkDelete([APP_ID, APP_KEY]))
}

export function validateAdzunaPair(appId: string, appKey: string): AdzunaKey {
  const cleanId = appId.trim()
  const cleanKey = appKey.trim()
  if (!cleanId || !cleanKey) throw partialCredentialsError()
  return { appId: cleanId, appKey: cleanKey }
}

function partialCredentialsError(): AppError {
  return new AppError({
    category: 'credentials',
    message: 'Adzuna needs both the App ID and App key from the same account.',
    dataSafe: true,
    available: 'Other job sources remain available.',
    action: { label: 'Enter both Adzuna values', kind: 'open_settings' },
    technical: 'partial_adzuna_credentials',
  })
}