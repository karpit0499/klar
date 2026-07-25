import { strict as assert } from 'node:assert'
import { runSearchSession, mergeOpportunity, SearchSessionModel } from '../src/flexible/searchSession'
import { makeOpportunity } from '../src/flexible/opportunity'
import type { Connector, ConnectorConfig, FlexibleQuery } from '../src/flexible/connectors/types'
import type { NormalizedJob } from '../src/types'

function opp(connectorId: string, n: number, over: Partial<Parameters<typeof makeOpportunity>[0]> = {}): NormalizedJob {
  return makeOpportunity({
    source: 'fabric', source_id: `${connectorId}:${n}`, connectorId, employerFamily: connectorId,
    title: `Job ${n}`, company: connectorId, location: { city: 'Berlin', country: 'DE', remote: false },
    url: `https://x/${connectorId}/${n}`, ...over,
  })
}
function fake(id: string, opps: NormalizedJob[], opts: { delayMs?: number; fail?: boolean } = {}): Connector {
  const config = { id, employerFamily: id, type: 'portal', attemptTimeoutMs: 12_000, retryEligible: true } as ConnectorConfig
  return {
    config,
    run: async () => {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
      if (opts.fail) throw new Error(`${id} failed`)
      return { opportunities: opps, usedFallback: false }
    },
  }
}
const proxy = (async () => ({ status: 200, contentType: 'application/json', body: '' })) as never
const query: FlexibleQuery = { cities: [{ city: 'Berlin', radius_km: 20 }], employment: [], roleFamilies: [], workplaces: [], keywords: [] }

// --- Pure merge: direct-employer link replaces aggregator, in place ---------
{
  const agg = makeOpportunity({ source: 'ba', source_id: '1', title: 'Kasse', company: 'REWE', location: { city: 'Berlin', country: 'DE', remote: false }, url: 'https://agg/1' })
  const direct = makeOpportunity({ source: 'fabric', source_id: 'rewe:1', connectorId: 'rewe', title: 'Kasse', company: 'REWE', location: { city: 'Berlin', country: 'DE', remote: false }, url: 'https://jobs.rewe-group.com/1' })
  const merged = mergeOpportunity(agg, direct)
  assert.equal(merged.url, 'https://jobs.rewe-group.com/1', 'direct apply link wins')
  assert.ok(merged.also_on?.some((a) => a.url === 'https://agg/1'), 'aggregator kept in also_on')
}

// --- Model: first publish at 10, stable 20-per-page --------------------------
{
  const model = new SearchSessionModel({ id: 't', startedAt: 0, deadlineAt: 60_000, connectors: [{ connectorId: 'a', employerFamily: 'A', type: 'portal' }] })
  model.ingest('a', { opportunities: Array.from({ length: 9 }, (_, i) => opp('a', i)), usedFallback: false }, 5)
  model.evaluatePublish()
  assert.equal(model.snapshot(0).publishedCount, 0, 'below threshold: not published')
  model.ingest('a', { opportunities: [opp('a', 99)], usedFallback: false }, 5)
  model.evaluatePublish()
  assert.equal(model.snapshot(0).pages.length, 1, 'published at 10')
}

// --- Runner: 24 unique → 2 pages (20 + 4), complete -------------------------
{
  let last
  const final = await runSearchSession({
    connectors: [
      fake('a', Array.from({ length: 8 }, (_, i) => opp('a', i))),
      fake('b', Array.from({ length: 8 }, (_, i) => opp('b', i))),
      fake('c', Array.from({ length: 8 }, (_, i) => opp('c', i))),
    ],
    query, proxy, onUpdate: (s) => { last = s },
  })
  assert.equal(final.totalCount, 24)
  assert.equal(final.totalPages, 2)
  assert.deepEqual(final.pages.map((p) => p.length), [20, 4], 'stable 20 + 4 pagination')
  assert.equal(final.phase, 'complete')
  assert.ok(last, 'emitted at least one snapshot')
}

// --- Runner: deadline finalizes; slow source skipped; phase partial ---------
{
  const never: Connector = { config: { id: 'slow', employerFamily: 'Slow', type: 'portal', attemptTimeoutMs: 12_000, retryEligible: true } as ConnectorConfig, run: () => new Promise(() => {}) }
  const final = await runSearchSession({ connectors: [fake('fast', [opp('fast', 1)]), never], query, proxy, onUpdate: () => {}, deadlineMs: 200, lowSupplyMs: 40 })
  assert.equal(final.reason, 'deadline')
  assert.equal(final.sources.find((s) => s.connectorId === 'slow')?.status, 'skipped')
  assert.equal(final.phase, 'partial', 'unfinished source → partial coverage')
}

// --- Runner: low-supply escape hatch publishes < 10 -------------------------
{
  const final = await runSearchSession({ connectors: [fake('a', [opp('a', 1), opp('a', 2)])], query, proxy, onUpdate: () => {}, lowSupplyMs: 10 })
  assert.equal(final.publishedCount, 2, 'few results still published')
  assert.equal(final.phase, 'complete')
}

// --- Runner: a failing connector never breaks the search --------------------
{
  const final = await runSearchSession({ connectors: [fake('ok', [opp('ok', 1)]), fake('bad', [], { fail: true })], query, proxy, onUpdate: () => {}, lowSupplyMs: 10 })
  assert.ok(final.totalCount >= 1, 'good source still returns')
  assert.equal(final.sources.find((s) => s.connectorId === 'bad')?.status, 'error')
}

console.log('v24-search-session.test.ts: all tests passed')