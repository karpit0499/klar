import { useEffect, useState } from 'react'
import { Button, Card } from './atoms'
import type { ResumeData } from '../resume/types'
import type { Preferences } from '../types'
import { analyzeResume } from '../resume/canonical'
import { loadAdzunaKey } from '../settings/adzunaKey'
import { createStandardBackup } from '../backup/backup'
import { getSetting, setSetting } from '../db/db'
import { useLocale } from '../i18n/LocaleProvider'

const DISMISSED = 'setupChecklistDismissedV1'
const BACKED_UP = 'setupChecklistBackedUpV1'

export function SetupChecklist({ resume, preferences, onProfile, onPreferences, onAdzuna, onAddResume }: {
  resume?: ResumeData
  preferences: Preferences
  onProfile: () => void
  onPreferences: () => void
  onAdzuna: () => void
  onAddResume: () => void
}) {
  const { locale } = useLocale(); const de = locale === 'de'
  const [visible, setVisible] = useState(false)
  const [adzuna, setAdzuna] = useState(false)
  const [backedUp, setBackedUp] = useState(false)
  useEffect(() => { void Promise.all([getSetting<boolean>(DISMISSED), getSetting<boolean>(BACKED_UP), loadAdzunaKey()]).then(([dismissed, backup, key]) => { setVisible(!dismissed); setBackedUp(Boolean(backup)); setAdzuna(Boolean(key)) }) }, [])
  if (!visible) return null
  const reviewed = Boolean(resume?.reviewedAt) && Boolean(resume && analyzeResume(resume).percentage >= 50)
  const hasPreferences = preferences.targetTitles.length > 0 || preferences.locations.length > 0 || Boolean(preferences.flexibleWork?.locations.length)
  async function backup() {
    const value = await createStandardBackup(); const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `klar-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url)
    await setSetting(BACKED_UP, true); setBackedUp(true)
  }
  const items = [
    {
      done: reviewed,
      label: resume
        ? (de ? 'Profil prüfen' : 'Review profile')
        : (de ? 'Lebenslauf optional hinzufügen' : 'Optionally add a résumé'),
      action: resume ? onProfile : onAddResume,
    },
    { done: hasPreferences, label: de ? 'Jobpräferenzen ergänzen' : 'Add job preferences', action: onPreferences },
    { done: adzuna, label: de ? 'Adzuna optional verbinden' : 'Optionally connect Adzuna', action: onAdzuna },
    { done: backedUp, label: de ? 'Erste Sicherung erstellen' : 'Create first backup', action: () => void backup() },
  ]
  return <Card className="mb-4 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-ink">{de ? 'Klar einrichten' : 'Finish setting up Klar'}</h2><p className="mt-1 text-sm text-muted">{de ? 'Kurze, kontextbezogene Schritte – kein blockierender Rundgang.' : 'Short contextual steps—no blocking tour.'}</p></div><Button size="sm" variant="ghost" onClick={() => { void setSetting(DISMISSED, true); setVisible(false) }}>{de ? 'Ausblenden' : 'Dismiss'}</Button></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{items.map((item) => <button type="button" key={item.label} onClick={item.action} className="flex min-h-tap items-center gap-3 rounded-md border border-border p-3 text-left text-sm text-ink hover:bg-surface-2"><span aria-hidden="true" className={item.done ? 'text-success' : 'text-faint'}>{item.done ? '✓' : '○'}</span>{item.label}</button>)}</div></Card>
}