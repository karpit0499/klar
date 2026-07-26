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
  isDefaultEngine,
  loadEngineSettings,
  probeEngineAccess,
  type EngineSettings,
} from './provider'
import type { StructuredOutputSchema } from './jsonSchemas'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type ProviderErrorDetails = {
  message?: unknown
  type?: unknown
  code?: unknown
  failed_generation?: unknown
}

type ChatApiResponse = {
  choices?: { finish_reason?: string; message?: { content?: string | null } }[]
  error?: ProviderErrorDetails
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
  /** Ask for a JSON object. Prefer `jsonSchema` for a defined contract. */
  json?: boolean
  /** Closed JSON Schema used with constrained decoding on supported Groq models. */
  jsonSchema?: StructuredOutputSchema
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

const REQUEST_TOO_LARGE_RE =
  /request[_\s-]*(?:body[_\s-]*)?too[_\s-]*large|too[_\s-]*many[_\s-]*tokens|context[_\s-]*length|exceeds?[_\s-]*(?:the[_\s-]*)?(?:context|token|request)|maximum[_\s-]*context/i

/** Which model id a set of options resolves to. Pure — used by tests and UI. */
export function resolveModel(engine: EngineSettings, opts: Pick<ChatOptions, 'model' | 'fast'>): string {
  if (opts.model) return opts.model
  return opts.fast ? engine.fastModel : engine.model
}

const STRICT_GROQ_MODELS = new Set([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
])

export type StructuredResponseMode = 'preferred' | 'json_object'

/** Whether Klar can safely request Groq's guaranteed constrained decoding. */
export function supportsStrictJson(engine: EngineSettings, model: string): boolean {
  return isDefaultEngine(engine) && STRICT_GROQ_MODELS.has(model)
}

/**
 * Groq returns HTTP 400 for constrained-decoding failures. Keep this deliberately
 * narrow: credentials, quota, oversized requests, retired models, network
 * failures, and arbitrary provider 400s must retain their existing error path.
 */
export function isSchemaGenerationFailure(
  status: number,
  error: ProviderErrorDetails | undefined,
): boolean {
  if (status !== 400 || !error) return false
  const message = providerErrorMessage(error, '')
  const markers = [message, stringValue(error.type), stringValue(error.code)]
    .filter(Boolean)
    .join(' ')
  if (
    isProviderRequestTooLarge(status, markers) ||
    isModelGoneProviderError(status, markers) ||
    /invalid[_\s-]*api[_\s-]*key|authentication|unauthori[sz]ed|credential|rate[_\s-]*limit|quota[_\s-]*(?:exceeded|reached)/i.test(markers)
  ) {
    return false
  }
  return (
    error.failed_generation !== undefined ||
    /failed_generation|json[_\s-]*validate|validate(?:d|ion)?\s+json|generated\s+json|json\s+does\s+not\s+match|expected\s+(?:json\s+)?schema|json\s*schema|jsonschema|missing\s+propert/i.test(markers)
  )
}

/**
 * Recover a provider's rejected generation only when it is already a valid JSON
 * object. Consumers still run their own no-fabrication and domain validators.
 */
export function recoverFailedGeneration(error: ProviderErrorDetails | undefined): string | null {
  if (!error || error.failed_generation === undefined) return null
  const candidate =
    typeof error.failed_generation === 'string'
      ? error.failed_generation
      : safelyStringify(error.failed_generation)
  if (!candidate) return null

  try {
    const parsed = extractJson<unknown>(candidate)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return JSON.stringify(parsed)
  } catch {
    return null
  }
}

/** Pure request builder so provider compatibility is covered without a network call. */
export function buildChatRequestBody(
  engine: EngineSettings,
  opts: Omit<ChatOptions, 'apiKey' | 'signal'>,
  responseMode: StructuredResponseMode = 'preferred',
): Record<string, unknown> {
  const model = resolveModel(engine, opts)
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ] satisfies ChatMessage[],
    temperature: opts.temperature ?? 0,
  }

  // Groq deprecated max_tokens. Keep it for custom OpenAI-compatible engines,
  // where max_completion_tokens is not universally implemented.
  if (isDefaultEngine(engine)) {
    body.max_completion_tokens = opts.maxTokens ?? 2048
    if (model.startsWith('openai/gpt-oss-')) body.reasoning_effort = 'low'
  } else {
    body.max_tokens = opts.maxTokens ?? 2048
  }

  if (
    responseMode === 'preferred' &&
    opts.jsonSchema &&
    supportsStrictJson(engine, model)
  ) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: opts.jsonSchema.name,
        strict: true,
        schema: opts.jsonSchema.schema,
      },
    }
  } else if (opts.json || opts.jsonSchema) {
    // Custom engines and other Groq models retain the broadly compatible mode.
    body.response_format = { type: 'json_object' }
  }
  return body
}

/** Whether this exact request used constrained JSON Schema decoding. */
export function isStrictJsonRequestBody(body: Record<string, unknown>): boolean {
  const format = body.response_format
  return (
    !!format &&
    typeof format === 'object' &&
    (format as { type?: unknown }).type === 'json_schema'
  )
}

/** Pure retry decision used by the client and regression tests. */
export function shouldRetryWithJsonObject(
  body: Record<string, unknown>,
  status: number,
  error: ProviderErrorDetails | undefined,
): boolean {
  return isStrictJsonRequestBody(body) && isSchemaGenerationFailure(status, error)
}

