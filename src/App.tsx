import { useEffect, useRef, useState } from 'react'
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
import { FlexibleWorkHome, type FlexibleLaunch } from './ui/FlexibleWorkHome'
import { FlexibleSearch } from './ui/FlexibleSearch'
import { WorkModeSwitch } from './ui/WorkModeSwitch'
import { ResumeEmptyWorkspace, ResumeWorkspace } from './ui/ResumeWorkspace'
import { SupportWorkspace } from './ui/SupportWorkspace'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { useT } from './i18n/LocaleProvider'
import type { TranslationKey } from './i18n/translations'
import { loadGroqKey, resolveAvailableGroqKey } from './settings/keys'
import { getVaultStatus } from './crypto/vault'
import {
  detectLocalSetupState,
  loadWorkMode,
  saveOnboardingProgress,
  saveWorkMode,
  type WorkMode,
} from './onboarding/setupState'
import { deriveProfile } from './resume/canonical'
import { loadCanonicalResume, replaceCanonicalResume, saveCanonicalResume } from './resume/store'
import { loadPreferences, savePreferences } from './storage/careerData'
import type { ResumeData } from './resume/types'
import type { FlexibleWorkPreferences } from './types'
import { shouldVisitFlexibleSearch } from './application/workspaceRouting'

type PrimaryTab = 'dashboard' | 'search' | 'tracker' | 'settings'
type Tab = PrimaryTab | 'resume' | 'support'
type KeyRequest = { action: string; resolve: (key: string | null) => void }
type PendingNavigation = { next: Tab; source: 'request' | 'history' }

const TAB_HASH: Record<Tab, string> = {
  dashboard: '#/dashboard',
  search: '#/search',
  tracker: '#/tracker',
  settings: '#/settings',
  resume: '#/resume',
  support: '#/support',
}

function tabFromHash(): Tab {
  const found = (Object.entries(TAB_HASH) as [Tab, string][])
    .find(([, hash]) => hash === window.location.hash)
  return found?.[0] ?? 'dashboard'
}

