// Run with: npx tsx test/regions.test.ts
// Covers the Region objects and region-based source gating in gatherJobs
// (feature 8.1) plus the AT/CH/NL/LU/LI markets and Adzuna country routing (feature 5).
import { REGIONS, DEFAULT_REGION_CODE } from '../src/regions/index.ts'
import { regionDE } from '../src/regions/de.ts'
import { regionAT } from '../src/regions/at.ts'
import { regionCH } from '../src/regions/ch.ts'
import { regionNL } from '../src/regions/nl.ts'
import { regionLU } from '../src/regions/lu.ts'
import { regionLI } from '../src/regions/li.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

// A Worker URL so BA/Adzuna build valid proxied URLs under tsx.
;(globalThis as { VITE_WORKER_URL?: string }).VITE_WORKER_URL = 'https://worker.test'

// ---- region objects --------------------------------------------------------
ok(REGIONS[DEFAULT_REGION_CODE] === regionDE, 'registry: default region is Germany')
ok(Object.keys(REGIONS).length === 6, 'registry: six regions registered')
ok(regionDE.resolveLocation('Berlin').canonical === 'Berlin', 'de: resolves a known city')
ok(regionDE.resolveLocation('Berlin').lat != null, 'de: known city has coordinates')
ok(regionDE.resolveLocation('Nowhere').canonical === 'Nowhere', 'de: unknown city passes through')
ok(regionDE.adzunaCountry === 'de', 'de: adzuna slug is de')

// Austria: Adzuna covered, EUR.
ok(regionAT.sources.includes('adzuna'), 'at: includes Adzuna')
ok(regionAT.adzunaCountry === 'at', 'at: adzuna slug is at')
ok(!regionAT.sources.includes('ba'), 'at: excludes DE-only BA')
ok(regionAT.currency === 'EUR', 'at: currency EUR')
ok(regionAT.resolveLocation('Wien').lat === 48.2082, 'at: resolves Wien')
ok(regionAT.resolveLocation('Vienna').canonical === 'Wien', 'at: English alias maps to Wien')

// Switzerland: Adzuna covered, CHF.
ok(regionCH.sources.includes('adzuna'), 'ch: includes Adzuna')
ok(regionCH.adzunaCountry === 'ch', 'ch: adzuna slug is ch')
ok(regionCH.currency === 'CHF', 'ch: currency CHF')
ok(regionCH.resolveLocation('Zurich').canonical === 'Zürich', 'ch: Zurich alias maps to Zürich')

// Netherlands: now Adzuna-covered, still no BA.
ok(regionNL.sources.includes('adzuna'), 'nl: now includes Adzuna')
ok(regionNL.adzunaCountry === 'nl', 'nl: adzuna slug is nl')
ok(!regionNL.sources.includes('ba'), 'nl: still excludes DE-only BA')
ok(regionNL.sources.includes('arbeitnow'), 'nl: keeps region-agnostic Arbeitnow')

// Luxembourg: no Adzuna feed → no adzuna source, no slug.
ok(!regionLU.sources.includes('adzuna'), 'lu: excludes Adzuna (no feed)')
ok(regionLU.adzunaCountry === undefined, 'lu: no adzuna slug')
ok(!regionLU.sources.includes('ba'), 'lu: excludes BA')
ok(regionLU.sources.includes('greenhouse'), 'lu: keeps ATS trio')
ok(regionLU.currency === 'EUR', 'lu: currency EUR')

// Liechtenstein: no Adzuna feed, CHF.
ok(!regionLI.sources.includes('adzuna'), 'li: excludes Adzuna (no feed)')
ok(regionLI.currency === 'CHF', 'li: currency CHF (Swiss franc union)')
ok(regionLI.resolveLocation('Vaduz').lat === 47.1416, 'li: resolves Vaduz')

// ---- gatherJobs honors the active region -----------------------------------
// Capture every fetched URL so we can assert both which sources run AND that
// Adzuna is pointed at the region's country slug.
let fetchedUrls: string[] = []
function stubFetch() {
  fetchedUrls = []
  ;(globalThis as any).fetch = async (input: string | URL) => {
    const url = String(input)
    fetchedUrls.push(url)
    if (url.includes('arbeitnow.com')) {
      return new Response(JSON.stringify({ data: [], links: { next: null } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('worker.test/ba')) {
      return new Response(JSON.stringify({ stellenangebote: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('worker.test/adzuna')) {
      return new Response(JSON.stringify({ results: [], count: 0 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

async function main() {
  const { gatherJobs } = await import('../src/sources/index.ts')

  // Luxembourg: BA + Adzuna must NOT run (ATS off to keep the test fast).
  stubFetch()
  const lu = await gatherJobs({ what: ['engineer'] }, { region: regionLU, sources: { ats: false } })
  const luSources = lu.status.map((s) => s.source)
  ok(!luSources.includes('ba') && !luSources.includes('adzuna'), 'gather: LU region excludes BA + Adzuna')
  ok(luSources.includes('arbeitnow'), 'gather: LU region still runs Arbeitnow')

  // Austria: Adzuna runs and hits the /at/ path (arbeitnow + ATS off to isolate).
  stubFetch()
  const at = await gatherJobs(
    { what: ['engineer'] },
    { region: regionAT, adzunaKey: { appId: 'x', appKey: 'y' }, sources: { arbeitnow: false, ats: false } },
  )
  ok(at.status.map((s) => s.source).includes('adzuna'), 'gather: AT region runs Adzuna')
  ok(fetchedUrls.some((u) => u.includes('/v1/api/jobs/at/search/')), 'gather: AT routes Adzuna to the /at/ feed')

  // Switzerland: Adzuna hits the /ch/ path.
  stubFetch()
  await gatherJobs(
    { what: ['engineer'] },
    { region: regionCH, adzunaKey: { appId: 'x', appKey: 'y' }, sources: { arbeitnow: false, ats: false } },
  )
  ok(fetchedUrls.some((u) => u.includes('/v1/api/jobs/ch/search/')), 'gather: CH routes Adzuna to the /ch/ feed')

  // Germany: Adzuna still defaults to the /de/ feed.
  stubFetch()
  await gatherJobs(
    { what: ['engineer'] },
    { region: regionDE, adzunaKey: { appId: 'x', appKey: 'y' }, sources: { ba: false, arbeitnow: false, ats: false } },
  )
  ok(fetchedUrls.some((u) => u.includes('/v1/api/jobs/de/search/')), 'gather: DE routes Adzuna to the /de/ feed')

  // Germany: BA runs (Arbeitnow + ATS + Adzuna off to isolate).
  stubFetch()
  const de = await gatherJobs(
    { what: ['engineer'] },
    { region: regionDE, sources: { arbeitnow: false, ats: false, adzuna: false } },
  )
  ok(de.status.map((s) => s.source).includes('ba'), 'gather: DE region runs BA')

  console.log(`\nRegion tests: ${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })