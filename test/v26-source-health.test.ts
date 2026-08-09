import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { db } from '../src/db/db'
import {
  clearOperationalEvents,
  listOperationalEvents,
  recordOperationalEvent,
} from '../src/observability/events'
import {
  initialSourceStatus,
  listCareerSourceHealth,
  persistCareerSourceHealth,
} from '../src/sources/health'

await Promise.all([
  db.connectorHealth.clear(),
  clearOperationalEvents(),
])

const successfulAt = '2026-07-31T09:00:00.000Z'
const [successful] = await persistCareerSourceHealth([
  initialSourceStatus('ba', {
    ok: true,
    count: 12,
    fetchedAt: successfulAt,
    duplicateFamilies: 2,
  }),
])
assert.equal(successful.lastSuccessfulRefresh, successfulAt)
assert.equal(successful.sourceUrl, 'https://rest.arbeitsagentur.de/')
assert.equal(successful.extractionConfidence, 'published')

const failedAt = '2026-07-31T10:00:00.000Z'
const [failed] = await persistCareerSourceHealth([
  initialSourceStatus('ba', {
    ok: false,
    count: 0,
    fetchedAt: failedAt,
    note: 'Synthetic source outage.',
  }),
])
assert.equal(
  failed.lastSuccessfulRefresh,
  successfulAt,
  'a failed fetch must preserve the last known successful refresh',
)

const rows = await listCareerSourceHealth()
assert.equal(rows.length, 1)
assert.equal(rows[0].connectorId, 'career:ba')
assert.equal(rows[0].successes, 1)
assert.equal(rows[0].failures, 1)
assert.equal(rows[0].consecutiveFailures, 1)
assert.equal(rows[0].lastFetchedAt, failedAt)
assert.equal(rows[0].lastSuccessAt, successfulAt)

const concurrentRows = await Promise.all(
  Array.from({ length: 8 }, (_, index) => recordOperationalEvent({
    name: 'failed_parse',
    outcome: 'error',
    sourceFamily: `concurrent-${index}`,
  })),
)
const concurrentEvents = await listOperationalEvents()
assert.ok(
  concurrentRows.every((row) => concurrentEvents.some((event) => event.id === row.id)),
  'concurrent operational-event writes must not overwrite one another',
)

await clearOperationalEvents()
const allowListed = await recordOperationalEvent({
  name: 'failed_parse',
  outcome: 'error',
  sourceFamily: 'https://private.example/resume?candidate=secret',
  at: 'Synthetic private timeline content must never be stored.',
  content: 'Synthetic private résumé content must never be stored.',
} as never)
const rawOperationalSetting = await db.settings.get('operationalEvents.v26')
const rawOperationalRows = rawOperationalSetting?.value as Record<string, unknown>[]
assert.deepEqual(rawOperationalRows, [allowListed])
assert.deepEqual(
  Object.keys(rawOperationalRows[0]).sort(),
  ['at', 'id', 'name', 'outcome'],
  'the IndexedDB row contains only explicitly allowed event fields',
)
assert.equal('content' in rawOperationalRows[0], false)
assert.equal('sourceFamily' in rawOperationalRows[0], false)
assert.doesNotMatch(JSON.stringify(rawOperationalRows), /Synthetic private|private\.example/)

const recordBeforeClear = recordOperationalEvent({
  name: 'export_failure',
  outcome: 'error',
  documentKind: 'packet',
})
const orderedClear = clearOperationalEvents()
await Promise.all([recordBeforeClear, orderedClear])
assert.deepEqual(
  await listOperationalEvents(),
  [],
  'clear must run after an already-queued record instead of racing it',
)

for (let index = 0; index < 105; index += 1) {
  await recordOperationalEvent({
    name: index % 2 ? 'failed_parse' : 'export_failure',
    outcome: 'error',
    documentKind: index % 2 ? 'resume' : 'packet',
    at: new Date(Date.UTC(2026, 6, 31, 10, index)).toISOString(),
  })
}
const events = await listOperationalEvents()
assert.equal(events.length, 100, 'the local operational ledger is bounded')
assert.ok(events.every((event) =>
  !('text' in event)
  && !('url' in event)
  && !('path' in event)
  && !('detail' in event)))

const diagnostics = readFileSync('src/ui/SearchDiagnosticsPanel.tsx', 'utf8')
assert.match(diagnostics, /lastSuccessfulRefresh/)
assert.match(diagnostics, /extractionConfidence/)
assert.match(diagnostics, /duplicateFamilies/)
assert.match(diagnostics, /klar:report-source/)
assert.match(diagnostics, /disabled=\{refreshDisabled\}/)

const searchStep = readFileSync('src/ui/SearchStep.tsx', 'utf8')
assert.match(searchStep, /const runInProgress = useRef\(false\)/)
assert.match(
  searchStep,
  /async function run\(\) \{\s+if \(runInProgress\.current\) return\s+runInProgress\.current = true/,
)
assert.match(searchStep, /finally \{\s+runInProgress\.current = false\s+\}/)
assert.match(searchStep, /refreshDisabled=\{searchBusy\}/)

const resumeStep = readFileSync('src/ui/ResumeStep.tsx', 'utf8')
const reupload = readFileSync('src/ui/ResumeReupload.tsx', 'utf8')
assert.match(resumeStep, /name: 'failed_parse'/)
assert.match(reupload, /name: 'failed_parse'/)

await Promise.all([
  db.connectorHealth.clear(),
  clearOperationalEvents(),
])
await db.close()

console.log('v26-source-health.test.ts: all tests passed')
