// Résumé upload / paste → extract text (client-side) → LLM parse → Profile.
import { useState } from 'react'
import { Button, Card, Spinner } from './atoms'
import { extractText } from '../parse/extract'
import { parseProfile } from '../parse/profile'
import type { Profile } from '../types'
import { useT } from '../i18n/LocaleProvider'

export function ResumeStep({
  apiKey,
  onParsed,
}: {
  apiKey: string
  onParsed: (p: Profile) => void
}) {
  const t = useT()

  const [busy, setBusy] = useState<'' | 'extracting' | 'parsing'>('')
  const [error, setError] = useState('')
  const [pasted, setPasted] = useState('')
  const [fileName, setFileName] = useState('')

  async function handleText(rawText: string) {
    setError('')
    if (rawText.trim().length < 30) {
      setError(t('resume.tooShort'))
      return
    }
    setBusy('parsing')
    try {
      const profile = await parseProfile(rawText, apiKey)
      onParsed(profile)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('resume.parseFailed'))
    } finally {
      setBusy('')
    }
  }

  async function handleFile(file: File) {
    setError('')
    setFileName(file.name)
    setBusy('extracting')
    try {
      const { text } = await extractText(file)
      setBusy('')
      await handleText(text)
    } catch (e) {
      setBusy('')
      setError(e instanceof Error ? e.message : t('resume.readFailed'))
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

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>
    </div>
  )
}