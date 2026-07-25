// ============================================================================
// Deterministic fixtures for offline QA and tests. Two things live here:
//
//   • fixtureProxy   — a FabricFetch returning canned feed/sitemap/portal bodies
//                      so the real ENGINES can be exercised without network.
//   • buildFixtureFabric — ready-made Connectors that emit realistic
//                      opportunities (with staggered delays, one failing source,
//                      a cross-source duplicate, and open-entry routes) so the
//                      progressive UI can be driven end-to-end with no Worker.
// ============================================================================
import type { FlexibleEmployment, FlexibleRoleFamily, NormalizedJob, WorkplaceType } from '../../types'
import { makeOpenEntry, makeOpportunity } from '../opportunity'
import { applyClassification } from '../taxonomy'
import type { Connector, ConnectorConfig, ConnectorResult, FabricFetch, FabricResponse } from './types'
import { fabricSourceId } from './types'

// --- fixtureProxy: canned upstream bodies (host+path → response) -------------

const RSS_REWE = `<?xml version="1.0"?><rss><channel>
<item><title>Aushilfe (m/w/d) Kasse – Teilzeit</title><link>https://jobs.rewe-group.com/job/1</link><description>REWE Markt Berlin sucht Kasse in Teilzeit.</description><pubDate>Mon, 20 Jul 2026 08:00:00 GMT</pubDate><guid>rewe-1</guid></item>
<item><title>Mitarbeiter Warenverräumung (m/w/d) Minijob</title><link>https://jobs.rewe-group.com/job/2</link><description>PENNY Hamburg, Warenverräumung auf 520-Euro-Basis.</description><pubDate>Sun, 19 Jul 2026 08:00:00 GMT</pubDate><guid>rewe-2</guid></item>
</channel></rss>`

const SITEMAP_KAUFLAND = `<?xml version="1.0"?><urlset>
<url><loc>https://jobs.kaufland.com/job/100</loc></url>
<url><loc>https://jobs.kaufland.com/job/101</loc></url>
<url><loc>https://jobs.kaufland.com/impressum</loc></url>
</urlset>`

const DETAIL_KAUFLAND_100 = `<html><head><script type="application/ld+json">
{"@type":"JobPosting","title":"Kommissionierer / Lagerhelfer (m/w/d)","description":"Nachtschicht im Verteilzentrum.","datePosted":"2026-07-18","hiringOrganization":{"name":"Kaufland"},"jobLocation":{"address":{"addressLocality":"Berlin"}},"url":"https://jobs.kaufland.com/job/100"}
</script></head><body>Kaufland</body></html>`

const DETAIL_KAUFLAND_101 = `<html><head><script type="application/ld+json">
{"@type":"JobPosting","title":"Verkäufer (m/w/d) Teilzeit","description":"Kasse und Verkauf.","datePosted":"2026-07-17","hiringOrganization":{"name":"Kaufland"},"jobLocation":{"address":{"addressLocality":"Hamburg"}},"url":"https://jobs.kaufland.com/job/101"}
</script></head><body>Kaufland</body></html>`

const PORTAL_ALDI_NORD = JSON.stringify({
  jobs: [
    { id: 'an-1', title: 'Verkaufskraft (m/w/d) Teilzeit', city: 'Berlin', url: '/job/an-1', description: 'ALDI Nord Filiale.', datePosted: '2026-07-16' },
    { id: 'an-2', title: 'Aushilfe Warenverräumung (m/w/d)', city: 'Leipzig', url: '/job/an-2', description: 'Regalauffüllung.', datePosted: '2026-07-15' },
  ],
})

const FIXTURE_BODIES: { match: (host: string, path: string) => boolean; body: string; type: string }[] = [
  { match: (h) => h === 'jobs.rewe-group.com', body: RSS_REWE, type: 'application/rss+xml' },
  { match: (h, p) => h === 'jobs.kaufland.com' && p.includes('sitemap'), body: SITEMAP_KAUFLAND, type: 'application/xml' },
  { match: (h, p) => h === 'jobs.kaufland.com' && p.includes('/job/100'), body: DETAIL_KAUFLAND_100, type: 'text/html' },
  { match: (h, p) => h === 'jobs.kaufland.com' && p.includes('/job/101'), body: DETAIL_KAUFLAND_101, type: 'text/html' },
  { match: (h) => h === 'karriere.aldi-nord.de', body: PORTAL_ALDI_NORD, type: 'application/json' },
]

