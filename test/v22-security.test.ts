import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import Dexie from 'dexie'
import { db } from '../src/db/db'
import {
  enableVault,
  getVaultStatus,
  lockVault,
  readSensitiveContent,
  unlockVault,
  updateSensitiveContent,
} from '../src/crypto/vault'
import { loadGroqKey, saveGroqKey } from '../src/settings/keys'
import { loadAdzunaKey } from '../src/settings/adzunaKey'
import { createCompleteEncryptedBackup, createStandardBackup } from '../src/backup/backup'
import type { Profile, TrackedJob } from '../src/types'
import { normalizeResume } from '../src/resume/canonical'

const PASSPHRASE = 'correct horse battery staple'

await resetDb()

const profile: Profile = {
  summary: 'Platform engineer',
  titles: [{ title: 'Platform Engineer', years: 4 }],
  skills: [{ name: 'TypeScript' }],
  domains: ['SaaS'],
  education: [],
  languages: [{ lang: 'English', level: 'C1' }],
  certifications: [],
  rawText: 'THIS RAW RESUME TEXT MUST NOT SURVIVE CONFIRMATION',
}
const canonical = normalizeResume({
  contact: { name: 'Ada', links: [] }, summary: profile.summary,
  experience: [{ title: 'Platform Engineer', company: 'Private Co', start: '01/2022', current: true, bullets: ['Private achievement'] }],
  education: [], skills: [{ group: 'Engineering', items: ['TypeScript'] }],
  languages: profile.languages, projects: [], certifications: [],
})
await db.resumes.put({ id: 'current', data: canonical, createdAt: '2026-07-22T10:00:00.000Z', updatedAt: '2026-07-22T10:00:00.000Z', revision: 1 })
await db.dashboard.put({ id: 'me', displayName: 'Ada', headline: 'Engineer', about: 'Private', location: 'Berlin', links: [] })
const tracked: TrackedJob = {
  jobId: 'j1',
  job: {
    id: 'j1', source: 'ba', source_id: '1', title: 'Engineer', company: 'Example',
    location: { country: 'DE', remote: false }, description: 'Role', url: 'https://example.test',
    salary: {}, tags: [], fetched_at: '2026-07-22T10:00:00.000Z',
  },
  status: 'interested', notes: 'Private note', reminders: [], contacts: [],
  history: [], createdAt: '2026-07-22T10:00:00.000Z', updatedAt: '2026-07-22T10:00:00.000Z',
}
await db.tracked.put(tracked)
await db.preferences.put({
  id: 'current', targetTitles: ['Private platform role'], fields: [], seniority: 'mid',
  salary: { currency: 'EUR', period: 'year' }, locations: [{ city: 'Berlin', radius_km: 25 }],
  workAuth: {}, languages: [], mustHaves: [], dealbreakers: [],
})
await db.jobs.put({ queryKey: 'private-search', jobs: [tracked.job], fetchedAt: '2026-07-22T10:00:00.000Z' })
await db.matches.put({
  cacheKey: 'private-match', jobId: 'j1', fitScore: 80, verdict: 'good', rationale: 'Private fit',
  matchedSkills: [], missingSkills: [], redFlags: [], scoredAt: '2026-07-22T10:00:00.000Z', modelVersion: 'test',
})
await db.vectors.put({ jobId: 'j1', embedderId: 'test', dim: 2, vec: [0.1, 0.2] })
await db.savedSearches.put({
  id: 'saved-1', name: 'Private saved search', query: { what: ['Engineer'] }, seenJobIds: [],
  createdAt: '2026-07-22T10:00:00.000Z', updatedAt: '2026-07-22T10:00:00.000Z',
})
await db.settings.bulkPut([
  { key: 'groqKey', value: 'gsk_super_secret' },
  { key: 'groqKeyRemember', value: true },
  { key: 'adzunaAppId', value: 'adzuna_id_secret' },
  { key: 'adzunaAppKey', value: 'adzuna_key_secret' },
  { key: 'resumeDataV1', value: {
    contact: { name: 'Ada', links: [] }, experience: [], education: [], skills: [],
    languages: [], projects: [], certifications: [],
  } },
])

await enableVault(
  PASSPHRASE,
  { unrecoverablePassphrase: true, backupOffered: true },
  'gsk_super_secret',
)
assert.equal(await getVaultStatus(), 'unlocked')
assert.equal(await db.profiles.count(), 0)
assert.equal(await db.resumes.count(), 0)
assert.equal(await db.dashboard.count(), 0)
assert.equal(await db.tracked.count(), 0)
assert.equal(await db.preferences.count(), 0)
assert.equal(await db.jobs.count(), 0)
assert.equal(await db.matches.count(), 0)
assert.equal(await db.vectors.count(), 0)
assert.equal(await db.savedSearches.count(), 0)
for (const key of ['groqKey', 'groqKeyRemember', 'adzunaAppId', 'adzunaAppKey', 'resumeDataV1']) {
  assert.equal(await db.settings.get(key), undefined, `plaintext ${key} must be removed`)
}

