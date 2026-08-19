import { useEffect, useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import { PreferenceControls } from './PreferenceControls'
import { SafetyCenter } from './SafetyCenter'
import { EngineSettingsCard, FeatureFlagsCard } from './EngineSettings'
import { BudgetNotice } from './BudgetNotice'
import { ErrorNotice } from './ErrorNotice'
import { DesktopCapabilityPanel } from './DesktopCapabilityPanel'
import { ConfirmDialog } from './ConfirmDialog'
import { wipeAllData } from '../db/db'
import { clearGroqKey } from '../settings/keys'
import { clearAdzunaKey, loadAdzunaKey, saveAdzunaKey } from '../settings/adzunaKey'
import { REGIONS, getActiveRegion, setActiveRegion, DEFAULT_REGION_CODE } from '../regions'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'
import { testAdzunaConnection } from '../settings/adzunaConnection'
import { toAppError, type AppErrorData } from '../errors/appError'
import { lockVault } from '../crypto/vault'
import { APP_VERSION } from '../lib/version'

export function SettingsStep({
  onReset,
  apiKey,
  onEditFlexible,
  hasFlexible,
}: {
  onReset: () => void
  apiKey?: string
  onEditFlexible?: () => void
  /** v2.4.1: false when no flexible search exists yet — the card invites setup. */
  hasFlexible?: boolean
}) {
  const t = useT()
  const [message, setMessage] = useState('')
  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false)
  const [regionCode, setRegionCode] = useState(DEFAULT_REGION_CODE)
  const [adzunaAppId, setAdzunaAppId] = useState('')
  const [adzunaAppKey, setAdzunaAppKey] = useState('')
  const [hasAdzunaKey, setHasAdzunaKey] = useState(false)
  const [adzunaMessage, setAdzunaMessage] = useState('')
  const [adzunaTesting, setAdzunaTesting] = useState(false)
  const [adzunaError, setAdzunaError] = useState<AppErrorData | null>(null)

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
    setWipeConfirmOpen(false)
    await wipeAllData()
    lockVault()
    await clearGroqKey()
    onReset()
  }

  return (
    <>
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
            <Button variant="danger" onClick={() => setWipeConfirmOpen(true)}>
              {t('settings.deleteAll')}
            </Button>
          </div>
          {message && <p className="mt-3 wrap-anywhere text-base text-muted">{message}</p>}
        </Card>

        <SafetyCenter apiKey={apiKey} />

        <DesktopCapabilityPanel />

        {onEditFlexible && (
          <Card className="mt-4 p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-ink">{t('flexible.home.eyebrow')}</h2>
            <p className="mt-1 text-base text-muted">{hasFlexible
              ? t('settings.flexibleExistingIntro')
              : t('settings.flexibleSetupIntro')}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={onEditFlexible}>
                {t(hasFlexible ? 'flexible.home.edit' : 'flexible.home.setUp')}
              </Button>
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

        {/* v2.5 · WS3 — the configurable OpenAI-compatible engine. */}
        <EngineSettingsCard apiKey={apiKey} />
        <div className="mt-4">
          <BudgetNotice />
        </div>

        {/* v2.5 · R10 — per-feature kill switches for the new application-quality work. */}
        <FeatureFlagsCard />

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

        <p className="mt-5 text-center text-sm text-faint" data-testid="app-version">
          Klar v{APP_VERSION}
        </p>
        </div>
      </div>
      <ConfirmDialog
        open={wipeConfirmOpen}
        title={t('settings.deleteDialogTitle')}
        description={t('settings.deleteConfirm')}
        confirmLabel={t('settings.deleteDialogConfirm')}
        cancelLabel={t('settings.deleteDialogCancel')}
        onConfirm={() => void wipe()}
        onCancel={() => setWipeConfirmOpen(false)}
      />
    </>
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
