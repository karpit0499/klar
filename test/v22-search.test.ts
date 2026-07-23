import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { db } from '../src/db/db'
import { selectAdzunaCredentials } from '../worker/src/index'
import { resolveSourcePlan, type GatherResult } from '../src/sources'
import { makeJob } from '../src/sources/normalize'
import {
  applyLocalFiltersWithDiagnostics,
  isHidden,
  validateHideTerms,
} from '../src/match/localFilters'
import { buildSearchDiagnostics } from '../src/search/diagnostics'
import {
  contentFingerprint,
  createSavedSearch,
  getSavedSearch,
  jobIdentities,
  mergeSeenIdentities,
  recordRun,
} from '../src/search/savedSearches'
import { regionDE } from '../src/regions/de'
import { AppError } from '../src/errors/appError'
import { clearOnboardingProgress, detectLocalSetupState, saveOnboardingProgress } from '../src/onboarding/setupState'
import { resumeFromLegacyProfile } from '../src/resume/canonical'
import { saveCanonicalResume } from '../src/resume/store'

await resetDb()

// Atomic Adzuna credential selection: never mix one user value with one Worker value.
assert.deepEqual(
  selectAdzunaCredentials({ ADZUNA_APP_ID: 'worker-id', ADZUNA_APP_KEY: 'worker-key' }, { appId: 'user-id' }),
  { ok: false, reason: 'partial_user_credentials' },
)
assert.deepEqual(
  selectAdzunaCredentials({ ADZUNA_APP_ID: 'worker-id', ADZUNA_APP_KEY: 'worker-key' }, { appId: 'user-id', appKey: 'user-key' }),
  { ok: true, source: 'user', appId: 'user-id', appKey: 'user-key' },
)
assert.deepEqual(
  selectAdzunaCredentials({ ADZUNA_APP_ID: 'worker-id', ADZUNA_APP_KEY: 'worker-key' }, {}),
  { ok: true, source: 'worker', appId: 'worker-id', appKey: 'worker-key' },
)
assert.deepEqual(
  selectAdzunaCredentials({ ADZUNA_APP_ID: 'worker-id', ADZUNA_APP_KEY: 'worker-key' }, { appId: '  ', appKey: 'user-key' }),
  { ok: false, reason: 'partial_user_credentials' },
)

// Every source can be selected alone, and all can be selected together.
for (const source of ['ba', 'arbeitnow', 'adzuna', 'ats'] as const) {
  const plan = resolveSourcePlan({
    sources: {
      ba: source === 'ba',
      arbeitnow: source === 'arbeitnow',
      adzuna: source === 'adzuna',
      ats: source === 'ats',
    },
  })
  assert.equal(Object.values(plan).filter(Boolean).length, 1)
  assert.equal(plan[source], true)
}
assert.deepEqual(
  resolveSourcePlan({ sources: { ba: true, arbeitnow: true, adzuna: true, ats: true } }),
  { ba: true, arbeitnow: true, adzuna: true, ats: true },
)

const microsoft = job('1', 'Engineer', 'Microsoft', { lat: 52.52, lng: 13.405 })
assert.equal(isHidden(microsoft, ['soft']), false, 'short substring must not hide Microsoft')
assert.equal(validateHideTerms(['a', 'ok', 'Example Recruiting']).rejected.length, 2)
assert.equal(isHidden(job('2', 'Engineer', 'Example Recruiting GmbH'), ['Example Recruiting']), true)
assert.equal(isHidden(job('3', 'Engineer', 'Example GmbH — Recruiting'), ['Example Recruiting']), true)

const unknownOrigin = applyLocalFiltersWithDiagnostics([microsoft], {
  maxDistanceKm: 25,
  origin: undefined,
})
assert.equal(unknownOrigin.jobs.length, 1, 'unresolved origin must not silently enforce distance')
assert.equal(unknownOrigin.diagnostics.distanceEnforced, false)
assert.match(unknownOrigin.diagnostics.distanceMessage ?? '', /not enforced/i)

const filteredAll = applyLocalFiltersWithDiagnostics([microsoft], {
  hideList: ['Microsoft'],
})
const gathered: GatherResult = {
  jobs: [microsoft],
  status: [{ source: 'ba', requested: true, ok: true, count: 1 }],
  sourcesRequested: ['ba'],
  rawCount: 3,
  duplicatesRemoved: 2,
}
const diagnostics = buildSearchDiagnostics(gathered, filteredAll.diagnostics, { finalCount: 0 })
assert.equal(diagnostics.rawCount, 3)
assert.equal(diagnostics.duplicatesRemoved, 2)
assert.equal(diagnostics.zeroResultReason, 'hide_list')
assert.match(diagnostics.zeroResultNextStep ?? '', /hide list/i)

