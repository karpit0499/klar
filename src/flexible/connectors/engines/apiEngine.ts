// ============================================================================
// API connector engine (§5.1 type 1). Wraps the existing v2.x adapters — BA,
// Adzuna, Arbeitnow, ATS — into the connector contract. This is the always-on
// baseline of the fallback ladder (§6.1): direct employer connectors ENHANCE
// it, never gate it. Employer-filtered API is also the standard fallback (§5.3).
// ============================================================================
import type { NormalizedJob, SearchQuery } from '../../../types'
import type { Adapter } from '../../../sources/types'
import { normalizeKey } from '../../../lib/hash'
import { applyClassification } from '../../taxonomy'
import { queryTerms } from '../terms'
import type { Connector, ConnectorConfig, ConnectorContext, ConnectorResult, FlexibleQuery } from '../types'

/** Stamp API-published provenance on the fields the boards actually publish. */
function stampApiProvenance(job: NormalizedJob, source: string): NormalizedJob {
  const observedAt = new Date().toISOString()
  const provenance = { method: 'api' as const, source, observedAt }
  const fieldProvenance = { ...(job.fieldProvenance ?? {}) }
  fieldProvenance.title = provenance
  fieldProvenance.employer = provenance
  if (job.location.city) fieldProvenance.city = provenance
  if (job.salary.min != null || job.salary.max != null) fieldProvenance.salary = provenance
  return { ...job, fieldProvenance }
}

/**
 * Build an API connector from a registry config and a bound adapter. The
 * adapter is injected (index.ts binds the real ones with keys/region; tests
 * inject fakes) so this engine never touches network state directly.
 */
export function makeApiConnector(config: ConnectorConfig, adapter: Adapter): Connector {
  const employer = config.api?.employerFilter
  return {
    config,
    async run(query: FlexibleQuery, ctx: ConnectorContext): Promise<ConnectorResult> {
      const what = queryTerms(query, employer)
      const first = query.cities[0]
      const sq: SearchQuery = {
        what: what.length ? what : ['Aushilfe'],
        where: first ? { city: first.city, radius_km: first.radius_km } : undefined,
        page: query.page,
      }
      const { jobs, note } = await adapter(sq, { signal: ctx.signal, page: query.page })

      const filtered = employer
        ? jobs.filter((job) => normalizeKey(job.company).includes(normalizeKey(employer)))
        : jobs

      const opportunities = filtered.map((job) => {
        const tagged: NormalizedJob = {
          ...stampApiProvenance(job, config.id),
          connectorId: config.id,
          employerFamily: config.employerFamily,
          canonicalEmployer: employer ?? job.canonicalEmployer ?? job.company,
          kind: 'vacancy',
          workplaces: job.workplaces ?? (config.workplaces.length ? config.workplaces : undefined),
        }
        return applyClassification(tagged, { source: config.id })
      })

      return { opportunities, note, usedFallback: false }
    },
  }
}

/** Adapter registry shape — index.ts supplies real adapters, tests supply fakes. */
export type ApiAdapters = Partial<Record<'ba' | 'adzuna' | 'arbeitnow' | 'ats', Adapter>>