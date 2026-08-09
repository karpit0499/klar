/**
 * Provider-neutral AI contracts for Klar v2.6.
 *
 * These types deliberately describe product capabilities, not provider routes.
 * Cloud and local providers must pass through the same downstream evidence and
 * schema validators; choosing a provider never relaxes a safety rule.
 */

export type AiProviderKind = 'cloud' | 'local'

export type AiCapability =
  | 'structured_job_extraction'
  | 'evidence_selection'
  | 'recruiter_message'
  | 'cover_letter'
  | 'resume_bullet_revision'

export type AiLanguage = 'de' | 'en'

export type AdapterSlot = 'base' | 'precision' | 'writer'

export type AiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type GenerationRequest = {
  /** Caller-generated id used for cancellation and diagnostics correlation. */
  requestId: string
  capability: AiCapability
  language: AiLanguage
  messages: AiMessage[]
  adapter: AdapterSlot
  maxOutputTokens: number
  temperature: number
  /** Maximum end-to-end request time, including local queueing. */
  timeoutMs: number
  /** Present only for tasks whose consumer requires structured output. */
  jsonSchema?: Record<string, JsonValue>
}

export type GenerationUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type GenerationTimings = {
  queuedMs?: number
  firstTokenMs?: number
  totalMs: number
}

export type GenerationResult = {
  requestId: string
  providerId: string
  modelId: string
  adapter: AdapterSlot
  content: string
  finishReason: 'stop' | 'length' | 'cancelled' | 'error' | 'unknown'
  usage?: GenerationUsage
  timings: GenerationTimings
}

export type ProviderHealth =
  | {
      status: 'ready'
      providerId: string
      modelId: string
      adapters: AdapterSlot[]
      warmed: boolean
    }
  | {
      status: 'unavailable' | 'starting' | 'degraded'
      providerId: string
      reason: string
    }

export type ProviderCapabilities = {
  providerId: string
  kind: AiProviderKind
  capabilities: ReadonlySet<AiCapability>
  languages: ReadonlySet<AiLanguage>
  adapters: ReadonlySet<AdapterSlot>
  structuredOutput: boolean
  cancellation: boolean
}

export interface AiProvider {
  readonly id: string
  readonly kind: AiProviderKind
  describeCapabilities(): ProviderCapabilities
  health(signal?: AbortSignal): Promise<ProviderHealth>
  generate(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult>
  cancel(requestId: string): Promise<boolean>
}

export class AiProviderError extends Error {
  readonly code:
    | 'invalid_request'
    | 'capability_unavailable'
    | 'provider_unavailable'
    | 'runtime_crashed'
    | 'cancelled'
    | 'timeout'
    | 'invalid_response'

  constructor(
    code: AiProviderError['code'],
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message)
    this.name = 'AiProviderError'
    this.code = code
    if (options.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}