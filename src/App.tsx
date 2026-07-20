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
  const prefs = useLiveQuery(() => db.preferences.get('current'), [], undefined)

  async function saveProfile(p: Profile) {
    const id = `${Date.now()}`
    await db.profiles.put({ ...p, id, createdAt: new Date().toISOString() })
    setDraftProfile(null)
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
      {tab === 'settings' && <SettingsStep onReset={fullReset} />}
    </Shell>
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
  return (
    <div className="min-h-full">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-indigo-700">Klar</span>
            <span className="text-xs text-gray-400">job tracker</span>
          </div>
          {!minimal && (
            <nav className="flex gap-1">
              {(['dashboard', 'search', 'tracker', 'settings'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
                    tab === t ? 'bg-indigo-100 text-indigo-800' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}