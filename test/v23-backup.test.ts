import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { db } from '../src/db/db'
import {
  createCompleteEncryptedBackup,
  createStandardBackup,
  importBackup,
  parseAndValidateBackup,
} from '../src/backup/backup'
import { normalizeResume } from '../src/resume/canonical'
import { encryptJSON } from '../src/crypto/resumeCrypto'
import { getVaultStatus, readSensitiveContent } from '../src/crypto/vault'

await resetDb()
const resume = normalizeResume({
  contact: { name: 'Backup Person', links: [] },
  experience: [{ title: 'Engineer', company: 'Example', start: '01/2024', current: true, bullets: ['Verified achievement'] }],
  education: [], skills: [{ group: 'Core', items: ['TypeScript'] }], languages: [], projects: [], certifications: [],
})
await db.resumes.put({ id: 'current', data: resume, createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z', revision: 1 })
await db.settings.bulkPut([
  { key: 'activeRegion', value: 'de' }, { key: 'groqKey', value: 'gsk_secret' },
  { key: 'adzunaAppId', value: 'secret-id' }, { key: 'adzunaAppKey', value: 'secret-key' },
])

const standard = await createStandardBackup()
assert.equal(standard.schemaVersion, 5)
assert.equal(standard.workspace.resumes[0].data.contact.name, 'Backup Person')
assert.equal(JSON.stringify(standard).includes('gsk_secret'), false)

const complete = await createCompleteEncryptedBackup('portable backup password')
assert.ok(complete.workspace.vault[0].credentials?.ct)
await db.settings.put({ key: 'sentinel', value: 'keep' })
await assert.rejects(importBackup(complete, 'wrong backup password'), /password/i)
assert.equal((await db.settings.get('sentinel'))?.value, 'keep')
await importBackup(complete, 'portable backup password')
assert.equal(await getVaultStatus(), 'unlocked')
assert.equal((await readSensitiveContent())?.canonicalResume?.data.contact.name, 'Backup Person')

await resetDb()
const v22 = await makeV22StandardEnvelope()
const migrated = await parseAndValidateBackup(v22)
assert.equal(migrated.schemaVersion, 5)
assert.equal(migrated.migration?.from, 'v2.2')
assert.equal(migrated.workspace.resumes[0].data.summary, 'Legacy profile')

const v22Encrypted = await makeV22EncryptedEnvelope()
await importBackup(v22Encrypted, 'legacy vault password')
assert.equal(await getVaultStatus(), 'unlocked')
assert.equal((await readSensitiveContent())?.canonicalResume?.data.summary, 'Encrypted legacy profile')

console.log('v23-backup.test.ts: all tests passed')

async function makeV22StandardEnvelope() {
  const envelope = {
    format: 'klar-backup', schemaVersion: 4, klarVersion: '2.2.0',
    exportedAt: '2026-07-22T00:00:00.000Z', mode: 'standard',
    workspace: {
      settings: [], profiles: [{
        id: 'legacy', createdAt: '2026-01-01T00:00:00.000Z', summary: 'Legacy profile',
        titles: [{ title: 'Engineer' }], skills: [{ name: 'TypeScript' }], domains: [],
        education: [], languages: [], certifications: [],
      }],
      preferences: [], jobs: [], matches: [], tracked: [], dashboard: [], vectors: [], savedSearches: [], vault: [],
    },
    integrity: { algorithm: 'SHA-256', digest: '' },
  }
  envelope.integrity.digest = await digest(envelope)
  return envelope
}

async function makeV22EncryptedEnvelope() {
  const password = 'legacy vault password'
  const content = await encryptJSON({
    version: 1,
    profiles: [{
      id: 'legacy', createdAt: '2026-01-01T00:00:00.000Z', summary: 'Encrypted legacy profile',
      titles: [{ title: 'Engineer' }], skills: [{ name: 'TypeScript' }], domains: [],
      education: [], languages: [], certifications: [],
    }],
    preferences: [], jobs: [], matches: [], dashboard: [], tracked: [], vectors: [], savedSearches: [],
    packets: [], originalFiles: [], knowledgeBase: [],
  }, password)
  const credentials = await encryptJSON({ version: 1, groqKey: 'encrypted-secret' }, password)
  const envelope = {
    format: 'klar-backup', schemaVersion: 4, klarVersion: '2.2.0',
    exportedAt: '2026-07-22T00:00:00.000Z', mode: 'complete-encrypted',
    workspace: {
      settings: [], profiles: [], preferences: [], jobs: [], matches: [], tracked: [], dashboard: [], vectors: [], savedSearches: [],
      vault: [{ id: 'primary', version: 1, content, credentials, createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z' }],
    },
    integrity: { algorithm: 'SHA-256', digest: '' },
  }
  envelope.integrity.digest = await digest(envelope)
  return envelope
}

async function digest(value: object): Promise<string> {
  const { integrity: _integrity, ...payload } = value as Record<string, unknown>
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function resetDb() {
  db.close(); await db.delete(); await db.open()
}