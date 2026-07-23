import { useEffect, useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import { PreferenceControls } from './PreferenceControls'
import { ResumeStep } from './ResumeStep'
import { ResumeEditor } from './ResumeEditor'
import { RestoreBackup } from './RestoreBackup'
import { IntakeStep } from './IntakeStep'
import { FlexibleWorkSetup } from './FlexibleWorkSetup'
import type { LocalSetupState, OnboardingStep } from '../onboarding/setupState'
import {
  clearOnboardingProgress,
  restartSetupSafely,
  saveDiscoveryMode,
  saveOnboardingProgress,
} from '../onboarding/setupState'
import { clearResumeDraft, loadCanonicalResume, loadResumeDraft, saveCanonicalResume, saveResumeDraft } from '../resume/store'
import { deriveProfile } from '../resume/canonical'
import type { ResumeData } from '../resume/types'
import type { DiscoveryMode, FlexibleWorkPreferences, Preferences } from '../types'
import { loadPreferences, savePreferences } from '../storage/careerData'
import { DEFAULT_REGION_CODE, getActiveRegion, REGIONS, setActiveRegion } from '../regions'
import { saveAdzunaKey } from '../settings/adzunaKey'
import { useLocale } from '../i18n/LocaleProvider'

type View = OnboardingStep | 'partial' | 'restore'

export function AdaptiveOnboarding({ state, apiKey, requireGroq, onComplete, onRestored, onExplore, initialView }: {
  state: Exclude<LocalSetupState, { kind: 'complete' | 'locked' }>
  apiKey?: string
  requireGroq: (action: string) => Promise<string | null>
  onComplete: () => void
  onRestored: () => void
  onExplore: () => void
  initialView?: 'welcome' | 'resume' | 'flexible' | 'restore'
}) {
  const { locale } = useLocale(); const de = locale === 'de'
  const [view, setView] = useState<View>(initialView ?? (state.kind === 'partial' ? 'partial' : 'welcome'))
  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>(state.discoveryMode)
  const [draft, setDraft] = useState<ResumeData | null>(null)
  const [profile, setProfile] = useState<ReturnType<typeof deriveProfile> | null>(null)
  const [flexibleInitial, setFlexibleInitial] = useState<FlexibleWorkPreferences | null | undefined>(undefined)
  const [region, setRegion] = useState(DEFAULT_REGION_CODE)
  const [adzunaId, setAdzunaId] = useState('')
  const [adzunaKey, setAdzunaKey] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { void getActiveRegion().then((item) => setRegion(item.code)) }, [])
  useEffect(() => {
    if (view !== 'flexible' || flexibleInitial !== undefined) return
    let cancelled = false
    void loadPreferences().then((preferences) => {
      if (!cancelled) setFlexibleInitial(preferences?.flexibleWork ?? null)
    })
    return () => { cancelled = true }
  }, [flexibleInitial, view])

  async function go(next: OnboardingStep, mode: DiscoveryMode = discoveryMode) {
    setDiscoveryMode(mode)
    await saveOnboardingProgress(next, mode)
    setView(next)
  }
  async function beginCareer() { await saveDiscoveryMode('career'); await go('resume', 'career') }
  async function beginFlexible() { await saveDiscoveryMode('flexible'); await go('flexible', 'flexible') }
  async function resumeSetup() {
    const next = state.kind === 'partial' ? state.resumeAt : 'resume'
    if (next === 'review') {
      const saved = await loadResumeDraft(); if (saved) setDraft(saved.data); else { setView('resume'); return }
    }
    if (next === 'preferences') {
      const saved = await loadCanonicalResume(); if (saved) setProfile(deriveProfile(saved.data)); else { setView('resume'); return }
    }
    setDiscoveryMode(state.discoveryMode)
    setView(next)
  }
  async function acceptDraft(next: ResumeData) { setDraft(next); await saveResumeDraft(next); await go('review') }
  async function confirmResume() {
    if (!draft) return
    await saveResumeDraft(draft)
    await saveCanonicalResume(draft, { snapshotCurrent: true, reason: 'edit' })
    const derived = deriveProfile(draft); setProfile(derived); await go('preferences')
  }
  async function savePrefs(preferences: Preferences) {
    const existing = await loadPreferences()
    await savePreferences({ ...preferences, flexibleWork: existing?.flexibleWork, discoveryMode })
    await go('connections')
  }
  async function skipPrefs() {
    if (!profile) return
    const existing = await loadPreferences()
    await savePreferences({ ...defaultPreferences(profile), flexibleWork: existing?.flexibleWork, discoveryMode }); await go('connections')
  }
  async function saveFlexible(flexibleWork: FlexibleWorkPreferences) {
    const existing = await loadPreferences()
    await savePreferences({
      ...(existing ?? emptyPreferences()),
      discoveryMode,
      flexibleWork,
    })
    await finish()
  }
  async function returnToFlexible() {
    await clearOnboardingProgress()
    onComplete()
  }
  async function finish() { await clearResumeDraft(); await clearOnboardingProgress(); onComplete() }
  async function saveConnection() {
    if ((adzunaId.trim() && !adzunaKey.trim()) || (!adzunaId.trim() && adzunaKey.trim())) {
      setMessage(de ? 'Bitte App ID und App Key gemeinsam eingeben.' : 'Enter both App ID and App key.'); return
    }
    if (adzunaId.trim() && adzunaKey.trim()) await saveAdzunaKey(adzunaId, adzunaKey)
    await finish()
  }
  async function startOver() {
    if (!confirm(de ? 'Teilweise eingerichtete Daten werden als wiederherstellbare Version behalten. Neu starten?' : 'Partial setup data will be kept as a recoverable version. Start over?')) return
    await restartSetupSafely(discoveryMode); setDraft(null); setView(discoveryMode === 'flexible' ? 'flexible' : 'resume')
  }

  if (view === 'restore') return <Frame region={region} onRegion={setRegion} onRestore={() => setView('restore')}><RestoreBackup onRestored={onRestored} onCancel={() => setView(state.kind === 'partial' ? 'partial' : 'welcome')} /></Frame>

  return (
    <Frame region={region} onRegion={setRegion} onRestore={() => setView('restore')}>
      {view === 'welcome' && <Welcome onCareer={() => void beginCareer()} onFlexible={() => void beginFlexible()} onRestore={() => setView('restore')} onExplore={onExplore} />}
      {view === 'partial' && (
        <div className="mx-auto max-w-2xl p-4 sm:p-6"><Card className="p-5 sm:p-6">
          <h1 className="text-2xl font-semibold text-ink">{de ? 'Einrichtung fortsetzen?' : 'Continue your setup?'}</h1>
          <p className="mt-2 text-base text-muted">{de ? 'Klar hat einen unvollständigen lokalen Arbeitsbereich gefunden. Nichts wird ohne Bestätigung gelöscht.' : 'Klar found an incomplete local workspace. Nothing is deleted without confirmation.'}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3"><Button onClick={() => void resumeSetup()}>{de ? 'Fortsetzen' : 'Continue setup'}</Button><Button variant="ghost" onClick={() => setView('restore')}>{de ? 'Sicherung laden' : 'Restore backup'}</Button><Button variant="ghost" onClick={() => void startOver()}>{de ? 'Neu starten' : 'Start over'}</Button></div>
        </Card></div>
      )}
      {view === 'resume' && state.kind === 'partial' && state.capabilities.canDiscoverFlexible && (
        <div className="mx-auto max-w-2xl px-4 pt-4 sm:px-6">
          <Button variant="ghost" onClick={() => void returnToFlexible()}>{de ? 'Zurück zu Flexible Arbeit' : 'Return to Flexible Work'}</Button>
        </div>
      )}
      {view === 'resume' && <ResumeStep apiKey={apiKey} requireGroq={requireGroq} onDraft={acceptDraft} />}
      {view === 'flexible' && flexibleInitial === undefined && (
        <div className="mx-auto max-w-4xl p-4 sm:p-6">
          <Card className="p-5 sm:p-6">
            <p className="text-base text-muted">{de ? 'Gespeicherte Suche wird geladen …' : 'Loading your saved search…'}</p>
          </Card>
        </div>
      )}
      {view === 'flexible' && flexibleInitial !== undefined && <FlexibleWorkSetup initial={flexibleInitial ?? undefined} onSave={saveFlexible} />}
      {view === 'review' && draft && <div className="mx-auto max-w-4xl p-4 sm:p-6"><ResumeEditor value={draft} onChange={(next) => { setDraft(next); void saveResumeDraft(next) }} onSave={() => void confirmResume()} saveLabel={de ? 'Bestätigen und fortfahren' : 'Confirm and continue'} /></div>}
      {view === 'preferences' && profile && <div><IntakeStep profile={profile} initial={undefined} onSave={savePrefs} /><div className="mx-auto -mt-4 max-w-2xl px-6 pb-6"><Button variant="ghost" onClick={() => void skipPrefs()}>{de ? 'Vorerst überspringen' : 'Skip for now'}</Button></div></div>}
      {view === 'connections' && (
        <div className="mx-auto max-w-2xl p-4 sm:p-6"><Card className="p-5 sm:p-6">
          <h1 className="text-2xl font-semibold text-ink">{de ? 'Jobsuche optional verbinden' : 'Optionally connect live job search'}</h1>
          <p className="mt-2 text-base text-muted">{de ? 'Adzuna ist kein Pflichtschritt. Profil, eingefügte Stellen und Bewerbungsunterlagen funktionieren ohne diese Verbindung.' : 'Adzuna is not required. Your profile, pasted jobs, and application preparation work without it.'}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Adzuna App ID"><TextInput value={adzunaId} onChange={(e) => setAdzunaId(e.target.value)} /></Field><Field label="Adzuna App key"><TextInput type="password" value={adzunaKey} onChange={(e) => setAdzunaKey(e.target.value)} /></Field></div>
          {message && <p className="mt-3 text-sm text-danger">{message}</p>}
          <div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => void saveConnection()}>{adzunaId && adzunaKey ? (de ? 'Verbinden und öffnen' : 'Connect and open Klar') : (de ? 'Klar öffnen' : 'Open Klar')}</Button><Button variant="ghost" onClick={() => void finish()}>{de ? 'Überspringen' : 'Skip'}</Button></div>
        </Card></div>
      )}
    </Frame>
  )
}

