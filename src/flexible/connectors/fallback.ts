// ============================================================================
// The fallback builder (§5.3 / §6.1). Every employer family must degrade to a
// usable result or an official route — never a broken placeholder. A direct
// connector that fails or returns nothing calls this to produce:
//
//   • api_employer     → employer-filtered BA/Adzuna vacancies (if a runner is
//                        wired) PLUS an official BA employer-search route card.
//   • open_entry       → the official "apply any time" route card(s).
//   • official_search  → a single official search-destination route card.
//
// Route cards are open_entry opportunities so the UI labels them honestly as a
// route, never as a scraped vacancy.
// ============================================================================
import type { NormalizedJob } from '../../types'
import { makeOpenEntry } from '../opportunity'
import { applyClassification } from '../taxonomy'
import { fabricSourceId } from './types'
import type { ConnectorConfig, ConnectorContext, ConnectorResult, FlexibleQuery } from './types'
import { normalizeKey } from '../../lib/hash'

/** Runs the employer-filtered API baseline; index.ts injects the real one. */
export type ApiRunner = (
  employer: string,
  query: FlexibleQuery,
  ctx: ConnectorContext,
) => Promise<NormalizedJob[]>

/** A guaranteed-valid official BA search route for any employer. */
export function baEmployerSearchUrl(employer: string): string {
  return `https://www.arbeitsagentur.de/jobsuche/suche?was=${encodeURIComponent(employer)}`
}

function routeCard(
  config: ConnectorConfig,
  opts: { programName: string; url: string; cities: string[]; note?: string },
): NormalizedJob {
  const now = new Date().toISOString()
  const cities = opts.cities.length ? opts.cities : ['']
  const city = cities[0] || undefined
  const base = makeOpenEntry({
    source_id: fabricSourceId(config.id, `fallback:${normalizeKey(opts.programName)}`),
    connectorId: config.id,
    employerFamily: config.employerFamily,
    title: opts.programName,
    company: config.employerFamily,
    canonicalEmployer: config.employerFamily,
    location: { city, country: 'Deutschland', remote: false },
    description: opts.note ?? '',
    url: opts.url,
    programName: opts.programName,
    cityAvailability: opts.cities,
    language: 'de',
    workplaces: config.workplaces,
    fieldProvenance: {
      title: { method: 'api', source: config.id, observedAt: now },
      employer: { method: 'api', source: config.id, observedAt: now },
    },
  })
  return applyClassification(base, { source: config.id })
}

export async function buildFallback(
  config: ConnectorConfig,
  query: FlexibleQuery,
  ctx: ConnectorContext,
  apiRunner?: ApiRunner,
): Promise<ConnectorResult> {
  const fb = config.fallback
  const cities = query.cities.map((c) => c.city)

  if (fb.kind === 'open_entry') {
    return {
      opportunities: [
        routeCard(config, {
          programName: fb.programName,
          url: fb.officialUrl,
          cities: fb.cities.length ? fb.cities : cities,
          note: fb.note,
        }),
      ],
      note: `Open application · ${config.employerFamily}`,
      usedFallback: true,
    }
  }

  if (fb.kind === 'official_search') {
    return {
      opportunities: [routeCard(config, { programName: fb.label, url: fb.url, cities })],
      note: `Official search · ${config.employerFamily}`,
      usedFallback: true,
    }
  }

  // api_employer
  const vacancies = apiRunner ? await apiRunner(fb.employer, query, ctx).catch(() => []) : []
  const route = routeCard(config, {
    programName: `${config.employerFamily} — official job search`,
    url: fb.officialSearchUrl ?? baEmployerSearchUrl(fb.employer),
    cities,
  })
  return {
    opportunities: [...vacancies, route],
    note: `${vacancies.length} employer-filtered + official route`,
    usedFallback: true,
  }
}