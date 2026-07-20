// The one-time (per device) Groq key gate. The key goes straight to Groq — it
// never touches our Worker — so it lives only in this browser.
import { useEffect, useState } from 'react'
import { Button, Card, Field, TextInput, Spinner, Badge } from './atoms'
import { loadGroqKey, saveGroqKey, clearGroqKey, isRemembered } from '../settings/keys'
import { pingGroqKey } from '../llm/groq'

export function KeyGate({ onReady }: { onReady: (key: string) => void }) {
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
      setError(res.error || 'That key did not work.')
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
        <h1 className="text-xl font-semibold">Connect your free Groq key</h1>
        <p className="mt-2 text-sm text-gray-600">
          Klar uses Groq's free API for résumé parsing and job matching. Your key is sent
          only to Groq, directly from your browser — never to our server.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-600">
          <li>
            Open{' '}
            <a className="text-indigo-600 underline" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
              console.groq.com/keys
            </a>{' '}
            and create a key (free, ~30 seconds).
          </li>
          <li>Paste it below and click Validate.</li>
        </ol>

        <div className="mt-4 space-y-3">
          <Field label="Groq API key" hint="Starts with gsk_…">
            <TextInput
              type="password"
              placeholder="gsk_…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember on this device (uncheck on shared computers)
          </label>

          <div className="flex items-center gap-3">
            <Button onClick={validateAndSave} disabled={status === 'checking' || !key.trim()}>
              {status === 'checking' ? <Spinner label="Validating…" /> : 'Validate & continue'}
            </Button>
            {hasStored && (
              <Button variant="ghost" onClick={forget}>
                Forget key
              </Button>
            )}
            {status === 'ok' && <Badge tone="green">Key works</Badge>}
          </div>

          {status === 'error' && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </Card>
    </div>
  )
}