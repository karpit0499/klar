// ============================================================================
// Personal dashboard persistence (feature 4.1). One row, id 'me', in the
// `dashboard` store. The photo is converted to a data URL in the browser and
// stored as a string — so it (a) never leaves the device and (b) survives the
// JSON export/import backup, unlike a raw Blob which can't be serialized.
// ============================================================================
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type DashboardRow } from '../db/db'
import type { Dashboard } from '../types'
import { getVaultStatus, readSensitiveContent, updateSensitiveContent } from '../crypto/vault'

const ID = 'me'

export const EMPTY_DASHBOARD: Dashboard = {
  displayName: '',
  headline: '',
  about: '',
  location: '',
  links: [],
}

/** Live dashboard for React components (re-renders on any change). */
export function useDashboard(): Dashboard | undefined {
  return useLiveQuery(async () => {
    const vault = await getVaultStatus()
    if (vault === 'unlocked') {
      const content = await readSensitiveContent()
      const row = content?.dashboard.find((item) => item.id === ID)
      return row ? stripId(row) : EMPTY_DASHBOARD
    }
    if (vault === 'locked') {
      await readSensitiveContent()
    }
    const row = await db.dashboard.get(ID)
    return row ? stripId(row) : EMPTY_DASHBOARD
  }, [], undefined)
}

/** Persist the dashboard (single row). */
export async function saveDashboard(data: Dashboard): Promise<void> {
  const vault = await getVaultStatus()
  if (vault === 'unlocked') {
    await updateSensitiveContent((content) => {
      content.dashboard = [{ ...data, id: ID }]
    })
    return
  }
  if (vault === 'locked') {
    await readSensitiveContent()
    return
  }
  await db.dashboard.put({ ...data, id: ID })
}

function stripId(row: DashboardRow): Dashboard {
  const { id: _id, ...rest } = row
  return rest
}

/**
 * Read an image File into a data URL (base64) entirely in the browser.
 * Rejects non-images and files over ~2MB (keeps IndexedDB small).
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'))
      return
    }
    if (file.size > 2_000_000) {
      reject(new Error('Image is too large (max 2MB). Pick a smaller one.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(file)
  })
}