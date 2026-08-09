import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { shouldVisitFlexibleSearch } from '../src/application/workspaceRouting'

assert.equal(
  shouldVisitFlexibleSearch({ tab: 'search', hasCareer: true }),
  false,
  'ordinary Career Search must not mount or auto-run Flexible Search',
)
assert.equal(
  shouldVisitFlexibleSearch({ tab: 'search', hasCareer: true, workMode: 'career' }),
  false,
)
assert.equal(
  shouldVisitFlexibleSearch({ tab: 'search', hasCareer: true, workMode: 'flexible' }),
  true,
  'switching to Flexible while on Search visits the Flexible search surface',
)
assert.equal(
  shouldVisitFlexibleSearch({ tab: 'search', hasCareer: false }),
  true,
  'a Flexible-only workspace mounts its search after the user opens Search',
)
assert.equal(
  shouldVisitFlexibleSearch({ tab: 'dashboard', hasCareer: true, workMode: 'flexible' }),
  false,
  'switching modes on Dashboard must not start a hidden Flexible search',
)

const app = readFileSync('src/App.tsx', 'utf8')
const changeTab = app.match(/function changeTab\(next: Tab\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''
assert.doesNotMatch(
  changeTab,
  /setFlexSearchVisited/,
  'generic Search navigation cannot mark the unrelated Flexible surface visited',
)
assert.match(app, /shouldVisitFlexibleSearch\(\{/)
assert.match(app, /setFlexLaunch\(launch\)[\s\S]*setFlexSearchVisited\(true\)/)

console.log('v26-workspace-routing.test.ts: all tests passed')
