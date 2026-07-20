// ============================================================================
// Key storage. The ONLY per-user secret is the Groq key. "Remember on device"
// ON  → IndexedDB (persists). OFF → sessionStorage (gone when the tab closes).
// Clear wipes both. We never send the Groq key to our Worker — it goes straight
// to Groq (verified CORS), so it's only ever visible to this browser + Groq.
// ============================================================================
import { getSetting, setSetting, db } from '../db/db'

const SS_KEY = 'klar.groqKey'
const DB_KEY = 'groqKey'
const REMEMBER_KEY = 'groqKeyRemember'

export async function saveGroqKey(key: string, remember: boolean): Promise<void> {
  const trimmed = key.trim()
  if (remember) {
    await setSetting(DB_KEY, trimmed)
    await setSetting(REMEMBER_KEY, true)
    try { sessionStorage.removeItem(SS_KEY) } catch { /* SSR/no storage */ }
  } else {
    try { sessionStorage.setItem(SS_KEY, trimmed) } catch { /* ignore */ }
    await setSetting(REMEMBER_KEY, false)
    await db.settings.delete(DB_KEY)
  }
}

export async function loadGroqKey(): Promise<string | undefined> {
  // Session first (covers the "not remembered" case), then IndexedDB.
  try {
    const s = sessionStorage.getItem(SS_KEY)
    if (s) return s
  } catch { /* ignore */ }
  return await getSetting<string>(DB_KEY)
}

export async function clearGroqKey(): Promise<void> {
  try { sessionStorage.removeItem(SS_KEY) } catch { /* ignore */ }
  await db.settings.delete(DB_KEY)
}

export async function isRemembered(): Promise<boolean> {
  return (await getSetting<boolean>(REMEMBER_KEY)) ?? true
}