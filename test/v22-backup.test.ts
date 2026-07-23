import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { db } from '../src/db/db'
import {
  createCompleteEncryptedBackup,
  createStandardBackup,
  importBackup,
  migrateLegacyBackup,
  parseAndValidateBackup,
} from '../src/backup/backup'

await resetDb()
await db.settings.bulkPut([
  { key: 'activeRegion', value: 'de' },
  { key: 'groqKey', value: 'invalid-but-secret-key' },
  { key: 'adzunaAppId', value: 'invalid-id' },
  { key: 'adzunaAppKey', value: 'invalid-key' },
])
await db.preferences.put({
  id: 'current', targetTitles: ['Engineer'], fields: [], seniority: 'mid',
  salary: { currency: 'EUR', period: 'year' }, locations: [], workAuth: {},
  languages: [], mustHaves: [], dealbreakers: [],
})

const standard = await createStandardBackup()
assert.equal(standard.format, 'klar-backup')
assert.equal(standard.schemaVersion, 5)
assert.equal(standard.klarVersion, '2.3.0')
assert.ok(standard.integrity.digest.length === 64)
assert.equal(JSON.stringify(standard).includes('invalid-but-secret-key'), false)

const previousRegion = await db.settings.get('activeRegion')
const damaged = structuredClone(standard)
damaged.workspace.settings.push({ key: 'tampered', value: true })
await assert.rejects(importBackup(damaged), /integrity/i)
assert.deepEqual(await db.settings.get('activeRegion'), previousRegion, 'invalid import leaves active data unchanged')
assert.equal(await db.settings.get('tampered'), undefined)

await assert.rejects(
  importBackup({ settings: {}, profiles: [], preferences: [] }),
  /invalid/i,
  'malformed legacy data is rejected instead of being coerced to an empty workspace',
)
assert.deepEqual(await db.settings.get('activeRegion'), previousRegion)

await db.settings.put({ key: 'temporary', value: 'remove me' })
await importBackup(standard)
assert.equal(await db.settings.get('temporary'), undefined)
assert.equal((await db.preferences.get('current'))?.targetTitles[0], 'Engineer')

const complete = await createCompleteEncryptedBackup('portable backup password')
assert.equal(complete.workspace.settings.some((row) => /groq|adzuna/i.test(row.key)), false)
assert.ok(complete.workspace.vault[0]?.credentials?.ct)
await parseAndValidateBackup(complete)
const mixed = structuredClone(complete)
mixed.workspace.resumes.push({
  id: 'current', createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z', revision: 1,
  data: { schemaVersion: 2, contact: { name: '', links: [] }, experience: [], education: [], skills: [], languages: [], projects: [], certifications: [], evidence: [] },
})
await assert.rejects(parseAndValidateBackup(mixed), /cannot be mixed/i)

const missingVault = structuredClone(standard)
missingVault.mode = 'complete-encrypted'
await assert.rejects(parseAndValidateBackup(missingVault), /missing its encrypted credential vault/i)

for (const [label, legacy] of [
  ['v1', { settings: [], profiles: [], preferences: [], jobs: [], matches: [], tracked: [] }],
  ['v2', { settings: [], profiles: [], preferences: [], jobs: [], matches: [], tracked: [], dashboard: [], vectors: [] }],
  ['v2.1', { settings: [], profiles: [], preferences: [], jobs: [], matches: [], tracked: [], dashboard: [], vectors: [], savedSearches: [] }],
] as const) {
  const migrated = await migrateLegacyBackup(legacy)
  assert.equal(migrated.migration?.from, label)
  assert.equal((await parseAndValidateBackup(migrated)).schemaVersion, 5)
}

const legacyWithReadableCredentials = await migrateLegacyBackup({
  settings: [
    { key: 'groqKey', value: 'must-disappear' },
    { key: 'adzunaAppId', value: 'must-disappear' },
    { key: 'adzunaAppKey', value: 'must-disappear' },
    { key: 'activeRegion', value: 'at' },
  ],
  profiles: [{
    id: 'old', createdAt: '2025-01-01T00:00:00.000Z', summary: '', titles: [], skills: [],
    domains: [], education: [], languages: [], certifications: [], rawText: 'remove raw text',
  }],
  preferences: [], jobs: [], matches: [], tracked: [],
})
assert.equal(JSON.stringify(legacyWithReadableCredentials).includes('must-disappear'), false)
assert.equal(JSON.stringify(legacyWithReadableCredentials.workspace.resumes).includes('rawText'), false)

console.log('v22-backup.test.ts: all tests passed')

async function resetDb() {
  db.close()
  await db.delete()
  await db.open()
}