import { useEffect, useState } from 'react'
import { Badge, Button, Card, Field, Spinner, TextInput } from './atoms'
import { PreferenceControls } from './PreferenceControls'
import { loadGroqKey, saveGroqKey, clearGroqKey, isRemembered } from '../settings/keys'
import { loadAdzunaKey, saveAdzunaKey } from '../settings/adzunaKey'
import { pingGroqKey } from '../llm/groq'
import { useT } from '../i18n/LocaleProvider'

export function KeyGate({ onReady }: { onReady: (key: string) => void }) {
  const t = useT()
  const [key, setKey] = useState('')
  const [remember, setRemember] = useState(true)
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [error, setError] = useState('')
  const [hasStored, setHasStored] = useState(false)
  const [adzunaAppId, setAdzunaAppId] = useState('')
  const [adzunaAppKey, setAdzunaAppKey] = useState('')

  useEffect(() => {
    void (async () => {
      const [storedGroq, storedAdzuna, storedRemember] = await Promise.all([
        loadGroqKey(),
        loadAdzunaKey(),
        isRemembered(),
      ])
      setRemember(storedRemember)
      if (storedGroq) {
        setKey(storedGroq)
        setHasStored(true)
      }
      if (storedAdzuna) {
        setAdzunaAppId(storedAdzuna.appId)
        setAdzunaAppKey(storedAdzuna.appKey)
      }
    })()
  }, [])

  async function validateAndSave() {
    const cleanKey = key.trim()
    const cleanAppId = adzunaAppId.trim()
    const cleanAppKey = adzunaAppKey.trim()
    if (!cleanKey) return
    if ((cleanAppId && !cleanAppKey) || (!cleanAppId && cleanAppKey)) {
      setStatus('error')
      setError(t('key.adzunaBothRequired'))
      return
    }

    setStatus('checking')
    setError('')
    const result = await pingGroqKey(cleanKey)
    if (!result.ok) {
      setStatus('error')
      setError(result.error || t('key.keyFailed'))
      return
    }

    await saveGroqKey(cleanKey, remember)
    if (cleanAppId && cleanAppKey) await saveAdzunaKey(cleanAppId, cleanAppKey)
    setStatus('ok')
    onReady(cleanKey)
  }

  async function forget() {
    await clearGroqKey()
    setKey('')
    setHasStored(false)
    setStatus('idle')
  }

  return (
    <div className="page-container">
      <div className="reading-container">
        <Card className="p-4 sm:p-6">
          <h1 className="font-display text-display-md font-semibold text-ink">{t('key.title')}</h1>
          <p className="mt-2 text-base leading-relaxed text-muted">{t('key.intro')}</p>

          <ol className="mt-4 list-decimal space-y-2 pl-5 text-base leading-relaxed text-muted">
            <li>
              {t('key.step1Open')}{' '}
              <a
                className="wrap-anywhere text-accent underline"
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
              >
                console.groq.com/keys
              </a>{' '}
              {t('key.step1After')}
            </li>
            <li>{t('key.step2')}</li>
          </ol>

          <div className="mt-5 space-y-4">
            <Field label={t('key.fieldLabel')} hint={t('key.fieldHint')}>
              <TextInput
                type="password"
                placeholder="gsk_…"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                autoComplete="off"
              />
            </Field>

            <label className="flex min-h-tap items-center gap-2 text-base text-ink">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <span>{t('key.remember')}</span>
            </label>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{t('key.adzunaTitle')}</h2>
              <Badge tone="outline">{t('common.optional')}</Badge>
            </div>
            <p className="mt-1 text-base leading-relaxed text-muted">{t('key.adzunaIntro')}</p>
            <a
              className="mt-2 inline-block wrap-anywhere text-sm text-accent underline"
              href="https://developer.adzuna.com/"
              target="_blank"
              rel="noreferrer"
            >
              developer.adzuna.com
            </a>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t('key.adzunaAppId')}>
                <TextInput
                  value={adzunaAppId}
                  onChange={(event) => setAdzunaAppId(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label={t('key.adzunaAppKey')}>
                <TextInput
                  type="password"
                  value={adzunaAppKey}
                  onChange={(event) => setAdzunaAppKey(event.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h2 className="text-lg font-semibold text-ink">{t('preferences.title')}</h2>
            <p className="mt-1 text-base text-muted">{t('preferences.intro')}</p>
            <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
              <PreferenceControls />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={validateAndSave} disabled={status === 'checking' || !key.trim()}>
              {status === 'checking' ? (
                <Spinner label={t('key.validating')} />
              ) : (
                t('key.validateContinue')
              )}
            </Button>
            {hasStored && (
              <Button variant="ghost" onClick={forget}>
                {t('key.forget')}
              </Button>
            )}
            {status === 'ok' && <Badge tone="success">{t('key.keyWorks')}</Badge>}
          </div>

          {status === 'error' && <p className="mt-3 text-base text-danger">{error}</p>}
        </Card>
      </div>
    </div>
  )
}