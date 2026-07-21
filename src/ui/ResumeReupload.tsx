// ============================================================================
// ResumeReupload (feature 11). Lets a returning user replace the résumé that
// backs their Profile without wiping everything. It reuses the exact same
// client-side pipeline as onboarding — extractText() → parseProfile() — so
// there's no second code path to keep in sync. On success it hands the fresh
// Profile back to the parent, which persists it as the new "current" profile.
//
// Compact by design: this lives inside a Settings card, so it's a single file
// button + optional paste box rather than the full-screen onboarding dropzone.
// ============================================================================
import { useState } from 'react'
import { Button, Spinner } from './atoms'
import { extractText } from '../parse/extract'
import { parseProfile } from '../parse/profile'
import type { Profile } from '../types'

export function ResumeReupload({
  apiKey,
  onReplace,
}: {
  apiKey: string
  onReplace: (p: Profile) => void | Promise<void>
}) {
  const [busy, setBusy] = useState<'' | 'extracting' | 'parsing'>('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Profile | null>(null)
  const [pasted, setPasted] = useState('')
  const [fileName, setFileName] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  async function parse(rawText: string) {
    setError('')
    if (rawText.trim().length < 30) {
      setError('That looks too short to be a résumé. Paste more text or choose a file.')
      return
    }
    setBusy('parsing')
    try {
      const profile = await parseProfile(rawText, apiKey)
      setPreview(profile) // show a summary before we overwrite anything
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parsing failed.')
    } finally {
      setBusy('')
    }
  }

  async function onFile(file: File) {
    setError('')
    setFileName(file.name)
    setBusy('extracting')
    try {
      const { text } = await extractText(file)
      setBusy('')
      await parse(text)
    } catch (e) {
      setBusy('')
      setError(e instanceof Error ? e.message : 'Could not read that file.')
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

  // Preview → confirm step (so a bad parse never silently clobbers the profile).
  if (preview) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
        <p className="font-medium text-ink">New résumé parsed — replace your current profile?</p>
        <dl className="mt-2 space-y-1 text-muted">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-faint">Titles</dt>
            <dd className="min-w-0 flex-1">{preview.titles?.map((tt) => tt.title).join(', ') || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-faint">Skills</dt>
            <dd className="min-w-0 flex-1">{preview.skills?.length ?? 0} detected</dd>
          </div>
          {preview.totalYears != null && (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-faint">Experience</dt>
              <dd className="min-w-0 flex-1">{preview.totalYears} years</dd>
            </div>
          )}
        </dl>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={() => void confirmReplace()}>
            Replace profile
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex">
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
            }}
          />
          <span className="inline-flex min-h-tap cursor-pointer items-center rounded-md border border-border bg-surface px-4 py-2.5 font-medium text-ink hover:bg-surface-2">
            Choose a file
          </span>
        </label>
        <button
          type="button"
          className="min-h-tap text-muted underline hover:text-ink"
          onClick={() => setShowPaste((v) => !v)}
        >
          {showPaste ? 'Hide paste box' : 'or paste text'}
        </button>
        {busy === 'extracting' && <Spinner label="Reading file…" />}
        {busy === 'parsing' && <Spinner label="Parsing with AI…" />}
      </div>

      {fileName && !busy && <p className="mt-1 text-xs text-faint">Selected: {fileName}</p>}

      {showPaste && (
        <div className="mt-3">
          <textarea
            className="h-32 w-full rounded-md border border-border bg-surface p-3 text-sm text-ink outline-none focus:border-accent"
            placeholder="Paste your résumé here…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="mt-2">
            <Button
              size="sm"
              onClick={() => void parse(pasted)}
              disabled={Boolean(busy) || pasted.trim().length < 30}
            >
              Parse pasted text
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-danger">{error}</p>}
    </div>
  )
}