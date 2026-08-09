#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import {
  access,
  mkdtemp,
  rm,
} from 'node:fs/promises'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { verifyPackagedFuses } from './fuse-verification.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const execFileAsync = promisify(execFile)

async function reserveLoopbackPort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  return address.port
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

async function stopDesktopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  if (await waitForExit(child, 5_000)) return
  child.kill('SIGKILL')
  await waitForExit(child, 5_000)
}

async function launchOverCdp({ executable, profile }) {
  const port = await reserveLoopbackPort()
  const launchOutput = []
  const child = spawn(executable, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
  ], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      launchOutput.push(chunk)
      if (launchOutput.length > 100) launchOutput.shift()
    })
  }

  const endpoint = `http://127.0.0.1:${port}`
  try {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `Packaged app exited before DevTools was ready.\n${launchOutput.join('')}`,
        )
      }
      try {
        const response = await fetch(`${endpoint}/json/version`)
        if (response.ok) {
          const browser = await chromium.connectOverCDP(endpoint)
          const context = browser.contexts()[0]
          assert.ok(context, 'Packaged app exposed a default browser context.')
          const pageDeadline = Date.now() + 30_000
          while (Date.now() < pageDeadline) {
            const page = context.pages().find((candidate) =>
              candidate.url().startsWith('file:'))
            if (page) return { browser, child, page }
            await wait(100)
          }
          await browser.close()
          throw new Error('Packaged renderer did not open a file:// page.')
        }
      } catch (error) {
        if (
          error instanceof Error
          && error.message === 'Packaged renderer did not open a file:// page.'
        ) {
          throw error
        }
      }
      await wait(100)
    }
    throw new Error(
      `Timed out connecting to the packaged app over CDP.\n${launchOutput.join('')}`,
    )
  } catch (error) {
    await stopDesktopProcess(child)
    throw error
  }
}

async function runtimeChildPid(parentPid) {
  const { stdout } = await execFileAsync('ps', [
    '-axo',
    'pid=,ppid=,command=',
  ])
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)
    if (
      match
      && Number(match[2]) === parentPid
      && /(?:^|[/\\])llama-server(?:\s|$)/.test(match[3])
    ) {
      return Number(match[1])
    }
  }
  throw new Error(`No managed llama-server child found for PID ${parentPid}.`)
}