export const fixtureProxy: FabricFetch = async (input): Promise<FabricResponse> => {
  const hit = FIXTURE_BODIES.find((entry) => entry.match(input.host, input.path))
  if (!hit) return { status: 404, contentType: 'text/plain', body: '' }
  return { status: 200, contentType: hit.type, body: hit.body }
}

// --- buildFixtureFabric: ready opportunities for the progressive UI ----------

type FixtureSpec = {
  connectorId: string
  employerFamily: string
  brand?: string
  title: string
  city: string
  url: string
  kind?: 'vacancy' | 'open_entry'
  employment?: FlexibleEmployment[]
  roleFamilies?: FlexibleRoleFamily[]
  workplaces?: WorkplaceType[]
  salaryHour?: number
}

function fixtureOpp(spec: FixtureSpec): NormalizedJob {
  const make = spec.kind === 'open_entry' ? makeOpenEntry : makeOpportunity
  const base = make({
    source: spec.kind === 'open_entry' ? 'fabric' : 'fabric',
    source_id: fabricSourceId(spec.connectorId, spec.url),
    connectorId: spec.connectorId,
    employerFamily: spec.employerFamily,
    brand: spec.brand,
    title: spec.title,
    company: spec.employerFamily,
    canonicalEmployer: spec.employerFamily,
    location: { city: spec.city, country: 'Deutschland', remote: false },
    description: `${spec.title} bei ${spec.employerFamily} in ${spec.city}.`,
    url: spec.url,
    posted_at: spec.kind === 'open_entry' ? undefined : '2026-07-19T08:00:00.000Z',
    salary: spec.salaryHour ? { min: spec.salaryHour, currency: 'EUR', period: 'hour' } : {},
    employment: spec.employment,
    roleFamilies: spec.roleFamilies,
    workplaces: spec.workplaces,
    programName: spec.kind === 'open_entry' ? spec.title : undefined,
    language: 'de',
    fieldProvenance: {
      title: { method: 'feed', source: spec.connectorId, observedAt: '2026-07-19T08:00:00.000Z' },
      employer: { method: 'feed', source: spec.connectorId, observedAt: '2026-07-19T08:00:00.000Z' },
      ...(spec.salaryHour ? { salary: { method: 'feed' as const, source: spec.connectorId, observedAt: '2026-07-19T08:00:00.000Z' } } : {}),
    },
  })
  return applyClassification(base, { source: spec.connectorId })
}

function fixtureConnector(
  config: Pick<ConnectorConfig, 'id' | 'employerFamily' | 'type'>,
  opportunities: NormalizedJob[],
  opts: { delayMs?: number; fail?: boolean } = {},
): Connector {
  return {
    config: { ...config, attemptTimeoutMs: 12_000, retryEligible: true } as ConnectorConfig,
    async run(): Promise<ConnectorResult> {
      if (opts.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs))
      if (opts.fail) throw new Error(`${config.employerFamily} fixture failure`)
      return { opportunities, usedFallback: false }
    },
  }
}

