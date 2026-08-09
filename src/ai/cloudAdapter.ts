import { AppError } from '../errors/appError'
import {
  chatComplete,
  type ChatOptions,
} from '../llm/groq'
import {
  loadEngineSettings,
  probeEngineAccess,
  type EngineSettings,
} from '../llm/provider'
import { loadGroqKey } from '../settings/keys'
import { AI_CAPABILITIES } from './capabilities'
import {
  AiProviderError,
  type AiProvider,
  type GenerationRequest,
  type GenerationResult,
  type ProviderCapabilities,
  type ProviderHealth,
} from './contracts'
import { validateGenerationRequest } from './validation'

type CloudCompletion = (options: ChatOptions) => Promise<string>
type EngineLoader = () => Promise<EngineSettings>
type KeyLoader = () => Promise<string | undefined>
type AccessProbe = (
  settings: EngineSettings,
  apiKey: string,
  options: { signal?: AbortSignal },
) => Promise<{ ok: true } | { ok: false; status: number; message: string }>

export type OpenAiCompatibleCloudDependencies = {
  complete?: CloudCompletion
  loadEngine?: EngineLoader
  loadApiKey?: KeyLoader
  probeAccess?: AccessProbe
  now?: () => number
}

function projectMessages(messages: GenerationRequest['messages']): {
  system: string
  user: string
} {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
    .trim()
  const conversation = messages.filter((message) => message.role !== 'system')
  const user =
    conversation.length === 1 && conversation[0].role === 'user'
      ? conversation[0].content
      : conversation
          .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
          .join('\n\n')
  if (!system || !user.trim()) {
    throw new AiProviderError(
      'invalid_request',
      'Cloud generation requires system and user content.',
    )
  }
  return { system, user }
}

function mapCloudError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error
  if (error instanceof AppError) {
    const code =
      error.category === 'validation'
        ? 'invalid_request'
        : error.category === 'parsing'
          ? 'invalid_response'
          : 'provider_unavailable'
    return new AiProviderError(code, error.message, { cause: error })
  }
  return new AiProviderError(
    'provider_unavailable',
    'The configured cloud AI engine could not complete this request.',
    { cause: error },
  )
}

/**
 * Provider-neutral bridge over Klar's existing OpenAI-compatible client.
 *
 * The existing client remains the authority for budget scheduling, endpoint
 * routing, credentials, constrained-output compatibility and AppError mapping.
 * This adapter does not duplicate those security- and reliability-sensitive
 * paths. It resolves the key at request time and never stores it on the class.
 */
export class OpenAiCompatibleCloudProvider implements AiProvider {
  readonly id = 'klar-cloud-openai-compatible'
  readonly kind = 'cloud' as const

  private readonly complete: CloudCompletion
  private readonly loadEngine: EngineLoader
  private readonly loadApiKey: KeyLoader
  private readonly probeAccess: AccessProbe
  private readonly now: () => number
  private readonly active = new Map<
    string,
    { controller: AbortController; timeout: boolean }
  >()
  private readonly cancelled = new Set<string>()

  constructor(dependencies: OpenAiCompatibleCloudDependencies = {}) {
    this.complete = dependencies.complete ?? chatComplete
    this.loadEngine = dependencies.loadEngine ?? loadEngineSettings
    this.loadApiKey = dependencies.loadApiKey ?? loadGroqKey
    this.probeAccess = dependencies.probeAccess ?? probeEngineAccess
    this.now = dependencies.now ?? (() => Date.now())
  }

