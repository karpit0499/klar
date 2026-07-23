import { useState } from 'react'
import { Button, Card, Spinner } from './atoms'
import { extractText } from '../parse/extract'
import { extractResumeData } from '../resume/extract'
import { emptyResume } from '../resume/canonical'
import type { ResumeData } from '../resume/types'
import { useLocale } from '../i18n/LocaleProvider'
import { ErrorNotice } from './ErrorNotice'
import { toAppError, type AppErrorData } from '../errors/appError'

export function ResumeStep({ apiKey, requireGroq, onDraft }: {
  apiKey?: string
  requireGroq: (action: string) => Promise<string | null>
  onDraft: (resume: ResumeData) => void | Promise<void>
}) {
  const { locale } = useLocale(); const de = locale === 'de'
  const [busy, setBusy] = useState<'' | 'reading' | 'parsing'>('')
  const [error, setError] = useState<AppErrorData | null>(null)
  const [pasted, setPasted] = useState('')
  const [fileName, setFileName] = useState('')

  async function structure(rawText: string) {
    if (rawText.trim().length < 30) {
      setError({
        category: 'validation', message: de ? 'Der Text ist zu kurz für eine zuverlässige Extraktion.' : 'The text is too short for reliable extraction.',
        dataSafe: true, available: de ? 'Es wurden keine Profildaten geändert.' : 'No profile data was changed.',
        action: { label: de ? 'Datei oder Text prüfen' : 'Check the file or text', kind: 'choose_file' },
      }); return
    }
    const key = apiKey ?? await requireGroq(de ? 'Lebenslauf strukturieren' : 'structure résumé')
    if (!key) return
    setBusy('parsing'); setError(null)
    try { await onDraft(await extractResumeData(rawText, key)) }
    catch (caught) {
      setError(toAppError(caught, {
        category: 'parsing', message: de ? 'Der Lebenslauf konnte nicht strukturiert werden.' : 'The résumé could not be structured.',
        dataSafe: true, available: de ? 'Der aktuelle Arbeitsbereich ist unverändert.' : 'The current workspace is unchanged.',
        action: { label: de ? 'Erneut versuchen' : 'Try again', kind: 'retry' },
      }))
    } finally { setBusy('') }
  }

  async function read(file: File) {
    setBusy('reading'); setError(null); setFileName(file.name)
    try { const result = await extractText(file); setBusy(''); await structure(result.text) }
    catch (caught) {
      setBusy(''); setError(toAppError(caught, {
        category: 'parsing', message: de ? 'Die Datei konnte lokal nicht gelesen werden.' : 'The file could not be read locally.',
        dataSafe: true, available: de ? 'Die Datei wurde nicht gespeichert oder hochgeladen.' : 'The file was not saved or uploaded.',
        action: { label: de ? 'Andere Datei wählen' : 'Choose another file', kind: 'choose_file' },
      }))
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Card className="p-4 sm:p-6">
        <h1 className="font-display text-display-md font-semibold text-ink">{de ? 'Lebenslauf als Grundlage' : 'Use your résumé as the foundation'}</h1>
        <p className="mt-2 text-base leading-relaxed text-muted">{de ? 'Dateien werden zuerst lokal gelesen. Nur der extrahierte Text wird für die ausdrücklich gestartete KI-Strukturierung an Groq gesendet. Der Rohtext wird nach der Prüfung verworfen.' : 'Files are read locally first. Only extracted text is sent to Groq for the AI structuring action you explicitly start. Raw text is discarded after review.'}</p>
        <p className="mt-2 text-sm text-faint">{de ? 'Extraktion kann Felder übersehen oder falsch einordnen. Du prüfst und bearbeitest jeden Abschnitt vor dem Speichern.' : 'Extraction can miss or misclassify fields. You review and edit every section before saving.'}</p>
        <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8 text-center hover:border-accent">
          <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void read(file) }} />
          <span className="font-medium text-ink">{de ? 'PDF, DOCX oder Textdatei wählen' : 'Choose PDF, DOCX, or text file'}</span>
          <span className="mt-1 text-sm text-faint">{fileName || (de ? 'Die Originaldatei wird nicht gespeichert.' : 'The original file is not retained.')}</span>
        </label>
        <div className="mt-4">
          <label className="text-sm font-medium text-ink" htmlFor="resume-paste">{de ? 'Oder Text einfügen' : 'Or paste text'}</label>
          <textarea id="resume-paste" className="mt-1 h-44 w-full rounded-md border border-border bg-surface p-3 text-base text-ink outline-none focus:border-accent" value={pasted} onChange={(e) => setPasted(e.target.value)} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void structure(pasted)} disabled={Boolean(busy) || pasted.trim().length < 30}>{de ? 'Text strukturieren' : 'Structure pasted text'}</Button>
          <Button variant="ghost" onClick={() => void onDraft(emptyResume())} disabled={Boolean(busy)}>{de ? 'Manuell erstellen' : 'Create manually'}</Button>
          {busy === 'reading' && <Spinner label={de ? 'Datei wird lokal gelesen' : 'Reading file locally'} />}
          {busy === 'parsing' && <Spinner label={de ? 'Abschnitte werden strukturiert' : 'Structuring sections'} />}
        </div>
        {error && <div className="mt-3"><ErrorNotice error={error} /></div>}
      </Card>
    </div>
  )
}