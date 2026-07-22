// Résumé upload / paste → extract text (client-side) → LLM parse → Profile.
import { useState } from 'react'
import { Button, Card, Spinner } from './atoms'
import { extractText } from '../parse/extract'
import { parseProfile } from '../parse/profile'
import type { Profile } from '../types'
import { useT } from '../i18n/LocaleProvider'
import { ErrorNotice } from './ErrorNotice'
import { toAppError, type AppErrorData } from '../errors/appError'

export function ResumeStep({
  apiKey,
  onParsed,
}: {
  apiKey: string
  onParsed: (p: Profile) => void
}) {
  const t = useT()

  const [busy, setBusy] = useState<'' | 'extracting' | 'parsing'>('')
  const [error, setError] = useState<AppErrorData | null>(null)
  const [pasted, setPasted] = useState('')
  const [fileName, setFileName] = useState('')

  async function handleText(rawText: string) {
    setError(null)
    if (rawText.trim().length < 30) {
      setError({
        category: 'validation', message: t('resume.tooShort'), dataSafe: true,
        available: 'No profile data has been changed.',
        action: { label: t('resume.chooseFile'), kind: 'choose_file' },
      })
      return
    }
    setBusy('parsing')
    try {
      const profile = await parseProfile(rawText, apiKey)
      onParsed(profile)
    } catch (e) {
      setError(toAppError(e, {
        category: 'parsing', message: t('resume.parseFailed'), dataSafe: true,
        available: 'No profile data has been changed.',
        action: { label: t('resume.parsePasted'), kind: 'retry' },
      }))
    } finally {
      setBusy('')
    }
  }

  async function handleFile(file: File) {
    setError(null)
    setFileName(file.name)
    setBusy('extracting')
    try {
      const { text } = await extractText(file)
      setBusy('')
      await handleText(text)
    } catch (e) {
      setBusy('')
      setError(toAppError(e, {
        category: 'parsing', message: t('resume.readFailed'), dataSafe: true,
        available: 'No profile data has been changed.',
        action: { label: t('resume.chooseFile'), kind: 'choose_file' },
      }))
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-ink">{t('resume.title')}</h2>
        <p className="mt-1 text-sm text-muted">{t('resume.intro')}</p>

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8 text-center hover:border-accent">
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
          <span className="text-sm font-medium text-ink">{t('resume.chooseFile')}</span>
          <span className="mt-1 text-xs text-faint">{fileName || t('resume.fileHint')}</span>
        </label>

        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-ink">{t('resume.orPaste')}</p>
          <textarea
            className="h-40 w-full rounded-lg border border-border p-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
            placeholder={t('resume.placeholder')}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-3">
            <Button onClick={() => void handleText(pasted)} disabled={Boolean(busy) || pasted.trim().length < 30}>
              {t('resume.parsePasted')}
            </Button>
            {busy === 'extracting' && <Spinner label={t('resume.readingFile')} />}
            {busy === 'parsing' && <Spinner label={t('resume.parsingAI')} />}
          </div>
        </div>

        {error && <div className="mt-3"><ErrorNotice error={error} /></div>}
      </Card>
    </div>
  )
}