  describeCapabilities(): ProviderCapabilities {
    return {
      providerId: this.id,
      kind: this.kind,
      capabilities: new Set(
        Object.keys(AI_CAPABILITIES) as Array<keyof typeof AI_CAPABILITIES>,
      ),
      languages: new Set(['de', 'en']),
      // These are logical task profiles for cloud routing. No claim is made
      // that a cloud model physically loads Klar's local LoRA adapters.
      adapters: new Set(['base', 'precision', 'writer']),
      structuredOutput: true,
      cancellation: true,
    }
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    try {
      const [settings, apiKey] = await Promise.all([
        this.loadEngine(),
        this.loadApiKey(),
      ])
      if (settings.requiresKey && !apiKey) {
        return {
          status: 'unavailable',
          providerId: this.id,
          reason: 'missing_credentials',
        }
      }
      const result = await this.probeAccess(settings, apiKey ?? '', { signal })
      return result.ok
        ? {
            status: 'ready',
            providerId: this.id,
            modelId: settings.model,
            adapters: ['base', 'precision', 'writer'],
            warmed: true,
          }
        : {
            status: 'unavailable',
            providerId: this.id,
            reason: result.status === 0 ? 'network' : `http_${result.status}`,
          }
    } catch {
      return {
        status: 'unavailable',
        providerId: this.id,
        reason: signal?.aborted ? 'cancelled' : 'probe_failed',
      }
    }
  }

  async generate(
    rawRequest: GenerationRequest,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    const request = validateGenerationRequest(rawRequest)
    if (this.active.has(request.requestId)) {
      throw new AiProviderError(
        'invalid_request',
        'A cloud request with this id is already running.',
      )
    }
    if (signal?.aborted) {
      throw new AiProviderError('cancelled', 'The cloud request was cancelled.')
    }
    const projected = projectMessages(request.messages)
    const controller = new AbortController()
    const active = { controller, timeout: false }
    this.active.set(request.requestId, active)
    const abortFromCaller = () => {
      this.cancelled.add(request.requestId)
      controller.abort()
    }
    signal?.addEventListener('abort', abortFromCaller, { once: true })
    const timeout = setTimeout(() => {
      active.timeout = true
      controller.abort()
    }, request.timeoutMs)
    const startedAt = this.now()

    try {
      const [settings, apiKey] = await Promise.all([
        this.loadEngine(),
        this.loadApiKey(),
      ])
      if (controller.signal.aborted) {
        throw new AiProviderError(
          active.timeout ? 'timeout' : 'cancelled',
          active.timeout
            ? 'The cloud request timed out.'
            : 'The cloud request was cancelled.',
        )
      }
      if (settings.requiresKey && !apiKey) {
        throw new AiProviderError(
          'provider_unavailable',
          'The configured cloud AI engine needs a key.',
        )
      }
      const content = await this.complete({
        system: projected.system,
        user: projected.user,
        apiKey: apiKey ?? '',
        model: settings.model,
        temperature: request.temperature,
        maxTokens: request.maxOutputTokens,
        signal: controller.signal,
        ...(request.jsonSchema
          ? {
              jsonSchema: {
                name: `klar_${request.capability}_v1`,
                schema: request.jsonSchema,
              },
            }
          : {}),
      })
      if (controller.signal.aborted) {
        throw new AiProviderError(
          active.timeout ? 'timeout' : 'cancelled',
          active.timeout
            ? 'The cloud request timed out.'
            : 'The cloud request was cancelled.',
        )
      }
      if (!content.trim()) {
        throw new AiProviderError(
          'invalid_response',
          'The cloud AI engine returned no usable content.',
        )
      }
      return {
        requestId: request.requestId,
        providerId: this.id,
        modelId: settings.model,
        adapter: request.adapter,
        content,
        finishReason: 'stop',
        timings: { totalMs: this.now() - startedAt },
      }
    } catch (error) {
      if (active.timeout) {
        throw new AiProviderError('timeout', 'The cloud request timed out.', {
          cause: error,
        })
      }
      if (this.cancelled.has(request.requestId) || signal?.aborted) {
        throw new AiProviderError(
          'cancelled',
          'The cloud request was cancelled.',
          { cause: error },
        )
      }
      throw mapCloudError(error)
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
      this.active.delete(request.requestId)
      this.cancelled.delete(request.requestId)
    }
  }

  async cancel(requestId: string): Promise<boolean> {
    const request = this.active.get(requestId)
    if (!request) return false
    this.cancelled.add(requestId)
    request.controller.abort()
    return true
  }
}