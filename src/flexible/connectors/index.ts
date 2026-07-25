// ============================================================================
// Connector assembly. Turns the registry configs into runnable Connector
// instances: picks the right engine per type, binds real adapters for API
// connectors, resolves federated members, and wraps every top-level connector
// so a failure or empty result degrades to its guaranteed fallback (§5.3/§6.1).
// ============================================================================
import type { Adapter } from '../../sources/types'
import { fetchBa } from '../../sources/ba'
import { fetchArbeitnow } from '../../sources/arbeitnow'
import { fetchAdzuna } from '../../sources/adzuna'
import { fetchAllAts } from '../../sources/ats'
import type { AdzunaKey } from '../../settings/adzunaKey'
import { serializeAppError, toAppError } from '../../errors/appError'
import { makeApiConnector, type ApiAdapters } from './engines/apiEngine'
import { makeFeedConnector } from './engines/feedEngine'
import { makeSitemapConnector } from './engines/sitemapEngine'
import { makePortalConnector } from './engines/portalEngine'
import { makeOpenEntryConnector } from './engines/openEntryEngine'
import { makeFederatedConnector } from './engines/federatedEngine'
import { buildFallback, type ApiRunner } from './fallback'
import { FLEXIBLE_REGISTRY_DE, topLevelConfigs } from './registry.de'
import { workerFabricFetch } from './proxy'
import type { Connector, ConnectorConfig, ConnectorContext, FabricFetch } from './types'

export type FabricOptions = {
  /** Override adapters (tests inject fakes). */
  adapters?: ApiAdapters
  adzunaKey?: AdzunaKey
  country?: string
}

/** Bind the real v2.x adapters, defaulting the ATS one to a query-agnostic run. */
export function defaultApiAdapters(options: FabricOptions = {}): Required<ApiAdapters> {
  const ba: Adapter = (q, o) => fetchBa(q, o)
  const arbeitnow: Adapter = (q, o) => fetchArbeitnow(q, o)
  const adzuna: Adapter = (q, o) => fetchAdzuna(q, { signal: o?.signal, key: options.adzunaKey, country: options.country })
  const ats: Adapter = (_q, o) => fetchAllAts(o?.signal).then((r) => ({ jobs: r.jobs }))
  return { ba, arbeitnow, adzuna, ats }
}

function rawEngine(
  config: ConnectorConfig,
  adapters: Required<ApiAdapters>,
  rawById: Map<string, Connector>,
): Connector {
  switch (config.type) {
    case 'api':
      return makeApiConnector(config, adapters[config.api?.adapter ?? 'ba'])
    case 'feed':
      return makeFeedConnector(config)
    case 'sitemap':
      return makeSitemapConnector(config)
    case 'portal':
      return makePortalConnector(config)
    case 'open_entry':
      return makeOpenEntryConnector(config)
    case 'federated': {
      const members = (config.members ?? [])
        .map((id) => rawById.get(id))
        .filter((member): member is Connector => Boolean(member))
      return makeFederatedConnector(config, members)
    }
  }
}

/** Wrap a connector so failure or emptiness degrades to its fallback route. */
function wrapWithFallback(connector: Connector, apiRunner: ApiRunner): Connector {
  return {
    config: connector.config,
    async run(query, ctx) {
      try {
        const result = await connector.run(query, ctx)
        if (result.opportunities.length === 0 && connector.config.type !== 'api') {
          return await buildFallback(connector.config, query, ctx, apiRunner)
        }
        return result
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        const fallback = await buildFallback(connector.config, query, ctx, apiRunner).catch(() => null)
        if (!fallback) throw error
        return {
          ...fallback,
          error: serializeAppError(
            toAppError(error, {
              category: 'source',
              message: `${connector.config.employerFamily} could not complete this search.`,
              available: 'The official route and other sources still return results.',
            }),
          ),
        }
      }
    },
  }
}

/** Build the runnable top-level connectors and the employer-filtered API runner. */
export function buildFabric(options: FabricOptions = {}): {
  connectors: Connector[]
  apiRunner: ApiRunner
} {
  const adapters = { ...defaultApiAdapters(options), ...options.adapters } as Required<ApiAdapters>
  const rawById = new Map<string, Connector>()

  for (const config of FLEXIBLE_REGISTRY_DE) {
    if (config.type === 'federated') continue
    rawById.set(config.id, rawEngine(config, adapters, rawById))
  }
  for (const config of FLEXIBLE_REGISTRY_DE) {
    if (config.type !== 'federated') continue
    rawById.set(config.id, rawEngine(config, adapters, rawById))
  }

  const baConfig = FLEXIBLE_REGISTRY_DE.find((c) => c.id === 'baseline-ba')!
  const apiRunner: ApiRunner = async (employer, query, ctx) => {
    const clone: ConnectorConfig = { ...baConfig, id: `fallback-ba:${employer}`, api: { adapter: 'ba', employerFilter: employer } }
    const result = await makeApiConnector(clone, adapters.ba).run(query, ctx)
    return result.opportunities
  }

  const connectors = topLevelConfigs()
    .filter((config) => config.health.enabled)
    .map((config) => wrapWithFallback(rawById.get(config.id)!, apiRunner))

  return { connectors, apiRunner }
}

/** A ready-to-run connector context using the Worker proxy (or an injected one). */
export function defaultContext(signal?: AbortSignal, proxy: FabricFetch = workerFabricFetch): ConnectorContext {
  return { proxy, signal, now: () => Date.now() }
}

export { workerFabricFetch }
export type { Connector, ConnectorContext, FabricFetch } from './types'