#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FuseV1Options,
  getCurrentFuseWire,
} from '@electron/fuses'

const root = fileURLToPath(new URL('../..', import.meta.url))

// Fuse bytes are the ASCII values for "0" and "1". @electron/fuses 1.8.0
// intentionally returns these raw states from getCurrentFuseWire().
const DISABLED = '0'.charCodeAt(0)
const ENABLED = '1'.charCodeAt(0)
const ELECTRON_43_FUSE_COUNT = 9
const WASM_TRAP_HANDLERS_INDEX = 8

const expected = [
  {
    name: 'RunAsNode',
    index: FuseV1Options.RunAsNode,
    state: DISABLED,
  },
  {
    name: 'EnableCookieEncryption',
    index: FuseV1Options.EnableCookieEncryption,
    state: ENABLED,
  },
  {
    name: 'EnableNodeOptionsEnvironmentVariable',
    index: FuseV1Options.EnableNodeOptionsEnvironmentVariable,
    state: DISABLED,
  },
  {
    name: 'EnableNodeCliInspectArguments',
    index: FuseV1Options.EnableNodeCliInspectArguments,
    state: DISABLED,
  },
  {
    name: 'EnableEmbeddedAsarIntegrityValidation',
    index: FuseV1Options.EnableEmbeddedAsarIntegrityValidation,
    state: ENABLED,
  },
  {
    name: 'OnlyLoadAppFromAsar',
    index: FuseV1Options.OnlyLoadAppFromAsar,
    state: ENABLED,
  },
  {
    name: 'LoadBrowserProcessSpecificV8Snapshot',
    index: FuseV1Options.LoadBrowserProcessSpecificV8Snapshot,
    state: DISABLED,
  },
  {
    name: 'GrantFileProtocolExtraPrivileges',
    index: FuseV1Options.GrantFileProtocolExtraPrivileges,
    state: ENABLED,
  },
  {
    name: 'WasmTrapHandlers',
    index: WASM_TRAP_HANDLERS_INDEX,
    state: ENABLED,
  },
]

function defaultPackagedExecutable() {
  if (process.platform === 'darwin') {
    return path.join(
      root,
      'release',
      'desktop',
      `mac-${process.arch}`,
      'Klar Developer Preview.app',
      'Contents',
      'MacOS',
      'Klar Developer Preview',
    )
  }
  if (process.platform === 'win32') {
    return path.join(
      root,
      'release',
      'desktop',
      'win-unpacked',
      'Klar Developer Preview.exe',
    )
  }
  return path.join(
    root,
    'release',
    'desktop',
    'linux-unpacked',
    'klar',
  )
}

function stateName(state) {
  if (state === ENABLED) return 'enabled'
  if (state === DISABLED) return 'disabled'
  return `unexpected-byte-${state}`
}

export async function verifyPackagedFuses(executablePath) {
  const resolved = path.resolve(executablePath)
  const wire = await getCurrentFuseWire(resolved)
  assert.equal(wire.version, '1', 'Electron Fuse Wire v1 is required.')

  const fuseIndexes = Object.keys(wire)
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((left, right) => left - right)
  assert.deepEqual(
    fuseIndexes,
    Array.from({ length: ELECTRON_43_FUSE_COUNT }, (_, index) => index),
    'Electron 43.2.0 must expose exactly the nine reviewed Fuse Wire v1 switches.',
  )

  const states = {}
  for (const item of expected) {
    assert.equal(
      wire[item.index],
      item.state,
      `${item.name} must be ${stateName(item.state)}.`,
    )
    states[item.name] = stateName(wire[item.index])
  }

  return {
    executable: resolved,
    version: wire.version,
    states,
  }
}

const isCommandLine = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isCommandLine) {
  const executable = process.argv[2]
    ?? process.env.KLAR_PACKAGED_EXECUTABLE
    ?? defaultPackagedExecutable()
  console.log(JSON.stringify(await verifyPackagedFuses(executable), null, 2))
}
