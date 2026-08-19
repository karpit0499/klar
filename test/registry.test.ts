import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  ATS_CANDIDATES_DACH,
  ATS_DIRECT_RUNTIME_DE,
  ATS_REGISTRY_DE,
  ATS_RETIRED_DACH,
  ATS_VERIFIED_DE,
} from '../src/sources/registry.de.ts'
import { ATS_CACHE_EXPANSION_DE } from '../src/sources/ats/catalog.v261.ts'
import { ATS_ALL_VERIFIED_DE, ATS_SOURCE_CATALOG_DE } from '../src/sources/ats/catalog.ts'
import { fetchAllAts } from '../src/sources/ats/index.ts'
import { isAtsLocationAdmitted, parseAtsLocation } from '../src/sources/ats/location.ts'
import { makeJob } from '../src/sources/normalize.ts'
import { gatherJobs } from '../src/sources/index.ts'
import {
  FLEXIBLE_OFFICIAL_ROUTES_DE,
  officialRouteOpportunity,
} from '../src/flexible/connectors/officialRoutes.de.ts'
import { buildFabric } from '../src/flexible/connectors/index.ts'
import { FLEXIBLE_REGISTRY_DE, topLevelConfigs } from '../src/flexible/connectors/registry.de.ts'
import type { ConnectorContext, FlexibleQuery } from '../src/flexible/connectors/types.ts'

const ATS_MANIFEST = 'data/sources/ats-live-100-2026-08-11.json'
const ROUTE_MANIFEST = 'data/sources/flexible-official-routes-100-2026-08-11.json'

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

type AtsAuditRow = {
  organization: string
  provider: 'greenhouse' | 'lever' | 'ashby'
  slug: string
  endpoint: string
  status: number
  live: boolean
  dachJobs: number
  getStatus: number
  currentJobs: number
  machineReadable: boolean
  verifiedAt: string
}
const atsAudit = JSON.parse(readFileSync(ATS_MANIFEST, 'utf8')) as AtsAuditRow[]
assert.equal(sha256(ATS_MANIFEST), '3db20ea2f204cb9cfd2ab837a31f253687204c211113f045888411ee3843cc17')
assert.equal(atsAudit.length, 100)
assert.deepEqual(
  Object.fromEntries(['greenhouse', 'ashby', 'lever'].map((provider) => [
    provider,
    atsAudit.filter((row) => row.provider === provider).length,
  ])),
  { greenhouse: 45, ashby: 46, lever: 9 },
)
assert.ok(atsAudit.every((row) => (
  row.live && row.status === 200 && row.getStatus === 200 && row.currentJobs > 0
  && row.dachJobs > 0 && row.machineReadable && row.verifiedAt === '2026-08-11'
)))
assert.equal(new Set(atsAudit.map((row) => `${row.provider}:${row.slug}`)).size, 100)
assert.deepEqual(
  ATS_CACHE_EXPANSION_DE.map(({ company, ats, slug, verifiedAt }) => ({ company, ats, slug, verifiedAt })),
  atsAudit.map((row) => ({
    company: row.organization,
    ats: row.provider,
    slug: row.slug,
    verifiedAt: row.verifiedAt,
  })),
  'the compact cache catalog exactly mirrors the evidence manifest',
)

assert.equal(ATS_DIRECT_RUNTIME_DE.length, 47)
assert.equal(ATS_CACHE_EXPANSION_DE.length, 100)
assert.equal(ATS_VERIFIED_DE.length, 47)
assert.equal(ATS_ALL_VERIFIED_DE.length, 147)
assert.equal(ATS_CANDIDATES_DACH.length, 21)
assert.equal(ATS_RETIRED_DACH.length, 141)
assert.equal(ATS_REGISTRY_DE, ATS_DIRECT_RUNTIME_DE)
assert.ok(ATS_REGISTRY_DE.every((entry) => entry.state === 'active' && entry.delivery === 'direct'))
assert.ok(ATS_CACHE_EXPANSION_DE.every((entry) => entry.state === 'active' && entry.delivery === 'worker_cache'))
assert.ok(ATS_CANDIDATES_DACH.every((entry) => entry.state === 'quarantined'))
assert.ok(ATS_RETIRED_DACH.every((entry) => entry.state === 'retired'))
assert.equal(
  new Set(ATS_SOURCE_CATALOG_DE.map((entry) => `${entry.ats}:${entry.slug}`)).size,
  ATS_SOURCE_CATALOG_DE.length,
  'no source identity appears twice across active, quarantined and retired records',
)

{
  const called: string[] = []
  const result = await fetchAllAts(undefined, [
    ATS_DIRECT_RUNTIME_DE[0],
    ATS_CACHE_EXPANSION_DE[0],
    ATS_RETIRED_DACH[0],
  ], 'de', {
    fetcher: async (entry) => {
      called.push(entry.slug)
      return []
    },
  })
  assert.deepEqual(called, [ATS_DIRECT_RUNTIME_DE[0].slug], 'browser fetches verified/direct entries only')
  assert.equal(result.emptyCompanies, 1, 'reachable zero inventory is healthy-empty')
  assert.equal(result.failedCompanies, 0)
  assert.equal(result.skippedCompanies, 2)
  assert.equal(result.companies[0].state, 'empty')
}

