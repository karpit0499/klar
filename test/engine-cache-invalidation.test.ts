// Regression: the in-memory AI engine copy in src/llm/provider.ts must not
// outlive the settings row it mirrors. Delete all local data and a backup
// restore both replace db.settings without a page reload; before the fix, chat
// completions, key checks, matching and the engine editor kept using the old
// engine, so a wiped workspace could still call a deleted custom endpoint.
import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db, wipeAllData } from '../src/db/db'
import { createStandardBackup, importBackup } from '../src/backup/backup'
import {
  DEFAULT_ENGINE,
  invalidateEngineCache,
  loadEngineSettings,
  saveEngineSettings,
  type EngineSettings,
} from '../src/llm/provider'

const ENGINE_KEY = 'llmEngine.v25'
const CUSTOM: EngineSettings = {
  baseUrl: 'https://models.example/v1', model: 'm', fastModel: 'm', requiresKey: true, fastMatching: false,
}
const RESTORED: EngineSettings = {
  baseUrl: 'https://restored.example/v1', model: 'r', fastModel: 'r-fast', requiresKey: false, fastMatching: true,
}

// --- Delete all local data (Settings) -----------------------------------------

await saveEngineSettings(CUSTOM)
assert.deepEqual(await loadEngineSettings(), CUSTOM)
await wipeAllData()
assert.equal(await db.settings.count(), 0)
// The stale read. db.ts cannot import provider.ts (provider.ts imports db.ts),
// so wiping the store cannot reach the cache by itself.
assert.deepEqual(await loadEngineSettings(), CUSTOM)

// The fix: SettingsStep.wipe() drops the cache once the stores are wiped, before
// the app re-renders.
const wipe = source('src/ui/SettingsStep.tsx').match(/async function wipe\(\) \{([\s\S]*?)\n {2}\}/)?.[1] ?? ''
const wiped = wipe.indexOf('await wipeAllData()')
const invalidated = wipe.indexOf('invalidateEngineCache()')
assert.ok(wiped >= 0, 'SettingsStep.wipe() wipes every store')
assert.ok(
  invalidated > wiped && invalidated < wipe.indexOf('onReset()'),
  'SettingsStep.wipe() invalidates the engine cache after wiping and before onReset()',
)
invalidateEngineCache()
assert.deepEqual(await loadEngineSettings(), DEFAULT_ENGINE)

// --- Backup restore (onboarding and Safety center both call importBackup) -----

// A backup made while Klar still used the default engine.
const defaultBackup = await createStandardBackup()
assert.equal(defaultBackup.workspace.settings.some((row) => row.key === ENGINE_KEY), false)

// The stale read: replacing db.settings the way importBackup's transaction does
// leaves the cached engine behind.
await saveEngineSettings(CUSTOM)
await db.transaction('rw', db.settings, async () => {
  await db.settings.clear()
  await db.settings.bulkPut(defaultBackup.workspace.settings)
})
assert.deepEqual(await loadEngineSettings(), CUSTOM)

// The fix: importBackup() itself drops the cache once its transaction commits.
await saveEngineSettings(CUSTOM)
await importBackup(defaultBackup)
assert.equal(await db.settings.get(ENGINE_KEY), undefined)
assert.deepEqual(await loadEngineSettings(), DEFAULT_ENGINE)

// A backup that carries its own engine replaces the cached one.
await saveEngineSettings(RESTORED)
const restoredBackup = await createStandardBackup()
await saveEngineSettings(CUSTOM)
assert.deepEqual(await loadEngineSettings(), CUSTOM)
await importBackup(restoredBackup)
assert.deepEqual(await loadEngineSettings(), RESTORED)

console.log('engine-cache-invalidation.test.ts: all tests passed')

function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8')
}
