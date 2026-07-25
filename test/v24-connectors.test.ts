import { strict as assert } from 'node:assert'
import { makeFeedConnector } from '../src/flexible/connectors/engines/feedEngine'
import { makeSitemapConnector } from '../src/flexible/connectors/engines/sitemapEngine'
import { makePortalConnector } from '../src/flexible/connectors/engines/portalEngine'
import { makeOpenEntryConnector } from '../src/flexible/connectors/engines/openEntryEngine'
import { makeFederatedConnector } from '../src/flexible/connectors/engines/federatedEngine'
import { buildFallback } from '../src/flexible/connectors/fallback'
import { fixtureProxy } from '../src/flexible/connectors/fixtures'
import { buildFabric } from '../src/flexible/connectors'
import {
  FLEXIBLE_REGISTRY_DE,
  FABRIC_ALLOWED_HOSTS,
  topLevelConfigs,
  employerFamilies,
} from '../src/flexible/connectors/registry.de'
import { FABRIC_HOSTS } from '../worker/src/fabric'
import type { Connector, ConnectorConfig, ConnectorContext, FlexibleQuery } from '../src/flexible/connectors/types'
import { parseFeedItems, extractSitemapUrls, extractJsonLdJobPostings } from '../src/flexible/connectors/parse'

const cfg = (id: string): ConnectorConfig => {
  const found = FLEXIBLE_REGISTRY_DE.find((c) => c.id === id)
  if (!found) throw new Error(`missing config ${id}`)
  return found
}
const ctx: ConnectorContext = { proxy: fixtureProxy, now: () => Date.now() }
const query: FlexibleQuery = {
  cities: [{ city: 'Berlin', radius_km: 20 }, { city: 'Hamburg', radius_km: 20 }, { city: 'Leipzig', radius_km: 20 }],
  employment: [], roleFamilies: [], workplaces: [], keywords: [],
}

// --- Safe parsers ------------------------------------------------------------
assert.equal(parseFeedItems('<rss><channel><item><title>A</title><link>https://x/1</link></item></channel></rss>').length, 1)
assert.equal(extractSitemapUrls('<urlset><url><loc>https://x/job/1</loc></url><url><loc>https://x/imp</loc></url></urlset>', ['/job/']).length, 1)
assert.equal(extractJsonLdJobPostings('<script type="application/ld+json">{"@type":"JobPosting","title":"T"}</script>').length, 1)

// --- Feed engine -------------------------------------------------------------
{
  const result = await makeFeedConnector(cfg('rewe-group')).run(query, ctx)
  assert.ok(result.opportunities.length >= 2, 'REWE feed yields items')
  assert.equal(result.opportunities[0].source, 'fabric')
  assert.equal(result.opportunities[0].employerFamily, 'REWE Group')
}

// --- Sitemap + JSON-LD engine (impressum filtered out) ----------------------
{
  const result = await makeSitemapConnector(cfg('kaufland')).run(query, ctx)
  assert.equal(result.opportunities.length, 2, 'two job detail pages, impressum ignored')
  assert.ok(result.opportunities.every((o) => o.fieldProvenance?.title?.method === 'structured_data'))
}

// --- Portal engine -----------------------------------------------------------
{
  const result = await makePortalConnector(cfg('aldi-nord')).run(query, ctx)
  assert.equal(result.opportunities.length, 2)
  assert.ok(result.opportunities.some((o) => o.roleFamilies?.includes('sales_assistant')))
}

// --- Open-entry engine -------------------------------------------------------
{
  const result = await makeOpenEntryConnector(cfg('amazon-ops')).run(query, ctx)
  assert.ok(result.opportunities.length >= 1)
  assert.ok(result.opportunities.every((o) => o.kind === 'open_entry'))
}

// --- Federated engine (one failing member never fails the group) ------------
{
  const okMember: Connector = { config: cfg('edeka-zentrale'), run: async () => ({ opportunities: (await makePortalConnector(cfg('aldi-nord')).run(query, ctx)).opportunities, usedFallback: false }) }
  const badMember: Connector = { config: cfg('edeka-regional'), run: async () => { throw new Error('down') } }
  const result = await makeFederatedConnector(cfg('edeka'), [okMember, badMember]).run(query, ctx)
  assert.ok(result.opportunities.length >= 1, 'group survives a failing member')
}

// --- Fallback builder --------------------------------------------------------
{
  const result = await buildFallback(cfg('rewe-group'), query, ctx)
  assert.equal(result.usedFallback, true)
  assert.ok(result.opportunities.length >= 1, 'api_employer fallback yields an official route card')
  assert.ok(result.opportunities.some((o) => o.kind === 'open_entry'))
}

// --- Registry integrity ------------------------------------------------------
{
  // Every family has a working fallback (§5.3: never a broken placeholder).
  for (const config of FLEXIBLE_REGISTRY_DE) {
    assert.ok(config.fallback, `${config.id} has a fallback`)
    assert.ok(config.attemptTimeoutMs >= 10_000 && config.attemptTimeoutMs <= 15_000, `${config.id} attempt timeout in 10–15s`)
  }
  // Federated members all resolve.
  for (const config of FLEXIBLE_REGISTRY_DE.filter((c) => c.type === 'federated')) {
    for (const memberId of config.members ?? []) {
      assert.ok(FLEXIBLE_REGISTRY_DE.some((c) => c.id === memberId), `${config.id} member ${memberId} exists`)
    }
  }
  // At least the 21 initial employer families are represented.
  assert.ok(employerFamilies().length >= 21, `has ${employerFamilies().length} employer families (>= 21)`)
  // Security: every registry host is on the Worker allowlist (§7).
  for (const host of FABRIC_ALLOWED_HOSTS) {
    assert.ok(FABRIC_HOSTS[host], `Worker allowlist covers ${host}`)
  }
}

// --- buildFabric: top-level only, members excluded, baselines present -------
{
  const { connectors } = buildFabric()
  assert.equal(connectors.length, topLevelConfigs().length)
  assert.ok(!connectors.some((c) => c.config.memberOnly), 'no member-only connectors at top level')
  assert.ok(connectors.some((c) => c.config.id === 'baseline-ba'), 'BA baseline present')
}

console.log('v24-connectors.test.ts: all tests passed')