/** A realistic mix of connectors for offline QA (Berlin/Hamburg/Leipzig). */
export function buildFixtureFabric(): Connector[] {
  return [
    fixtureConnector({ id: 'baseline-ba', employerFamily: 'Bundesagentur', type: 'api' }, [
      fixtureOpp({ connectorId: 'baseline-ba', employerFamily: 'REWE', title: 'Kassierer (m/w/d) Aushilfe', city: 'Berlin', url: 'https://ba/1', roleFamilies: ['cashier'], workplaces: ['supermarket'], employment: ['temporary'] }),
      fixtureOpp({ connectorId: 'baseline-ba', employerFamily: 'Getränkemarkt Nord', title: 'Verkaufshilfe (m/w/d) Minijob', city: 'Hamburg', url: 'https://ba/2', roleFamilies: ['sales_assistant'], workplaces: ['retail_store'], employment: ['minijob'] }),
      fixtureOpp({ connectorId: 'baseline-ba', employerFamily: 'Stadtreinigung', title: 'Reinigungskraft (m/w/d) Teilzeit', city: 'Berlin', url: 'https://ba/3', roleFamilies: ['cleaning'], employment: ['part_time'] }),
    ], { delayMs: 5 }),
    fixtureConnector({ id: 'rewe-group', employerFamily: 'REWE Group', type: 'feed' }, [
      // Cross-source duplicate of the BA REWE cashier → should MERGE in place.
      fixtureOpp({ connectorId: 'rewe-group', employerFamily: 'REWE', brand: 'REWE', title: 'Kassierer (m/w/d) Aushilfe', city: 'Berlin', url: 'https://jobs.rewe-group.com/1', roleFamilies: ['cashier'], workplaces: ['supermarket'], employment: ['temporary'], salaryHour: 13.5 }),
      fixtureOpp({ connectorId: 'rewe-group', employerFamily: 'PENNY', brand: 'PENNY', title: 'Warenverräumung (m/w/d) Minijob', city: 'Hamburg', url: 'https://jobs.rewe-group.com/2', roleFamilies: ['shelf_stocking'], workplaces: ['supermarket'], employment: ['minijob'], salaryHour: 13.5 }),
    ], { delayMs: 20 }),
    fixtureConnector({ id: 'kaufland', employerFamily: 'Kaufland', type: 'sitemap' }, [
      fixtureOpp({ connectorId: 'kaufland', employerFamily: 'Kaufland', title: 'Kommissionierer (m/w/d) Nachtschicht', city: 'Berlin', url: 'https://jobs.kaufland.com/job/100', roleFamilies: ['picking_packing', 'warehouse'], workplaces: ['warehouse'], employment: ['night', 'part_time'], salaryHour: 15 }),
      fixtureOpp({ connectorId: 'kaufland', employerFamily: 'Kaufland', title: 'Verkäufer (m/w/d) Teilzeit', city: 'Hamburg', url: 'https://jobs.kaufland.com/job/101', roleFamilies: ['sales_assistant', 'cashier'], workplaces: ['supermarket'], employment: ['part_time'] }),
    ], { delayMs: 45 }),
    fixtureConnector({ id: 'dhl', employerFamily: 'Deutsche Post DHL', type: 'portal' }, [
      fixtureOpp({ connectorId: 'dhl', employerFamily: 'Deutsche Post DHL', title: 'Paketsortierer (m/w/d)', city: 'Leipzig', url: 'https://careers.dhl.com/1', roleFamilies: ['parcel_sorting'], workplaces: ['parcel_hub'], employment: ['part_time', 'night'], salaryHour: 14 }),
      fixtureOpp({ connectorId: 'dhl', employerFamily: 'Deutsche Post DHL', title: 'Paketzusteller (m/w/d) Aushilfe', city: 'Berlin', url: 'https://careers.dhl.com/2', roleFamilies: ['delivery'], workplaces: ['delivery'], employment: ['temporary'], salaryHour: 15 }),
    ], { delayMs: 60 }),
    fixtureConnector({ id: 'mcdonalds', employerFamily: "McDonald's", type: 'portal' }, [
      fixtureOpp({ connectorId: 'mcdonalds', employerFamily: "McDonald's", title: 'Küchenhilfe (m/w/d) Wochenende', city: 'Berlin', url: 'https://mcdonalds.jobs/1', roleFamilies: ['kitchen'], workplaces: ['restaurant'], employment: ['weekend', 'part_time'], salaryHour: 13.5 }),
    ], { delayMs: 80 }),
    fixtureConnector({ id: 'amazon-ops', employerFamily: 'Amazon Operations', type: 'open_entry' }, [
      fixtureOpp({ connectorId: 'amazon-ops', employerFamily: 'Amazon Operations', title: 'Amazon hourly jobs — apply any time', city: 'Berlin', url: 'https://hiring.amazon.de/', kind: 'open_entry', workplaces: ['warehouse'], roleFamilies: ['picking_packing'] }),
    ], { delayMs: 30 }),
    fixtureConnector({ id: 'lieferando', employerFamily: 'Lieferando', type: 'open_entry' }, [
      fixtureOpp({ connectorId: 'lieferando', employerFamily: 'Lieferando', title: 'Lieferando courier — apply in your city', city: 'Berlin', url: 'https://karriere.lieferando.de/rider', kind: 'open_entry', workplaces: ['delivery'], roleFamilies: ['delivery'] }),
    ], { delayMs: 25 }),
    // A deliberately failing direct connector to exercise the partial/limited UI.
    fixtureConnector({ id: 'dm', employerFamily: 'dm-drogerie markt', type: 'portal' }, [], { delayMs: 15, fail: true }),
  ]
}