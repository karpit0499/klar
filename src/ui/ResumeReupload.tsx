import { useState } from 'react'
import { Button, Spinner } from './atoms'
import { extractText } from '../parse/extract'
import { parseProfile } from '../parse/profile'
import { useT } from '../i18n/LocaleProvider'
import type { Profile } from '../types'
import { ErrorNotice } from './ErrorNotice'
import { toAppError, type AppErrorData } from '../errors/appError'

export function ResumeReupload({
  apiKey,
  onReplace,
}: {
  apiKey: string
  onReplace: (profile: Profile) => void | Promise<void>
}) {
  const t = useT()
  const [busy, setBusy] = useState<'' | 'extracting' | 'parsing'>('')
  const [error, setError] = useState<AppErrorData | null>(null)
  const [preview, setPreview] = useState<Profile | null>(null)
  const [pasted, setPasted] = useState('')
  const [fileName, setFileName] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  async function parse(rawText: string) {
    setError(null)
    if (rawText.trim().length < 30) {
      setError({
        category: 'validation', message: t('settings.reuploadTooShort'), dataSafe: true,
        available: 'Your current profile remains unchanged.',
        action: { label: t('settings.reuploadChoose'), kind: 'choose_file' },
      })
      return
    }
    setBusy('parsing')
    try {
      setPreview(await parseProfile(rawText, apiKey))
    } catch (parseError) {
      setError(toAppError(parseError, {
        category: 'parsing', message: t('settings.reuploadParseFailed'), dataSafe: true,
        available: 'Your current profile remains unchanged.',
        action: { label: t('settings.reuploadParse'), kind: 'retry' },
      }))
    } finally {
      setBusy('')
    }
  }

  async function onFile(file: File) {
    setError(null)
    setFileName(file.name)
    setBusy('extracting')
    try {
      const { text } = await extractText(file)
      setBusy('')
      await parse(text)
    } catch (readError) {
      setBusy('')
      setError(toAppError(readError, {
        category: 'parsing', message: t('settings.reuploadReadFailed'), dataSafe: true,
        available: 'Your current profile remains unchanged.',
        action: { label: t('settings.reuploadChoose'), kind: 'choose_file' },
      }))
    }
  }

  async function confirmReplace() {
    if (!preview) return
    await onReplace(preview)
    setPreview(null)
    setPasted('')
    setFileName('')
    setShowPaste(false)
  }

  if (preview) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-3 text-base">
        <p className="font-medium text-ink">{t('settings.reuploadConfirm')}</p>
        <dl className="mt-3 space-y-2 text-muted">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-faint">{t('profile.titles')}</dt>
            <dd className="min-w-0 flex-1 wrap-anywhere">
              {preview.titles?.map((title) => title.title).join(', ') || '—'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-faint">{t('settings.reuploadSkills')}</dt>
            <dd className="min-w-0 flex-1">
              {t('settings.reuploadDetected', { count: preview.skills?.length ?? 0 })}
            </dd>
          </div>
          {preview.totalYears != null && (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-faint">{t('profile.experience')}</dt>
              <dd className="min-w-0 flex-1">
                {t('settings.reuploadYears', { years: preview.totalYears })}
              </dd>
            </div>
          )}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void confirmReplace()}>
            {t('settings.reuploadReplace')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
            {t('settings.reuploadCancel')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="text-base">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex">
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onFile(file)
            }}
          />
          <span className="inline-flex min-h-tap cursor-pointer items-center rounded-md border border-border bg-surface px-4 py-2.5 font-medium text-ink hover:bg-surface-2">
            {t('settings.reuploadChoose')}
          </span>
        </label>
        <button
          type="button"
          className="min-h-tap text-muted underline hover:text-ink"
          onClick={() => setShowPaste((visible) => !visible)}
        >
          {showPaste ? t('settings.reuploadHidePaste') : t('settings.reuploadShowPaste')}
        </button>
        {busy === 'extracting' && <Spinner label={t('settings.reuploadReading')} />}
        {busy === 'parsing' && <Spinner label={t('settings.reuploadParsing')} />}
      </div>

      {fileName && !busy && (
        <p className="mt-2 wrap-anywhere text-sm text-faint">
          {t('settings.reuploadSelected', { file: fileName })}
        </p>
      )}

      {showPaste && (
        <div className="mt-3">
          <textarea
            className="h-36 w-full rounded-md border border-border bg-surface p-3 text-base text-ink outline-none focus:border-accent"
            placeholder={t('resume.placeholder')}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
          />
          <div className="mt-2">
            <Button
              size="sm"
              onClick={() => void parse(pasted)}
              disabled={Boolean(busy) || pasted.trim().length < 30}
            >
              {t('settings.reuploadParse')}
            </Button>
          </div>
        </div>
      )}

      {error && <div className="mt-2"><ErrorNotice error={error} /></div>}
    </div>
  )
}