function defaultExecutable() {
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

const executable = path.resolve(
  process.env.KLAR_PACKAGED_EXECUTABLE ?? defaultExecutable(),
)
await access(executable)
const fuseVerification = await verifyPackagedFuses(executable)

const suppliedProfile = process.env.KLAR_SMOKE_PROFILE
const profile = suppliedProfile
  ? path.resolve(suppliedProfile)
  : await mkdtemp(path.join(os.tmpdir(), 'klar-packaged-smoke-'))

let browser
let desktopProcess
try {
  const launched = await launchOverCdp({ executable, profile })
  browser = launched.browser
  desktopProcess = launched.child
  const page = launched.page

  // Connecting over CDP can happen after the file document exists but before
  // its deferred module graph has rendered. Reloading during that narrow
  // window aborts main.mjs's awaited loadFile() and tests a navigation race
  // created by the harness rather than the packaged application's startup.
  // Prove the real first load rendered before reloading to capture its CSP
  // response headers below.
  await page.getByText('Find work your way.').waitFor({
    state: 'visible',
    timeout: 30_000,
  })

  const documentResponses = []
  page.on('response', (response) => {
    if (response.request().resourceType() === 'document') {
      documentResponses.push(response)
    }
  })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('Find work your way.').waitFor({
    state: 'visible',
    timeout: 30_000,
  })

  assert.equal(await page.title(), 'Klar — Job Tracker')
  assert.match(page.url(), /^file:/)
  assert.equal(
    await page.evaluate(() => window.klarDesktop?.desktop ?? false),
    true,
  )
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined')

  const systemInfo = await page.evaluate(() =>
    window.klarDesktop.system.getInfo())
  assert.equal(systemInfo.desktop, true)
  assert.equal(systemInfo.appVersion, '2.6.0')
  assert.equal(systemInfo.productName, 'Klar Developer Preview')
  assert.equal(systemInfo.runtime.phase, 'stopped')

  let realModel
  const artifactId = process.env.KLAR_MODEL_ARTIFACT_ID
  if (artifactId) {
    const startedAt = Date.now()
    const ready = await page.evaluate((id) =>
      window.klarDesktop.runtime.start(id), artifactId)
    assert.equal(ready.phase, 'ready')
    assert.ok(ready.adapters.includes('base'))

    const cancellationRequestId = 'smoke-cancel-0001'
    const cancellation = page.evaluate(async (requestId) => {
      try {
        await window.klarDesktop.ai.generate({
          requestId,
          capability: 'cover_letter',
          language: 'en',
          messages: [
            {
              role: 'system',
              content: 'Write a detailed but factual cover letter.',
            },
            {
              role: 'user',
              content: 'Write about a synthetic SQL analyst role. Do not use personal data.',
            },
          ],
          adapter: 'base',
          maxOutputTokens: 2_048,
          temperature: 0.2,
          timeoutMs: 120_000,
        })
        return { completed: true }
      } catch (error) {
        return {
          completed: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }, cancellationRequestId)
    await page.waitForTimeout(250)
    assert.equal(
      await page.evaluate((requestId) =>
        window.klarDesktop.ai.cancel(requestId), cancellationRequestId),
      true,
    )
    const cancellationResult = await cancellation
    assert.equal(cancellationResult.completed, false)
    assert.match(cancellationResult.message, /cancel/i)

    const generation = await page.evaluate(() =>
      window.klarDesktop.ai.generate({
        requestId: 'smoke-structured-0001',
        capability: 'structured_job_extraction',
        language: 'en',
        messages: [
          {
            role: 'system',
            content: 'Return only JSON that exactly matches the supplied schema.',
          },
          {
            role: 'user',
            content: 'Junior Data Analyst. SQL and Power BI are required. English posting.',
          },
        ],
        adapter: 'base',
        maxOutputTokens: 256,
        temperature: 0,
        timeoutMs: 120_000,
        jsonSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            required_skills: {
              type: 'array',
              items: { type: 'string' },
            },
            language: { type: 'string', enum: ['en', 'de'] },
          },
          required: ['title', 'required_skills', 'language'],
          additionalProperties: false,
        },
      }))
    assert.equal(generation.providerId, 'klar-local')
    assert.equal(generation.adapter, 'base')
    const structured = JSON.parse(generation.content)
    assert.equal(typeof structured.title, 'string')
    assert.ok(Array.isArray(structured.required_skills))
    assert.equal(structured.language, 'en')

    let crashRecoveryVerified = false
    if (
      process.env.KLAR_REAL_MODEL_CRASH === '1'
      && process.platform !== 'win32'
    ) {
      const childPid = await runtimeChildPid(desktopProcess.pid)
      process.kill(childPid, 'SIGKILL')
      await page.waitForFunction(async () =>
        (await window.klarDesktop.runtime.getStatus()).phase === 'crashed', {
        timeout: 10_000,
      })
      const restarted = await page.evaluate((id) =>
        window.klarDesktop.runtime.start(id), artifactId)
      assert.equal(restarted.phase, 'ready')
      crashRecoveryVerified = true
    }

    const stopped = await page.evaluate(() =>
      window.klarDesktop.runtime.stop())
    assert.equal(stopped.phase, 'stopped')
    realModel = {
      artifactId,
      warmupMs: ready.warmupMs,
      endToEndStartupMs: Date.now() - startedAt,
      generationMs: generation.timings.totalMs,
      outputTokens: generation.usage?.outputTokens,
      cancellationVerified: true,
      postCancellationGenerationVerified: true,
      crashRecoveryVerified,
    }
  }

  const response = documentResponses.at(-1)
  assert.ok(response, 'packaged renderer document response was observed')
  const headers = await response.allHeaders()
  const csp = headers['content-security-policy'] ?? ''
  assert.match(csp, /script-src 'self'/)
  assert.match(csp, /object-src 'none'/)
  assert.doesNotMatch(csp, /unsafe-eval/)

  const pageErrors = await page.pageErrors()
  const consoleErrors = (await page.consoleMessages())
    .filter((message) => message.type() === 'error')
    .map((message) => message.text())
  assert.deepEqual(
    {
      pageErrors: pageErrors.map((error) => error.message),
      consoleErrors,
    },
    { pageErrors: [], consoleErrors: [] },
  )

  if (process.env.KLAR_SMOKE_SCREENSHOT) {
    await page.screenshot({
      path: path.resolve(process.env.KLAR_SMOKE_SCREENSHOT),
      fullPage: true,
    })
  }

  console.log(JSON.stringify({
    executable,
    platform: systemInfo.platform,
    architecture: systemInfo.architecture,
    appVersion: systemInfo.appVersion,
    cspVerified: true,
    fuseVerification,
    rendererIsolationVerified: true,
    ...(realModel ? { realModel } : {}),
    pageErrors: 0,
    consoleErrors: 0,
  }, null, 2))
} finally {
  await browser?.close().catch(() => undefined)
  await stopDesktopProcess(desktopProcess)
  if (!suppliedProfile) {
    await rm(profile, { recursive: true, force: true })
  }
}