{
  const result = await fetchAllAts(undefined, [ATS_DIRECT_RUNTIME_DE[0]], 'de', {
    fetcher: async () => { throw new Error('synthetic outage') },
  })
  assert.equal(result.failedCompanies, 1)
  assert.equal(result.companies[0].state, 'quarantined')
}

{
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    gatherJobs({ what: ['engineer'] }, {
      signal: controller.signal,
      sources: { ba: false, arbeitnow: false, adzuna: false, ats: true },
    }),
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
    'cancellation must reject the gather instead of recording source failures',
  )
}

{
  const unknown = parseAtsLocation({ locationText: 'Remote' })
  assert.equal(unknown.location.country, '', 'unknown country stays unknown')
  assert.equal(isAtsLocationAdmitted(unknown, 'de'), false)

  const berlin = parseAtsLocation({ locationText: 'Berlin, Germany' })
  assert.equal(berlin.location.city, 'Berlin')
  assert.equal(berlin.location.country, 'Germany')
  assert.equal(isAtsLocationAdmitted(berlin, 'de'), true)

  const london = parseAtsLocation({ locationText: 'London, United Kingdom' })
  assert.equal(london.location.country, 'United Kingdom')
  assert.equal(isAtsLocationAdmitted(london, 'de'), false)

  const multiple = parseAtsLocation({ locationText: 'London; Berlin, Germany' })
  assert.equal(multiple.location.city, undefined, 'multi-location text is never stored as one city')
  assert.equal(isAtsLocationAdmitted(multiple, 'de'), true)
}

type RouteAuditRow = {
  id: string
  organization: string
  country: 'DE'
  sector: string
  integrationKind: 'official_search' | 'open_entry'
  officialUrl: string
  status: number
  verifiedAt: string
  machineReadable: boolean
}
const routeAudit = JSON.parse(readFileSync(ROUTE_MANIFEST, 'utf8')) as RouteAuditRow[]
assert.equal(sha256(ROUTE_MANIFEST), '93f0fee77bb906cc20547b13c8e9ac84d2b2c1707e2c04776ce0833af4c05c35')
assert.equal(routeAudit.length, 100)
assert.equal(routeAudit.filter((route) => route.integrationKind === 'official_search').length, 98)
assert.equal(routeAudit.filter((route) => route.integrationKind === 'open_entry').length, 2)
assert.ok(routeAudit.every((route) => (
  route.status === 200 && route.verifiedAt === '2026-08-11'
  && route.officialUrl.startsWith('https://') && route.machineReadable === false
)))
assert.equal(new Set(routeAudit.map((route) => route.id)).size, 100)
assert.deepEqual(FLEXIBLE_OFFICIAL_ROUTES_DE, routeAudit.map((route) => ({
  id: route.id,
  organization: route.organization,
  country: route.country,
  sector: route.sector,
  integrationKind: route.integrationKind,
  officialUrl: route.officialUrl,
  verifiedAt: route.verifiedAt,
})))

{
  const search = FLEXIBLE_OFFICIAL_ROUTES_DE.find((route) => route.integrationKind === 'official_search')!
  const open = FLEXIBLE_OFFICIAL_ROUTES_DE.find((route) => route.integrationKind === 'open_entry')!
  const searchCard = officialRouteOpportunity(search, 'Berlin')
  const openCard = officialRouteOpportunity(open, 'Berlin')
  assert.equal(searchCard.kind, 'official_search')
  assert.equal(openCard.kind, 'open_entry')
  assert.equal(searchCard.lastVerifiedAt, '2026-08-11')
  assert.equal(searchCard.posted_at, undefined)
}

assert.ok(FLEXIBLE_REGISTRY_DE.some((config) => config.verification === 'candidate'))
assert.ok(topLevelConfigs().every((config) => config.verification === 'verified'))

{
  const emptyAdapter = async () => ({ jobs: [] })
  const { connectors } = buildFabric({ adapters: { ba: emptyAdapter } })
  const ba = connectors.find((connector) => connector.config.id === 'baseline-ba')!
  const query: FlexibleQuery = {
    cities: [{ city: 'Berlin', radius_km: 20 }],
    employment: [], roleFamilies: [], workplaces: [], keywords: [],
  }
  const context: ConnectorContext = {
    proxy: async () => { throw new Error('proxy must not run') },
    now: () => Date.UTC(2026, 7, 11),
  }
  const result = await ba.run(query, context)
  assert.equal(result.usedFallback, true)
  assert.equal(result.fallbackReason, 'empty')
  assert.equal(result.opportunities[0].kind, 'official_search')
  assert.equal(result.opportunities[0].lastVerifiedAt, undefined, 'a route without evidence date is not stamped today')
}

const fixtureController = readFileSync('src/flexible/useFlexibleSearch.ts', 'utf8')
assert.match(fixtureController, /import\.meta\.env\.DEV/)
assert.match(fixtureController, /VITE_ENABLE_SOURCE_FIXTURES === 'true'/)
assert.doesNotMatch(fixtureController, /const usingFixtures = !WORKER_URL/)

const sample = makeJob({
  source: 'ashby', source_id: 'sample', title: 'Sample', company: 'Sample GmbH',
  location: { city: 'Berlin', country: 'Germany', remote: false },
  description: '', url: 'https://example.com/job',
})
assert.equal(sample.location.country, 'Germany')

console.log('registry.test.ts: all source lifecycle and manifest tests passed')
