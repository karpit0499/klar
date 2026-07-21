// ============================================================================
// Theme system (feature 3). Three modes: 'light', 'dark', 'system'. The choice
// is stored in localStorage — NOT IndexedDB — on purpose: the theme has to be
// applied SYNCHRONOUSLY before the first paint to avoid a white flash, and only
// localStorage can be read that early (see the boot snippet in index.html).
//
// Applying a theme = toggling the `.dark` class on <html> (Tailwind reads it via
// darkMode: 'class') and setting `color-scheme` so native controls match.
// ============================================================================

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'klar-theme'

/** Read the saved mode. Defaults to 'system' when nothing is stored yet. */
export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // localStorage can throw in private-mode / sandboxed contexts — fall through.
  }
  return 'system'
}

/** Persist the mode. Best-effort; a storage failure must never crash the UI. */
export function storeTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

/** Does the OS currently prefer dark? */
export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

/** Resolve a mode to the concrete scheme that should be on screen. */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return mode
}

/** Apply a mode to the document: toggle `.dark` and set `color-scheme`. */
export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

/**
 * Wire up theme handling once, at boot. Applies the stored mode and, while in
 * 'system' mode, keeps the UI in sync if the OS theme flips. Returns a cleanup
 * function (handy in tests / React StrictMode).
 */
export function initTheme(): () => void {
  applyTheme(getStoredTheme())
  const mql = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!mql) return () => {}
  const onChange = () => {
    if (getStoredTheme() === 'system') applyTheme('system')
  }
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}