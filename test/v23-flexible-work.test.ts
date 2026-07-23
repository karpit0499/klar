import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { db, getSetting, setSetting } from '../src/db/db'
import {
  clearOnboardingProgress,
  detectLocalSetupState,
  saveDiscoveryMode,
  workspaceCapabilities,
} from '../src/onboarding/setupState'
import { normalizeResume } from '../src/resume/canonical'
import { loadCanonicalResume, saveCanonicalResume } from '../src/resume/store'
import { loadPreferences, savePreferences } from '../src/storage/careerData'
import {
  createStandardBackup,
  importBackup,
  inspectBackup,
  type BackupEnvelope,
} from '../src/backup/backup'
import {
  SEARCH_FIRST_PUBLISH_MIN,
  SEARCH_HARD_DEADLINE_MS,
  SEARCH_LOW_SUPPLY_PUBLISH_MS,
  SEARCH_MAX_RETRIES,
  SEARCH_PAGE_SIZE,
  SOURCE_ATTEMPT_TIMEOUT_MAX_MS,
  SOURCE_ATTEMPT_TIMEOUT_MIN_MS,
  canRetrySearchSource,
} from '../src/search/sessionPolicy'
import {
  normalizeFlexibleRadius,
  validateFlexibleWorkSelection,
} from '../src/flexible/preferences'
import type { FlexibleWorkPreferences, Preferences } from '../src/types'

const flexible: FlexibleWorkPreferences = {
  employment: ['minijob', 'part_time'],
  roleFamilies: [],
  workplaces: ['supermarket', 'warehouse'],
  locations: [
    { city: 'Berlin', radius_km: 20 },
    { city: 'Hamburg', radius_km: 15 },
  ],
  schedule: {
    days: ['friday', 'saturday'],
    periods: ['evening'],
    maxHoursPerWeek: 20,
  },
  languageComfort: { german: 'B1', english: 'fluent' },
  physicalWork: 'limited',
  hasBike: true,
  earliestStart: '2026-08-01',
}

await resetDb()
await saveDiscoveryMode('flexible')
await savePreferences({ ...emptyPreferences(), discoveryMode: 'flexible', flexibleWork: flexible })
await clearOnboardingProgress()

const flexibleState = await detectLocalSetupState()
assert.equal(flexibleState.kind, 'complete')
if (flexibleState.kind !== 'complete') throw new Error('Expected a complete flexible workspace.')
assert.equal(flexibleState.discoveryMode, 'flexible')
assert.equal(flexibleState.hasResume, false)
assert.deepEqual(flexibleState.capabilities, {
  canDiscoverCareer: false,
  canDiscoverFlexible: true,
  canPrepareApplications: false,
  canUseResumeMatching: false,
})
assert.equal(await loadCanonicalResume(), null, 'Flexible Work must not create an empty résumé.')

const backup = await createStandardBackup()
const preview = await inspectBackup(backup)
assert.ok(preview.categories.includes('Flexible Work preferences'))
assert.equal(preview.categories.includes('career profile'), false)

await resetDb()
await importBackup(backup)
assert.equal(await loadCanonicalResume(), null)
assert.equal((await loadPreferences())?.flexibleWork?.locations[0].city, 'Berlin')
assert.equal((await loadPreferences())?.flexibleWork?.locations[1].city, 'Hamburg')
assert.equal((await detectLocalSetupState()).kind, 'complete')

const malformed = structuredClone(backup)
;(malformed.workspace.preferences[0].flexibleWork as unknown as { employment: unknown }).employment = [42]
await reseal(malformed)
await setSetting('importMarker', 'keep')
await assert.rejects(importBackup(malformed), /Flexible Work preference options are invalid/i)
assert.equal(await getSetting('importMarker'), 'keep', 'Rejected import must not mutate the active workspace.')

const malformedSchedule = structuredClone(backup)
;(malformedSchedule.workspace.preferences[0].flexibleWork as FlexibleWorkPreferences).schedule = {
  maxHoursPerWeek: 999,
}
await reseal(malformedSchedule)
await assert.rejects(importBackup(malformedSchedule), /schedule preferences are invalid/i)
assert.equal(await getSetting('importMarker'), 'keep', 'Rejected optional preferences must not mutate the active workspace.')

