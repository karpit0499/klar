// ============================================================================
// The OpenAI-compatible chat client. Default Groq requests use Klar's fixed
// browser-safe Worker relay; custom engines remain direct. A relayed key exists
// only in the Authorization header for that one request and is never stored.
//
// v2.5 (WS3): the endpoint and model are no longer hardcoded. Every request now
// resolves `EngineSettings` from ./provider.ts first, so the same call sites work
// against hosted Groq (the default, verified CORS allow-origin *) or any other
// OpenAI-compatible endpoint the user configures. `groqChat` keeps its name so
// no caller had to change; `chatComplete` is the accurate alias for new code.
//
// Routing NEVER relaxes a validator. This file only chooses WHERE a request goes
// and reports failures honestly — it has no notion of "acceptable output".
// ============================================================================
import { AppError, serializeAppError, toAppError, type AppErrorData } from '../errors/appError'
import { parseLimitFromError, saveTpmLimit } from './budget'
import {
  engineDisplayName,
  engineRequestUrl,
  loadEngineSettings,
  probeEngineAccess,
  type EngineSettings,
} from './provider'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type ChatApiResponse = {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

export type ChatOptions = {
  system: string
  user: string
  apiKey: string
  /** Explicit model id. Overrides both the engine default and `fast`. */
  model?: string
  /** Prefer the engine's smaller/faster model (high-volume work like matching). */
  fast?: boolean
  temperature?: number
  /** Ask for a strict JSON object (OpenAI-compatible json_object mode). */
  json?: boolean
  maxTokens?: number
  signal?: AbortSignal
}

/**
 * v2.4.3: does this provider message describe a single request that was too big,
 * rather than a temporary quota? The distinction matters enormously: a temporary
 * quota clears in a minute, an oversized request never will, and telling someone
 * to "try again" in the second case is the bug v2.4.3 fixed.
 */
export function isRequestTooLarge(status: number, message: string): boolean {
  if (status === 413) return true
  return status === 429 && /too large|request too large|exceeds/i.test(message)
}

/** Which model id a set of options resolves to. Pure — used by tests and UI. */
export function resolveModel(engine: EngineSettings, opts: Pick<ChatOptions, 'model' | 'fast'>): string {
  if (opts.model) return opts.model
  return opts.fast ? engine.fastModel : engine.model
}

/** One chat completion. Returns the raw assistant text. Throws on API errors. */
export async function chatComplete(opts: ChatOptions): Promise<string> {
  const engine = await loadEngineSettings()
  const name = engineDisplayName(engine)
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ]
  const body: Record<string, unknown> = {
    model: resolveModel(engine, opts),
    messages,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 2048,
  }
  if (opts.json) body.response_format = { type: 'json_object' }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`

  let res: Response
  try {
    res = await fetch(engineRequestUrl(engine, '/chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AppError({
      category: 'network',
      message: `Klar could not reach ${name}.`,
      dataSafe: true,
      available: 'Local search, filters, tracker, backups, and exports still work.',
      action: { label: 'Check the connection and retry', kind: 'retry' },
      technical: error instanceof Error ? error.message : String(error),
    })
  }

  const data = (await res.json().catch(() => ({}))) as ChatApiResponse
  if (!res.ok) {
    const msg = data.error?.message || `${name} HTTP ${res.status}`

    // v2.4.3: providers state their real numbers when they refuse. Read them so
    // the pre-flight check stops guessing.
    const limits = parseLimitFromError(msg)
    if (limits?.limit) void saveTpmLimit(limits.limit)

    if (isRequestTooLarge(res.status, msg)) {
      throw new AppError({
        category: 'validation',
        message: `That request was larger than ${name} allows in one go.`,
        dataSafe: true,
        available:
          'Waiting will not help, because the request itself is over the limit. ' +
          'Use "Tailor without AI" to build this résumé now with no AI at all, or shorten the job description.',
        action: { label: 'Continue without AI', kind: 'none' },
        technical: msg,
      })
    }

    const category =
      res.status === 429
        ? 'rate_limit'
        : res.status === 401 || res.status === 403
          ? 'credentials'
          : 'source'
    // v2.5 (D2 model-drift guard): a retired model id comes back as a 404/400
    // mentioning the model. Say so plainly and send the person to Settings,
    // instead of surfacing an opaque provider error.
    const modelGone =
      (res.status === 404 || res.status === 400) && /model/i.test(msg)
    throw new AppError({
      category: modelGone ? 'validation' : category,
      message: modelGone
        ? `${name} does not offer the model "${resolveModel(engine, opts)}" any more.`
        : category === 'rate_limit'
          ? `${name} has reached its current request limit.`
          : category === 'credentials'
            ? `${name} rejected this API key.`
            : `${name} could not complete this request.`,
      dataSafe: true,
      available: 'Local search, filters, tracker, backups, and exports still work.',
      action: {
        label: modelGone
          ? 'Choose another model in Settings'
          : category === 'credentials'
            ? 'Update the API key'
            : category === 'rate_limit'
              ? 'Wait a moment, or switch engine in Settings'
              : 'Try again',
        kind: modelGone || category === 'credentials' ? 'open_settings' : 'retry',
      },
      technical: msg,
    })
  }
  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * Backwards-compatible name. Every pre-v2.5 call site imports `groqChat`; it now
 * routes through the configured engine like `chatComplete`.
 */
export const groqChat = chatComplete

/**
 * Parse a JSON object out of an LLM reply, tolerating stray prose or ```json
 * fences. Returns the parsed value or throws with a clear message.
 */
export function extractJson<T>(text: string): T {
  let t = text.trim()
  // Strip a ```json … ``` or ``` … ``` fence if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  // If there's leading/trailing prose, grab the outermost {...} or [...].
  if (!(t.startsWith('{') || t.startsWith('['))) {
    const objStart = t.indexOf('{')
    const arrStart = t.indexOf('[')
    const start =
      objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart)
    if (start === -1) throw parsingError('No JSON found in model reply')
    const openCh = t[start]
    const closeCh = openCh === '{' ? '}' : ']'
    const end = t.lastIndexOf(closeCh)
    if (end === -1) throw parsingError('Unterminated JSON in model reply')
    t = t.slice(start, end + 1)
  }
  try {
    return JSON.parse(t) as T
  } catch (e) {
    throw parsingError('Model returned invalid JSON: ' + (e instanceof Error ? e.message : String(e)))
  }
}

