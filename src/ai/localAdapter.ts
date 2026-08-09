import {
  AiProviderError,
  type AiProvider,
  type GenerationRequest,
  type GenerationResult,
  type ProviderCapabilities,
  type ProviderHealth,
} from './contracts'
import { AI_CAPABILITIES } from './capabilities'
import { desktopBridge, type KlarDesktopBridge } from './runtime'
import { validateGenerationRequest } from './validation'

const LOCAL_PROVIDER_ID = 'klar-local'

function mapDesktopError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error
  const candidate = error as { code?: unknown; message?: unknown }
  const message =
    typeof candidate?.message === 'string'
      ? candidate.message
      : 'The local model could not complete this request.'
  switch (candidate?.code) {
    case 'cancelled':
      return new AiProviderError('cancelled', message, { cause: error })
    case 'timeout':
      return new AiProviderError('timeout', message, { cause: error })
    case 'runtime_crashed':
      return new AiProviderError('runtime_crashed', message, { cause: error })
    case 'invalid_response':
      return new AiProviderError('invalid_response', message, { cause: error })
    default:
      return new AiProviderError('provider_unavailable', message, { cause: error })
  }
}

export class LocalAiProvider implements AiProvider {
  readonly id = LOCAL_PROVIDER_ID
  readonly kind = 'local' as const

  constructor(private readonly bridge: KlarDesktopBridge) {}

  describeCapabilities(): ProviderCapabilities {
    return {
      providerId: this.id,
      kind: this.kind,
      capabilities: new Set(Object.keys(AI_CAPABILITIES) as Array<keyof typeof AI_CAPABILITIES>),
      languages: new Set(['de', 'en']),
      adapters: new Set(['base', 'precision', 'writer']),
      structuredOutput: true,
      cancellation: true,
    }
  }

  async health(): Promise<ProviderHealth> {
    const status = await this.bridge.runtime.getStatus()
    if (status.phase === 'ready' && status.modelId) {
      return {
        status: 'ready',
        providerId: this.id,
        modelId: status.modelId,
        adapters: status.adapters,
        warmed: status.warmed,
      }
    }
    if (status.phase === 'starting' || status.phase === 'verifying') {
      return { status: 'starting', providerId: this.id, reason: status.phase }
    }
    return {
      status: status.phase === 'crashed' ? 'degraded' : 'unavailable',
      providerId: this.id,
      reason: status.lastErrorCode ?? status.phase,
    }
  }

  async generate(
    rawRequest: GenerationRequest,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    const request = validateGenerationRequest(rawRequest)
    if (signal?.aborted) throw new AiProviderError('cancelled', 'The request was cancelled.')

    const abort = () => {
      void this.bridge.ai.cancel(request.requestId)
    }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      return await this.bridge.ai.generate(request)
    } catch (error) {
      throw mapDesktopError(error)
    } finally {
      signal?.removeEventListener('abort', abort)
    }
  }

  async cancel(requestId: string): Promise<boolean> {
    return this.bridge.ai.cancel(requestId)
  }
}

export function createDesktopLocalProvider(
  bridge: KlarDesktopBridge | null = desktopBridge(),
): LocalAiProvider | null {
  return bridge ? new LocalAiProvider(bridge) : null
}