const row = await db.vault.get('primary')
assert.ok(row?.content.ct)
assert.ok(row?.credentials?.ct)
const serializedRow = JSON.stringify(row)
for (const secret of ['gsk_super_secret', 'adzuna_id_secret', 'adzuna_key_secret', 'Private note', 'Private platform role', 'Private saved search', 'Ada']) {
  assert.equal(serializedRow.includes(secret), false, `vault must not contain readable ${secret}`)
}

const content = await readSensitiveContent()
assert.equal(content?.canonicalResume?.data.contact.name, 'Ada')
assert.equal(content?.preferences[0]?.targetTitles[0], 'Private platform role')
assert.equal(content?.savedSearches[0]?.name, 'Private saved search')
assert.equal(await loadGroqKey(), 'gsk_super_secret')
assert.deepEqual(await loadAdzunaKey(), { appId: 'adzuna_id_secret', appKey: 'adzuna_key_secret' })

const standard = await createStandardBackup()
const standardJson = JSON.stringify(standard)
assert.equal(standard.mode, 'standard')
assert.equal(standard.workspace.vault[0]?.credentials, undefined)
for (const secret of ['gsk_super_secret', 'adzuna_id_secret', 'adzuna_key_secret']) {
  assert.equal(standardJson.includes(secret), false, 'standard backup must contain no readable credential')
}

const complete = await createCompleteEncryptedBackup()
assert.equal(complete.mode, 'complete-encrypted')
assert.ok(complete.workspace.vault[0]?.credentials?.ct)
assert.equal(JSON.stringify(complete).includes('gsk_super_secret'), false)

lockVault()
assert.equal(await getVaultStatus(), 'locked')
await assert.rejects(readSensitiveContent(), /locked/i)
await assert.rejects(loadGroqKey(), /locked/i)

const beforeWrongPassphrase = JSON.stringify(await db.vault.get('primary'))
await assert.rejects(unlockVault('definitely the wrong passphrase'), /passphrase/i)
assert.equal(JSON.stringify(await db.vault.get('primary')), beforeWrongPassphrase, 'wrong passphrase must not mutate ciphertext')

await unlockVault(PASSPHRASE)
assert.equal(await getVaultStatus(), 'unlocked')
assert.equal((await readSensitiveContent())?.tracked[0]?.notes, 'Private note')

await saveGroqKey('session-only-secret', false)
assert.equal(await loadGroqKey(), 'session-only-secret')
lockVault()
await assert.rejects(loadGroqKey(), /locked/i, 'a session-only credential must not bypass a locked vault')
await unlockVault(PASSPHRASE)
assert.equal(await loadGroqKey(), undefined, 'locking erases session-only credentials')

await assert.rejects(
  updateSensitiveContent(() => { throw new Error('simulated mutation failure') }),
  /simulated mutation failure/,
)
await updateSensitiveContent((draft) => { draft.dashboard[0]!.headline = 'Recovered queue' })
assert.equal((await readSensitiveContent())?.dashboard[0]?.headline, 'Recovered queue')

let releaseMutation!: () => void
let markStarted!: () => void
const mutationStarted = new Promise<void>((resolve) => { markStarted = resolve })
const mutationGate = new Promise<void>((resolve) => { releaseMutation = resolve })
const pendingMutation = updateSensitiveContent(async (draft) => {
  markStarted()
  await mutationGate
  draft.dashboard[0]!.headline = 'Must not re-open memory'
})
await mutationStarted
lockVault()
releaseMutation()
await assert.rejects(pendingMutation, /locked/i)
await assert.rejects(readSensitiveContent(), /locked/i)

await exerciseV3Upgrade()

console.log('v22-security.test.ts: all tests passed')

async function resetDb() {
  db.close()
  await db.delete()
  await db.open()
}

async function exerciseV3Upgrade() {
  lockVault()
  db.close()
  await db.delete()
  const legacy = new Dexie('klar')
  legacy.version(3).stores({
    settings: 'key', profiles: 'id, createdAt', preferences: 'id', jobs: 'queryKey, fetchedAt',
    matches: 'cacheKey, jobId', tracked: 'jobId, status, updatedAt', dashboard: 'id',
    vectors: 'jobId, embedderId', savedSearches: 'id, updatedAt',
  })
  await legacy.open()
  await legacy.table('profiles').put({
    id: 'legacy-profile', createdAt: '2025-01-01T00:00:00.000Z', summary: '', titles: [], skills: [],
    domains: [], education: [], languages: [], certifications: [], rawText: 'remove during v4 upgrade',
  })
  await legacy.table('preferences').put({
    id: 'current', targetTitles: ['Keep me'], fields: [], seniority: 'mid',
    salary: { currency: 'EUR', period: 'year' }, locations: [], workAuth: {},
    languages: [], mustHaves: [], dealbreakers: [],
  })
  legacy.close()
  await db.open()
  assert.equal(await db.profiles.get('legacy-profile'), undefined)
  assert.equal((await db.resumes.get('current'))?.data.schemaVersion, 2)
  assert.equal((await db.preferences.get('current'))?.targetTitles[0], 'Keep me')
}