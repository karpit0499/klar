// The one-time (per device) Groq key gate. The key goes straight to Groq — it
// never touches our Worker — so it lives only in this browser.
import { useEffect, useState } from 'react'
import { Button, Card, Field, TextInput, Spinner, Badge } from './atoms'
import { loadGroqKey, saveGroqKey, clearGroqKey, isRemembered } from '../settings/keys'
import { pingGroqKey } from '../llm/groq'
import { useT } from '../i18n/LocaleProvider'

export function KeyGate({ onReady }: { onReady: (key: string) => void }) {
  const t = useT()

  const [key, setKey] = useState('')
  const [remember, setRemember] = useState(true)
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [error, setError] = useState('')
  const [hasStored, setHasStored] = useState(false)

  useEffect(() => {
    void (async () => {
      const stored = await loadGroqKey()
      setRemember(await isRemembered())
      if (stored) {
        setKey(stored)
        setHasStored(true)
      }
    })()
  }, [])

  async function validateAndSave() {
    if (!key.trim()) return
    setStatus('checking')
    setError('')
    const res = await pingGroqKey(key.trim())
    if (res.ok) {
      await saveGroqKey(key.trim(), remember)
      setStatus('ok')
      onReady(key.trim())
    } else {
      setStatus('error')
      setError(res.error || t('key.keyFailed'))
    }
  }

  async function forget() {
    await clearGroqKey()
    setKey('')
    setHasStored(false)
    setStatus('idle')
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-ink">{t('key.title')}</h1>
        <p className="mt-2 text-sm text-muted">{t('key.intro')}</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>
            {t('key.step1Open')}{' '}
            <a className="text-accent underline" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
              console.groq.com/keys
            </a>{' '}
            {t('key.step1After')}
          </li>
          <li>{t('key.step2')}</li>
        </ol>

        <div className="mt-4 space-y-3">
          <Field label={t('key.fieldLabel')} hint={t('key.fieldHint')}>
            <TextInput
              type="password"
              placeholder="gsk_…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {t('key.remember')}
          </label>

          <div className="flex items-center gap-3">
            <Button onClick={validateAndSave} disabled={status === 'checking' || !key.trim()}>
              {status === 'checking' ? <Spinner label={t('key.validating')} /> : t('key.validateContinue')}
            </Button>
            {hasStored && (
              <Button variant="ghost" onClick={forget}>
                {t('key.forget')}
              </Button>
            )}
            {status === 'ok' && <Badge tone="success">{t('key.keyWorks')}</Badge>}
          </div>

          {status === 'error' && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Card>
    </div>
  )
}