function Frame({ children, region, onRegion, onRestore }: { children: React.ReactNode; region: string; onRegion: (code: string) => void; onRestore: () => void }) {
  const { locale } = useLocale(); const de = locale === 'de'
  async function change(code: string) { onRegion(code); await setActiveRegion(code) }
  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-5xl grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2 px-4 py-3 sm:grid-cols-[auto_1fr_auto] sm:gap-x-4 sm:px-6">
          <span className="font-display text-2xl font-bold leading-none tracking-[-0.04em] text-ink">
            Klar<span className="text-accent">.</span>
          </span>
          <div className="justify-self-end sm:justify-self-center">
            <PreferenceControls compact />
          </div>
          <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-1 sm:flex-nowrap sm:justify-self-end">
            <label className="text-sm text-muted">
              <span className="sr-only">{de ? 'Region' : 'Region'}</span>
              <select className="min-h-tap rounded-md border border-border bg-surface px-3 text-ink" value={region} onChange={(e) => void change(e.target.value)}>
                {Object.values(REGIONS).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <Button size="sm" variant="ghost" onClick={onRestore}>{de ? 'Sicherung laden' : 'Restore backup'}</Button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}

function Welcome({ onCareer, onFlexible, onRestore, onExplore }: { onCareer: () => void; onFlexible: () => void; onRestore: () => void; onExplore: () => void }) {
  const { locale } = useLocale(); const de = locale === 'de'
  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10"><div className="py-6 text-center sm:py-10"><h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">{de ? 'Arbeit finden. Auf deine Art.' : 'Find work your way.'}</h1><p className="mx-auto mt-3 max-w-2xl text-base text-muted sm:text-lg">{de ? 'Baue dein Karriereprofil auf oder suche flexible Arbeit ohne Lebenslauf.' : 'Build your career profile or look for flexible work without a résumé.'}</p></div><div className="grid gap-4 sm:grid-cols-2"><Choice title={de ? 'Karriereprofil erstellen' : 'Build my career profile'} body={de ? 'Lebenslauf hochladen oder manuell erstellen.' : 'Upload a résumé or create it manually.'} onClick={onCareer} /><Choice title={de ? 'Flexible Arbeit finden' : 'Find flexible work'} body={de ? 'Minijobs und Teilzeit nach Ort und Arbeitsart suchen – ohne Lebenslauf.' : 'Search minijobs and part-time work by place and work type—no résumé required.'} onClick={onFlexible} /><Choice title={de ? 'Klar-Sicherung laden' : 'Restore Klar backup'} body={de ? 'Vor der Einrichtung prüfen und vollständig wiederherstellen.' : 'Validate and fully restore before setup.'} onClick={onRestore} /><Choice title={de ? 'Klar erkunden' : 'Explore Klar'} body={de ? 'Temporäre Beispieldaten, keine Schlüssel erforderlich.' : 'Temporary sample data, no keys required.'} onClick={onExplore} /></div></div>
}
function Choice({ title, body, onClick }: { title: string; body: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex min-h-36 flex-col justify-center rounded-xl border border-border bg-surface p-5 text-left shadow-card transition hover:border-accent sm:min-h-40 sm:p-6"><span className="text-lg font-semibold text-ink sm:text-xl">{title}</span><span className="mt-2 block text-sm text-muted sm:text-base">{body}</span></button> }

function defaultPreferences(profile: ReturnType<typeof deriveProfile>): Preferences {
  return {
    targetTitles: [...new Set(profile.titles.map((item) => item.title).filter(Boolean))], fields: profile.domains,
    seniority: 'mid', salary: { currency: 'EUR', period: 'year' }, locations: [], workAuth: {},
    languages: profile.languages.map((item) => ({ lang: item.lang, min_level: item.level ?? '' })),
    mustHaves: [], dealbreakers: [],
  }
}

function emptyPreferences(): Preferences {
  return {
    targetTitles: [],
    fields: [],
    seniority: 'intern',
    salary: { currency: 'EUR', period: 'year' },
    locations: [],
    workAuth: {},
    languages: [],
    mustHaves: [],
    dealbreakers: [],
  }
}