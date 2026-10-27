// Run with: npx tsx test/release-flag-fallbacks.test.ts
//
// Two release flags in src/lib/appFlags.ts promise a working, honest fallback:
//   customEngine off → hosted Groq defaults only
//   packets      off → nothing is persisted; the drawer is session-only
// Both were shown in Settings and read nowhere, so switching them off did
// nothing. This suite proves each fallback at the layer every caller goes
// through, and that switching a flag back on restores the saved state untouched.
import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { db } from '../src/db/db'
import { DEFAULT_APP_FLAGS, saveAppFlags } from '../src/lib/appFlags'
import { chatComplete, pingGroqKey } from '../src/llm/groq'
import {
  DEFAULT_ENGINE,
  effectiveEngine,
  listEngineModels,
  loadEngineSettings,
  loadStoredEngineSettings,
  probeEngineAccess,
  saveEngineSettings,
  type EngineSettings,
} from '../src/llm/provider'
import { OpenAiCompatibleCloudProvider } from '../src/ai/cloudAdapter'
import {
  beginGeneration,
  clearSessionPackets,
  deletePacket,
  endGeneration,
  listPackets,
  loadPacket,
  openPacket,
  pushPacketVersion,
  recordPacketExport,
  updatePacket,
} from '../src/packets/store'
import { packetId } from '../src/packets/types'
import { enableVault, lockVault, readSensitiveContent, unlockVault } from '../src/crypto/vault'
import { makeJob } from '../src/sources/normalize'
import { LocaleProvider } from '../src/i18n/LocaleProvider'
import { translations, type TranslationKey } from '../src/i18n/translations'
import { EngineSettingsCard } from '../src/ui/EngineSettings'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = (file: string) => readFileSync(path.join(root, file), 'utf8')

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Rendered copy may come out in either locale, depending on the host. */
function includesCopy(markup: string, key: TranslationKey): boolean {
  return markup.includes(translations.en[key]) || markup.includes(translations.de[key])
}

const custom: EngineSettings = {
  baseUrl: 'https://models.example/v1',
  model: 'custom-large',
  fastModel: 'custom-small',
  requiresKey: false,
  fastMatching: true,
}

// Existing installs keep today's behaviour: both features stay on by default.
assert.equal(DEFAULT_APP_FLAGS.customEngine, true, 'custom engines stay allowed by default')
assert.equal(DEFAULT_APP_FLAGS.packets, true, 'packets stay persisted by default')

// ===========================================================================
// 1. customEngine — the pure resolver
// ===========================================================================
{
  assert.equal(
    effectiveEngine(custom, { customEngine: true }),
    custom,
    'flag on: the saved engine is used as-is',
  )
  const off = effectiveEngine(custom, { customEngine: false })
  assert.deepEqual(
    off,
    { ...DEFAULT_ENGINE, fastMatching: true },
    'flag off: hosted Groq endpoint and models; only the fast-matching choice is kept',
  )
  assert.deepEqual(
    effectiveEngine({ ...custom, fastMatching: false }, { customEngine: false }),
    DEFAULT_ENGINE,
    'flag off without fast matching is exactly the default engine',
  )
}

// ===========================================================================
// 2. customEngine — stored vs. effective settings
// ===========================================================================
{
  await saveEngineSettings(custom)
  assert.deepEqual(await loadEngineSettings(), custom, 'flag on: requests resolve the saved engine')

  await saveAppFlags({ customEngine: false })
  const effective = await loadEngineSettings()
  assert.equal(effective.baseUrl, DEFAULT_ENGINE.baseUrl, 'flag off: requests resolve the hosted endpoint')
  assert.equal(effective.model, DEFAULT_ENGINE.model)
  assert.equal(effective.fastModel, DEFAULT_ENGINE.fastModel)
  assert.equal(effective.requiresKey, true, 'the hosted default still needs a key')
  assert.equal(effective.fastMatching, true, 'the cost-control choice survives')
  assert.deepEqual(
    await loadStoredEngineSettings(),
    custom,
    'flag off: the Settings editor still sees the saved engine',
  )
  const row = await db.settings.get('llmEngine.v25')
  assert.deepEqual(row?.value, custom, 'flag off: the saved engine is left untouched in storage')

  await saveAppFlags({ customEngine: true })
  assert.deepEqual(await loadEngineSettings(), custom, 'flag back on: the saved engine returns')
}

