import type { KlarDesktopBridge } from './runtime'
import { desktopBridge } from './runtime'
import {
  OpenAiCompatibleCloudProvider,
  type OpenAiCompatibleCloudDependencies,
} from './cloudAdapter'
import { createDesktopLocalProvider } from './localAdapter'
import { AiProviderRegistry } from './providerRegistry'

export type DefaultAiRegistryOptions = {
  cloud?: OpenAiCompatibleCloudDependencies | false
  localBridge?: KlarDesktopBridge | null
}

/**
 * Root integration seam for v2.6 actions. Web builds receive the current cloud
 * engine only. Desktop builds additionally receive the local provider exposed
 * by the narrow preload bridge. Callers still make the explicit provider
 * choice; this factory never performs a silent cloud/local fallback.
 */
export function createDefaultAiProviderRegistry(
  options: DefaultAiRegistryOptions = {},
): AiProviderRegistry {
  const registry = new AiProviderRegistry()
  if (options.cloud !== false) {
    registry.register(
      new OpenAiCompatibleCloudProvider(options.cloud ?? {}),
    )
  }
  const local = createDesktopLocalProvider(
    options.localBridge === undefined
      ? desktopBridge()
      : options.localBridge,
  )
  if (local) registry.register(local)
  return registry
}
