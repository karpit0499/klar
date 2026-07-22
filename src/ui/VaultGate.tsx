import { useState } from 'react'
import { unlockVault } from '../crypto/vault'
import { toAppError, type AppErrorData } from '../errors/appError'
import { Button, Card, Field, Spinner, TextInput } from './atoms'
import { ErrorNotice } from './ErrorNotice'
import { useT } from '../i18n/LocaleProvider'

export function VaultGate({ onUnlocked }: { onUnlocked: () => void }) {
  const t = useT()
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AppErrorData | null>(null)

  async function unlock() {
    setBusy(true)
    setError(null)
    try {
      await unlockVault(passphrase)
      setPassphrase('')
      onUnlocked()
    } catch (caught) {
      setError(toAppError(caught, {
        category: 'locked',
        message: 'Klar could not unlock the vault.',
        dataSafe: true,
        available: 'Your encrypted data remains unchanged.',
        action: { label: 'Check the passphrase and try again', kind: 'unlock' },
      }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-container">
      <div className="reading-container">
        <Card className="p-4 sm:p-6">
          <h1 className="font-display text-display-md font-semibold text-ink">{t('vault.title')}</h1>
          <p className="mt-2 text-base leading-relaxed text-muted">
            {t('vault.intro')}
          </p>
          <div className="mt-5">
            <Field label={t('vault.passphrase')}>
              <TextInput
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                autoComplete="current-password"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && passphrase) void unlock()
                }}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Button disabled={busy || !passphrase} onClick={() => void unlock()}>
              {busy ? <Spinner label={t('vault.unlocking')} /> : t('vault.unlock')}
            </Button>
          </div>
          {error && <div className="mt-4"><ErrorNotice error={error} /></div>}
        </Card>
      </div>
    </div>
  )
}