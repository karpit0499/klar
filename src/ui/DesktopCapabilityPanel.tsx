import { useEffect, useMemo, useState } from 'react'
import { Card, Button, Field, Spinner, TextInput } from './atoms'
import { useLocale } from '../i18n/LocaleProvider'
import {
  desktopBridge,
  type DesktopSystemInfo,
  type KlarDesktopBridge,
  type LocalRuntimeStatus,
} from '../ai/runtime'
import { triggerBlobDownload } from '../export/download'

// v2.6 has genuinely prepared and smoke-tested only the base validation
// package. The two-adapter lab package remains a Kaggle/HOLD example.
const DEFAULT_ARTIFACT_ID = 'qwen3.5-9b-q4km-base-validation'

type Copy = {
  title: string
  intro: string
  preview: string
  build: string
  architecture: string
  disk: string
  memory: string
  runtime: string
  model: string
  ready: string
  notReady: string
  refresh: string
  refreshing: string
  artifact: string
  artifactHint: string
  start: string
  starting: string
  stop: string
  stopping: string
  diagnostics: string
  diagnosticsHint: string
  download: string
  downloading: string
  noModel: string
  unavailable: string
}

const COPY: Record<'en' | 'de', Copy> = {
  en: {
    title: 'Desktop capability panel',
    intro:
      'This panel describes the narrow capabilities exposed by the Klar Developer Preview. It does not give the page general access to files, the shell, or system processes.',
    preview: 'Internal developer preview',
    build: 'Desktop build',
    architecture: 'CPU architecture',
    disk: 'Available disk',
    memory: 'Memory tier',
    runtime: 'Local runtime',
    model: 'Model',
    ready: 'Ready',
    notReady: 'Not ready',
    refresh: 'Refresh status',
    refreshing: 'Refreshing…',
    artifact: 'Installed model package ID',
    artifactHint:
      'Enter a reviewed package ID, never a file path. Klar verifies its manifest, signature, and checksums before startup.',
    start: 'Verify and start',
    starting: 'Starting…',
    stop: 'Stop runtime',
    stopping: 'Stopping…',
    diagnostics: 'Redacted diagnostic export',
    diagnosticsHint:
      'Contains app/runtime status and content-free events only—no resume, job description, generated writing, secret, email address, URL query, or local path.',
    download: 'Download diagnostics',
    downloading: 'Preparing…',
    noModel: 'No verified model is running',
    unavailable: 'Status unavailable',
  },
  de: {
    title: 'Desktop-Funktionsübersicht',
    intro:
      'Diese Übersicht zeigt die eng begrenzten Funktionen der Klar Developer Preview. Die Seite erhält keinen allgemeinen Zugriff auf Dateien, Shell oder Systemprozesse.',
    preview: 'Interne Developer Preview',
    build: 'Desktop-Build',
    architecture: 'CPU-Architektur',
    disk: 'Freier Speicher',
    memory: 'Arbeitsspeicher-Stufe',
    runtime: 'Lokale Laufzeit',
    model: 'Modell',
    ready: 'Bereit',
    notReady: 'Nicht bereit',
    refresh: 'Status aktualisieren',
    refreshing: 'Wird aktualisiert…',
    artifact: 'ID des installierten Modellpakets',
    artifactHint:
      'Gib eine geprüfte Paket-ID ein, niemals einen Dateipfad. Klar prüft Manifest, Signatur und Prüfsummen vor dem Start.',
    start: 'Prüfen und starten',
    starting: 'Wird gestartet…',
    stop: 'Laufzeit stoppen',
    stopping: 'Wird gestoppt…',
    diagnostics: 'Geschwärzter Diagnoseexport',
    diagnosticsHint:
      'Enthält nur App-/Laufzeitstatus und inhaltsfreie Ereignisse—keinen Lebenslauf, keine Stellenbeschreibung, generierten Text, Schlüssel, E-Mail-Adresse, URL-Parameter oder lokalen Pfad.',
    download: 'Diagnose herunterladen',
    downloading: 'Wird vorbereitet…',
    noModel: 'Kein geprüftes Modell läuft',
    unavailable: 'Status nicht verfügbar',
  },
}

