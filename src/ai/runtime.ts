import type { AdapterSlot, GenerationRequest, GenerationResult } from './contracts'

export type LocalRuntimePhase =
  | 'not_installed'
  | 'stopped'
  | 'verifying'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'crashed'
  | 'error'

export type LocalRuntimeStatus = {
  phase: LocalRuntimePhase
  artifactId?: string
  modelId?: string
  runtimeVersion?: string
  adapters: AdapterSlot[]
  warmed: boolean
  warmupMs?: number
  activeRequests: number
  lastErrorCode?: string
}

export type DesktopSystemInfo = {
  desktop: true
  appVersion: string
  productName: string
  platform: 'darwin' | 'win32' | 'linux'
  architecture: string
  totalMemoryBytes: number
  freeMemoryBytes: number
  memoryTier: 'unsupported' | 'minimum' | 'recommended'
  availableDiskBytes?: number
  runtime: LocalRuntimeStatus
}

export type RedactedDiagnosticReport = {
  schemaVersion: 1
  generatedAt: string
  app: {
    version: string
    platform: string
    architecture: string
  }
  events: Array<{
    timestamp: string
    type: string
    detail: Record<string, string | number | boolean | null>
  }>
}

/**
 * The only desktop powers visible to renderer code. There is intentionally no
 * generic invoke, path chooser, filesystem, shell, process, or raw Electron API.
 */
export type KlarDesktopBridge = {
  readonly desktop: true
  system: {
    getInfo(): Promise<DesktopSystemInfo>
  }
  runtime: {
    getStatus(): Promise<LocalRuntimeStatus>
    start(artifactId: string): Promise<LocalRuntimeStatus>
    stop(): Promise<LocalRuntimeStatus>
  }
  ai: {
    generate(request: GenerationRequest): Promise<GenerationResult>
    cancel(requestId: string): Promise<boolean>
  }
  diagnostics: {
    getRedactedReport(): Promise<RedactedDiagnosticReport>
  }
}

declare global {
  interface Window {
    klarDesktop?: KlarDesktopBridge
  }
}

export function desktopBridge(): KlarDesktopBridge | null {
  if (typeof window === 'undefined') return null
  const bridge = window.klarDesktop
  return bridge?.desktop === true ? bridge : null
}
