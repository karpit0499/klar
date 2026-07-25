// ============================================================================
// Feed connector engine (§5.1 type 2). Fetches an employer RSS/Atom feed via
// the allowlisted proxy, parses items safely, and normalizes each into a
// vacancy Opportunity with 'feed' provenance. City is detected best-effort.
// ============================================================================
import type { NormalizedJob } from '../../../types'
import { toISO } from '../../../sources/normalize'
import { makeOpportunity } from '../../opportunity'
import { applyClassification } from '../../taxonomy'
import { fabricSourceId } from '../types'
import type { Connector, ConnectorConfig, ConnectorContext, ConnectorResult, FlexibleQuery } from '../types'
import { parseFeedItems, ldDescription } from '../parse'
import { hostAndPath } from '../url'
import { detectCity } from '../locate'
import { stableHash } from '../../../lib/hash'

export function makeFeedConnector(config: ConnectorConfig): Connector {
  return {
    config,
    async run(query: FlexibleQuery, ctx: ConnectorContext): Promise<ConnectorResult> {
      const feed = config.feed
      if (!feed) throw new Error(`Connector ${config.id} is type 'feed' but has no feed spec`)
      const { host, path } = hostAndPath(feed.url)
      const response = await ctx.proxy({
        connectorId: config.id,
        host,
        path,
        accept: 'xml',
        maxBytes: config.maxBytes,
        signal: ctx.signal,
      })

      const items = parseFeedItems(response.body)
      const opportunities: NormalizedJob[] = []
      for (const item of items) {
        if (!item.title || !item.link) continue
        const text = `${item.title} ${item.description ?? ''}`
        const city = detectCity(text, query)
        // National feeds: keep every item, but only mark a city we can verify.
        const base = makeOpportunity({
          source: 'fabric',
          source_id: fabricSourceId(config.id, item.guid ?? stableHash(item.link)),
          connectorId: config.id,
          employerFamily: config.employerFamily,
          title: item.title,
          company: config.employerFamily,
          canonicalEmployer: config.employerFamily,
          location: { city, country: 'Deutschland', remote: false },
          description: ldDescription(item.description),
          url: item.link,
          posted_at: toISO(item.pubDate),
          language: 'de',
          workplaces: config.workplaces,
          fieldProvenance: {
            title: { method: 'feed', source: config.id, observedAt: new Date().toISOString() },
            employer: { method: 'feed', source: config.id, observedAt: new Date().toISOString() },
          },
        })
        opportunities.push(applyClassification(base, { source: config.id }))
      }

      return {
        opportunities,
        note: `${opportunities.length} from ${config.employerFamily} feed`,
        usedFallback: false,
      }
    },
  }
}