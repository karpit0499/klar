import { strict as assert } from 'node:assert'
import { EventEmitter } from 'node:events'
import {
  access,
  mkdtemp,
  rm,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  LocalRuntimeManager,
  RuntimeOperationError,
} from '../desktop/runtime/local-runtime.mjs'

class FakeStream extends EventEmitter {
  setEncoding(): void {}
}

class FakeChild extends EventEmitter {
  stdout = new FakeStream()
  stderr = new FakeStream()
  killed = false

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killed = true
    queueMicrotask(() => this.emit('exit', 0, signal))
    return true
  }

  crash(): void {
    this.emit('exit', 9, null)
  }
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'klar-v26-runtime-'))
try {
  const children: FakeChild[] = []
  let generationMode: 'pending' | 'success' = 'pending'
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/health')) {
      return new Response('{"status":"ok"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (generationMode === 'success') {
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: 'Grounded local output.' },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4,
            total_tokens: 14,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      )
    })
  }
  const runtime = new LocalRuntimeManager({
    paths: {
      runtimeExecutable: path.join(temporary, 'llama-server'),
      runtimeStateRoot: path.join(temporary, 'runtime'),
    },
    resolveLaunch: async (artifactId: string) => ({
      artifactId,
      modelId: 'Qwen/Qwen3.5-9B',
      runtimeVersion: 'b10199',
      modelPath: path.join(temporary, 'model.gguf'),
      adapters: {
        precision: path.join(temporary, 'precision.gguf'),
        writer: path.join(temporary, 'writer.gguf'),
      },
      contextTokens: 8192,
    }),
    spawnProcess: (() => {
      const child = new FakeChild()
      children.push(child)
      return child
    }) as never,
    fetcher,
    allocatePort: async () => 18_080 + children.length,
    randomSecret: () => 'unit-test-ephemeral-secret',
    startupTimeoutMs: 2_000,
  })

  const started = await runtime.start('qwen35-lab-model')
  assert.equal(started.phase, 'ready')
  assert.deepEqual(started.adapters, ['base', 'precision', 'writer'])
  assert.equal(started.warmed, true)

  const request = {
    requestId: 'cancel-request-0001',
    capability: 'recruiter_message',
    language: 'en',
    messages: [
      { role: 'system', content: 'Use facts only.' },
      { role: 'user', content: 'Write a short message.' },
    ],
    adapter: 'writer',
    maxOutputTokens: 256,
    temperature: 0,
    timeoutMs: 30_000,
  }
  const cancelledGeneration = runtime.generate(request)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(runtime.status().activeRequests, 1)
  assert.equal(runtime.cancel(request.requestId), true)
  await assert.rejects(
    cancelledGeneration,
    (error: unknown) =>
      error instanceof RuntimeOperationError && error.code === 'cancelled',
  )
  assert.equal(runtime.status().phase, 'ready')
  assert.equal(runtime.status().activeRequests, 0)
  assert.equal(runtime.cancel(request.requestId), false)

  const crashRequest = {
    ...request,
    requestId: 'crash-request-0001',
  }
  const crashedGeneration = runtime.generate(crashRequest)
  await new Promise((resolve) => setImmediate(resolve))
  children[0].crash()
  await assert.rejects(
    crashedGeneration,
    (error: unknown) =>
      error instanceof RuntimeOperationError &&
      error.code === 'runtime_crashed',
  )
  assert.equal(runtime.status().phase, 'crashed')
  assert.equal(runtime.status().activeRequests, 0)

  generationMode = 'success'
  const restarted = await runtime.start('qwen35-lab-model')
  assert.equal(restarted.phase, 'ready')
  assert.equal(children.length, 2)
  const recovered = await runtime.generate({
    ...request,
    requestId: 'recovered-request-0001',
  })
  assert.equal(recovered.content, 'Grounded local output.')
  assert.equal(recovered.usage?.totalTokens, 14)
  assert.equal(runtime.status().activeRequests, 0)

  const stopped = await runtime.stop()
  assert.equal(stopped.phase, 'stopped')

  let finishVerification!: (value: {
    artifactId: string
    modelId: string
    runtimeVersion: string
    modelPath: string
    adapters: Record<string, string>
    contextTokens: number
  }) => void
  const verification = new Promise<Parameters<typeof finishVerification>[0]>(
    (resolve) => {
      finishVerification = resolve
    },
  )
  let delayedSpawns = 0
  const delayedRuntime = new LocalRuntimeManager({
    paths: {
      runtimeExecutable: path.join(temporary, 'llama-server'),
      runtimeStateRoot: path.join(temporary, 'delayed-runtime'),
    },
    resolveLaunch: async () => verification,
    spawnProcess: (() => {
      delayedSpawns += 1
      return new FakeChild()
    }) as never,
    fetcher,
    allocatePort: async () => 18_099,
    randomSecret: () => 'unit-test-delayed-secret',
    startupTimeoutMs: 2_000,
  })
  const delayedStart = delayedRuntime.start('delayed-model')
  await new Promise((resolve) => setImmediate(resolve))
  const delayedStop = delayedRuntime.stop()
  finishVerification({
    artifactId: 'delayed-model',
    modelId: 'Qwen/Qwen3.5-9B',
    runtimeVersion: 'b10199',
    modelPath: path.join(temporary, 'model.gguf'),
    adapters: {},
    contextTokens: 8192,
  })
  await assert.rejects(
    delayedStart,
    (error: unknown) =>
      error instanceof RuntimeOperationError && error.code === 'start_cancelled',
  )
  assert.equal((await delayedStop).phase, 'stopped')
  assert.equal(
    delayedSpawns,
    0,
    'stopping during package verification must prevent a later orphan spawn',
  )

  let asyncErrorChild!: FakeChild
  const asyncErrorRuntime = new LocalRuntimeManager({
    paths: {
      runtimeExecutable: path.join(temporary, 'missing-llama-server'),
      runtimeStateRoot: path.join(temporary, 'async-error-runtime'),
    },
    resolveLaunch: async (artifactId: string) => ({
      artifactId,
      modelId: 'Qwen/Qwen3.5-9B',
      runtimeVersion: 'b10199',
      modelPath: path.join(temporary, 'model.gguf'),
      adapters: {},
      contextTokens: 8192,
    }),
    spawnProcess: (() => {
      asyncErrorChild = new FakeChild()
      queueMicrotask(() => {
        const error = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
        asyncErrorChild.emit('error', error)
      })
      return asyncErrorChild
    }) as never,
    fetcher: async () => new Promise<Response>(() => undefined),
    allocatePort: async () => 18_100,
    randomSecret: () => 'unit-test-async-error-secret',
    startupTimeoutMs: 120_000,
  })
  await assert.rejects(
    asyncErrorRuntime.start('async-error-model'),
    (error: unknown) =>
      error instanceof RuntimeOperationError && error.code === 'spawn_failed',
  )
  assert.equal(asyncErrorRuntime.status().phase, 'error')
  assert.equal(asyncErrorRuntime.status().lastErrorCode, 'spawn_failed')
  await assert.rejects(
    access(path.join(temporary, 'async-error-runtime', 'llama-api-key')),
    (error: NodeJS.ErrnoException) => error.code === 'ENOENT',
  )

  class StubbornChild extends FakeChild {
    pid = 42_424
    signals: NodeJS.Signals[] = []

    override kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
      this.signals.push(signal)
      return true
    }

    exitNow(): void {
      this.emit('exit', 0, 'SIGKILL')
    }
  }

  const stopTimers: Array<() => void> = []
  const stubbornChild = new StubbornChild()
  const stubbornRuntime = new LocalRuntimeManager({
    paths: {
      runtimeExecutable: path.join(temporary, 'llama-server'),
      runtimeStateRoot: path.join(temporary, 'stubborn-runtime'),
    },
    resolveLaunch: async (artifactId: string) => ({
      artifactId,
      modelId: 'Qwen/Qwen3.5-9B',
      runtimeVersion: 'b10199',
      modelPath: path.join(temporary, 'model.gguf'),
      adapters: {},
      contextTokens: 8192,
    }),
    spawnProcess: (() => stubbornChild) as never,
    fetcher,
    allocatePort: async () => 18_101,
    randomSecret: () => 'unit-test-stubborn-secret',
    sleep: async () => new Promise<void>((resolve) => {
      stopTimers.push(resolve)
    }),
    startupTimeoutMs: 2_000,
  })
  assert.equal((await stubbornRuntime.start('stubborn-model')).phase, 'ready')
  let stubbornStopSettled = false
  const stubbornStop = stubbornRuntime.stop().then((status) => {
    stubbornStopSettled = true
    return status
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(stubbornChild.signals, ['SIGTERM'])
  stopTimers.shift()?.()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(stubbornChild.signals, ['SIGTERM', 'SIGKILL'])
  assert.equal(
    stubbornStopSettled,
    false,
    'SIGKILL delivery alone must not be treated as process exit',
  )
  stubbornChild.exitNow()
  assert.equal((await stubbornStop).phase, 'stopped')
} finally {
  await rm(temporary, { recursive: true, force: true })
}

console.log('v26-runtime-recovery.test.ts: all tests passed')