// ===========================================================================
// 3. customEngine — no request and no key ever reaches the disabled endpoint
// ===========================================================================
const originalFetch = globalThis.fetch
const seen: { url: string; init?: RequestInit }[] = []
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input)
  seen.push({ url, init })
  return url.endsWith('/models')
    ? jsonResponse({ data: [{ id: 'served-model' }] })
    : jsonResponse({ choices: [{ message: { content: 'ok' } }] })
}) as typeof fetch

try {
  const chat = { system: 'Answer briefly.', user: 'Say ok.', apiKey: 'gsk_flag_test', maxTokens: 50 }

  // Control: with the flag on, the saved custom engine really is called.
  seen.length = 0
  assert.equal(await chatComplete(chat), 'ok')
  assert.equal(seen[0].url, 'https://models.example/v1/chat/completions', 'flag on: the custom endpoint is called')
  assert.equal(JSON.parse(String(seen[0].init?.body)).model, 'custom-large')

  await saveAppFlags({ customEngine: false })
  seen.length = 0

  assert.equal(await chatComplete(chat), 'ok')
  assert.equal(
    seen[0].url,
    'https://api.groq.com/openai/v1/chat/completions',
    'flag off: chat completions go to the hosted default',
  )
  const body = JSON.parse(String(seen[0].init?.body)) as Record<string, unknown>
  assert.equal(body.model, DEFAULT_ENGINE.model, 'flag off: the default model is requested')
  assert.equal(body.max_completion_tokens, 50, 'flag off: the Groq request format is used')

  await chatComplete({ ...chat, fast: true })
  assert.equal(
    JSON.parse(String(seen[1].init?.body)).model,
    DEFAULT_ENGINE.fastModel,
    'flag off: high-volume work uses the default fast model',
  )

  const pinged = await pingGroqKey('gsk_flag_test')
  assert.deepEqual(pinged, { ok: true })
  assert.equal(seen[2].url, 'https://api.groq.com/openai/v1/models', 'flag off: the key check goes to the default')

  // Callers that pass the saved settings explicitly are routed the same way.
  assert.deepEqual(await listEngineModels(custom, 'gsk_flag_test'), ['served-model'])
  assert.equal(seen[3].url, 'https://api.groq.com/openai/v1/models', 'flag off: model listing skips the custom endpoint')

  let probedUrl = ''
  const probed = await probeEngineAccess(custom, 'gsk_flag_test', {
    fetcher: (async (input: string | URL | Request) => {
      probedUrl = String(input)
      return jsonResponse({ data: [] })
    }) as typeof fetch,
  })
  assert.deepEqual(probed, { ok: true })
  assert.equal(probedUrl, 'https://api.groq.com/openai/v1/models', 'flag off: the key is never offered to the custom endpoint')

  // The provider-neutral cloud adapter resolves the same effective engine.
  const healthChecked: EngineSettings[] = []
  const cloud = new OpenAiCompatibleCloudProvider({
    loadApiKey: async () => 'gsk_flag_test',
    probeAccess: async (settings) => {
      healthChecked.push(settings)
      return { ok: true }
    },
  })
  const health = await cloud.health()
  assert.equal(health.status, 'ready')
  if (health.status === 'ready') assert.equal(health.modelId, DEFAULT_ENGINE.model)
  assert.equal(healthChecked[0].baseUrl, DEFAULT_ENGINE.baseUrl, 'flag off: the cloud adapter uses the default')

  assert.ok(
    seen.every((request) => !request.url.includes('models.example')),
    'flag off: not one request reached the custom endpoint',
  )
} finally {
  globalThis.fetch = originalFetch
  await saveAppFlags({ customEngine: true })
}

