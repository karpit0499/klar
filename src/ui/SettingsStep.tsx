import { useEffect, useRef, useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import { PreferenceControls } from './PreferenceControls'
import { ResumeReupload } from './ResumeReupload'
import { exportAll, importAll, wipeAllData } from '../db/db'
import { clearGroqKey } from '../settings/keys'
import { clearAdzunaKey, loadAdzunaKey, saveAdzunaKey } from '../settings/adzunaKey'
import { REGIONS, getActiveRegion, setActiveRegion, DEFAULT_REGION_CODE } from '../regions'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'
import type { Profile } from '../types'

export function SettingsStep({
  onReset,
  apiKey,
  onReplaceProfile,
}: {
  onReset: () => void
  apiKey: string
  onReplaceProfile: (profile: Profile) => void | Promise<void>
}) {
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [regionCode, setRegionCode] = useState(DEFAULT_REGION_CODE)
  const [adzunaAppId, setAdzunaAppId] = useState('')
  const [adzunaAppKey, setAdzunaAppKey] = useState('')
  const [hasAdzunaKey, setHasAdzunaKey] = useState(false)
  const [adzunaMessage, setAdzunaMessage] = useState('')

  useEffect(() => {
    void getActiveRegion().then((region) => setRegionCode(region.code))
    void loadAdzunaKey().then((credentials) => {
      if (!credentials) return
      setAdzunaAppId(credentials.appId)
      setAdzunaAppKey(credentials.appKey)
      setHasAdzunaKey(true)
    })
  }, [])

  async function changeRegion(code: string) {
    setRegionCode(code)
    await setActiveRegion(code)
    setMessage(t('settings.regionChanged', { region: t(regionLabelKey(code)) }))
  }

  async function saveAdzuna() {
    const appId = adzunaAppId.trim()
    const appKey = adzunaAppKey.trim()
    if (!appId || !appKey) {
      setAdzunaMessage(t('settings.adzunaBothRequired'))
      return
    }
    await saveAdzunaKey(appId, appKey)
    setHasAdzunaKey(true)
    setAdzunaMessage(t('settings.adzunaSaved'))
  }

  async function removeAdzuna() {
    await clearAdzunaKey()
    setAdzunaAppId('')
    setAdzunaAppKey('')
    setHasAdzunaKey(false)
    setAdzunaMessage(t('settings.adzunaRemoved'))
  }

  async function doExport() {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `klar-export-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage(t('settings.exported'))
  }

  async function doImport(file: File) {
    try {
      const text = await file.text()
      await importAll(JSON.parse(text))
      setMessage(t('settings.imported'))
      setTimeout(() => location.reload(), 600)
    } catch (error) {
      setMessage(
        t('settings.importFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  async function wipe() {
    if (!confirm(t('settings.deleteConfirm'))) return
    await wipeAllData()
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
            <Button onClick={doExport}>{t('settings.export')}</Button>
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              {t('settings.import')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void doImport(file)
              }}
            />
            <Button variant="danger" onClick={wipe}>
              {t('settings.deleteAll')}
            </Button>
          </div>
          <p className="mt-3 text-sm text-faint">{t('settings.credentialsExcluded')}</p>
          {message && <p className="mt-3 wrap-anywhere text-base text-muted">{message}</p>}
        </Card>

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
            {hasAdzunaKey && (
              <Button variant="ghost" onClick={removeAdzuna}>
                {t('settings.adzunaRemove')}
              </Button>
            )}
          </div>
          <p className="mt-3 text-sm text-faint">{t('settings.adzunaPrivacy')}</p>
          {adzunaMessage && <p className="mt-3 text-base text-muted">{adzunaMessage}</p>}
        </Card>

        <Card className="mt-4 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{t('settings.resumeTitle')}</h2>
          <p className="mt-1 text-base leading-relaxed text-muted">{t('settings.resumeIntro')}</p>
          <div className="mt-4">
            <ResumeReupload apiKey={apiKey} onReplace={onReplaceProfile} />
          </div>
        </Card>

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