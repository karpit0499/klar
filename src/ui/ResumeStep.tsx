// Résumé upload / paste → extract text (client-side) → LLM parse → Profile.
import { useState } from 'react'
import { Button, Card, Spinner } from './atoms'
import { extractText } from '../parse/extract'
import { parseProfile } from '../parse/profile'
import type { Profile } from '../types'

export function ResumeStep({
  apiKey,
  onParsed,
}: {
  apiKey: string
  onParsed: (p: Profile) => void
}) {
  const [busy, setBusy] = useState<'' | 'extracting' | 'parsing'>('')
  const [error, setError] = useState('')
  const [pasted, setPasted] = useState('')
  const [fileName, setFileName] = useState('')

  async function handleText(rawText: string) {
    setError('')
    if (rawText.trim().length < 30) {
      setError('That looks too short to be a résumé. Paste more text or upload a file.')
      return
    }
    setBusy('parsing')
    try {
      const profile = await parseProfile(rawText, apiKey)
      onParsed(profile)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parsing failed.')
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
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Add your résumé</h2>
        <p className="mt-1 text-sm text-gray-600">
          PDF, DOCX, or paste text. Everything is processed in your browser; the file is
          never uploaded to us.
        </p>

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 p-8 text-center hover:border-indigo-400">
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
          <span className="text-sm font-medium text-gray-700">Click to choose a file</span>
          <span className="mt-1 text-xs text-gray-500">{fileName || 'PDF or DOCX'}</span>
        </label>

        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-gray-700">…or paste résumé text</p>
          <textarea
            className="h-40 w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="Paste your résumé here…"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-3">
            <Button onClick={() => void handleText(pasted)} disabled={Boolean(busy) || pasted.trim().length < 30}>
              Parse pasted text
            </Button>
            {busy === 'extracting' && <Spinner label="Reading file…" />}
            {busy === 'parsing' && <Spinner label="Parsing résumé with AI…" />}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>
    </div>
  )
}