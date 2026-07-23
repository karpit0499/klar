import { useState } from 'react'
import { Button, Spinner } from './atoms'
import { extractText } from '../parse/extract'
import { extractResumeData } from '../resume/extract'
import type { ResumeData } from '../resume/types'
import { ResumeEditor } from './ResumeEditor'
import { ErrorNotice } from './ErrorNotice'
import { toAppError, type AppErrorData } from '../errors/appError'
import { useLocale } from '../i18n/LocaleProvider'

export function ResumeReupload({ apiKey, requireGroq, onReplace }: {
  apiKey?: string
  requireGroq: (action: string) => Promise<string | null>
  onReplace: (resume: ResumeData) => void | Promise<void>
}) {
  const { locale } = useLocale(); const de = locale === 'de'
  const [busy, setBusy] = useState<'' | 'reading' | 'parsing' | 'saving'>('')
  const [error, setError] = useState<AppErrorData | null>(null)
  const [preview, setPreview] = useState<ResumeData | null>(null)
  const [pasted, setPasted] = useState('')

  async function parse(text: string) {
    if (text.trim().length < 30) return
    const key = apiKey ?? await requireGroq(de ? 'Lebenslauf neu strukturieren' : 'structure replacement résumé')
    if (!key) return
    setBusy('parsing'); setError(null)
    try { setPreview(await extractResumeData(text, key)) }
    catch (caught) { setError(toAppError(caught, {
      category: 'parsing', message: de ? 'Der neue Lebenslauf konnte nicht strukturiert werden.' : 'The replacement résumé could not be structured.',
      dataSafe: true, available: de ? 'Das aktuelle Profil bleibt unverändert.' : 'The current profile remains unchanged.',
      action: { label: de ? 'Erneut versuchen' : 'Try again', kind: 'retry' },
    })) } finally { setBusy('') }
  }
  async function file(file: File) {
    setBusy('reading'); setError(null)
    try { const result = await extractText(file); setBusy(''); await parse(result.text) }
    catch (caught) { setBusy(''); setError(toAppError(caught, {
      category: 'parsing', message: de ? 'Die Datei konnte nicht gelesen werden.' : 'The file could not be read.',
      dataSafe: true, available: de ? 'Das aktuelle Profil bleibt unverändert.' : 'The current profile remains unchanged.',
      action: { label: de ? 'Andere Datei wählen' : 'Choose another file', kind: 'choose_file' },
    })) }
  }
  async function confirm() {
    if (!preview) return
    setBusy('saving')
    try { await onReplace(preview); setPreview(null); setPasted('') }
    finally { setBusy('') }
  }

  if (preview) return <div className="mt-4"><div className="mb-3 rounded-md border border-accent bg-accent-tint p-3 text-sm text-accent">{de ? 'Vorschau: Prüfe alle Abschnitte. Beim Bestätigen legt Klar automatisch eine wiederherstellbare Version des aktuellen Profils an und ersetzt es vollständig.' : 'Preview: review every section. On confirmation, Klar automatically saves a restorable version of the current profile and replaces it in full.'}</div><ResumeEditor value={preview} onChange={setPreview} onSave={() => void confirm()} busy={busy === 'saving'} saveLabel={de ? 'Vorschau bestätigen und ersetzen' : 'Confirm preview and replace'} /><div className="mt-3"><Button variant="ghost" onClick={() => setPreview(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button></div></div>

  return <div><div className="flex flex-wrap items-center gap-3"><label className="inline-flex"><input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => { const selected = e.target.files?.[0]; if (selected) void file(selected) }} /><span className="inline-flex min-h-tap cursor-pointer items-center rounded-md border border-border bg-surface px-4 py-2 font-medium text-ink hover:bg-surface-2">{de ? 'Neue Datei wählen' : 'Choose replacement file'}</span></label>{busy === 'reading' && <Spinner label={de ? 'Lokal lesen' : 'Reading locally'} />}{busy === 'parsing' && <Spinner label={de ? 'Strukturieren' : 'Structuring'} />}</div><textarea className="mt-3 h-32 w-full rounded-md border border-border bg-surface p-3 text-base text-ink outline-none focus:border-accent" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={de ? 'Oder Lebenslauftext einfügen' : 'Or paste résumé text'} /><div className="mt-2"><Button size="sm" variant="ghost" onClick={() => void parse(pasted)} disabled={Boolean(busy) || pasted.trim().length < 30}>{de ? 'Text prüfen' : 'Preview pasted text'}</Button></div>{error && <div className="mt-3"><ErrorNotice error={error} /></div>}</div>
}