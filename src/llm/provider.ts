// ============================================================================
// v2.5 · WS3 — the AI engine (provider) layer.
//
// Every AI call in Klar already funnels through ONE function (`groqChat` in
// ./groq.ts). Until v2.5 that function pointed at the hardcoded
// `GROQ.baseUrl` constant, which was the single thing standing between Klar and
// "bring your own model". This module makes the OpenAI-compatible endpoint, the
// main model and the fast model configurable — with no changes at any call site.
//
// TWO HARD RULES, both from the ATS plan:
//
//  1. Routing NEVER relaxes a validator (WS3, §8.3). A weaker engine is allowed
//     to fail more often. It is never allowed to produce output the
//     no-fabrication guard would have rejected. There is deliberately no
//     "lenient mode" switch anywhere in this file.
//
//  2. Local models are NOT promised on the hosted site (Risk R2). Klar is served
//     over HTTPS from GitHub Pages. A browser BLOCKS an https:// page from
//     calling http://localhost:11434 (Ollama) or http://localhost:1234
//     (LM Studio) as mixed content, and Ollama additionally needs
//     OLLAMA_ORIGINS set for CORS. So v2.5 ships the configuration plus an
//     explicit, honest warning; the full local experience is v2.6 work, gated on
//     that blocker being solved. `engineWarning()` below is how we stay honest.
// ============================================================================
import { GROQ, WORKER_URL } from '../lib/config'
import { getSetting, setSetting } from '../db/db'

export type EngineSettings = {
  /** OpenAI-compatible base URL, no trailing slash (…/v1). */
  baseUrl: string
  /** Model id used for quality-critical work (tailoring, letters). */
  model: string
  /** Smaller/faster model id used for high-volume work (match scoring). */
  fastModel: string
  /** false → a local runtime that needs no API key. */
  requiresKey: boolean
  /** Use `fastModel` for match scoring (v2.5 cost control for free tiers). */
  fastMatching: boolean
}

const KEY = 'llmEngine.v25'

export const DEFAULT_ENGINE: EngineSettings = {
  baseUrl: GROQ.baseUrl,
  model: GROQ.model,
  fastModel: GROQ.fastModel,
  requiresKey: true,
  fastMatching: false,
}

// --- Pure helpers (unit-testable with no database and no network) ------------

/** Trim whitespace and any trailing slashes. Returns '' for empty input. */
export function normalizeBaseUrl(raw: string): string {
  return (raw ?? '').trim().replace(/\/+$/, '')
}

export type EngineProblem = 'baseUrl' | 'scheme' | 'model'

/**
 * Validate a user-entered engine configuration. Returns the cleaned value or the
 * first problem found, so the settings form can point at one field at a time.
 */
export function validateEngineDraft(
  draft: { baseUrl: string; model: string; fastModel: string; requiresKey: boolean; fastMatching: boolean },
): { ok: true; value: EngineSettings } | { ok: false; problem: EngineProblem } {
  const baseUrl = normalizeBaseUrl(draft.baseUrl)
  if (!baseUrl) return { ok: false, problem: 'baseUrl' }
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    return { ok: false, problem: 'baseUrl' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, problem: 'scheme' }
  }
  const model = draft.model.trim()
  if (!model) return { ok: false, problem: 'model' }
  const fastModel = draft.fastModel.trim() || model
  return {
    ok: true,
    value: { baseUrl, model, fastModel, requiresKey: draft.requiresKey, fastMatching: draft.fastMatching },
  }
}

/** True when the settings still point at Klar's default hosted engine. */
export function isDefaultEngine(settings: EngineSettings): boolean {
  return settings.baseUrl === DEFAULT_ENGINE.baseUrl
}

/**
 * Resolve an engine endpoint. Groq calls use Klar's fixed Worker relay when it
 * is configured; custom engines remain direct so bring-your-own-engine keeps
 * working. The relay avoids browser CORS/privacy failures and never
 * stores the per-request API key.
 */
export function engineRequestUrl(
  settings: EngineSettings,
  endpoint: '/chat/completions' | '/models',
  workerUrl: string = WORKER_URL,
): string {
  const relay = normalizeBaseUrl(workerUrl)
  if (relay && isDefaultEngine(settings)) return `${relay}/groq${endpoint}`
  return `${settings.baseUrl}${endpoint}`
}

/** A short, human label for error messages: "Groq" or the endpoint's host. */
export function engineDisplayName(settings: EngineSettings): string {
  if (isDefaultEngine(settings)) return 'Groq'
  try {
    return new URL(settings.baseUrl).host
  } catch {
    return 'the AI engine'
  }
}

export type EngineWarning =
  /** An http:// endpoint on an https:// page — the browser will block it. */
  | 'mixed_content'
  /** A plain-http endpoint, and Klar itself is also on http (dev): allowed. */
  | 'insecure_dev'
  /** A non-default endpoint that declares it needs no key. */
  | 'no_key'
  | null

/**
 * The honest pre-flight warning for a configuration. `pageProtocol` is injected
 * so this stays pure and testable (default: the current page, or https when
 * there is no `location`, which is the safe assumption).
 */
export function engineWarning(
  settings: EngineSettings,
  pageProtocol: string = typeof location === 'undefined' ? 'https:' : location.protocol,
): EngineWarning {
  let protocol = 'https:'
  try {
    protocol = new URL(settings.baseUrl).protocol
  } catch {
    return null
  }
  if (protocol === 'http:') {
    return pageProtocol === 'https:' ? 'mixed_content' : 'insecure_dev'
  }
  if (!settings.requiresKey && !isDefaultEngine(settings)) return 'no_key'
  return null
}

// --- Stored settings ---------------------------------------------------------

let cached: EngineSettings | null = null

/** Drop the in-memory copy (used after a save and by tests). */
export function invalidateEngineCache(): void {
  cached = null
}

export async function loadEngineSettings(): Promise<EngineSettings> {
  if (cached) return cached
  let stored: Partial<EngineSettings> | undefined
  try {
    stored = await getSetting<Partial<EngineSettings>>(KEY)
  } catch {
    stored = undefined
  }
  const merged: EngineSettings = { ...DEFAULT_ENGINE, ...stored }
  // Never trust a stored value that would produce an unusable request.
  const checked = validateEngineDraft(merged)
  cached = checked.ok ? checked.value : { ...DEFAULT_ENGINE }
  return cached
}

export async function saveEngineSettings(value: EngineSettings): Promise<EngineSettings> {
  const checked = validateEngineDraft(value)
  if (!checked.ok) throw new Error(`Invalid engine setting: ${checked.problem}`)
  await setSetting(KEY, checked.value)
  cached = checked.value
  return checked.value
}

export async function resetEngineSettings(): Promise<EngineSettings> {
  await setSetting(KEY, { ...DEFAULT_ENGINE })
  cached = { ...DEFAULT_ENGINE }
  return cached
}

/**
 * D2 (model-drift guard): ask the engine which models it actually serves.
 * `config.ts` itself warns that "Groq rotates its catalogue often", so a
 * retired model id used to fail as an opaque error. Settings can now list the
 * real ids. Returns [] when the endpoint does not implement /models.
 */
export async function listEngineModels(
  settings: EngineSettings,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const res = await fetch(engineRequestUrl(settings, '/models'), { headers, signal })
  if (!res.ok) return []
  const body = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null
  const ids = (body?.data ?? [])
    .map((row) => (typeof row?.id === 'string' ? row.id : ''))
    .filter((id) => id.length > 0)
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}
