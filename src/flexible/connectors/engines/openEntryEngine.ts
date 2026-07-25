// ============================================================================
// Open-entry connector engine (§5.1 type 5). Open-entry programmes are official
// "apply any time / join the candidate pool" routes — NOT individual vacancies.
// This engine emits one open_entry Opportunity per requested city that the
// programme serves, always carrying the official recruitment URL. It performs no
// vacancy scraping; availability comes from the verified config city list.
// ============================================================================
import type { NormalizedJob } from '../../../types'
import { makeOpenEntry } from '../../opportunity'
import { applyClassification } from '../../taxonomy'
import { fabricSourceId } from '../types'
import type { Connector, ConnectorConfig, ConnectorContext, ConnectorResult, FlexibleQuery } from '../types'
import { normalizeKey } from '../../../lib/hash'

/** Cities the programme serves that also match the user's requested cities. */
function relevantCities(programmeCities: string[], query: FlexibleQuery): string[] {
  if (query.cities.length === 0) return programmeCities
  const wanted = new Set(query.cities.map((c) => normalizeKey(c.city)))
  const matched = programmeCities.filter((city) => wanted.has(normalizeKey(city)))
  // If the programme is nationwide (empty list) or none match, still offer it
  // for the requested cities — open-entry routes accept applications anywhere.
  return matched.length ? matched : query.cities.map((c) => c.city)
}

export function makeOpenEntryConnector(config: ConnectorConfig): Connector {
  return {
    config,
    async run(query: FlexibleQuery, _ctx: ConnectorContext): Promise<ConnectorResult> {
      const spec = config.openEntry
      if (!spec) throw new Error(`Connector ${config.id} is type 'open_entry' but has no openEntry spec`)

      const cities = relevantCities(spec.cities, query)
      const now = new Date().toISOString()
      const opportunities: NormalizedJob[] = cities.map((city) => {
        const base = makeOpenEntry({
          source_id: fabricSourceId(config.id, normalizeKey(city) || 'any'),
          connectorId: config.id,
          employerFamily: config.employerFamily,
          title: spec.programName,
          company: config.employerFamily,
          canonicalEmployer: config.employerFamily,
          location: { city, country: 'Deutschland', remote: false },
          description: spec.note ?? '',
          url: spec.officialUrl,
          lastVerifiedAt: spec.verifiedAt ?? now,
          programName: spec.programName,
          cityAvailability: cities,
          language: 'de',
          workplaces: config.workplaces,
          fieldProvenance: {
            title: { method: 'api', source: config.id, observedAt: now },
            employer: { method: 'api', source: config.id, observedAt: now },
            city: { method: 'api', source: config.id, observedAt: now },
          },
        })
        return applyClassification(base, { source: config.id })
      })

      return {
        opportunities,
        note: `Open application · ${config.employerFamily}`,
        usedFallback: false,
      }
    },
  }
}