import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  ATS_CACHE_EXPANSION_DE,
} from '../src/sources/ats/catalog.v261'
import { fetchCachedAts } from '../src/sources/ats/cache'
import {
  ATS_CACHE_CATALOG_VERSION,
  ATS_CACHE_SCHEMA_VERSION,
  ATS_MAX_JOBS_PER_TENANT,
  ATS_MAX_TENANT_VALUE_BYTES,
  type AtsCacheStore,
  parseTenantRecord,
  queryAtsCache,
  refreshAtsCacheBatch,
  tenantKey,
} from '../worker/src/atsCache'
import { isFeedbackOriginAllowed } from '../worker/src/index'

class MemoryStore implements AtsCacheStore {
  readonly values = new Map<string, string>()
  manyReads = 0

  async getText(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async getManyText(keys: string[]): Promise<Map<string, string | null>> {
    this.manyReads += 1
    return new Map(keys.map((key) => [key, this.values.get(key) ?? null]))
  }

  async putText(key: string, value: string): Promise<void> {
    this.values.set(key, value)
  }

  resetCursor(): void {
    for (const key of this.values.keys()) {
      if (key.endsWith(':cursor')) this.values.delete(key)
    }
  }
}

const START = Date.UTC(2026, 7, 11, 12)

function successResponse(input: RequestInfo | URL, jobsPerTenant = 1): Response {
  const url = new URL(String(input))
  const makeLocation = (index: number) => index === jobsPerTenant - 1 && jobsPerTenant > 1
    ? 'London, United Kingdom'
    : 'Berlin, Germany'
  if (url.hostname === 'boards-api.greenhouse.io') {
    return Response.json({
      jobs: Array.from({ length: jobsPerTenant }, (_, index) => ({
        id: index + 1,
        title: `Data Engineer ${index}`,
        absolute_url: `https://boards.greenhouse.io/example/jobs/${index + 1}`,
        content: '<p>Build reliable data systems &amp; services.</p>',
        first_published: '2026-08-10T12:00:00Z',
        location: { name: makeLocation(index) },
      })),
    })
  }
  if (url.hostname === 'api.lever.co') {
    return Response.json(Array.from({ length: jobsPerTenant }, (_, index) => ({
      id: `lever-${index}`,
      text: `Data Engineer ${index}`,
      hostedUrl: `https://jobs.lever.co/example/${index}`,
      descriptionPlain: 'Build reliable data systems and services.',
      createdAt: START,
      categories: { location: makeLocation(index), department: 'Engineering' },
    })))
  }
  if (url.hostname === 'api.ashbyhq.com') {
    return Response.json({
      jobs: Array.from({ length: jobsPerTenant }, (_, index) => ({
        id: `ashby-${index}`,
        title: `Data Engineer ${index}`,
        jobUrl: `https://jobs.ashbyhq.com/example/${index}`,
        descriptionPlain: 'Build reliable data systems and services.',
        publishedAt: '2026-08-10T12:00:00Z',
        location: makeLocation(index),
        isListed: true,
      })),
    })
  }
  return Response.json({}, { status: 404 })
}

function emptyResponse(input: RequestInfo | URL): Response {
  const host = new URL(String(input)).hostname
  return host === 'api.lever.co' ? Response.json([]) : Response.json({ jobs: [] })
}

{
  const store = new MemoryStore()
  const called: string[] = []
  const first = await refreshAtsCacheBatch(store, {
    scheduledTime: START,
    requestFetch: async (input) => {
      called.push(String(input))
      return successResponse(input, 2)
    },
  })
  assert.equal(first.attempted, 6, 'the cron refresh stays inside its fixed staggered batch')
  assert.deepEqual(first.states, { active: 6, empty: 0, transient: 0, hard: 0, quarantined: 0 })
  assert.equal(first.nextIndex, 6)
  assert.equal(called.length, 6)
  assert.ok(called.every((url) => /^https:\/\/(boards-api\.greenhouse\.io|api\.lever\.co|api\.ashbyhq\.com)\//.test(url)))

  const firstRecord = parseTenantRecord(store.values.get(tenantKey(ATS_CACHE_EXPANSION_DE[0])) ?? null)
  assert.ok(firstRecord)
  assert.equal(firstRecord.rawJobCount, 2)
  assert.equal(firstRecord.admittedJobCount, 1, 'London is not admitted into the DACH cache')
  assert.equal(firstRecord.jobs[0].location.country, 'Germany')
  assert.equal('raw' in firstRecord.jobs[0], false, 'unbounded vendor payloads are never cached')

  const duplicate = await refreshAtsCacheBatch(store, {
    scheduledTime: START,
    requestFetch: async () => { throw new Error('duplicate event must not fetch') },
  })
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.attempted, 0)

  const second = await refreshAtsCacheBatch(store, {
    scheduledTime: START + 15 * 60_000,
    requestFetch: async (input) => successResponse(input),
  })
  assert.equal(second.startIndex, 6)
  assert.equal(second.nextIndex, 12, 'the persisted cursor advances without browser fan-out')

  const query = await queryAtsCache(store, new URLSearchParams({
    market: 'de',
    what: 'data engineer',
  }), START + 16 * 60_000)
  assert.equal(query.status, 200)
  assert.equal(query.body.ready, true)
  assert.ok(query.body.jobs.length > 0)
  assert.equal(store.manyReads, 1, 'the endpoint bulk-reads all 100 tenant keys in one KV operation')
  assert.equal(query.body.tenants.missing, 88)

  const alternatives = new URLSearchParams()
  alternatives.append('what', 'Product Manager')
  alternatives.append('what', 'Data Engineer')
  const alternativeQuery = await queryAtsCache(store, alternatives, START + 17 * 60_000)
  assert.ok(
    alternativeQuery.body.jobs.length > 0,
    'complete target roles are OR alternatives rather than one impossible token AND',
  )

  const firstKey = tenantKey(ATS_CACHE_EXPANSION_DE[0])
  const remoteRecord = parseTenantRecord(store.values.get(firstKey) ?? null)
  assert.ok(remoteRecord)
  store.values.set(firstKey, JSON.stringify({
    ...remoteRecord,
    jobs: remoteRecord.jobs.map((job) => ({
      ...job,
      location: { ...job.location, city: undefined, remote: true },
    })),
  }))
  const remoteQuery = await queryAtsCache(
    store,
    new URLSearchParams({ market: 'de', where: 'Berlin', radius_km: '25', remote: 'true' }),
    START + 18 * 60_000,
  )
  assert.ok(remoteQuery.body.jobs.length > 0, 'remote rows reach the client filter even without a city')
}

{
  const store = new MemoryStore()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START,
    requestFetch: async (input) => successResponse(input),
  })
  for (let entryIndex = 0; entryIndex < 6; entryIndex += 1) {
    const entry = ATS_CACHE_EXPANSION_DE[entryIndex]
    const key = tenantKey(entry)
    const record = parseTenantRecord(store.values.get(key) ?? null)
    assert.ok(record)
    const jobs = Array.from({ length: 40 }, (_, jobIndex) => ({
      ...record.jobs[0],
      id: `${record.tenantId}:${jobIndex}`,
      source_id: `${record.slug}:${jobIndex}`,
      title: 'Software Engineer',
      location: { city: 'Munich', country: 'Germany', remote: false },
      posted_at: `2026-08-${String(12 - (jobIndex % 2)).padStart(2, '0')}T12:00:00Z`,
    }))
    if (entryIndex === 5) {
      jobs[39] = {
        ...jobs[39],
        id: `${record.tenantId}:berlin`,
        source_id: `${record.slug}:berlin`,
        location: { city: 'Berlin', country: 'Germany', remote: false },
        posted_at: '2026-08-01T12:00:00Z',
      }
    }
    store.values.set(key, JSON.stringify({
      ...record,
      jobs,
      rawJobCount: jobs.length,
      admittedJobCount: jobs.length,
      storedJobCount: jobs.length,
    }))
  }
  const berlin = await queryAtsCache(
    store,
    new URLSearchParams({
      market: 'de',
      what: 'Software Engineer',
      where: 'Berlin',
      radius_km: '25',
      limit: '200',
    }),
    START + 20 * 60_000,
  )
  assert.equal(berlin.body.jobs.length, 1)
  assert.equal(berlin.body.jobs[0].location.city, 'Berlin')
  assert.equal(berlin.body.truncated, false, 'geography is applied before the 200-row safety cap')
}

