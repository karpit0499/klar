// ============================================================================
// Structured-portal connector engine (§5.1 type 4). Retrieves a public,
// queryable JSON manifest / paginated search response and maps it through a
// declarative field map. No HTML layout parsing — this is structured data only.
// ============================================================================
import type { NormalizedJob } from '../../../types'
import { toISO } from '../../../sources/normalize'
import { makeOpportunity } from '../../opportunity'
import { applyClassification } from '../../taxonomy'
import { fabricSourceId } from '../types'
import type {
  Connector,
  ConnectorConfig,
  ConnectorContext,
  ConnectorResult,
  FlexibleQuery,
  PortalFieldMap,
} from '../types'
import { safeJsonParse } from '../parse'
import { stripHtml } from '../../../lib/html'
import { hostAndPath, resolveUrl, withParams } from '../url'
import { cityAllowed } from '../locate'
import { stableHash } from '../../../lib/hash'

/** Read a dotted path (`data.jobs`) from an unknown object; '' returns root. */
function pick(root: unknown, path?: string): unknown {
  if (!path) return root
  return path.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[key]
    return undefined
  }, root)
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number') return String(value)
  return undefined
}

function mapPosting(
  item: unknown,
  map: PortalFieldMap,
  config: ConnectorConfig,
): NormalizedJob | null {
  const title = str(pick(item, map.title))
  const rawUrl = str(pick(item, map.url))
  if (!title || !rawUrl) return null
  const id = str(pick(item, map.id)) ?? stableHash(rawUrl)
  const url = map.urlBase ? resolveUrl(rawUrl, map.urlBase) : rawUrl
  const city = map.city ? str(pick(item, map.city)) : undefined
  const now = new Date().toISOString()
  return makeOpportunity({
    source: 'fabric',
    source_id: fabricSourceId(config.id, id),
    connectorId: config.id,
    employerFamily: config.employerFamily,
    title,
    company: config.employerFamily,
    canonicalEmployer: config.employerFamily,
    location: { city, country: 'Deutschland', remote: false },
    description: map.description ? stripHtml(str(pick(item, map.description)) ?? '') : '',
    url,
    posted_at: map.postedAt ? toISO(str(pick(item, map.postedAt))) : undefined,
    validThrough: map.validThrough ? toISO(str(pick(item, map.validThrough))) : undefined,
    language: 'de',
    workplaces: config.workplaces,
    fieldProvenance: {
      title: { method: 'structured_data', source: config.id, observedAt: now },
      employer: { method: 'structured_data', source: config.id, observedAt: now },
      ...(city ? { city: { method: 'structured_data' as const, source: config.id, observedAt: now } } : {}),
    },
  })
}

export function makePortalConnector(config: ConnectorConfig): Connector {
  return {
    config,
    async run(query: FlexibleQuery, ctx: ConnectorContext): Promise<ConnectorResult> {
      const portal = config.portal
      if (!portal) throw new Error(`Connector ${config.id} is type 'portal' but has no portal spec`)

      // Apply pagination + the first city as a query hint where the portal takes one.
      const params: Record<string, string | number | undefined> = {}
      if (config.pagination.kind === 'page') {
        params[config.pagination.param] = (query.page ?? 1) - 1 + config.pagination.startAt
        if (config.pagination.sizeParam) params[config.pagination.sizeParam] = config.pagination.size
      } else if (config.pagination.kind === 'offset') {
        params[config.pagination.param] = ((query.page ?? 1) - 1) * config.pagination.size
        if (config.pagination.sizeParam) params[config.pagination.sizeParam] = config.pagination.size
      }
      const path = withParams(portal.searchPath, params)
      const { host } = hostAndPath(`https://${config.allowedHosts[0]}${portal.searchPath}`)

      const response = await ctx.proxy({
        connectorId: config.id,
        host,
        path,
        accept: 'json',
        maxBytes: config.maxBytes,
        signal: ctx.signal,
      })

      const root = safeJsonParse(response.body)
      const list = pick(root, portal.map.root)
      const items = Array.isArray(list) ? list : []

      const opportunities: NormalizedJob[] = []
      for (const item of items) {
        const mapped = mapPosting(item, portal.map, config)
        if (!mapped) continue
        const text = `${mapped.title} ${mapped.location.city ?? ''}`
        if (!cityAllowed(text, query)) continue
        opportunities.push(applyClassification(mapped, { source: config.id }))
      }

      return {
        opportunities,
        note: `${opportunities.length} from ${config.employerFamily} portal`,
        usedFallback: false,
      }
    },
  }
}