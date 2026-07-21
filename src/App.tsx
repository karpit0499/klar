// Top-level app: a small step machine that also persists profile & preferences
// to IndexedDB, so a returning user lands straight on the search screen.
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { KeyGate } from './ui/KeyGate'
import { ResumeStep } from './ui/ResumeStep'
import { ProfileStep } from './ui/ProfileStep'
import { IntakeStep } from './ui/IntakeStep'
import { SearchStep } from './ui/SearchStep'
import { TrackerBoard } from './ui/TrackerBoard'
import { SettingsStep } from './ui/SettingsStep'
import { DashboardStep } from './ui/DashboardStep'
import { useTheme, ThemeToggle } from './ui/useTheme'
import { useT, LocaleToggle } from './i18n/LocaleProvider'
import type { TranslationKey } from './i18n/translations'
import { db } from './db/db'
import { loadGroqKey } from './settings/keys'
import type { Preferences, Profile } from './types'

type Tab = 'dashboard' | 'search' | 'tracker' | 'settings'

export default function App() {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [checkedKey, setCheckedKey] = useState(false)
  const [draftProfile, setDraftProfile] = useState<Profile | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')

  // Load any stored key once on boot.
  useEffect(() => {
    void loadGroqKey().then((k) => {
      if (k) setApiKey(k)
      setCheckedKey(true)
    })
  }, [])

  // Live profile & preferences from IndexedDB.
  const profile = useLiveQuery(async () => {
    const rows = await db.profiles.orderBy('createdAt').reverse().limit(1).toArray()
    return rows[0] ?? null
  }, [], undefined)
  // NOTE: resolve a missing row to `null` (not the raw `undefined`), so the
  // loading guard below can tell "still loading" (undefined) from "no prefs yet"
  // (null). Returning raw `undefined` here made a brand-new user — who has no
  // preferences row — collapse into the `prefs === undefined` loading branch and
  // never reach the intake step (blank screen after the résumé step).
  const prefs = useLiveQuery(async () => (await db.preferences.get('current')) ?? null, [], undefined)

  async function persistProfile(p: Profile) {
    const id = `${Date.now()}`
    await db.profiles.put({ ...p, id, createdAt: new Date().toISOString() })
  }
  async function saveProfile(p: Profile) {
    await persistProfile(p)
    setDraftProfile(null)
  }
  /** Feature 11 — overwrite the current profile from a freshly parsed résumé. */
  async function replaceProfile(p: Profile) {
    await persistProfile(p)
  }
  async function savePrefs(p: Preferences) {
    await db.preferences.put({ ...p, id: 'current' })
  }
  function fullReset() {
    setApiKey(null)
    setDraftProfile(null)
    setTab('dashboard')
  }

  if (!checkedKey) return null
  if (!apiKey) return <KeyGate onReady={setApiKey} />

  // Onboarding: no saved profile yet.
  if (draftProfile) {
    return (
      <Shell tab={tab} setTab={setTab} minimal>
        <ProfileStep
          profile={draftProfile}
          onConfirm={() => void saveProfile(draftProfile)}
          onRedo={() => setDraftProfile(null)}
        />
      </Shell>
    )
  }
  if (profile === undefined || prefs === undefined) return null // still loading
  if (profile === null) {
    return (
      <Shell tab={tab} setTab={setTab} minimal>
        <ResumeStep apiKey={apiKey} onParsed={setDraftProfile} />
      </Shell>
    )
  }
  if (!prefs) {
    return (
      <Shell tab={tab} setTab={setTab} minimal>
        <IntakeStep profile={profile} onSave={savePrefs} />
      </Shell>
    )
  }

  // Main app.
  return (
    <Shell tab={tab} setTab={setTab}>
      {tab === 'dashboard' && <DashboardStep profile={profile} prefs={prefs} />}
      {tab === 'search' && <SearchStep profile={profile} prefs={prefs} apiKey={apiKey} />}
      {tab === 'tracker' && <TrackerBoard />}
      {tab === 'settings' && (
        <SettingsStep onReset={fullReset} apiKey={apiKey} onReplaceProfile={replaceProfile} />
      )}
    </Shell>
  )
}



const TABS: { id: Tab; labelKey: TranslationKey; glyph: string }[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', glyph: '▦' },
  { id: 'search', labelKey: 'nav.search', glyph: '⌕' },
  { id: 'tracker', labelKey: 'nav.tracker', glyph: '☑' },
  { id: 'settings', labelKey: 'nav.settings', glyph: '⚙' },
]

/** The wordmark: Space Grotesk Bold, sentence case, −4% tracking, cobalt full stop. */
function Wordmark() {
  return (
    <span className="font-display text-lg font-bold tracking-[-0.04em] text-ink">
      Klar<span className="text-accent">.</span>
    </span>
  )
}

function Shell({
  children,
  tab,
  setTab,
  minimal,
}: {
  children: React.ReactNode
  tab: Tab
  setTab: (t: Tab) => void
  minimal?: boolean
}) {
  const { mode, setMode } = useTheme()
  const t = useT()

  // Onboarding (minimal): no nav rail — a slim top bar with the wordmark + toggles.
  if (minimal) {
    return (
      <div className="min-h-full bg-bg text-ink">
        <a href="#main" className="skip-link sr-only">
          {t('shell.skipToContent')}
        </a>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Wordmark />
            <div className="flex items-center gap-3">
              <LocaleToggle />
              <ThemeToggle mode={mode} setMode={setMode} />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1200px]">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-bg text-ink">
      {/* Keyboard users can jump straight to content (WCAG 2.4.1). */}
      <a href="#main" className="skip-link sr-only">
        {t('shell.skipToContent')}
      </a>

      {/* Desktop nav rail — brand sidebar (240px), true-black in dark. Hidden below sm. */}
      <aside
        aria-label={t('nav.aria')}
        className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar sm:flex"
      >
        <div className="px-4 py-4">
          <Wordmark />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {TABS.map((item) => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-tap items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-accent-tint text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {item.glyph}
                </span>
                {t(item.labelKey)}
              </button>
            )
          })}
        </nav>
        <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
          <LocaleToggle />
          <ThemeToggle mode={mode} setMode={setMode} />
        </div>
      </aside>

      {/* Content column — offset by the rail on desktop, 1200px max, room for the
          mobile bottom bar below sm. */}
      <main id="main" className="sm:pl-60">
        <div className="mx-auto max-w-[1200px] pt-14 pb-20 sm:pt-0 sm:pb-0">{children}</div>
      </main>

      {/* Mobile bottom navigation — the rail relocated to the bottom edge below sm. */}
      <nav
        aria-label={t('nav.ariaMobile')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar sm:hidden"
      >
        <div className="mx-auto grid max-w-[1200px] grid-cols-4">
          {TABS.map((item) => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-tap flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium ${
                  active ? 'text-accent' : 'text-faint'
                }`}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {item.glyph}
                </span>
                {t(item.labelKey)}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Mobile top bar with wordmark + toggles (the rail is hidden below sm). */}
      <div className="fixed inset-x-0 top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-2 sm:hidden">
        <Wordmark />
        <div className="flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle mode={mode} setMode={setMode} />
        </div>
      </div>
    </div>
  )
}