{
  const store = new MemoryStore()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START,
    requestFetch: async (input) => successResponse(input),
  })
  store.resetCursor()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START + 60_000,
    requestFetch: async () => Response.json({ error: 'temporary' }, { status: 503 }),
  })
  const record = parseTenantRecord(store.values.get(tenantKey(ATS_CACHE_EXPANSION_DE[0])) ?? null)
  assert.equal(record?.state, 'transient')
  assert.equal(record?.jobs.length, 1, 'transient errors retain the last-known-good jobs')
  const stale = await queryAtsCache(store, new URLSearchParams(), START + 2 * 60_000)
  assert.equal(stale.body.tenants.staleServed, 6)
  assert.ok(stale.body.jobs.length > 0, 'recent last-known-good jobs remain queryable')

  store.resetCursor()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START + 3 * 60_000,
    requestFetch: async () => Response.json({ error: 'gone' }, { status: 404 }),
  })
  const hardGrace = await queryAtsCache(store, new URLSearchParams(), START + 4 * 60_000)
  assert.equal(hardGrace.body.tenants.hard, 6)
  assert.ok(hardGrace.body.jobs.length > 0, 'one hard check does not immediately hide last-known-good jobs')

  store.resetCursor()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START + 5 * 60_000,
    requestFetch: async () => Response.json({ error: 'still gone' }, { status: 404 }),
  })
  const secondHardGrace = await queryAtsCache(store, new URLSearchParams(), START + 6 * 60_000)
  assert.equal(secondHardGrace.body.tenants.hard, 6)
  assert.ok(secondHardGrace.body.jobs.length > 0)

  store.resetCursor()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START + 7 * 60_000,
    requestFetch: async () => Response.json({ error: 'confirmed gone' }, { status: 404 }),
  })
  const quarantined = await queryAtsCache(store, new URLSearchParams(), START + 8 * 60_000)
  assert.equal(quarantined.body.tenants.quarantined, 6)
  assert.equal(quarantined.body.jobs.length, 0, 'the third consecutive hard check quarantines the tenant')

  store.resetCursor()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START + 9 * 60_000,
    requestFetch: async () => Response.json({ error: 'temporary after quarantine' }, { status: 503 }),
  })
  const stillQuarantined = parseTenantRecord(
    store.values.get(tenantKey(ATS_CACHE_EXPANSION_DE[0])) ?? null,
  )
  assert.equal(stillQuarantined?.state, 'quarantined', 'only a valid schema response releases quarantine')
}