await savePreferences({ ...emptyPreferences(), discoveryMode: 'both', flexibleWork: flexible })
await saveDiscoveryMode('both')
await clearOnboardingProgress()
const bothState = await detectLocalSetupState()
assert.equal(bothState.kind, 'complete')
if (bothState.kind !== 'complete') throw new Error('Expected a complete combined workspace.')
assert.equal(bothState.capabilities.canDiscoverFlexible, true)
assert.equal(bothState.capabilities.canDiscoverCareer, false)

await resetDb()
const resume = normalizeResume({
  contact: { name: 'Student Example', location: 'Munich', links: [] },
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  languages: [],
})
await saveCanonicalResume(resume, { snapshotCurrent: false })
await savePreferences({
  ...emptyPreferences(),
  targetTitles: ['Student assistant'],
  flexibleWork: flexible,
})
await clearOnboardingProgress()
const legacyCareer = await detectLocalSetupState()
assert.equal(legacyCareer.kind, 'complete')
if (legacyCareer.kind !== 'complete') throw new Error('Expected a complete legacy career workspace.')
assert.equal(legacyCareer.discoveryMode, 'career')
assert.equal(legacyCareer.capabilities.canDiscoverCareer, true)
assert.equal((await loadPreferences())?.flexibleWork?.locations[0].city, 'Berlin')
assert.equal((await loadCanonicalResume())?.data.contact.location, 'Munich')

assert.deepEqual(workspaceCapabilities(false, { ...emptyPreferences(), discoveryMode: 'flexible', flexibleWork: flexible }), {
  canDiscoverCareer: false,
  canDiscoverFlexible: true,
  canPrepareApplications: false,
  canUseResumeMatching: false,
})

assert.equal(SOURCE_ATTEMPT_TIMEOUT_MIN_MS, 10_000)
assert.equal(SOURCE_ATTEMPT_TIMEOUT_MAX_MS, 15_000)
assert.equal(SEARCH_HARD_DEADLINE_MS, 60_000)
assert.equal(SEARCH_MAX_RETRIES, 2)
assert.equal(SEARCH_PAGE_SIZE, 20)
assert.equal(SEARCH_FIRST_PUBLISH_MIN, 10)
assert.equal(SEARCH_LOW_SUPPLY_PUBLISH_MS, 8_000)
assert.equal(canRetrySearchSource({ retryCount: 0, networkError: true, remainingMs: 40_000 }), true)
assert.equal(canRetrySearchSource({ retryCount: 2, networkError: true, remainingMs: 40_000 }), false)
assert.equal(canRetrySearchSource({ retryCount: 0, status: 429, retryAfterMs: 50_000, remainingMs: 40_000 }), false)
assert.equal(canRetrySearchSource({ retryCount: 0, status: 401, remainingMs: 40_000 }), false)
assert.equal(canRetrySearchSource({ retryCount: 0, status: 503, remainingMs: 40_000 }), true)
assert.equal(validateFlexibleWorkSelection([''], ['minijob'], []), 'location')
assert.equal(validateFlexibleWorkSelection(['', 'Berlin'], [], []), 'work_type')
assert.equal(validateFlexibleWorkSelection(['Berlin'], ['part_time'], []), null)
assert.equal(normalizeFlexibleRadius('0'), 1)
assert.equal(normalizeFlexibleRadius('999'), 200)
assert.equal(normalizeFlexibleRadius('not-a-number'), 15)

console.log('v23-flexible-work.test.ts: all tests passed')

function emptyPreferences(): Preferences {
  return {
    targetTitles: [],
    fields: [],
    seniority: 'intern',
    salary: { currency: 'EUR', period: 'year' },
    locations: [],
    workAuth: {},
    languages: [],
    mustHaves: [],
    dealbreakers: [],
  }
}

async function reseal(envelope: BackupEnvelope): Promise<void> {
  const { integrity: _integrity, ...payload } = envelope
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)))
  envelope.integrity.digest = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function resetDb() {
  db.close()
  await db.delete()
  await db.open()
}