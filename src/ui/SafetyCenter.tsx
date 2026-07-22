import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createCompleteEncryptedBackup,
  createDecryptedExport,
  createStandardBackup,
  importBackup,
  type BackupEnvelope,
} from '../backup/backup'
import { disableVault, enableVault, getVaultStatus, lockVault } from '../crypto/vault'
import { toAppError, type AppErrorData } from '../errors/appError'
import { useT } from '../i18n/LocaleProvider'
import { Button, Card, Field, TextInput } from './atoms'
import { ErrorNotice } from './ErrorNotice'

export function SafetyCenter({ apiKey }: { apiKey: string }) {
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const vaultStatus = useLiveQuery(getVaultStatus, [], undefined)
  const [backupPassword, setBackupPassword] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [decryptedConfirmation, setDecryptedConfirmation] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<AppErrorData | null>(null)

  async function action(name: string, run: () => Promise<void>) {
    setBusy(name)
    setMessage('')
    setError(null)
    try {
      await run()
    } catch (caught) {
      setError(toAppError(caught, {
        message: 'Klar could not complete this safety action.',
        dataSafe: true,
        available: 'Your current workspace remains available.',
        action: { label: 'Review the fields and try again', kind: 'retry' },
      }))
    } finally {
      setBusy('')
    }
  }

  function download(filename: string, backup: BackupEnvelope) {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage(t('safety.done'))
  }

  const stamp = new Date().toISOString().slice(0, 10)

  return (
    <Card className="mt-4 p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-ink">{t('safety.title')}</h2>
      <p className="mt-1 text-base leading-relaxed text-muted">{t('safety.intro')}</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-lg border border-border bg-surface-2 p-4">
          <h3 className="font-semibold text-ink">{t('safety.standard')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('safety.standardHint')}</p>
          <Button
            className="mt-3 max-w-full whitespace-normal text-left"
            disabled={Boolean(busy)}
            onClick={() => void action('standard', async () => {
              download(`klar-standard-${stamp}.json`, await createStandardBackup())
            })}
          >
            {t('safety.standard')}
          </Button>
        </section>

        <section className="min-w-0 rounded-lg border border-border bg-surface-2 p-4">
          <h3 className="font-semibold text-ink">{t('safety.complete')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('safety.completeHint')}</p>
          {vaultStatus === 'disabled' && (
            <div className="mt-3">
              <Field label={t('safety.backupPassword')}>
                <TextInput
                  type="password"
                  value={backupPassword}
                  onChange={(event) => setBackupPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
          )}
          <Button
            variant="ghost"
            className="mt-3 max-w-full whitespace-normal text-left"
            disabled={Boolean(busy)}
            onClick={() => void action('complete', async () => {
              download(
                `klar-complete-encrypted-${stamp}.json`,
                await createCompleteEncryptedBackup(backupPassword || undefined),
              )
            })}
          >
            {t('safety.complete')}
          </Button>
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-border p-4">
        <h3 className="font-semibold text-ink">{t('safety.import')}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t('safety.importHint')}</p>
        <Button variant="ghost" className="mt-3" onClick={() => fileRef.current?.click()}>
          {t('safety.import')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            void action('import', async () => {
              await importBackup(JSON.parse(await file.text()))
              setMessage(t('safety.restored'))
              setTimeout(() => location.reload(), 600)
            })
          }}
        />
      </section>

      <section className="mt-4 rounded-lg border border-border p-4">
        <h3 className="font-semibold text-ink">{t('safety.encryptionTitle')}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {vaultStatus === 'unlocked'
            ? t('safety.encryptionUnlocked')
            : vaultStatus === 'locked'
              ? t('safety.encryptionLocked')
              : t('safety.encryptionDisabled')}
        </p>
        {vaultStatus === 'disabled' && (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t('safety.passphrase')}>
                <TextInput type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" />
              </Field>
              <Field label={t('safety.confirmPassphrase')}>
                <TextInput type="password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} autoComplete="new-password" />
              </Field>
            </div>
            <label className="mt-3 flex min-h-tap items-start gap-2 text-sm leading-relaxed text-ink">
              <input className="mt-1" type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>{t('safety.acknowledge')}</span>
            </label>
            <Button
              className="mt-3"
              disabled={Boolean(busy) || !acknowledged}
              onClick={() => void action('enable', async () => {
                if (passphrase !== confirmPassphrase) throw new Error(t('safety.passphrasesDiffer'))
                await enableVault(passphrase, { unrecoverablePassphrase: acknowledged, backupOffered: true }, apiKey)
                setPassphrase('')
                setConfirmPassphrase('')
              })}
            >
              {t('safety.enable')}
            </Button>
          </>
        )}
        {vaultStatus === 'unlocked' && (
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="ghost" onClick={() => { lockVault(); location.reload() }}>{t('safety.lock')}</Button>
            <Button variant="danger" onClick={() => void action('disable', async () => { await disableVault() })}>{t('safety.disable')}</Button>
          </div>
        )}
      </section>

      {vaultStatus === 'unlocked' && (
        <section className="mt-4 rounded-lg border border-danger/40 p-4">
          <h3 className="font-semibold text-ink">{t('safety.decryptedTitle')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('safety.decryptedHint')}</p>
          <div className="mt-3 max-w-md">
            <Field label={t('safety.decryptedConfirm')}>
              <TextInput value={decryptedConfirmation} onChange={(event) => setDecryptedConfirmation(event.target.value)} />
            </Field>
          </div>
          <Button
            variant="danger"
            className="mt-3 max-w-full whitespace-normal"
            onClick={() => void action('decrypted', async () => {
              download(`klar-readable-${stamp}.json`, await createDecryptedExport(decryptedConfirmation))
            })}
          >
            {t('safety.decryptedAction')}
          </Button>
        </section>
      )}

      {message && <p className="mt-4 wrap-anywhere text-base text-muted">{message}</p>}
      {error && <div className="mt-4"><ErrorNotice error={error} /></div>}
    </Card>
  )
}