{
  const store = new MemoryStore()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START,
    requestFetch: async (input) => successResponse(input),
  })
  store.resetCursor()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START + 60_000,
    requestFetch: async (input) => emptyResponse(input),
  })
  const empty = parseTenantRecord(store.values.get(tenantKey(ATS_CACHE_EXPANSION_DE[0])) ?? null)
  assert.equal(empty?.state, 'empty')
  assert.equal(empty?.jobs.length, 0, 'healthy-empty clears stale listings')
  assert.equal(empty?.lastErrorCode, undefined)
}

{
  const store = new MemoryStore()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START,
    requestFetch: async (input) => successResponse(input),
  })
  for (let check = 1; check <= 3; check += 1) {
    store.resetCursor()
    const refresh = await refreshAtsCacheBatch(store, {
      scheduledTime: START + check * 60_000,
      requestFetch: async () => Response.json({ unexpected: [] }),
    })
    const record = parseTenantRecord(
      store.values.get(tenantKey(ATS_CACHE_EXPANSION_DE[0])) ?? null,
    )
    assert.equal(record?.lastErrorCode, 'schema_greenhouse_root')
    assert.equal(record?.consecutiveHardFailures, check)
    assert.equal(record?.state, check < 3 ? 'hard' : 'quarantined')
    assert.equal(refresh.states[check < 3 ? 'hard' : 'quarantined'], 6)
    const query = await queryAtsCache(store, new URLSearchParams(), START + check * 60_000)
    assert.equal(
      query.body.jobs.length > 0,
      check < 3,
      'schema drift serves recent LKG twice, then quarantines on the third check',
    )
  }
}

