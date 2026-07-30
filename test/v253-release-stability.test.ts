import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { strFromU8, unzipSync } from 'fflate'
import { db } from '../src/db/db'
import {
  buildChatRequestBody,
  supportsStrictJson,
} from '../src/llm/groq'
import {
  INTERVIEW_OUTPUT,
  JD_REQUIREMENTS_OUTPUT,
  PROFILE_OUTPUT,
  RERANK_OUTPUT,
  RESUME_EXTRACTION_OUTPUT,
  TAILORING_OUTPUT,
  type JsonSchema,
} from '../src/llm/jsonSchemas'
import {
  DEFAULT_ENGINE,
  type EngineSettings,
} from '../src/llm/provider'
import { applicationPacketZip } from '../src/packets/download'
import { loadPacket, openPacket, updatePacket } from '../src/packets/store'
import { newPacket } from '../src/packets/types'
import { normalizeResume } from '../src/resume/canonical'
import type { FlexibleWorkPreferences, NormalizedJob } from '../src/types'
import {
  createStandardBackup,
  importBackup,
  parseAndValidateBackup,
} from '../src/backup/backup'
import {
  disableVault,
  enableVault,
  readSensitiveContent,
} from '../src/crypto/vault'
import { isNewerRelease } from '../src/lib/version'

assert.equal(isNewerRelease('2.5.3'), false)
assert.equal(isNewerRelease('2.5.3.1'), false)
assert.equal(isNewerRelease('2.5.3.2'), false)
assert.equal(isNewerRelease('2.5.3.3'), false)
assert.equal(isNewerRelease('2.5.3.4'), false)
assert.equal(isNewerRelease('2.5.3.5'), false)
assert.equal(isNewerRelease('2.5.2'), false)
assert.equal(isNewerRelease('2.5.4'), false)
assert.equal(isNewerRelease('2.5.5'), false)
assert.equal(isNewerRelease('2.5.6'), true)
assert.equal(isNewerRelease('2.6.0'), true)
assert.equal(isNewerRelease('not-a-release'), false)

const schemas = [
  TAILORING_OUTPUT,
  JD_REQUIREMENTS_OUTPUT,
  RERANK_OUTPUT,
  PROFILE_OUTPUT,
  RESUME_EXTRACTION_OUTPUT,
  INTERVIEW_OUTPUT,
]
for (const output of schemas) assertStrictObjects(output.schema, output.name)

const strictBody = buildChatRequestBody(DEFAULT_ENGINE, {
  system: 'system',
  user: 'user',
  jsonSchema: TAILORING_OUTPUT,
  maxTokens: 1234,
})
assert.equal(supportsStrictJson(DEFAULT_ENGINE, DEFAULT_ENGINE.model), true)
assert.equal(strictBody.max_completion_tokens, 1234)
assert.equal(strictBody.max_tokens, undefined)
assert.equal(strictBody.reasoning_effort, 'low')
assert.deepEqual(strictBody.response_format, {
  type: 'json_schema',
  json_schema: {
    name: TAILORING_OUTPUT.name,
    strict: true,
    schema: TAILORING_OUTPUT.schema,
  },
})

const customEngine: EngineSettings = {
  ...DEFAULT_ENGINE,
  baseUrl: 'https://compatible.example/v1',
}
const compatibleBody = buildChatRequestBody(customEngine, {
  system: 'system',
  user: 'user',
  jsonSchema: TAILORING_OUTPUT,
  maxTokens: 900,
})
assert.equal(compatibleBody.max_tokens, 900)
assert.equal(compatibleBody.max_completion_tokens, undefined)
assert.deepEqual(compatibleBody.response_format, { type: 'json_object' })

await resetDb()
const job = sampleJob()
const resume = normalizeResume({
  contact: { name: 'Packet Person', email: 'person@example.com', links: [] },
  summary: 'Data engineer',
  experience: [{
    title: 'Data Engineer',
    company: 'Example GmbH',
    start: '01/2024',
    current: true,
    bullets: ['Built reliable data pipelines'],
  }],
  education: [],
  skills: [{ group: 'Core', items: ['TypeScript'] }],
  languages: [{ lang: 'English', level: 'C1' }],
  projects: [],
  certifications: [],
})

const zip = unzipSync(new Uint8Array(await (
  await applicationPacketZip(resume, 'en', 'klar-example', 'Dear team,\nHello.')
).arrayBuffer()))
assert.ok(zip['klar-example-en.docx']?.length > 100)
assert.equal(
  strFromU8(zip['klar-example-cover-letter-en.txt']),
  'Dear team,\nHello.',
)

const packet = newPacket('career', job)
await db.packets.put(packet)
await Promise.all(
  Array.from({ length: 30 }, (_, index) =>
    updatePacket(packet.id, (draft) => {
      draft.notes += String(index % 10)
    }),
  ),
)
assert.equal((await loadPacket(packet.id))?.notes.length, 30)

