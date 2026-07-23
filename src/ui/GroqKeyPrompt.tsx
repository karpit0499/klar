import { useEffect, useState } from 'react'
import { Button, Card, Field, Spinner, TextInput } from './atoms'
import { loadGroqKey, saveGroqKey } from '../settings/keys'
import { pingGroqKey } from '../llm/groq'
import { ErrorNotice } from './ErrorNotice'
import type { AppErrorData } from '../errors/appError'
import { useLocale } from '../i18n/LocaleProvider'

export function GroqKeyPrompt({ action, onReady, onCancel }: {
  action: string
  onReady: (key: string) => void
  onCancel: () => void
}) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [key, setKey] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AppErrorData | null>(null)

  useEffect(() => { void loadGroqKey().then((stored) => setKey(stored ?? '')) }, [])

  async function submit() {
    const clean = key.trim()
    if (!clean) return
    setBusy(true); setError(null)
    const result = await pingGroqKey(clean)
    if (!result.ok) {
      setError(result.error ?? {
        category: 'credentials', message: de ? 'Der Groq-Schlüssel konnte nicht bestätigt werden.' : 'The Groq key could not be verified.',
        dataSafe: true, available: de ? 'Deine lokalen Daten sind unverändert.' : 'Your local data is unchanged.',
        action: { label: de ? 'Schlüssel prüfen' : 'Check the key', kind: 'retry' },
      })
      setBusy(false); return
    }
    await saveGroqKey(clean, remember)
    setBusy(false); onReady(clean)
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <Card className="w-full max-w-lg p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-ink">{de ? 'Groq nur für diese KI-Aktion verbinden' : 'Connect Groq for this AI action'}</h2>
        <p className="mt-2 text-base text-muted">
          {de ? `Klar fragt jetzt, weil du „${action}“ gestartet hast. Lokale Funktionen benötigen keinen Schlüssel.` : `Klar is asking now because you started “${action}”. Local features do not need a key.`}
        </p>
        <div className="mt-4">
          <Field label={de ? 'Groq API-Schlüssel' : 'Groq API key'} hint={de ? 'Wird direkt an Groq gesendet.' : 'Sent directly to Groq.'}>
            <TextInput type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="gsk_…" autoComplete="off" />
          </Field>
        </div>
        <label className="mt-3 flex min-h-tap items-center gap-2 text-base text-ink">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          {de ? 'Auf diesem Gerät speichern' : 'Remember on this device'}
        </label>
        {error && <div className="mt-3"><ErrorNotice error={error} /></div>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => void submit()} disabled={busy || !key.trim()}>
            {busy ? <Spinner label={de ? 'Prüfen' : 'Checking'} /> : de ? 'Prüfen und fortfahren' : 'Verify and continue'}
          </Button>
          <Button variant="ghost" onClick={onCancel}>{de ? 'Abbrechen' : 'Cancel'}</Button>
        </div>
      </Card>
    </div>
  )
}