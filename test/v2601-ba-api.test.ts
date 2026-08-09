import { strict as assert } from 'node:assert'

;(globalThis as { VITE_WORKER_URL?: string }).VITE_WORKER_URL =
  'https://worker.test'

const originalFetch = globalThis.fetch
const requestedUrls: URL[] = []

globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
  const value =
    typeof input === 'string' || input instanceof URL
      ? String(input)
      : input.url
  const url = new URL(value)
  requestedUrls.push(url)

  if (url.pathname === '/ba/pc/v6/jobs') {
    if (url.searchParams.get('was') === 'No inventory') {
      return new Response(
        JSON.stringify({ maxErgebnisse: 0 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url.searchParams.get('was') === 'Fallback role') {
      return new Response(
        JSON.stringify({
          ergebnisliste: [{
            referenznummer: '10000-FALLBACK-S',
            hauptberuf: 'Fallback occupation',
            datumErsteVeroeffentlichung: '2026-08-07',
            externeURL: 'not-a-web-url',
            stellenlokationen: [],
          }],
          maxErgebnisse: 1,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response(
      JSON.stringify({
        ergebnisliste: [
          {
            referenznummer: '10000-TEST-S',
            stellenangebotsTitel: 'Data Engineer',
            hauptberuf: 'Datenbankentwickler/in',
            firma: 'Example GmbH',
            externeURL: 'https://example.com/apply',
            homeofficemoeglich: true,
            veroeffentlichungszeitraum: { von: '2026-08-09' },
            datumErsteVeroeffentlichung: '2026-08-08',
            stellenlokationen: [{
              adresse: {
                plz: '10115',
                ort: 'Berlin',
                region: 'BERLIN',
                land: 'DEUTSCHLAND',
              },
              breite: 52.532,
              laenge: 13.384,
            }],
          },
        ],
        maxErgebnisse: 1,
        page: 2,
        size: 50,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  if (url.pathname.startsWith('/ba/pc/v4/jobdetails/')) {
    return new Response(
      JSON.stringify({
        stellenangebotsBeschreibung:
          '<p>Build <strong>reliable</strong> data pipelines.</p>',
        verguetungsangabe: 'JAHRESGEHALT',
        arbeitszeitVollzeit: true,
        homeofficemoeglich: true,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  return new Response(JSON.stringify({ error: 'unexpected test URL' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  })
}) as typeof fetch

try {
  const { fetchBa, fetchBaDetail } = await import('../src/sources/ba')

  const result = await fetchBa(
    {
      what: ['Data Engineer', 'Data Scientist'],
      where: { city: 'Berlin', radius_km: 25 },
    },
    { page: 2 },
  )

  const searchRequest = requestedUrls[0]
  assert.equal(searchRequest.pathname, '/ba/pc/v6/jobs')
  assert.equal(searchRequest.searchParams.get('was'), 'Data Engineer Data Scientist')
  assert.equal(searchRequest.searchParams.get('wo'), 'Berlin')
  assert.equal(searchRequest.searchParams.get('umkreis'), '25')
  assert.equal(searchRequest.searchParams.get('angebotsart'), '1')
  assert.equal(searchRequest.searchParams.get('size'), '50')
  assert.equal(searchRequest.searchParams.get('page'), '2')

  assert.equal(result.jobs.length, 1)
  const job = result.jobs[0]
  assert.equal(job.source, 'ba')
  assert.equal(job.source_id, '10000-TEST-S')
  assert.equal(job.title, 'Data Engineer')
  assert.equal(job.company, 'Example GmbH')
  assert.equal(job.url, 'https://example.com/apply')
  assert.equal(job.posted_at, '2026-08-09T00:00:00.000Z')
  assert.deepEqual(job.location, {
    city: 'Berlin',
    region: 'BERLIN',
    country: 'DEUTSCHLAND',
    remote: true,
    lat: 52.532,
    lng: 13.384,
  })

  const detail = await fetchBaDetail('10000-TEST-S')
  assert.equal(
    requestedUrls[1].pathname,
    `/ba/pc/v4/jobdetails/${btoa('10000-TEST-S')}`,
  )
  assert.deepEqual(detail, {
    description: 'Build reliable data pipelines.',
    employment_type: 'full-time',
    remote: true,
    salaryText: 'JAHRESGEHALT',
  })

  const empty = await fetchBa({ what: ['No inventory'] })
  assert.deepEqual(empty.jobs, [])

  const fallback = await fetchBa({ what: ['Fallback role'] })
  assert.equal(fallback.jobs.length, 1)
  assert.equal(fallback.jobs[0].title, 'Fallback occupation')
  assert.equal(fallback.jobs[0].company, 'Unknown company')
  assert.equal(fallback.jobs[0].location.country, 'Deutschland')
  assert.equal(fallback.jobs[0].posted_at, '2026-08-07T00:00:00.000Z')
  assert.equal(
    fallback.jobs[0].url,
    'https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-FALLBACK-S',
  )

  assert.equal(
    requestedUrls.some((url) => url.pathname === '/ba/pc/v4/jobs'),
    false,
    'the rejected v4 list route must never return',
  )
} finally {
  globalThis.fetch = originalFetch
}

console.log('v2601-ba-api.test.ts: all tests passed')