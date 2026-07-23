import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { LayoutDashboard, ListChecks, Search, Settings, type LucideIcon } from 'lucide-react'
import { SearchStep } from './ui/SearchStep'
import { TrackerBoard } from './ui/TrackerBoard'
import { SettingsStep } from './ui/SettingsStep'
import { DashboardStep } from './ui/DashboardStep'
import { PreferenceControls } from './ui/PreferenceControls'
import { VaultGate } from './ui/VaultGate'
import { AdaptiveOnboarding } from './ui/AdaptiveOnboarding'
import { ExploreWorkspace } from './ui/ExploreWorkspace'
import { GroqKeyPrompt } from './ui/GroqKeyPrompt'
import { SetupChecklist } from './ui/SetupChecklist'
import { FlexibleWorkHome } from './ui/FlexibleWorkHome'
import { useT } from './i18n/LocaleProvider'
import type { TranslationKey } from './i18n/translations'
import { DEFAULT_WEIGHTS } from './match/weights'
import { loadGroqKey } from './settings/keys'
import { getVaultStatus } from './crypto/vault'
import { detectLocalSetupState, saveOnboardingProgress } from './onboarding/setupState'
import { deriveProfile } from './resume/canonical'
import { loadCanonicalResume, replaceCanonicalResume, saveCanonicalResume } from './resume/store'
import { loadPreferences } from './storage/careerData'
import type { ResumeData } from './resume/types'

type Tab = 'dashboard' | 'search' | 'tracker' | 'settings'
type KeyRequest = { action: string; resolve: (key: string | null) => void }

export default function App() {
  const [apiKey, setApiKey] = useState<string>()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [revision, setRevision] = useState(0)
  const [demo, setDemo] = useState(false)
  const [onboardingTarget, setOnboardingTarget] = useState<'welcome' | 'resume' | 'flexible' | 'restore'>()
  const [keyRequest, setKeyRequest] = useState<KeyRequest | null>(null)
  const vaultStatus = useLiveQuery(getVaultStatus, [revision], undefined)
  const setupState = useLiveQuery(
    async () => vaultStatus === 'locked' || vaultStatus === undefined ? undefined : detectLocalSetupState(),
    [vaultStatus, revision],
    undefined,
  )
  const canonical = useLiveQuery(
    async () => vaultStatus === 'locked' || vaultStatus === undefined ? null : loadCanonicalResume(),
    [vaultStatus, revision],
    undefined,
  )
  const preferences = useLiveQuery(
    async () => vaultStatus === 'locked' || vaultStatus === undefined ? null : loadPreferences(),
    [vaultStatus, revision],
    undefined,
  )

  useEffect(() => {
    if (vaultStatus === undefined || vaultStatus === 'locked') return
    void loadGroqKey().then((key) => setApiKey(key))
  }, [vaultStatus, revision])

  function requireGroq(action: string): Promise<string | null> {
    if (apiKey) return Promise.resolve(apiKey)
    return new Promise((resolve) => setKeyRequest({ action, resolve }))
  }
  function finishKey(key: string | null) {
    if (key) setApiKey(key)
    keyRequest?.resolve(key); setKeyRequest(null)
  }
  function refresh() { setRevision((value) => value + 1) }
  function changeTab(next: Tab) { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); setTab(next) }

  if (vaultStatus === undefined) return null
  if (vaultStatus === 'locked') return <Shell tab={tab} setTab={changeTab} minimal><VaultGate onUnlocked={refresh} /></Shell>
  if (demo) return <ExploreWorkspace onStart={() => { setOnboardingTarget('resume'); setDemo(false) }} onRestore={() => { setOnboardingTarget('restore'); setDemo(false) }} onLeave={() => { setOnboardingTarget('welcome'); setDemo(false) }} />
  if (!setupState || canonical === undefined || preferences === undefined) return null
  if (setupState.kind === 'locked') return <Shell tab={tab} setTab={changeTab} minimal><VaultGate onUnlocked={refresh} /></Shell>
  if (setupState.kind !== 'complete') {
    return <>
      <AdaptiveOnboarding state={setupState} apiKey={apiKey} requireGroq={requireGroq} onComplete={refresh} onRestored={refresh} onExplore={() => setDemo(true)} initialView={onboardingTarget} />
      {keyRequest && <GroqKeyPrompt action={keyRequest.action} onReady={(key) => finishKey(key)} onCancel={() => finishKey(null)} />}
    </>
  }
  if (!preferences) return null
  const currentPreferences = preferences
  const profile = canonical ? deriveProfile(canonical.data) : null

  async function saveResume(data: ResumeData) { await saveCanonicalResume(data, { reason: 'edit' }); refresh() }
  async function replaceResume(data: ResumeData) { await replaceCanonicalResume(data); refresh() }
  async function addResume() {
    await saveOnboardingProgress('resume', currentPreferences.discoveryMode === 'flexible' ? 'both' : currentPreferences.discoveryMode ?? 'career')
    setOnboardingTarget('resume')
    refresh()
  }
  async function editFlexible() {
    await saveOnboardingProgress('flexible', currentPreferences.discoveryMode ?? 'flexible')
    setOnboardingTarget('flexible')
    refresh()
  }

  return <>
    <Shell tab={tab} setTab={changeTab}>
      {tab === 'dashboard' && (canonical && profile
        ? <div className="page-container"><SetupChecklist resume={canonical.data} preferences={preferences} onProfile={() => changeTab('settings')} onPreferences={() => changeTab('settings')} onAdzuna={() => changeTab('settings')} onAddResume={() => void addResume()} /><DashboardStep profile={profile} prefs={preferences} /></div>
        : <FlexibleWorkHome preferences={preferences} onEdit={() => void editFlexible()} onAddResume={() => void addResume()} />)}
      <div hidden={tab !== 'search'}>{canonical && profile
        ? <SearchStep resume={canonical.data} profile={profile} prefs={preferences} apiKey={apiKey} requireGroq={requireGroq} />
        : <FlexibleWorkHome preferences={preferences} onEdit={() => void editFlexible()} onAddResume={() => void addResume()} />}</div>
      {tab === 'tracker' && <TrackerBoard weights={preferences.weights ?? DEFAULT_WEIGHTS} />}
      {tab === 'settings' && <SettingsStep
        onReset={refresh}
        apiKey={apiKey}
        requireGroq={requireGroq}
        resume={canonical?.data}
        onSaveResume={canonical ? saveResume : undefined}
        onReplaceResume={canonical ? replaceResume : undefined}
        onResumeChanged={canonical ? refresh : undefined}
        onEditFlexible={preferences.flexibleWork ? () => void editFlexible() : undefined}
        onAddResume={!canonical ? () => void addResume() : undefined}
      />}
    </Shell>
    {keyRequest && <GroqKeyPrompt action={keyRequest.action} onReady={(key) => finishKey(key)} onCancel={() => finishKey(null)} />}
  </>
}

