#!/usr/bin/env node
import { generateKeyPairSync } from 'node:crypto'
import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.env.CI !== 'true') {
  throw new Error('This disposable trust key may only be created in CI.')
}

const root = fileURLToPath(new URL('../..', import.meta.url))
const destination = path.join(
  root,
  'desktop',
  'resources',
  'trust',
  'model-signing-public.pem',
)
const { publicKey } = generateKeyPairSync('ed25519')
const pem = publicKey.export({ type: 'spki', format: 'pem' })

await mkdir(path.dirname(destination), { recursive: true })
await writeFile(destination, pem, { encoding: 'utf8', mode: 0o600 })
console.log('Created a disposable public model-trust key for CI packaging.')