{
  const store = new MemoryStore()
  await refreshAtsCacheBatch(store, {
    scheduledTime: START,
    requestFetch: async (input) => successResponse(input, 100),
  })
  const key = tenantKey(ATS_CACHE_EXPANSION_DE[0])
  const text = store.values.get(key) ?? ''
  const record = parseTenantRecord(text)
  assert.ok(Buffer.byteLength(text) <= ATS_MAX_TENANT_VALUE_BYTES)
  assert.ok((record?.storedJobCount ?? Infinity) <= ATS_MAX_JOBS_PER_TENANT)
  assert.equal(record?.truncated, true, 'large valid boards are truncated deterministically')
}

{
  let calls = 0
  let requested = ''
  const cached = await fetchCachedAts({
    what: ['data engineer'],
    fields: ['platform'],
    where: { city: 'Berlin', radius_km: 25 },
    remote: true,
  }, {
    workerUrl: 'https://worker.example/',
    market: 'de',
    requestFetch: async (input) => {
      calls += 1
      requested = String(input)
      return Response.json({
        schemaVersion: ATS_CACHE_SCHEMA_VERSION,
        catalogVersion: ATS_CACHE_CATALOG_VERSION,
        generatedAt: new Date(START).toISOString(),
        ready: true,
        jobs: [],
        truncated: false,
        tenants: {
          active: 12, empty: 3, transient: 1, hard: 2, quarantined: 4, missing: 78, staleServed: 1,
        },
      })
    },
  })
  assert.equal(calls, 1, 'the browser calls one normalized Worker endpoint')
  assert.equal(new URL(requested).pathname, '/ats-cache')
  assert.equal(new URL(requested).searchParams.get('market'), 'de')
  assert.equal(new URL(requested).searchParams.get('where'), 'Berlin')
  assert.equal(new URL(requested).searchParams.get('radius_km'), '25')
  assert.equal(new URL(requested).searchParams.get('remote'), 'true')
  assert.deepEqual(
    new URL(requested).searchParams.getAll('what'),
    ['data engineer', 'platform'],
    'target roles stay bounded OR alternatives on the normalized endpoint',
  )
  assert.equal(cached.activeCompanies, 12)
  assert.equal(cached.staleCompanies, 1)
  assert.equal(cached.truncated, false)
}

{
  let requested = ''
  await fetchCachedAts({
    what: ['data engineer'],
    where: { city: 'Berlin', radius_km: 25 },
    remote: false,
  }, {
    workerUrl: 'https://worker.example/',
    requestFetch: async (input) => {
      requested = String(input)
      return Response.json({
        schemaVersion: ATS_CACHE_SCHEMA_VERSION,
        catalogVersion: ATS_CACHE_CATALOG_VERSION,
        generatedAt: new Date(START).toISOString(),
        ready: true,
        jobs: [],
        truncated: false,
        tenants: {
          active: 1, empty: 0, transient: 0, hard: 0, quarantined: 0, missing: 99, staleServed: 0,
        },
      })
    },
  })
  const params = new URL(requested).searchParams
  assert.equal(params.get('where'), 'Berlin')
  assert.equal(params.get('radius_km'), '25')
  assert.equal(params.has('remote'), false, 'remote=false keeps both remote and on-site cached rows')
}

assert.equal(isFeedbackOriginAllowed(null, 'https://klar.example'), false)
assert.equal(isFeedbackOriginAllowed('https://klar.example', '*'), false)
assert.equal(isFeedbackOriginAllowed('https://evil.example', 'https://klar.example'), false)
assert.equal(isFeedbackOriginAllowed('https://klar.example', 'https://klar.example'), true)

const workerConfig = readFileSync('worker/wrangler.jsonc', 'utf8')
assert.match(workerConfig, /"binding"\s*:\s*"ATS_CACHE"/)
assert.match(workerConfig, /"binding"\s*:\s*"FEEDBACK_DEDUP"/)
assert.match(workerConfig, /"crons"\s*:\s*\["\*\/15 \* \* \* \*"\]/)
assert.match(workerConfig, /"TURNSTILE_EXPECTED_HOSTNAMES"/)
assert.doesNotMatch(workerConfig, /"TURNSTILE_EXPECTED_HOSTNAME"\s*:/)

console.log('v261-ats-cache.test.ts: all tests passed')