const TABS: { id: Tab; labelKey: TranslationKey; icon: LucideIcon }[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'search', labelKey: 'nav.search', icon: Search },
  { id: 'tracker', labelKey: 'nav.tracker', icon: ListChecks },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
]

function Wordmark() { return <span className="font-display text-2xl font-bold leading-none tracking-[-0.04em] text-ink sm:text-[28px]">Klar<span className="text-accent">.</span></span> }

function Shell({ children, tab, setTab, minimal }: { children: React.ReactNode; tab: Tab; setTab: (tab: Tab) => void; minimal?: boolean }) {
  const t = useT()
  if (minimal) return <div className="min-h-[100dvh] bg-bg text-ink"><header className="border-b border-border bg-surface"><div className="mx-auto flex max-w-[1200px] items-center px-4 py-4 sm:px-6"><Wordmark /></div></header><main id="main" className="mx-auto max-w-[1200px]">{children}</main></div>
  return <div className="min-h-[100dvh] bg-bg text-ink"><a href="#main" className="skip-link sr-only">{t('shell.skipToContent')}</a><aside aria-label={t('nav.aria')} className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar sm:flex"><div className="px-5 py-5"><Wordmark /></div><nav className="flex flex-1 flex-col gap-1 px-3">{TABS.map((item) => { const active = tab === item.id; const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} aria-current={active ? 'page' : undefined} className={`flex min-h-tap items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition ${active ? 'bg-accent-tint text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}><Icon aria-hidden="true" size={20} strokeWidth={2} className="shrink-0" />{t(item.labelKey)}</button> })}</nav><div className="border-t border-sidebar-border p-3"><PreferenceControls compact /></div></aside><main id="main" className="pt-[61px] pb-24 sm:pl-64 sm:pt-0 sm:pb-0">{children}</main><nav aria-label={t('nav.ariaMobile')} className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] sm:hidden"><div className="mx-auto grid max-w-[1200px] grid-cols-4">{TABS.map((item) => { const active = tab === item.id; const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} aria-current={active ? 'page' : undefined} className={`flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-xs font-medium ${active ? 'text-accent' : 'text-faint'}`}><Icon aria-hidden="true" size={22} strokeWidth={2} />{t(item.labelKey)}</button> })}</div></nav><div className="fixed inset-x-0 top-0 z-20 border-b border-border bg-surface px-4 py-2 sm:hidden"><div className="flex items-center justify-between gap-2"><Wordmark /><PreferenceControls compact /></div></div></div>
}