/** One chat completion. Returns the raw assistant text. Throws on API errors. */
export async function chatComplete(opts: ChatOptions): Promise<string> {
  const engine = await loadEngineSettings()
  const name = engineDisplayName(engine)
  const primaryBody = buildChatRequestBody(engine, opts)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`

  const requestUrl = engineRequestUrl(engine, '/chat/completions')
  let result = await sendChatRequest(requestUrl, headers, primaryBody, opts.signal, name)
  let initialSchemaError: ProviderErrorDetails | undefined

  if (
    !result.response.ok &&
    shouldRetryWithJsonObject(primaryBody, result.response.status, result.data.error)
  ) {
    const recovered = recoverFailedGeneration(result.data.error)
    if (recovered) return recovered

    // Exactly one compatibility retry. This is not used for arbitrary errors,
    // and this second request is never recursively retried.
    initialSchemaError = result.data.error
    const fallbackBody = buildChatRequestBody(engine, opts, 'json_object')
    result = await sendChatRequest(requestUrl, headers, fallbackBody, opts.signal, name)
  }

  if (!result.response.ok) {
    throwProviderError(
      engine,
      name,
      opts,
      result.response.status,
      result.data.error,
      initialSchemaError,
    )
  }

  const choice = result.data.choices?.[0]
  const content = choice?.message?.content?.trim()
  if (!content) {
    throw new AppError({
      category: 'source',
      message: `${name} returned no usable text.`,
      dataSafe: true,
      available: 'Your existing profile and workspace are unchanged.',
      action: { label: 'Try the action again', kind: 'retry' },
      technical: `empty_completion${choice?.finish_reason ? `; finish_reason=${choice.finish_reason}` : ''}`,
    })
  }
  return content
}

type ChatHttpResult = {
  response: Response
  data: ChatApiResponse
}

async function sendChatRequest(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  name: string,
): Promise<ChatHttpResult> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new AppError({
      category: 'network',
      message: `Klar could not reach ${name}.`,
      dataSafe: true,
      available: 'Local search, filters, tracker, backups, and exports still work.',
      action: { label: 'Check the connection and retry', kind: 'retry' },
      technical: error instanceof Error ? error.message : String(error),
    })
  }

  return {
    response,
    data: (await response.json().catch(() => ({}))) as ChatApiResponse,
  }
}

function throwProviderError(
  engine: EngineSettings,
  name: string,
  opts: ChatOptions,
  status: number,
  error: ProviderErrorDetails | undefined,
  initialSchemaError?: ProviderErrorDetails,
): never {
  const msg = providerErrorMessage(error, `${name} HTTP ${status}`)
  const technical = initialSchemaError
    ? `initial_schema_error=${providerErrorTechnical(initialSchemaError, msg)}; ` +
      `json_object_error=${providerErrorTechnical(error, msg)}`
    : providerErrorTechnical(error, msg)

  // v2.4.3: providers state their real numbers when they refuse. Read them so
  // the pre-flight check stops guessing.
  const limits = parseLimitFromError(msg)
  if (limits?.limit) void saveTpmLimit(limits.limit)

  if (isProviderRequestTooLarge(status, [msg, stringValue(error?.code)].join(' '))) {
    throw new AppError({
      category: 'validation',
      message: `That request was larger than ${name} allows in one go.`,
      dataSafe: true,
      available:
        'Waiting will not help, because the request itself is over the limit. ' +
        'Use "Tailor without AI" to build this résumé now with no AI at all, or shorten the job description.',
      action: { label: 'Continue without AI', kind: 'none' },
      technical,
    })
  }

  const category =
    status === 429
      ? 'rate_limit'
      : status === 401 || status === 403
        ? 'credentials'
        : 'source'
  // v2.5 (D2 model-drift guard): a retired model id comes back as a 404/400
  // mentioning the model. Say so plainly and send the person to Settings,
  // instead of surfacing an opaque provider error.
  const modelGone = isModelGoneProviderError(
    status,
    [msg, stringValue(error?.type), stringValue(error?.code)].join(' '),
  )
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
    technical,
  })
}

function providerErrorMessage(error: ProviderErrorDetails | undefined, fallback: string): string {
  return typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : fallback
}

function providerErrorTechnical(
  error: ProviderErrorDetails | undefined,
  fallback: string,
): string {
  if (!error) return fallback
  const message = providerErrorMessage(error, fallback)
  const details: Record<string, unknown> = {}
  if (error.type !== undefined) details.type = error.type
  if (error.code !== undefined) details.code = error.code
  if (error.failed_generation !== undefined) {
    // Never surface résumé/job content in the UI's technical-detail panel.
    // The typed response still retains the payload for in-memory recovery.
    details.failed_generation_present = true
  }
  const serialized = safelyStringify(details)
  return serialized && serialized !== '{}' ? `${message}; provider_error=${serialized}` : message
}

function safelyStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function isModelGoneProviderError(status: number, details: string): boolean {
  if (status !== 400 && status !== 404) return false
  return (
    /model[_\s-]*(?:(?:has[_\s-]*been[_\s-]*)?(?:decommissioned|retired|deprecated|unavailable)|not[_\s-]*(?:found|available|supported)|does[_\s-]*not[_\s-]*exist)|(?:invalid|unknown)[_\s-]*model/i.test(details)
  )
}

function isProviderRequestTooLarge(status: number, details: string): boolean {
  return isRequestTooLarge(status, details) || (status === 400 && REQUEST_TOO_LARGE_RE.test(details))
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (!!error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError')
  )
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