export default function App() {
  const [apiKey, setApiKey] = useState<string>()
  const [tab, setTab] = useState<Tab>(() => tabFromHash())
  const [revision, setRevision] = useState(0)
  const [demo, setDemo] = useState(false)
  const [flexLaunch, setFlexLaunch] = useState<FlexibleLaunch | null>(null)
  const [flexSearchVisited, setFlexSearchVisited] = useState(false)
  const [onboardingTarget, setOnboardingTarget] = useState<'welcome' | 'resume' | 'flexible' | 'restore'>()
  const [keyRequest, setKeyRequest] = useState<KeyRequest | null>(null)
  const [resumeDirty, setResumeDirty] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null)
  const tabRef = useRef(tab)
  const resumeDirtyRef = useRef(false)
  const pendingNavigationRef = useRef<PendingNavigation | null>(null)
  // v2.4.1: which surface the workspace is showing. `undefined` = not chosen yet,
  // so we fall back to whatever the person actually has set up.
  const [workMode, setWorkMode] = useState<WorkMode>()
  const t = useT()
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

  // Restore the last chosen surface once, after the vault is open.
  useEffect(() => {
    if (vaultStatus === undefined || vaultStatus === 'locked') return
    void loadWorkMode().then((stored) => {
      if (stored) setWorkMode((current) => current ?? stored)
    })
  }, [vaultStatus])

  useEffect(() => {
    const openSourceReport = () => {
      changeTab('support')
    }
    window.addEventListener('klar:report-source', openSourceReport)
    return () => window.removeEventListener('klar:report-source', openSourceReport)
  }, [])

  useEffect(() => {
    if (!Object.values(TAB_HASH).includes(window.location.hash)) {
      history.replaceState(null, '', TAB_HASH[tabRef.current])
    }
    const restoreRoute = () => {
      const next = tabFromHash()
      if (
        tabRef.current === 'resume' &&
        resumeDirtyRef.current &&
        next !== 'resume'
      ) {
        // popstate already moved the address bar. Push the Resume route back as
        // the current entry; confirming then goes back once to the requested
        // history entry. This preserves both Back and Forward semantics.
        history.pushState(null, '', TAB_HASH.resume)
        setPendingRoute({ next, source: 'history' })
        return
      }
      tabRef.current = next
      setTab(next)
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
    window.addEventListener('popstate', restoreRoute)
    return () => window.removeEventListener('popstate', restoreRoute)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const root = document.querySelector<HTMLElement>(`[data-page="${tab}"]:not([hidden])`)
      const target = root?.querySelector<HTMLElement>('h1, h2') ?? root
      if (!target) return
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1
      target.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [setupState?.kind, tab])

  useEffect(() => {
    if (canonical === undefined) return
    if (shouldVisitFlexibleSearch({
      tab: tab === 'resume' || tab === 'support' ? 'dashboard' : tab,
      hasCareer: Boolean(canonical),
      workMode,
    })) {
      setFlexSearchVisited(true)
    }
  }, [canonical, tab, workMode])

  async function requireGroq(action: string): Promise<string | null> {
    // Re-read storage at action time. A returning user can click before the
    // startup effect has copied their saved key into React state.
    const available = await resolveAvailableGroqKey(apiKey).catch(() => undefined)
    if (available) {
      setApiKey(available)
      return available
    }
    return new Promise((resolve) => setKeyRequest({ action, resolve }))
  }
  function finishKey(key: string | null) {
    if (key) setApiKey(key)
    keyRequest?.resolve(key); setKeyRequest(null)
  }
  function refresh() { setRevision((value) => value + 1) }
  function setPendingRoute(next: PendingNavigation | null) {
    pendingNavigationRef.current = next
    setPendingNavigation(next)
  }
  function updateResumeDirty(next: boolean) {
    resumeDirtyRef.current = next
    setResumeDirty(next)
  }
  function commitTab(next: Tab, mode: 'push' | 'replace' = 'push') {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    if (window.location.hash !== TAB_HASH[next]) {
      if (mode === 'replace') history.replaceState(null, '', TAB_HASH[next])
      else history.pushState(null, '', TAB_HASH[next])
    }
    tabRef.current = next
    setTab(next)
  }
  function changeTab(next: Tab) {
    if (next === tabRef.current) return
    if (tabRef.current === 'resume' && resumeDirtyRef.current && next !== 'resume') {
      setPendingRoute({ next, source: 'request' })
      return
    }
    commitTab(next)
  }
  function cancelPendingNavigation() {
    setPendingRoute(null)
  }
  function confirmPendingNavigation() {
    const pending = pendingNavigationRef.current
    if (!pending) return
    updateResumeDirty(false)
    setPendingRoute(null)
    if (pending.source === 'history') history.back()
    else commitTab(pending.next)
  }

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

  // ---------------------------------------------------------------------------
  // v2.4.1 routing. Career discovery needs a resume; Flexible Work never does.
  // Both are always reachable — having a resume no longer hides Flexible Work.
  // ---------------------------------------------------------------------------
  const hasCareer = Boolean(canonical && profile)
  const activeMode: WorkMode = hasCareer ? (workMode ?? 'career') : 'flexible'
  const showFlexible = activeMode === 'flexible'
  const flexiblePreferences = flexLaunch?.preferences ?? currentPreferences.flexibleWork

  async function saveResume(data: ResumeData) { await saveCanonicalResume(data, { reason: 'edit' }); refresh() }
  async function replaceResume(data: ResumeData) { await replaceCanonicalResume(data); refresh() }
  async function addResume() {
    await saveOnboardingProgress('resume', currentPreferences.discoveryMode === 'flexible' ? 'both' : currentPreferences.discoveryMode ?? 'career')
    setOnboardingTarget('resume')
    refresh()
  }
  async function editFlexible() {
    // Drop any launched saved search so the edited preferences are what runs next.
    setFlexLaunch(null)
    await saveOnboardingProgress('flexible', currentPreferences.discoveryMode === 'career' ? 'both' : currentPreferences.discoveryMode ?? 'flexible')
    await saveWorkMode('flexible')
    setWorkMode('flexible')
    setOnboardingTarget('flexible')
    refresh()
  }
  // v2.5: the flexible prepare drawer can save the OPTIONAL contact block. It is
  // merged back into the same preferences row, so it lives inside the existing
  // encrypted boundary and never becomes a second source of truth.
  async function saveFlexiblePreferences(value: FlexibleWorkPreferences) {
    await savePreferences({ ...currentPreferences, flexibleWork: value })
    refresh()
  }
  async function changeWorkMode(next: WorkMode) {
    if (next === activeMode) return
    setFlexLaunch(null)
    setWorkMode(next)
    await saveWorkMode(next)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  // Only meaningful once career discovery exists; otherwise there is nothing to
  // switch between and the workspace is Flexible Work by definition.
  const switcher = hasCareer
    ? <WorkModeSwitch mode={activeMode} onChange={(next) => void changeWorkMode(next)} />
    : undefined

  const flexibleHome = (
    <FlexibleWorkHome
      preferences={currentPreferences}
      onSearch={(launch) => {
        setFlexLaunch(launch)
        setFlexSearchVisited(true)
        changeTab('search')
      }}
      onEdit={() => void editFlexible()}
      onAddResume={hasCareer ? undefined : () => void addResume()}
      onSupport={() => changeTab('support')}
      switcher={switcher}
    />
  )

  return <>
    <Shell tab={tab} setTab={changeTab}>
      {tab === 'dashboard' && (
        <div data-page="dashboard">
          {showFlexible
            ? flexibleHome
            : <div className="page-container">
                {switcher && <div className="mb-4">{switcher}</div>}
                <SetupChecklist resume={canonical!.data} preferences={preferences} onProfile={() => changeTab('resume')} onPreferences={() => changeTab('settings')} onAdzuna={() => changeTab('settings')} onAddResume={() => void addResume()} />
                <DashboardStep profile={profile!} prefs={preferences} onResume={() => changeTab('resume')} onSupport={() => changeTab('support')} />
              </div>}
        </div>
      )}

      {/* Career search stays mounted so a long run is not thrown away on tab change. */}
      <div data-page="search" hidden={tab !== 'search' || showFlexible}>{hasCareer
        ? <SearchStep active={tab === 'search' && !showFlexible} resume={canonical!.data} profile={profile!} prefs={preferences} apiKey={apiKey} requireGroq={requireGroq} switcher={switcher} />
        : null}</div>

      {/* Flexible Search also stays mounted after its first visit. The wordmark
          and navigation can hide it without discarding a live run, results,
          pagination, or an open preparation drawer. */}
      {flexSearchVisited && (
        <div data-page="search" hidden={tab !== 'search' || !showFlexible}>
          {flexiblePreferences && (
            <FlexibleSearch
              active={tab === 'search' && showFlexible}
              key={flexLaunch?.savedSearchId ?? 'default'}
              preferences={flexiblePreferences}
              savedSearchId={flexLaunch?.savedSearchId}
              onEdit={() => void editFlexible()}
              switcher={switcher}
              onSavePreferences={(value) => void saveFlexiblePreferences(value)}
            />
          )}
        </div>
      )}
      {tab === 'search' && showFlexible && !flexiblePreferences && (
        <div data-page="search">{flexibleHome}</div>
      )}

      {tab === 'tracker' && (
        <div data-page="tracker">
          <TrackerBoard
            profile={profile ?? undefined}
            prefs={preferences}
          />
        </div>
      )}
      {tab === 'settings' && (
        <div data-page="settings">
          <SettingsStep
            onReset={refresh}
            apiKey={apiKey}
            onEditFlexible={() => void editFlexible()}
            hasFlexible={Boolean(preferences.flexibleWork)}
          />
        </div>
      )}
      {tab === 'resume' && canonical && (
        <ResumeWorkspace
          resume={canonical.data}
          apiKey={apiKey}
          requireGroq={requireGroq}
          onSave={saveResume}
          onReplace={replaceResume}
          onChanged={refresh}
          onDirtyChange={updateResumeDirty}
          onBack={() => changeTab('dashboard')}
        />
      )}
      {tab === 'resume' && !canonical && (
        <ResumeEmptyWorkspace
          onAdd={() => void addResume()}
          onBack={() => changeTab('dashboard')}
        />
      )}
      {tab === 'support' && <SupportWorkspace onBack={() => changeTab('dashboard')} />}
    </Shell>
    {keyRequest && <GroqKeyPrompt action={keyRequest.action} onReady={(key) => finishKey(key)} onCancel={() => finishKey(null)} />}
    <ConfirmDialog
      open={Boolean(pendingNavigation && resumeDirty)}
      title={t('route.unsavedTitle')}
      description={t('route.unsavedBody')}
      confirmLabel={t('route.discardAndLeave')}
      cancelLabel={t('route.keepEditing')}
      onConfirm={confirmPendingNavigation}
      onCancel={cancelPendingNavigation}
    />
  </>
}

const TABS: { id: PrimaryTab; labelKey: TranslationKey; icon: LucideIcon }[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'search', labelKey: 'nav.search', icon: Search },
  { id: 'tracker', labelKey: 'nav.tracker', icon: ListChecks },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
]

function Wordmark({ onDashboard }: { onDashboard: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      aria-label={t('shell.wordmarkDashboard')}
      className="min-h-tap rounded-md px-1 text-left font-display text-2xl font-bold leading-none tracking-[-0.04em] text-ink transition hover:text-accent sm:text-[28px]"
      onClick={onDashboard}
    >
      Klar<span className="text-accent">.</span>
    </button>
  )
}

function Shell({ children, tab, setTab, minimal }: { children: React.ReactNode; tab: Tab; setTab: (tab: Tab) => void; minimal?: boolean }) {
  const t = useT()
  const primaryTab: PrimaryTab = tab === 'resume' || tab === 'support' ? 'dashboard' : tab
  if (minimal) return <div className="min-h-[100dvh] bg-bg text-ink"><header className="border-b border-border bg-surface"><div className="mx-auto flex max-w-[1200px] items-center px-4 py-4 sm:px-6"><Wordmark onDashboard={() => setTab('dashboard')} /></div></header><main id="main" className="mx-auto max-w-[1200px]">{children}</main></div>
  return <div className="min-h-[100dvh] bg-bg text-ink"><a href="#main" className="skip-link sr-only">{t('shell.skipToContent')}</a><aside aria-label={t('nav.aria')} className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar sm:flex"><div className="px-5 py-3"><Wordmark onDashboard={() => setTab('dashboard')} /></div><nav className="flex flex-1 flex-col gap-1 px-3">{TABS.map((item) => { const active = primaryTab === item.id; const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} aria-current={active ? 'page' : undefined} className={`flex min-h-tap items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition ${active ? 'bg-accent-tint text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}><Icon aria-hidden="true" size={20} strokeWidth={2} className="shrink-0" />{t(item.labelKey)}</button> })}</nav><div className="border-t border-sidebar-border p-3"><PreferenceControls stack /></div></aside><main id="main" className="pt-[calc(env(safe-area-inset-top)+57px)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pl-64 sm:pt-0 sm:pb-0">{children}</main><nav aria-label={t('nav.ariaMobile')} className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] sm:hidden"><div className="mx-auto grid max-w-[1200px] grid-cols-4">{TABS.map((item) => { const active = primaryTab === item.id; const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} aria-current={active ? 'page' : undefined} className={`flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-xs font-medium ${active ? 'text-accent' : 'text-muted'}`}><Icon aria-hidden="true" size={22} strokeWidth={2} />{t(item.labelKey)}</button> })}</div></nav><div className="fixed inset-x-0 top-0 z-20 border-b border-border bg-surface pt-[env(safe-area-inset-top)] sm:hidden"><div className="flex h-14 items-center justify-between gap-2 px-4"><Wordmark onDashboard={() => setTab('dashboard')} /><PreferenceControls compact /></div></div></div>
}