const preferences: FlexibleWorkPreferences = {
  employment: ['part_time'],
  roleFamilies: ['cashier'],
  workplaces: ['supermarket'],
  locations: [{ city: 'Berlin', radius_km: 10 }],
  contact: { name: 'Private Person', email: 'private@example.com' },
}
await db.flexibleSearches.put({
  id: 'flex-1',
  name: 'Berlin',
  preferences,
  seenIdentities: [],
  createdAt: '2026-07-26T10:00:00.000Z',
  updatedAt: '2026-07-26T10:00:00.000Z',
})
await db.flexibleCache.put({
  queryKey: 'cache-1',
  opportunities: [job],
  firstSeenAt: '2026-07-26T10:00:00.000Z',
  lastVerifiedAt: '2026-07-26T10:00:00.000Z',
  expiresAt: '2026-07-27T10:00:00.000Z',
})
await db.connectorHealth.put({
  connectorId: 'fixture',
  consecutiveFailures: 0,
  successes: 1,
  failures: 0,
  schemaFailures: 0,
  killed: false,
})

const backup = await createStandardBackup()
assert.equal(backup.schemaVersion, 6)
assert.equal(backup.workspace.flexibleSearches.length, 1)
assert.equal(backup.workspace.flexibleCache.length, 1)
assert.equal(backup.workspace.connectorHealth.length, 1)
assert.equal(backup.workspace.packets.length, 1)
await resetDb()
await importBackup(backup)
assert.equal((await db.flexibleSearches.get('flex-1'))?.preferences.contact?.name, 'Private Person')
assert.equal(await db.flexibleCache.count(), 1)
assert.equal(await db.connectorHealth.count(), 1)
assert.equal((await db.packets.get(packet.id))?.notes.length, 30)

// Existing schema-5 backups remain importable, even though those releases did
// not know about the new arrays.
const old = structuredClone(backup) as unknown as Record<string, unknown>
const oldWorkspace = old.workspace as Record<string, unknown>
delete oldWorkspace.flexibleSearches
delete oldWorkspace.flexibleCache
delete oldWorkspace.connectorHealth
delete oldWorkspace.packets
old.schemaVersion = 5
old.integrity = { algorithm: 'SHA-256', digest: await digest(old) }
const migrated = await parseAndValidateBackup(old)
assert.equal(migrated.schemaVersion, 6)
assert.equal(migrated.migration?.from, 'v2.3-v2.5')

await resetDb()
await db.flexibleSearches.put({
  id: 'vault-flex',
  name: 'Encrypted Berlin',
  preferences,
  createdAt: '2026-07-26T10:00:00.000Z',
  updatedAt: '2026-07-26T10:00:00.000Z',
})
await openPacket('career', job)
await enableVault(
  'a sufficiently long vault passphrase',
  { unrecoverablePassphrase: true, backupOffered: true },
)
assert.equal(await db.flexibleSearches.count(), 0)
assert.equal(await db.packets.count(), 0)
assert.equal((await readSensitiveContent())?.flexibleSearches[0]?.id, 'vault-flex')
assert.equal((await readSensitiveContent())?.packets[0]?.jobId, job.id)
await disableVault()
assert.equal(await db.flexibleSearches.count(), 1)
assert.equal(await db.packets.count(), 1)

console.log('v253-release-stability.test.ts: all tests passed')

function assertStrictObjects(schema: JsonSchema, path: string): void {
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, `${path} must be closed`)
    const properties = schema.properties as Record<string, JsonSchema>
    assert.deepEqual(
      [...(schema.required as string[])].sort(),
      Object.keys(properties).sort(),
      `${path} must require every property`,
    )
    for (const [key, child] of Object.entries(properties)) {
      assertStrictObjects(child, `${path}.${key}`)
    }
  }
  if (schema.type === 'array') {
    assertStrictObjects(schema.items as JsonSchema, `${path}[]`)
  }
  if (Array.isArray(schema.anyOf)) {
    for (const [index, child] of (schema.anyOf as JsonSchema[]).entries()) {
      assertStrictObjects(child, `${path}.anyOf[${index}]`)
    }
  }
}

function sampleJob(): NormalizedJob {
  return {
    id: 'job-1',
    source: 'arbeitnow',
    source_id: 'job-1',
    title: 'Data Engineer',
    company: 'Example GmbH',
    location: { city: 'Berlin', country: 'DE', remote: false },
    description: 'Build reliable data pipelines.',
    url: 'https://example.com/job',
    salary: {},
    tags: [],
    fetched_at: '2026-07-26T10:00:00.000Z',
  }
}

async function digest(value: object): Promise<string> {
  const { integrity: _integrity, ...payload } = value as Record<string, unknown>
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function resetDb(): Promise<void> {
  db.close()
  await db.delete()
  await db.open()
}