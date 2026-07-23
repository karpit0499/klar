import { useState } from 'react'
import { Button, Card, Field, Spinner, TextInput } from './atoms'
import { importBackup, inspectBackup, type BackupPreview } from '../backup/backup'
import { ErrorNotice } from './ErrorNotice'
import { toAppError, type AppErrorData } from '../errors/appError'
import { useLocale } from '../i18n/LocaleProvider'

export function RestoreBackup({ onRestored, onCancel }: { onRestored: () => void; onCancel: () => void }) {
  const { locale } = useLocale(); const de = locale === 'de'
  const [payload, setPayload] = useState<unknown>()
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AppErrorData | null>(null)

  async function choose(file: File) {
    setBusy(true); setError(null); setPreview(null)
    try {
      const value = JSON.parse(await file.text()) as unknown
      setPayload(value); setPreview(await inspectBackup(value))
    } catch (caught) {
      setPayload(undefined); setError(toAppError(caught, {
        category: 'import', message: de ? 'Diese Datei ist keine gültige Klar-Sicherung.' : 'This file is not a valid Klar backup.',
        dataSafe: true, available: de ? 'Der aktuelle Arbeitsbereich wurde nicht geändert.' : 'The current workspace was not changed.',
        action: { label: de ? 'Andere Datei wählen' : 'Choose another file', kind: 'choose_file' },
      }))
    } finally { setBusy(false) }
  }

  async function restore() {
    if (!payload || !preview) return
    setBusy(true); setError(null)
    try { await importBackup(payload, preview.passwordRequired ? password : undefined); onRestored() }
    catch (caught) { setError(toAppError(caught, {
      category: 'import', message: de ? 'Die Sicherung konnte nicht wiederhergestellt werden.' : 'The backup could not be restored.',
      dataSafe: true, available: de ? 'Der bisherige Arbeitsbereich bleibt erhalten.' : 'The previous workspace remains intact.',
      action: { label: de ? 'Datei und Passwort prüfen' : 'Check the file and password', kind: 'retry' },
    })) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Card className="p-4 sm:p-6">
        <h1 className="text-xl font-semibold text-ink">{de ? 'Klar-Sicherung wiederherstellen' : 'Restore a Klar backup'}</h1>
        <p className="mt-2 text-base text-muted">{de ? 'Klar prüft Format, Version und Integrität, bevor aktive Daten geändert werden.' : 'Klar checks format, version, and integrity before active data changes.'}</p>
        <label className="mt-5 flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border p-7 text-center font-medium text-ink hover:border-accent">
          <input className="hidden" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void choose(file) }} />
          {de ? 'Sicherungsdatei auswählen oder hier ablegen' : 'Choose or drop a backup file here'}
        </label>
        {busy && <div className="mt-3"><Spinner label={de ? 'Wird geprüft' : 'Checking'} /></div>}
        {preview && (
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
            <p><strong className="text-ink">{de ? 'Exportiert:' : 'Exported:'}</strong> {new Date(preview.exportedAt).toLocaleString()}</p>
            <p><strong className="text-ink">Klar:</strong> {preview.klarVersion}</p>
            <p><strong className="text-ink">{de ? 'Inhalt:' : 'Contains:'}</strong> {preview.categories.join(', ') || '—'}</p>
            {preview.passwordRequired && <div className="mt-3"><Field label={de ? 'Sicherungspasswort' : 'Backup password'}><TextInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field></div>}
            <p className="mt-3 text-faint">{de ? 'Die vollständige Wiederherstellung ersetzt den aktuellen Arbeitsbereich erst nach erfolgreicher Prüfung. Verbindungen werden anschließend getrennt geprüft.' : 'Full restore replaces the current workspace only after successful validation. Connections are checked separately afterward.'}</p>
          </div>
        )}
        {error && <div className="mt-3"><ErrorNotice error={error} /></div>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => void restore()} disabled={!preview || busy || Boolean(preview.passwordRequired && !password)}>{de ? 'Vollständig wiederherstellen' : 'Restore full workspace'}</Button>
          <Button variant="ghost" onClick={onCancel}>{de ? 'Zurück' : 'Back'}</Button>
        </div>
      </Card>
    </div>
  )
}