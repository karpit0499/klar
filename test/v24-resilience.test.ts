import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { db } from '../src/db/db'
import {
  newHealth, recordFailure, recordSuccess, isCircuitOpen, shouldSkip, canaryDue, successRate, BREAKER, observe,
} from '../src/flexible/resilience'
import {
  isExpiredVacancy, pruneExpired, preserveFreshness, writeFlexibleCache, readFreshCache, sweepExpiredCache,
} from '../src/flexible/cache'
import { createFlexibleSearch, useFlexibleSearches, recordFlexibleRun, splitFlexibleFresh, getFlexibleSearch } from '../src/flexible/savedFlexibleSearches'
import { loadFlexibleFlags, setConnectorKilled, isConnectorEnabled, DEFAULT_FLEXIBLE_FLAGS } from '../src/flexible/flags'
import { makeOpportunity } from '../src/flexible/opportunity'
import type { NormalizedJob, FlexibleWorkPreferences } from '../src/types'
import type { ConnectorConfig } from '../src/flexible/connectors/types'

const now = Date.UTC(2026, 6, 20)
function opp(id: string, over: Partial<Parameters<typeof makeOpportunity>[0]> = {}): NormalizedJob {
  return makeOpportunity({ source: 'fabric', source_id: id, connectorId: 'c', title: `Job ${id}`, company: 'Emp', location: { city: 'Berlin', country: 'DE', remote: false }, url: `https://x/${id}`, ...over })
}

// --- Circuit breaker ---------------------------------------------------------
{
  let h = newHealth('c')
  for (let i = 0; i < BREAKER.failuresToOpen; i++) h = recordFailure(h, {}, now)
  assert.equal(h.consecutiveFailures, BREAKER.failuresToOpen)
  assert.equal(isCircuitOpen(h, now), true, 'opens after threshold')
  assert.equal(shouldSkip(h, now), true, 'search skips during cooldown')
  assert.equal(isCircuitOpen(h, now + BREAKER.cooldownMs + 1), false, 'closes after cooldown window')
  assert.equal(canaryDue(h, now + BREAKER.cooldownMs + 1), true, 'canary allowed after cooldown')
  const recovered = recordSuccess(h, 120, now + BREAKER.cooldownMs + 2)
  assert.equal(recovered.consecutiveFailures, 0)
  assert.equal(isCircuitOpen(recovered, now + BREAKER.cooldownMs + 3), false, 'success resets the breaker')
  assert.ok(successRate(recordFailure(newHealth('c'), {}, now)) < 1)
}
{
  // Manual kill switch always skips.
  const killed = { ...newHealth('c'), killed: true }
  assert.equal(shouldSkip(killed, now), true)
}
{
  // observe() persists health across a fake-indexeddb round trip.
  const persisted = await observe('conn-x', { ok: false }, now)
  assert.equal(persisted.failures, 1)
  const again = await observe('conn-x', { ok: true, latencyMs: 90 }, now)
  assert.equal(again.consecutiveFailures, 0)
}

// --- Cache safety ------------------------------------------------------------
{
  const expired = opp('e', { validThrough: new Date(now - 1000).toISOString() })
  const live = opp('l', { validThrough: new Date(now + 86_400_000).toISOString() })
  const openEntry = makeOpportunity({ source: 'fabric', source_id: 'oe', kind: 'open_entry', connectorId: 'c', title: 'Pool', company: 'Emp', location: { country: 'DE', remote: false }, url: 'https://x/oe' })
  assert.equal(isExpiredVacancy(expired, now), true)
  assert.equal(isExpiredVacancy(openEntry, now), false, 'open-entry never expires as a vacancy')
  const pruned = pruneExpired([expired, live, openEntry], now)
  assert.equal(pruned.length, 2, 'expired vacancy dropped, open-entry kept')

  // preserveFreshness carries first-seen forward and never relabels as new.
  const previous = [{ ...live, fetched_at: '2026-01-01T00:00:00.000Z' }]
  const kept = preserveFreshness(previous, [live], now)
  assert.equal(kept[0].fetched_at, '2026-01-01T00:00:00.000Z', 'first-seen preserved')

  await writeFlexibleCache('flex:key', [live, expired], { now })
  const fresh = await readFreshCache('flex:key', now)
  assert.equal(fresh?.length, 1, 'cache stores only validated, unexpired records')
  const stale = await readFreshCache('flex:key', now + 31 * 60_000)
  assert.equal(stale, null, 'expired cache row is not served as fresh')
  assert.ok((await sweepExpiredCache(now + 31 * 60_000)) >= 1)
}

// --- Feature flags + kill switch ---------------------------------------------
{
  const baseConfig = { id: 'rewe-group', health: { enabled: true }, type: 'feed' } as ConnectorConfig
  assert.equal(isConnectorEnabled(DEFAULT_FLEXIBLE_FLAGS, baseConfig), true)
  await setConnectorKilled('rewe-group', true)
  const flags = await loadFlexibleFlags()
  assert.equal(isConnectorEnabled(flags, baseConfig), false, 'killed connector disabled')
  await setConnectorKilled('rewe-group', false)
  // Master switch keeps baseline API on, gates direct fabric.
  assert.equal(isConnectorEnabled({ ...DEFAULT_FLEXIBLE_FLAGS, fabricEnabled: false }, baseConfig), false)
  assert.equal(isConnectorEnabled({ ...DEFAULT_FLEXIBLE_FLAGS, fabricEnabled: false }, { ...baseConfig, type: 'api' }), true)
}

// --- Saved flexible searches + new-since-last -------------------------------
{
  const prefs: FlexibleWorkPreferences = { employment: ['minijob'], roleFamilies: [], workplaces: ['supermarket'], locations: [{ city: 'Berlin', radius_km: 20 }] }
  const id = await createFlexibleSearch({ name: 'Berlin minijobs', preferences: prefs })
  const first = await recordFlexibleRun(id, [opp('1'), opp('2')])
  assert.equal(first.length, 0, 'first run baselines, nothing marked new')
  const row = await getFlexibleSearch(id)
  assert.ok(row && row.lastRunAt)
  const split = splitFlexibleFresh([opp('1'), opp('3')], row!)
  assert.equal(split.fresh.length, 1, 'only the unseen job is new')
  const secondFresh = await recordFlexibleRun(id, [opp('1'), opp('3')])
  assert.equal(secondFresh.length, 1)
  // useFlexibleSearches is a hook; just assert it is a function (rendered in UI tests/browser).
  assert.equal(typeof useFlexibleSearches, 'function')
}

console.log('v24-resilience.test.ts: all tests passed')