function parsingError(technical: string): AppError {
  return new AppError({
    category: 'parsing',
    message: 'The AI response could not be read safely.',
    dataSafe: true,
    available: 'Your existing profile and workspace are unchanged.',
    action: { label: 'Retry the action', kind: 'retry' },
    technical,
  })
}

/** Quota-free authentication check used by the in-app key prompt. */
export async function pingGroqKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: AppErrorData }> {
  try {
    const engine = await loadEngineSettings()
    const name = engineDisplayName(engine)
    const result = await probeEngineAccess(engine, apiKey)
    if (result.ok) return { ok: true }
    const credentials = result.status === 401 || result.status === 403
    const network = result.status === 0
    return {
      ok: false,
      error: serializeAppError(new AppError({
        category: credentials ? 'credentials' : network ? 'network' : 'source',
        message: credentials
          ? `${name} rejected this API key.`
          : network
            ? `Klar could not reach ${name}.`
            : `${name} could not validate this API key.`,
        dataSafe: true,
        available: 'Local features remain available.',
        action: {
          label: credentials ? 'Check the key and try again' : 'Try validation again',
          kind: credentials ? 'open_settings' : 'retry',
        },
        technical: result.message,
      })),
    }
  } catch (e) {
    return {
      ok: false,
      error: serializeAppError(toAppError(e, {
        category: 'credentials',
        message: 'That API key could not be validated.',
        dataSafe: true,
        available: 'Local features remain available.',
        action: { label: 'Check the key and try again', kind: 'open_settings' },
      })),
    }
  }
}
