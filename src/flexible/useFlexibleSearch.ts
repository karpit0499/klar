// ============================================================================
// React controller for a progressive Flexible Work search. It wires the query,
// the fabric connectors (or fixtures when no Worker is configured), the cache
// and the connector health/kill-switches into `runSearchSession`, and exposes a
// live snapshot plus stop/retry/pagination controls to the UI.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FlexibleWorkPreferences, NormalizedJob } from '../types'
import { WORKER_URL } from '../lib/config'
import { buildFabric, workerFabricFetch } from './connectors'
import { buildFixtureFabric, fixtureProxy } from './connectors/fixtures'
import type { Connector, FabricFetch } from './connectors/types'
import { FLEXIBLE_REGISTRY_DE } from './connectors/registry.de'
import { isConnectorEnabled, loadFlexibleFlags } from './flags'
import { loadHealth, observe, shouldSkip } from './resilience'
import { readFreshCache, writeFlexibleCache } from './cache'
import { flexibleQueryKey, toFlexibleQuery } from './query'
import { runSearchSession, type SearchSessionSnapshot } from './searchSession'

export type FlexibleSearchController = {
  snapshot: SearchSessionSnapshot | null
  running: boolean
  usingFixtures: boolean
  page: number
  setPage: (page: number) => void
  start: () => void
  stop: () => void
}

const configById = new Map(FLEXIBLE_REGISTRY_DE.map((c) => [c.id, c]))

/** Build the connector set honouring flags, kill switches and circuit breakers. */
async function resolveConnectors(usingFixtures: boolean): Promise<{ connectors: Connector[]; proxy: FabricFetch }> {
  if (usingFixtures) return { connectors: buildFixtureFabric(), proxy: fixtureProxy }
  const flags = await loadFlexibleFlags()
  const { connectors } = buildFabric()
  const allowed: Connector[] = []
  for (const connector of connectors) {
    const config = configById.get(connector.config.id)
    if (config && !isConnectorEnabled(flags, config)) continue
    const health = await loadHealth(connector.config.id)
    if (shouldSkip(health)) continue
    allowed.push(connector)
  }
  return { connectors: allowed, proxy: workerFabricFetch }
}

export function useFlexibleSearch(
  preferences: FlexibleWorkPreferences,
  opts: { keywords?: string[]; auto?: boolean } = {},
): FlexibleSearchController {
  const usingFixtures = !WORKER_URL
  const [snapshot, setSnapshot] = useState<SearchSessionSnapshot | null>(null)
  const [running, setRunning] = useState(false)
  const [page, setPage] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)

  const start = useCallback(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const runId = ++runIdRef.current
    setRunning(true)
    setPage(0)

    void (async () => {
      const query = toFlexibleQuery(preferences, { keywords: opts.keywords })
      const queryKey = flexibleQueryKey(query)
      const { connectors, proxy } = await resolveConnectors(usingFixtures)

      // Fallback ladder #1: show valid recent cached results immediately.
      const cached = await readFreshCache(queryKey).catch(() => null)
      const seeded: Connector[] = cached && cached.length
        ? [cacheConnector(cached), ...connectors]
        : connectors

      const final = await runSearchSession({
        connectors: seeded,
        query,
        proxy,
        signal: controller.signal,
        onUpdate: (snap) => {
          if (runIdRef.current === runId) setSnapshot(snap)
        },
      })

      if (runIdRef.current !== runId) return
      setRunning(false)

      // Persist health per source and cache the validated result set.
      const published = final.pages.flat()
      await writeFlexibleCache(queryKey, published).catch(() => undefined)
      if (!usingFixtures) {
        await Promise.all(
          final.sources
            .filter((s) => s.connectorId !== 'cache')
            .map((s) => observe(s.connectorId, {
              ok: s.status === 'ok' || s.status === 'fallback',
              latencyMs: s.latencyMs,
            }).catch(() => undefined)),
        )
      }
    })()
  }, [preferences, opts.keywords, usingFixtures])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setRunning(false)
  }, [])

  useEffect(() => {
    if (opts.auto) start()
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { snapshot, running, usingFixtures, page, setPage, start, stop }
}

/** A synthetic instant connector that surfaces fresh cached results first. */
function cacheConnector(opportunities: NormalizedJob[]): Connector {
  return {
    config: { id: 'cache', employerFamily: 'Recent results', type: 'api', attemptTimeoutMs: 10_000, retryEligible: false } as Connector['config'],
    run: async () => ({ opportunities, usedFallback: false }),
  }
}