function gibibytes(bytes: number | undefined, locale: 'en' | 'de'): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '—'
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(bytes / 1_073_741_824)} GiB`
}

function runtimeLabel(status: LocalRuntimeStatus, copy: Copy): string {
  return `${status.phase} · ${status.phase === 'ready' ? copy.ready : copy.notReady}`
}

function errorMessage(error: unknown, copy: Copy): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return copy.unavailable
}

export function DesktopCapabilityPanel() {
  const { locale } = useLocale()
  const language = locale === 'de' ? 'de' : 'en'
  const copy = COPY[language]
  const bridge = useMemo<KlarDesktopBridge | null>(() => desktopBridge(), [])
  const [info, setInfo] = useState<DesktopSystemInfo | null>(null)
  const [artifactId, setArtifactId] = useState(DEFAULT_ARTIFACT_ID)
  const [busy, setBusy] = useState<'refresh' | 'start' | 'stop' | 'diagnostics' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function refresh(activeBridge: KlarDesktopBridge = bridge!) {
    setBusy('refresh')
    setError('')
    try {
      setInfo(await activeBridge.system.getInfo())
    } catch (caught) {
      setError(errorMessage(caught, copy))
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!bridge) return
    void refresh(bridge)
    // The bridge is fixed by preload for the lifetime of this renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge])

  if (!bridge) return null

  async function startRuntime() {
    setBusy('start')
    setError('')
    setMessage('')
    try {
      await bridge!.runtime.start(artifactId.trim())
      setInfo(await bridge!.system.getInfo())
      setMessage(language === 'de' ? 'Die lokale Laufzeit ist bereit.' : 'The local runtime is ready.')
    } catch (caught) {
      setError(errorMessage(caught, copy))
      setInfo(await bridge!.system.getInfo().catch(() => null))
    } finally {
      setBusy(null)
    }
  }

  async function stopRuntime() {
    setBusy('stop')
    setError('')
    setMessage('')
    try {
      await bridge!.runtime.stop()
      setInfo(await bridge!.system.getInfo())
      setMessage(language === 'de' ? 'Die lokale Laufzeit wurde gestoppt.' : 'The local runtime was stopped.')
    } catch (caught) {
      setError(errorMessage(caught, copy))
    } finally {
      setBusy(null)
    }
  }

  async function downloadDiagnostics() {
    setBusy('diagnostics')
    setError('')
    setMessage('')
    try {
      const report = await bridge!.diagnostics.getRedactedReport()
      triggerBlobDownload(
        new Blob([`${JSON.stringify(report, null, 2)}\n`], {
          type: 'application/json;charset=utf-8',
        }),
        `klar-desktop-diagnostics-${report.generatedAt.slice(0, 10)}.json`,
      )
      setMessage(language === 'de' ? 'Der Diagnoseexport ist bereit.' : 'The diagnostic export is ready.')
    } catch (caught) {
      setError(errorMessage(caught, copy))
    } finally {
      setBusy(null)
    }
  }

  const runtime = info?.runtime
  const runtimeReady = runtime?.phase === 'ready'

  return (
    <Card className="mt-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-ink">{copy.title}</h2>
          <p className="mt-1 max-w-3xl text-base leading-relaxed text-muted">{copy.intro}</p>
        </div>
        <span className="rounded border border-border bg-surface-2 px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted">
          {copy.preview}
        </span>
      </div>

      {info ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Capability label={copy.build} value={`${info.productName} · v${info.appVersion}`} />
          <Capability label={copy.architecture} value={`${info.platform} · ${info.architecture}`} />
          <Capability label={copy.disk} value={gibibytes(info.availableDiskBytes, language)} />
          <Capability
            label={copy.memory}
            value={`${info.memoryTier} · ${gibibytes(info.totalMemoryBytes, language)}`}
          />
          <Capability
            label={copy.runtime}
            value={runtime ? runtimeLabel(runtime, copy) : copy.unavailable}
          />
          <Capability label={copy.model} value={runtime?.modelId ?? copy.noModel} />
        </dl>
      ) : (
        <div className="mt-4" role="status">
          <Spinner label={copy.refreshing} />
        </div>
      )}

      <div className="mt-4">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void refresh()}
        >
          {busy === 'refresh' ? copy.refreshing : copy.refresh}
        </Button>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4">
        <Field label={copy.artifact} hint={copy.artifactHint}>
          <TextInput
            value={artifactId}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            onChange={(event) => setArtifactId(event.target.value)}
          />
        </Field>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            disabled={busy !== null || runtimeReady || !artifactId.trim()}
            onClick={() => void startRuntime()}
          >
            {busy === 'start' ? copy.starting : copy.start}
          </Button>
          <Button
            variant="ghost"
            disabled={busy !== null || !runtime || runtime.phase === 'stopped'}
            onClick={() => void stopRuntime()}
          >
            {busy === 'stop' ? copy.stopping : copy.stop}
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border p-4">
        <h3 className="text-base font-semibold text-ink">{copy.diagnostics}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{copy.diagnosticsHint}</p>
        <Button
          className="mt-3"
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void downloadDiagnostics()}
        >
          {busy === 'diagnostics' ? copy.downloading : copy.download}
        </Button>
      </div>

      {message && <p className="mt-3 text-sm text-success" role="status">{message}</p>}
      {error && <p className="mt-3 wrap-anywhere text-sm text-danger" role="alert">{error}</p>}
    </Card>
  )
}

function Capability({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-1 wrap-anywhere text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}
