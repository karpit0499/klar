// ============================================================================
// Federated-group connector engine (§5.1 type 6). Combines a parent portal,
// regional/franchise portals, and aggregator fallbacks behind one connector.
// Members run concurrently; one failing member never fails the group. Results
// are merged and locally de-duplicated. If EVERY member fails, it throws so the
// connector wrapper applies the family fallback.
// ============================================================================
import type { NormalizedJob } from '../../../types'
import { dedupeJobs } from '../../../sources/dedup'
import type { Connector, ConnectorConfig, ConnectorContext, ConnectorResult, FlexibleQuery } from '../types'

export function makeFederatedConnector(config: ConnectorConfig, members: Connector[]): Connector {
  return {
    config,
    async run(query: FlexibleQuery, ctx: ConnectorContext): Promise<ConnectorResult> {
      if (members.length === 0) throw new Error(`Federated connector ${config.id} has no members`)

      const settled = await Promise.allSettled(members.map((member) => member.run(query, ctx)))
      const opportunities: NormalizedJob[] = []
      let ok = 0
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          ok++
          opportunities.push(...result.value.opportunities)
        }
      }

      if (ok === 0) throw new Error(`All ${config.id} members failed`)

      return {
        opportunities: dedupeJobs(opportunities),
        note: `${config.employerFamily}: ${ok} of ${members.length} sources`,
        usedFallback: false,
      }
    },
  }
}