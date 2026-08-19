import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const PREVIEW_URL = 'http://127.0.0.1:4173/'
const preview = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
)

let previewOutput = ''
preview.stdout.on('data', (chunk) => { previewOutput += chunk.toString() })
preview.stderr.on('data', (chunk) => { previewOutput += chunk.toString() })

async function waitForPreview() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (preview.exitCode !== null) {
      throw new Error(`Vite preview exited before it was ready.\n${previewOutput}`)
    }
    try {
      const response = await fetch(PREVIEW_URL, { cache: 'no-store' })
      if (response.ok) return
    } catch {
      // The local socket is expected to refuse connections during startup.
    }
    await delay(100)
  }
  throw new Error(`Vite preview did not become ready.\n${previewOutput}`)
}

async function stopPreview() {
  if (preview.exitCode !== null) return
  preview.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => preview.once('exit', resolve)),
    delay(2_000),
  ])
  if (preview.exitCode === null) preview.kill('SIGKILL')
}

let status = 1
try {
  await waitForPreview()
  status = await new Promise((resolve, reject) => {
    const test = spawn(process.execPath, ['qa/e2e.mjs'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
    test.once('error', reject)
    test.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Browser QA ended with signal ${signal}.`))
      else resolve(code ?? 1)
    })
  })
} finally {
  await stopPreview()
}

process.exitCode = status
