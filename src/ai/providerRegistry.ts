import {
  AiProviderError,
  type AiCapability,
  type AiLanguage,
  type AiProvider,
} from './contracts'
import { missingProviderRequirements, providerSupports } from './capabilities'

export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>()

  register(provider: AiProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`AI provider already registered: ${provider.id}`)
    }
    this.providers.set(provider.id, provider)
  }

  unregister(providerId: string): boolean {
    return this.providers.delete(providerId)
  }

  get(providerId: string): AiProvider | undefined {
    return this.providers.get(providerId)
  }

  list(): AiProvider[] {
    return [...this.providers.values()]
  }

  eligible(capability: AiCapability, language: AiLanguage): AiProvider[] {
    return this.list().filter((provider) =>
      providerSupports(provider.describeCapabilities(), capability, language),
    )
  }

  require(
    providerId: string,
    capability: AiCapability,
    language: AiLanguage,
  ): AiProvider {
    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new AiProviderError(
        'provider_unavailable',
        `AI provider is not registered: ${providerId}`,
      )
    }
    const missing = missingProviderRequirements(
      provider.describeCapabilities(),
      capability,
      language,
    )
    if (missing.length > 0) {
      throw new AiProviderError(
        'capability_unavailable',
        `${providerId} cannot serve this request (${missing.join(', ')}).`,
      )
    }
    return provider
  }
}
