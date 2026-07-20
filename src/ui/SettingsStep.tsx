// Settings: JSON backup/restore (feature 3.3), a data-loss warning (6.2), the
// region selector (8.1), and delete-all (6.1). The JSON backup is your data,
// not your key — the API key is deliberately excluded from the export file.
import { useEffect, useRef, useState } from 'react'
import { Button, Card, Field } from './atoms'
import { exportAll, importAll, wipeAllData } from '../db/db'
import { clearGroqKey } from '../settings/keys'
import { REGIONS, getActiveRegion, setActiveRegion, DEFAULT_REGION_CODE } from '../regions'

export function SettingsStep({ onReset }: { onReset: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [regionCode, setRegionCode] = useState(DEFAULT_REGION_CODE)

  useEffect(() => {
    void getActiveRegion().then((r) => setRegionCode(r.code))
  }, [])

  async function changeRegion(code: string) {
    setRegionCode(code)
    await setActiveRegion(code)
    setMsg(`Region set to ${REGIONS[code]?.label ?? code}. It applies on your next search.`)
  }

  async function doExport() {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `klar-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg('Exported. Keep this file safe — it is your backup.')
  }

  async function doImport(file: File) {
    try {
      const text = await file.text()
      await importAll(JSON.parse(text))
      setMsg('Imported. Reloading…')
      setTimeout(() => location.reload(), 600)
    } catch (e) {
      setMsg('Import failed: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function wipe() {
    if (!confirm('Delete ALL local data (profile, preferences, dashboard, tracked jobs)? This cannot be undone.')) return
    await wipeAllData()
    await clearGroqKey()
    onReset()
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Settings & data</h2>
        <p className="mt-1 text-sm text-gray-600">
          All your data lives in this browser. Export it to back up or move devices.
        </p>

        {/* Data-loss warning (feature 6.2). */}
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Heads up: because nothing is stored on a server, clearing your browser or switching devices
          wipes everything permanently. Export a backup every so often.
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={doExport}>Export data (JSON)</Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            Import / restore from file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
            }}
          />
          <Button variant="danger" onClick={wipe}>
            Delete all local data
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Your Groq API key is never written to the export file.
        </p>
        {msg && <p className="mt-3 text-sm text-gray-600">{msg}</p>}
      </Card>

      {/* Region selector (feature 8.1). */}
      <Card className="mt-4 p-6">
        <h2 className="text-lg font-semibold">Region</h2>
        <p className="mt-1 text-sm text-gray-600">
          Which market to search. Each region decides which job sources run.
        </p>
        <div className="mt-3 max-w-xs">
          <Field label="Active region">
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={regionCode}
              onChange={(e) => void changeRegion(e.target.value)}
            >
              {Object.values(REGIONS).map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>
    </div>
  )
}