// Every request path resolves `loadEngineSettings()`; only the editor may read
// the stored copy, so no future caller can bypass the flag by accident.
{
  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`
      if (entry.isDirectory()) walk(relative)
      else if (/\.tsx?$/.test(entry.name)) files.push(relative)
    }
  }
  walk('src')
  const storedReaders = files.filter((file) => source(file).includes('loadStoredEngineSettings')).sort()
  assert.deepEqual(
    storedReaders,
    ['src/llm/provider.ts', 'src/ui/EngineSettings.tsx'],
    'only the Settings editor reads the stored engine directly',
  )
}

// ===========================================================================
// 4. customEngine — Settings says so, and keeps the saved values read-only
// ===========================================================================
{
  const render = (customEngine?: boolean) =>
    renderToStaticMarkup(h(LocaleProvider, null, h(EngineSettingsCard, { customEngine })))

  const off = render(false)
  assert.ok(includesCopy(off, 'settings.engine.customOff'), 'flag off: the card explains that defaults are in use')
  for (const id of ['engine-base-url', 'engine-model', 'engine-fast-model']) {
    assert.match(off, new RegExp(`<input[^>]*id="${id}"[^>]*disabled=""`), `flag off: ${id} is read-only`)
  }
  const checkboxes = off.match(/<input type="checkbox"[^>]*>/g) ?? []
  assert.equal(checkboxes.length, 2)
  assert.match(checkboxes[0], /disabled=""/, 'flag off: the key requirement belongs to the saved endpoint')
  assert.doesNotMatch(checkboxes[1], /disabled=""/, 'flag off: fast matching still applies to the defaults')
  assert.match(
    off,
    /<button[^>]*disabled=""[^>]*>(List available models|Verfügbare Modelle anzeigen)<\/button>/,
    'flag off: the disabled endpoint is not offered for model listing',
  )

  const on = render()
  assert.ok(!includesCopy(on, 'settings.engine.customOff'), 'flag on: no notice')
  assert.doesNotMatch(on, /disabled=""/, 'flag on: the editor is fully editable')

  const settings = source('src/ui/SettingsStep.tsx')
  assert.match(settings, /<EngineSettingsCard apiKey=\{apiKey\} customEngine=\{flags\.customEngine\} \/>/)
  assert.match(settings, /<FeatureFlagsCard onChange=\{setFlags\} \/>/, 'the engine card follows the flag live')
}

// ===========================================================================
// 5. packets — session-only, never persisted
// ===========================================================================
const job = makeJob({
  source: 'greenhouse', source_id: 'flag-a', title: 'Data Analyst', company: 'Datenhaus',
  location: { country: 'DE', city: 'Berlin', remote: false },
  description: 'SQL and Tableau', url: 'https://example.test/a',
})
const sessionJob = makeJob({
  source: 'greenhouse', source_id: 'flag-b', title: 'BI Developer', company: 'Zahlenwerk',
  location: { country: 'DE', city: 'Hamburg', remote: false },
  description: 'Power BI', url: 'https://example.test/b',
})
const flexJob = makeJob({
  source: 'fabric', source_id: 'flag-f', title: 'Aushilfe Kasse', company: 'REWE Group',
  location: { country: 'DE', city: 'Berlin', remote: false },
  description: 'Kasse', url: 'https://jobs.rewe-group.com/flag',
})
const persistedId = packetId('career', job.id)
const sessionId = packetId('career', sessionJob.id)
const flexId = packetId('flexible', flexJob.id)

{
  // Control: with the flag on, a packet is written to storage.
  await openPacket('career', job)
  await updatePacket(persistedId, (row) => { row.notes = 'persisted notes' })
  assert.equal((await db.packets.get(persistedId))?.notes, 'persisted notes', 'flag on: packets are persisted')

  await saveAppFlags({ packets: false })

  assert.equal(await loadPacket(persistedId), null, 'flag off: stored packets are not read')

  const opened = await openPacket('career', sessionJob)
  assert.equal(opened.id, sessionId)
  await updatePacket(sessionId, (row) => { row.notes = 'session notes' })
  await beginGeneration(sessionId, { stage: 'resume', language: 'en', startedAt: new Date().toISOString() })
  assert.equal((await loadPacket(sessionId))?.generation?.stage, 'resume', 'flag off: generation state works in memory')
  await endGeneration(sessionId)
  await pushPacketVersion(sessionId, 'before-edit')
  await recordPacketExport(sessionId, { at: new Date().toISOString(), format: 'pdf', artifact: 'resume' })

  const session = await loadPacket(sessionId)
  assert.equal(session?.notes, 'session notes', 'flag off: edits are kept for the session')
  assert.equal(session?.generation, undefined)
  assert.equal(session?.versions.length, 1)
  assert.equal(session?.exportHistory.length, 1)

  const reopened = await openPacket('career', { ...sessionJob, title: 'BI Developer (m/w/d)' })
  assert.equal(reopened.notes, 'session notes', 'flag off: reopening the drawer in this tab keeps the work')
  assert.equal(reopened.job.title, 'BI Developer (m/w/d)', 'flag off: the job snapshot still refreshes')

  // The resume-free Flexible drawer uses the same store.
  await openPacket('flexible', flexJob)
  await updatePacket(flexId, (row) => { row.flexible = { message: 'Hallo', availability: 'Samstags' } })
  assert.equal((await loadPacket(flexId))?.flexible?.message, 'Hallo')

  // A returned row is a copy, exactly like a real store's.
  const copy = await loadPacket(sessionId)
  copy!.notes = 'mutated outside the store'
  assert.equal((await loadPacket(sessionId))?.notes, 'session notes', 'flag off: callers cannot mutate the session row')

  assert.deepEqual(
    (await listPackets()).map((row) => row.id).sort(),
    [sessionId, flexId].sort(),
    'flag off: only this session’s packets are listed',
  )

  await deletePacket(persistedId)

  assert.equal(await db.packets.count(), 1, 'flag off: nothing new reached the packets table')
  assert.equal(await db.packets.get(sessionId), undefined)
  assert.equal(await db.packets.get(flexId), undefined)
  assert.equal(
    (await db.packets.get(persistedId))?.notes,
    'persisted notes',
    'flag off: the stored packet is untouched, even by a delete',
  )
}

// The encrypted vault is never touched either, so a locked vault cannot block
// a session-only drawer.
{
  const passphrase = 'a-very-long-passphrase'
  await saveAppFlags({ packets: true })
  await enableVault(passphrase, { unrecoverablePassphrase: true, backupOffered: true })
  assert.equal(
    (await readSensitiveContent())?.packets.find((row) => row.id === persistedId)?.notes,
    'persisted notes',
    'control: the stored packet moved into the vault',
  )

  await saveAppFlags({ packets: false })
  await updatePacket(sessionId, (row) => { row.notes = 'still session only' })
  assert.equal((await loadPacket(sessionId))?.notes, 'still session only')
  assert.deepEqual(
    (await readSensitiveContent())?.packets.map((row) => row.id),
    [persistedId],
    'flag off: session packets never enter the vault',
  )

  lockVault()
  const whileLocked = await openPacket('career', sessionJob)
  assert.equal(whileLocked.notes, 'still session only', 'flag off: a locked vault does not block the drawer')

  await saveAppFlags({ packets: true })
  await assert.rejects(loadPacket(persistedId), /locked/i, 'control: flag on, a locked vault still guards packets')

  await unlockVault(passphrase)
  assert.equal(
    (await loadPacket(persistedId))?.notes,
    'persisted notes',
    'flag back on: the stored packet returns unchanged',
  )
  assert.equal(await loadPacket(sessionId), null, 'flag back on: session packets were never saved')
  assert.equal(await loadPacket(flexId), null)
}

// Settings › Delete all local data also forgets session-only packets.
{
  await saveAppFlags({ packets: false })
  const latest = makeJob({
    source: 'greenhouse', source_id: 'flag-c', title: 'Analyst', company: 'Firma',
    location: { country: 'DE', city: 'Köln', remote: false },
    description: 'Excel', url: 'https://example.test/c',
  })
  await openPacket('career', latest)
  assert.ok(await loadPacket(packetId('career', latest.id)))
  clearSessionPackets()
  assert.equal(await loadPacket(packetId('career', latest.id)), null, 'clearing drops every session packet')
  assert.deepEqual(await listPackets(), [])
  assert.match(
    source('src/ui/SettingsStep.tsx'),
    /await wipeAllData\(\)\s+clearSessionPackets\(\)/,
    'delete-all clears the session store too',
  )
  await saveAppFlags({ packets: true })
}

// The drawer stops promising that anything is saved.
{
  const bundle = source('src/ui/ApplicationBundle.tsx')
  assert.match(
    bundle,
    /flags\.packets \? 'packet\.autosave' : 'packet\.sessionOnly'/,
    'flag off: the drawer says it is not saving',
  )
  for (const key of ['settings.engine.customOff', 'packet.sessionOnly'] as const) {
    assert.ok(translations.en[key].trim() && translations.de[key].trim(), `${key} exists in both languages`)
    assert.notEqual(translations.de[key], translations.en[key], `${key} is translated`)
  }
}

console.log('release-flag-fallbacks.test.ts: all tests passed')
