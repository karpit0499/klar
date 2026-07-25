import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { translate } from '../src/i18n/translations'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = (path: string) => readFileSync(root + path, 'utf8')

const home = source('src/ui/FlexibleWorkHome.tsx')
const search = source('src/ui/FlexibleSearch.tsx')
const card = source('src/ui/OpportunityCard.tsx')
const app = source('src/App.tsx')
const db = source('src/db/db.ts')

// Home is the real workspace now (saved searches + launcher), not a placeholder.
assert.match(home, /useFlexibleSearches/)
assert.match(home, /onSearch\(/)
assert.match(home, /flexible\.home\.savedTitle/)
assert.doesNotMatch(home, /enabled in v2\.4/, 'the v2.3 placeholder copy is gone')

// Progressive search screen: Stop, progress bar, source status, pagination.
assert.match(search, /flexible\.search\.stop/)
assert.match(search, /role="progressbar"/)
assert.match(search, /flexible\.search\.sourcesHeading/)
assert.match(search, /flexible\.search\.pageLabel/)
assert.match(search, /useFlexibleSearch\(/)
assert.match(search, /aria-live="polite"/)

// Opportunity card: distinct open-entry treatment + apply + provenance note.
assert.match(card, /flexible\.card\.openEntry/)
assert.match(card, /flexible\.card\.apply/)
assert.match(card, /flexible\.card\.inferred/)
assert.match(card, /rel="noreferrer"/)

// App wires the progressive search into the search tab for résumé-free users.
assert.match(app, /<FlexibleSearch/)
assert.match(app, /flexLaunch/)

// The v6 migration adds the three Source-Fabric stores.
assert.match(db, /this\.version\(6\)/)
assert.match(db, /flexibleSearches/)
assert.match(db, /flexibleCache/)
assert.match(db, /connectorHealth/)

// Bilingual parity for a representative Flexible Work key.
assert.notEqual(translate('de', 'flexible.search.stop'), translate('en', 'flexible.search.stop'))
assert.equal(translate('en', 'flexible.card.openEntry'), 'Open application')
assert.equal(translate('de', 'flexible.card.openEntry'), 'Initiativbewerbung')

console.log('v24-ui.test.ts: all tests passed')