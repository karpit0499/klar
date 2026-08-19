import { strict as assert } from 'node:assert'
import {
  OFFICIAL_ROUTE_PAGE_SIZE,
  officialRouteDirectoryPage,
} from '../src/flexible/officialRouteDirectory'
import { FLEXIBLE_OFFICIAL_ROUTES_DE } from '../src/flexible/connectors/officialRoutes.de'

{
  const page = officialRouteDirectoryPage()
  assert.equal(page.total, 100)
  assert.equal(page.items.length, OFFICIAL_ROUTE_PAGE_SIZE)
  assert.equal(page.totalPages, 13)
  assert.ok(page.items.every(({ opportunity }) => (
    opportunity.kind === 'official_search' || opportunity.kind === 'open_entry'
  )))
  assert.ok(page.items.every(({ opportunity }) => opportunity.posted_at === undefined))
}

{
  const logistics = officialRouteDirectoryPage({ sector: 'logistics' })
  assert.equal(
    logistics.total,
    FLEXIBLE_OFFICIAL_ROUTES_DE.filter((route) => route.sector === 'logistics').length,
  )
  assert.ok(logistics.items.every(({ route }) => route.sector === 'logistics'))

  const accentFolded = officialRouteDirectoryPage({ text: 'wurth' })
  assert.deepEqual(accentFolded.items.map(({ route }) => route.organization), ['Würth'])

  const digraphFolded = officialRouteDirectoryPage({ text: 'wuerth' })
  assert.deepEqual(digraphFolded.items.map(({ route }) => route.organization), ['Würth'])

  const openEntry = officialRouteDirectoryPage({ text: 'Uber Eats Courier' })
  assert.equal(openEntry.total, 1)
  assert.equal(openEntry.items[0].opportunity.kind, 'open_entry')
  assert.equal(openEntry.items[0].opportunity.url, openEntry.items[0].route.officialUrl)
}

{
  const last = officialRouteDirectoryPage({ page: 99 })
  assert.equal(last.page, 12, 'out-of-range pages clamp to the last bounded page')
  assert.ok(last.items.length <= OFFICIAL_ROUTE_PAGE_SIZE)
}

{
  const berlin = officialRouteDirectoryPage({ city: ' Berlin ' })
  assert.equal(berlin.cityContext, 'Berlin')
  assert.ok(berlin.items.every(({ opportunity }) => opportunity.location.city === undefined))
  assert.ok(berlin.items.every(({ opportunity }) => opportunity.cityAvailability?.length === 0))
  assert.ok(berlin.items.every(({ locationStatus }) => locationStatus === 'check_on_official_site'))
  assert.deepEqual(
    berlin.items.map(({ opportunity }) => opportunity.url),
    FLEXIBLE_OFFICIAL_ROUTES_DE.slice(0, OFFICIAL_ROUTE_PAGE_SIZE).map((route) => route.officialUrl),
    'a city context never fabricates a city-specific URL or vacancy',
  )
}

console.log('v261-official-route-directory.test.ts: all tests passed')
