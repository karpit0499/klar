import { useEffect, useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import { PreferenceControls } from './PreferenceControls'
import { ResumeReupload } from './ResumeReupload'
import { ResumeEditor } from './ResumeEditor'
import { ResumeHistory } from './ResumeHistory'
import { SafetyCenter } from './SafetyCenter'
import { ErrorNotice } from './ErrorNotice'
import { wipeAllData } from '../db/db'
import { clearGroqKey } from '../settings/keys'
import { clearAdzunaKey, loadAdzunaKey, saveAdzunaKey } from '../settings/adzunaKey'
import { REGIONS, getActiveRegion, setActiveRegion, DEFAULT_REGION_CODE } from '../regions'
import { useLocale, useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'
import type { ResumeData } from '../resume/types'
import { testAdzunaConnection } from '../settings/adzunaConnection'
import { toAppError, type AppErrorData } from '../errors/appError'
import { lockVault } from '../crypto/vault'

export function SettingsStep({
  onReset,
  apiKey,
  requireGroq,
  resume,
  onSaveResume,
  onReplaceResume,
  onResumeChanged,
  onEditFlexible,
  onAddResume,
}: {
  onReset: () => void
  apiKey?: string
  requireGroq: (action: string) => Promise<string | null>
  resume?: ResumeData
  onSaveResume?: (resume: ResumeData) => void | Promise<void>
  onReplaceResume?: (resume: ResumeData) => void | Promise<void>
  onResumeChanged?: () => void
  onEditFlexible?: () => void
  onAddResume?: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const de = locale === 'de'
  const [message, setMessage] = useState('')
  const [regionCode, setRegionCode] = useState(DEFAULT_REGION_CODE)
  const [adzunaAppId, setAdzunaAppId] = useState('')
  const [adzunaAppKey, setAdzunaAppKey] = useState('')
  const [hasAdzunaKey, setHasAdzunaKey] = useState(false)
  const [adzunaMessage, setAdzunaMessage] = useState('')
  const [adzunaTesting, setAdzunaTesting] = useState(false)
  const [adzunaError, setAdzunaError] = useState<AppErrorData | null>(null)
  const [resumeDraft, setResumeDraft] = useState<ResumeData | null>(() => resume ? structuredClone(resume) : null)
  const [resumeSaved, setResumeSaved] = useState('')

  useEffect(() => {
    void getActiveRegion().then((region) => setRegionCode(region.code))
    void loadAdzunaKey()
      .then((credentials) => {
        if (!credentials) return
        setAdzunaAppId(credentials.appId)
        setAdzunaAppKey(credentials.appKey)
        setHasAdzunaKey(true)
      })
      .catch((error) => setAdzunaError(toAppError(error, {
        message: 'Klar could not read the saved Adzuna credentials.',
        dataSafe: true,
        available: 'Other sources remain available.',
        action: { label: 'Enter a complete pair', kind: 'open_settings' },
      })))
  }, [])

  useEffect(() => { setResumeDraft(resume ? structuredClone(resume) : null) }, [resume])

  async function changeRegion(code: string) {
    setRegionCode(code)
    await setActiveRegion(code)
    setMessage(t('settings.regionChanged', { region: t(regionLabelKey(code)) }))
  }

  async function saveAdzuna() {
    setAdzunaError(null)
    const appId = adzunaAppId.trim()
    const appKey = adzunaAppKey.trim()
    if (!appId || !appKey) {
      setAdzunaMessage(t('settings.adzunaBothRequired'))
      return
    }
    try {
      await saveAdzunaKey(appId, appKey)
      setHasAdzunaKey(true)
      setAdzunaMessage(t('settings.adzunaSaved'))
    } catch (error) {
      setAdzunaError(toAppError(error, {
        message: t('settings.adzunaBothRequired'),
        dataSafe: true,
        available: 'Other job sources remain available.',
        action: { label: t('settings.adzunaBothRequired'), kind: 'open_settings' },
      }))
    }
  }

  async function removeAdzuna() {
    await clearAdzunaKey()
    setAdzunaAppId('')
    setAdzunaAppKey('')
    setHasAdzunaKey(false)
    setAdzunaMessage(t('settings.adzunaRemoved'))
  }

  async function testAdzuna() {
    setAdzunaTesting(true)
    setAdzunaError(null)
    const result = await testAdzunaConnection({ appId: adzunaAppId.trim(), appKey: adzunaAppKey.trim() })
    if (result.ok) setAdzunaMessage(t('settings.adzunaWorks'))
    else setAdzunaError(result.error)
    setAdzunaTesting(false)
  }

  async function wipe() {
    if (!confirm(t('settings.deleteConfirm'))) return
    await wipeAllData()
    lockVault()
    await clearGroqKey()
    onReset()
  }

  return (
    <div className="page-container">
      <div className="reading-container">
        <Card className="p-4 sm:p-6">
          <h1 className="font-display text-display-md font-semibold text-ink">
            {t('settings.title')}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted">{t('settings.intro')}</p>
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4 text-base leading-relaxed text-ink">
            {t('settings.dataWarning')}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="danger" onClick={wipe}>
              {t('settings.deleteAll')}
            </Button>
          </div>
          {message && <p className="mt-3 wrap-anywhere text-base text-muted">{message}</p>}
        </Card>

        <SafetyCenter apiKey={apiKey} />

        {(onEditFlexible || onAddResume) && (
          <Card className="mt-4 p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-ink">{de ? 'Flexible Arbeit' : 'Flexible Work'}</h2>
            <p className="mt-1 text-base text-muted">{de ? 'Passe Orte, Arbeitsarten und Verfügbarkeit an oder ergänze einen Lebenslauf für Karrierejobs.' : 'Adjust locations, work types, and availability, or add a résumé for career roles.'}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {onEditFlexible && <Button onClick={onEditFlexible}>{de ? 'Flexible Suche bearbeiten' : 'Edit flexible search'}</Button>}
              {onAddResume && <Button variant="ghost" onClick={onAddResume}>{de ? 'Lebenslauf hinzufügen' : 'Add résumé'}</Button>}
            </div>
          </Card>
        )}

        <Card className="mt-4 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{t('preferences.title')}</h2>
          <p className="mt-1 text-base text-muted">{t('preferences.intro')}</p>
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
            <PreferenceControls />
          </div>
        </Card>

        <Card className="mt-4 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{t('settings.adzunaTitle')}</h2>
          <p className="mt-1 text-base leading-relaxed text-muted">{t('settings.adzunaIntro')}</p>
          <a
            className="mt-2 inline-block wrap-anywhere text-sm text-accent underline"
            href="https://developer.adzuna.com/"
            target="_blank"
            rel="noreferrer"
          >
            developer.adzuna.com
          </a>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.adzunaAppId')}>
              <TextInput
                value={adzunaAppId}
                onChange={(event) => setAdzunaAppId(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label={t('settings.adzunaAppKey')}>
              <TextInput
                type="password"
                value={adzunaAppKey}
                onChange={(event) => setAdzunaAppKey(event.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={saveAdzuna}>{t('common.save')}</Button>
            <Button
              variant="ghost"
              disabled={adzunaTesting || !adzunaAppId.trim() || !adzunaAppKey.trim()}
              onClick={() => void testAdzuna()}
            >
              {adzunaTesting ? t('settings.adzunaTesting') : t('settings.adzunaTest')}
            </Button>
            {hasAdzunaKey && (
              <Button variant="ghost" onClick={removeAdzuna}>
                {t('settings.adzunaRemove')}
              </Button>
            )}
          </div>
          <p className="mt-3 text-sm text-faint">{t('settings.adzunaPrivacy')}</p>
          {adzunaMessage && <p className="mt-3 text-base text-muted">{adzunaMessage}</p>}
          {adzunaError && <div className="mt-3"><ErrorNotice error={adzunaError} /></div>}
        </Card>

        {resumeDraft && onSaveResume && <Card className="mt-4 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{t('settings.resumeTitle')}</h2>
          <p className="mt-1 text-base leading-relaxed text-muted">{t('settings.resumeIntro')}</p>
          <div className="mt-4">
            <ResumeEditor
              value={resumeDraft}
              onChange={setResumeDraft}
              onSave={() => void (async () => {
                await onSaveResume(resumeDraft)
                setResumeSaved(de ? 'Gespeichert' : 'Saved')
                setTimeout(() => setResumeSaved(''), 1500)
              })()}
            />
            {resumeSaved && <p className="mt-2 text-sm text-success">{resumeSaved}</p>}
          </div>
        </Card>}

        {onReplaceResume && <Card className="mt-4 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{de ? 'Lebenslauf ersetzen' : 'Replace résumé'}</h2>
          <p className="mt-1 text-base leading-relaxed text-muted">{de ? 'Prüfe jeden Abschnitt vor dem vollständigen Ersetzen. Klar speichert die aktuelle Version automatisch.' : 'Preview every section before a full replacement. Klar saves the current version automatically.'}</p>
          <div className="mt-4">
            <ResumeReupload apiKey={apiKey} requireGroq={requireGroq} onReplace={onReplaceResume} />
          </div>
        </Card>}

        {onResumeChanged && <Card className="mt-4 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{de ? 'Lebenslauf-Verlauf' : 'Résumé history'}</h2>
          <div className="mt-4"><ResumeHistory onRestored={onResumeChanged} /></div>
        </Card>}

        <Card className="mt-4 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{t('settings.regionTitle')}</h2>
          <p className="mt-1 text-base leading-relaxed text-muted">{t('settings.regionIntro')}</p>
          <div className="mt-4 max-w-xs">
            <Field label={t('settings.activeRegion')}>
              <select
                className="min-h-tap w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-ink"
                value={regionCode}
                onChange={(event) => void changeRegion(event.target.value)}
              >
                {Object.values(REGIONS).map((region) => (
                  <option key={region.code} value={region.code}>
                    {t(regionLabelKey(region.code))}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>
      </div>
    </div>
  )
}

function regionLabelKey(code: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    de: 'region.de',
    at: 'region.at',
    ch: 'region.ch',
    nl: 'region.nl',
    lu: 'region.lu',
    li: 'region.li',
  }
  return keys[code] ?? 'region.de'
}