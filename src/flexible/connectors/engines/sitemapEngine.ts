// ============================================================================
// Sitemap + structured-detail connector engine (§5.1 type 3). Discovers
// canonical detail pages from a sitemap, fetches a BOUNDED number of them, and
// parses JobPosting JSON-LD. Detail fetches are capped (maxDetails) so one large
// sitemap never threatens the 60s search budget.
// ============================================================================
import type { NormalizedJob } from '../../../types'
import { toISO } from '../../../sources/normalize'
import { makeOpportunity } from '../../opportunity'
import { applyClassification } from '../../taxonomy'
import { fabricSourceId } from '../types'
import type { Connector, ConnectorConfig, ConnectorContext, ConnectorResult, FlexibleQuery } from '../types'
import {
  extractJsonLdJobPostings,
  extractSitemapUrls,
  ldCity,
  ldDescription,
  ldOrganization,
} from '../parse'
import { hostAndPath } from '../url'
import { cityAllowed } from '../locate'
import { stableHash } from '../../../lib/hash'

export function makeSitemapConnector(config: ConnectorConfig): Connector {
  return {
    config,
    async run(query: FlexibleQuery, ctx: ConnectorContext): Promise<ConnectorResult> {
      const sitemap = config.sitemap
      if (!sitemap) throw new Error(`Connector ${config.id} is type 'sitemap' but has no sitemap spec`)

      const index = hostAndPath(sitemap.sitemapUrl)
      const sitemapXml = await ctx.proxy({
        connectorId: config.id,
        host: index.host,
        path: index.path,
        accept: 'xml',
        maxBytes: config.maxBytes,
        signal: ctx.signal,
      })

      const detailUrls = extractSitemapUrls(sitemapXml.body, sitemap.detailPathIncludes).slice(
        0,
        sitemap.maxDetails,
      )

      const opportunities: NormalizedJob[] = []
      for (const detailUrl of detailUrls) {
        if (ctx.signal?.aborted) break
        let html: string
        try {
          const { host, path } = hostAndPath(detailUrl)
          const detail = await ctx.proxy({
            connectorId: config.id,
            host,
            path,
            accept: 'text',
            maxBytes: config.maxBytes,
            signal: ctx.signal,
          })
          html = detail.body
        } catch {
          continue // one dead detail page never fails the connector
        }
        for (const posting of extractJsonLdJobPostings(html)) {
          if (!posting.title) continue
          const city = ldCity(posting.jobLocation)
          if (!cityAllowed([posting.title, city].filter(Boolean).join(' '), query)) continue
          const base = makeOpportunity({
            source: 'fabric',
            source_id: fabricSourceId(config.id, stableHash(detailUrl)),
            connectorId: config.id,
            employerFamily: config.employerFamily,
            title: posting.title,
            company: ldOrganization(posting.hiringOrganization) ?? config.employerFamily,
            canonicalEmployer: config.employerFamily,
            location: { city, country: 'Deutschland', remote: false },
            description: ldDescription(posting.description),
            url: posting.url ?? detailUrl,
            posted_at: toISO(posting.datePosted),
            validThrough: toISO(posting.validThrough),
            language: 'de',
            workplaces: config.workplaces,
            fieldProvenance: {
              title: { method: 'structured_data', source: config.id, observedAt: new Date().toISOString() },
              employer: { method: 'structured_data', source: config.id, observedAt: new Date().toISOString() },
              ...(city ? { city: { method: 'structured_data' as const, source: config.id, observedAt: new Date().toISOString() } } : {}),
            },
          })
          opportunities.push(applyClassification(base, { source: config.id }))
        }
      }

      return {
        opportunities,
        note: `${opportunities.length} from ${config.employerFamily} (${detailUrls.length} pages)`,
        usedFallback: false,
      }
    },
  }
}