// Saved-search first run is a baseline, and merged/content identities remain seen.
const savedId = await createSavedSearch({ name: 'Engineering', query: { what: ['Engineer'] } })
const merged = {
  ...microsoft,
  also_on: [{ source: 'adzuna' as const, source_id: 'adz-1', url: 'https://adzuna.test/1' }],
}
assert.ok(jobIdentities(merged).includes('source:adzuna:adz-1'))
assert.match(contentFingerprint(merged), /^content:/)
assert.deepEqual(await recordRun(savedId, [merged]), [], 'first run must establish a baseline')

const sameContentNewSource = {
  ...merged,
  id: 'different-primary-id',
  source: 'arbeitnow' as const,
  source_id: 'different-source-id',
  also_on: undefined,
}
assert.deepEqual(await recordRun(savedId, [sameContentNewSource]), [], 'content fingerprint prevents false new badge')
const saved = await getSavedSearch(savedId)
assert.ok(saved?.seenIdentities?.some((entry) => entry.value === 'source:adzuna:adz-1'))

const old = Array.from({ length: 5_100 }, (_, index) => ({
  value: `old:${index}`,
  lastSeenAt: '2020-01-01T00:00:00.000Z',
}))
const pruned = mergeSeenIdentities(old, [merged], new Date('2026-07-22T00:00:00.000Z'))
assert.ok(pruned.length <= 5_000)
assert.equal(pruned.some((entry) => entry.value.startsWith('old:')), false)

// Setup-state detection distinguishes absent, interrupted, and complete workspaces.
assert.deepEqual(await detectLocalSetupState(), { kind: 'absent', resumeAt: 'welcome', discoveryMode: 'career' })
await saveOnboardingProgress('review')
assert.deepEqual(await detectLocalSetupState(), {
  kind: 'partial', resumeAt: 'review', discoveryMode: 'career',
  hasResume: false, hasDraft: false, hasPreferences: false,
  capabilities: {
    canDiscoverCareer: false, canDiscoverFlexible: false,
    canPrepareApplications: false, canUseResumeMatching: false,
  },
})

await db.matches.put({
  cacheKey: 'old', jobId: 'j', fitScore: 50, verdict: 'good', rationale: '', matchedSkills: [],
  missingSkills: [], redFlags: [], scoredAt: '2026-01-01T00:00:00.000Z', modelVersion: 'old',
})
await saveCanonicalResume(resumeFromLegacyProfile({
  summary: '', titles: [], skills: [], domains: [], education: [], languages: [], certifications: [],
  rawText: 'temporary extraction text',
}), { reason: 'migration' })
assert.equal(await db.matches.count(), 0, 'profile changes clear obsolete match caches')
assert.equal(await db.profiles.count(), 0)
assert.equal((await db.resumes.get('current'))?.data.schemaVersion, 2)
await db.preferences.put({
  id: 'current', targetTitles: [], fields: [], seniority: 'mid',
  salary: { currency: 'EUR', period: 'year' }, locations: [], workAuth: {}, languages: [],
  mustHaves: [], dealbreakers: [],
})
await clearOnboardingProgress()
assert.equal((await detectLocalSetupState()).kind, 'complete')

const modeled = new AppError({
  category: 'source', message: 'Source failed.', dataSafe: true,
  available: 'Other sources work.', action: { label: 'Retry', kind: 'retry' }, technical: 'HTTP 502',
})
assert.deepEqual(modeled.toJSON(), {
  category: 'source', message: 'Source failed.', dataSafe: true,
  available: 'Other sources work.', action: { label: 'Retry', kind: 'retry' }, technical: 'HTTP 502',
})

console.log('v22-search.test.ts: all tests passed')

function job(
  id: string,
  title: string,
  company: string,
  coordinates: { lat?: number; lng?: number } = {},
) {
  return makeJob({
    source: 'ba', source_id: id, title, company,
    location: { country: 'DE', city: 'Berlin', remote: false, ...coordinates },
    description: 'TypeScript platform role', url: `https://example.test/${id}`,
    posted_at: '2026-07-21T00:00:00.000Z',
  })
}

async function resetDb() {
  db.close()
  await db.delete()
  await db.open()
  assert.equal(regionDE.resolveLocation('Berlin').canonical, 'Berlin')
}