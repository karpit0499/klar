import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  LayoutDashboard,
  ListChecks,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { KeyGate } from './ui/KeyGate'
import { ResumeStep } from './ui/ResumeStep'
import { ProfileStep } from './ui/ProfileStep'
import { IntakeStep } from './ui/IntakeStep'
import { SearchStep } from './ui/SearchStep'
import { TrackerBoard } from './ui/TrackerBoard'
import { SettingsStep } from './ui/SettingsStep'
import { DashboardStep } from './ui/DashboardStep'
import { PreferenceControls } from './ui/PreferenceControls'
import { VaultGate } from './ui/VaultGate'
import { useT } from './i18n/LocaleProvider'
import type { TranslationKey } from './i18n/translations'
import { DEFAULT_WEIGHTS } from './match/weights'
import { loadGroqKey } from './settings/keys'
import type { Preferences, Profile } from './types'
import { getVaultStatus } from './crypto/vault'
import { loadCurrentProfile, persistProfile } from './profile/store'
import { clearOnboardingProgress, saveOnboardingProgress } from './onboarding/setupState'
import { clearResumeData } from './settings/resumeData'
import { loadPreferences, savePreferences } from './storage/careerData'

type Tab = 'dashboard' | 'search' | 'tracker' | 'settings'

export default function App() {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [checkedKey, setCheckedKey] = useState(false)
  const [draftProfile, setDraftProfile] = useState<Profile | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [unlockRevision, setUnlockRevision] = useState(0)

  const vaultStatus = useLiveQuery(getVaultStatus, [unlockRevision], undefined)

  useEffect(() => {
    if (vaultStatus === undefined || vaultStatus === 'locked') return
    setCheckedKey(false)
    void loadGroqKey().then((key) => {
      if (key) setApiKey(key)
      setCheckedKey(true)
    })
  }, [vaultStatus, unlockRevision])

  const profile = useLiveQuery(async () => {
    if (vaultStatus === undefined || vaultStatus === 'locked') return null
    return loadCurrentProfile()
  }, [vaultStatus, unlockRevision], undefined)

  const prefs = useLiveQuery(
    loadPreferences,
    [vaultStatus, unlockRevision],
    undefined,
  )

  async function saveProfile(nextProfile: Profile) {
    await persistProfile(nextProfile)
    await saveOnboardingProgress('preferences')
    setDraftProfile(null)
  }

  async function replaceProfile(nextProfile: Profile) {
    await persistProfile(nextProfile)
    // The detailed résumé belongs to the previous upload and must not silently
    // power generators after the reviewed profile has been replaced.
    await clearResumeData()
  }

  async function savePrefs(nextPrefs: Preferences) {
    await savePreferences(nextPrefs)
    await clearOnboardingProgress()
  }

  function fullReset() {
    setApiKey(null)
    setDraftProfile(null)
    setTab('dashboard')
  }

  function changeTab(nextTab: Tab) {
    // Every screen is a top-level destination. Carrying the previous screen's
    // scroll offset across navigation can open a shorter screen halfway down.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    setTab(nextTab)
  }

  if (vaultStatus === undefined) return null

  if (vaultStatus === 'locked') {
    return (
      <Shell tab={tab} setTab={changeTab} minimal>
        <VaultGate onUnlocked={() => setUnlockRevision((value) => value + 1)} />
      </Shell>
    )
  }

  if (!checkedKey) return null

  if (!apiKey) {
    return (
      <Shell tab={tab} setTab={changeTab} minimal>
        <KeyGate onReady={setApiKey} />
      </Shell>
    )
  }

  if (draftProfile) {
    return (
      <Shell tab={tab} setTab={changeTab} minimal>
        <ProfileStep
          profile={draftProfile}
          onConfirm={() => void saveProfile(draftProfile)}
          onRedo={() => setDraftProfile(null)}
        />
      </Shell>
    )
  }

  if (profile === undefined || prefs === undefined) return null

  if (profile === null) {
    return (
      <Shell tab={tab} setTab={changeTab} minimal>
        <ResumeStep
          apiKey={apiKey}
          onParsed={(nextProfile) => {
            void saveOnboardingProgress('profile-review')
            setDraftProfile(nextProfile)
          }}
        />
      </Shell>
    )
  }

  if (!prefs) {
    return (
      <Shell tab={tab} setTab={changeTab} minimal>
        <IntakeStep profile={profile} onSave={savePrefs} />
      </Shell>
    )
  }

  return (
    <Shell tab={tab} setTab={changeTab}>
      {tab === 'dashboard' && <DashboardStep profile={profile} prefs={prefs} />}
      {/* Keep Search mounted so a completed, expensive result set is not lost
          when the user checks Tracker or Settings and comes back. */}
      <div hidden={tab !== 'search'}>
        <SearchStep profile={profile} prefs={prefs} apiKey={apiKey} />
      </div>
      {tab === 'tracker' && <TrackerBoard weights={prefs.weights ?? DEFAULT_WEIGHTS} />}
      {tab === 'settings' && (
        <SettingsStep onReset={fullReset} apiKey={apiKey} onReplaceProfile={replaceProfile} />
      )}
    </Shell>
  )
}

const TABS: {
  id: Tab
  labelKey: TranslationKey
  icon: LucideIcon
}[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'search', labelKey: 'nav.search', icon: Search },
  { id: 'tracker', labelKey: 'nav.tracker', icon: ListChecks },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
]

function Wordmark() {
  return (
    <span className="font-display text-2xl font-bold leading-none tracking-[-0.04em] text-ink sm:text-[28px]">
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
  setTab: (tab: Tab) => void
  minimal?: boolean
}) {
  const t = useT()

  if (minimal) {
    return (
      <div className="min-h-[100dvh] bg-bg text-ink">
        <a href="#main" className="skip-link sr-only">
          {t('shell.skipToContent')}
        </a>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-[1200px] items-center px-4 py-4 sm:px-6">
            <Wordmark />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1200px]">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-bg text-ink">
      <a href="#main" className="skip-link sr-only">
        {t('shell.skipToContent')}
      </a>

      <aside
        aria-label={t('nav.aria')}
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar sm:flex"
      >
        <div className="px-5 py-5">
          <Wordmark />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {TABS.map((item) => {
            const active = tab === item.id
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-tap items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition ${
                  active ? 'bg-accent-tint text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <Icon aria-hidden="true" size={20} strokeWidth={2} className="shrink-0" />
                {t(item.labelKey)}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <PreferenceControls compact />
        </div>
      </aside>

      <main id="main" className="pt-40 pb-24 sm:pl-64 sm:pt-0 sm:pb-0">
        {children}
      </main>

      <nav
        aria-label={t('nav.ariaMobile')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <div className="mx-auto grid max-w-[1200px] grid-cols-4">
          {TABS.map((item) => {
            const active = tab === item.id
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-xs font-medium ${
                  active ? 'text-accent' : 'text-faint'
                }`}
              >
                <Icon aria-hidden="true" size={22} strokeWidth={2} />
                {t(item.labelKey)}
              </button>
            )
          })}
        </div>
      </nav>

      <div className="fixed inset-x-0 top-0 z-20 border-b border-border bg-surface px-4 py-2 sm:hidden">
        <div className="flex items-center justify-between">
          <Wordmark />
        </div>
        <PreferenceControls compact />
      </div>
    </div>
  )
}