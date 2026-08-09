#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const testDirectory = path.join(root, 'test')
const files = (await readdir(testDirectory))
  .filter((name) => name.endsWith('.test.ts'))
  .sort((left, right) => left.localeCompare(right))

if (files.length === 0) throw new Error('No test/*.test.ts files were found.')

for (const name of files) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', path.join(testDirectory, name)],
    { cwd: root, env: process.env, stdio: 'inherit', shell: false },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
