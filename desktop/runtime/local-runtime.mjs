import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  chmod,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { allocateLoopbackPort } from './port.mjs'

export const PINNED_LLAMA_CPP_BUILD = 'b10199'
const MAX_CONCURRENT_REQUESTS = 1
const GRACEFUL_STOP_TIMEOUT_MS = 5_000
const FORCED_STOP_TIMEOUT_MS = 5_000

export class RuntimeOperationError extends Error {
  constructor(code, message, cause) {
    super(message)
    this.name = 'RuntimeOperationError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

function cleanRuntimeEnvironment(source = process.env) {
  const allowed = [
    'PATH',
    'Path',
    'SYSTEMROOT',
    'WINDIR',
    'HOME',
    'USERPROFILE',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
  ]
  return Object.fromEntries(
    allowed
      .filter((name) => typeof source[name] === 'string')
      .map((name) => [name, source[name]]),
  )
}

export function buildManagedRuntimeArgs({
  launch,
  port,
  apiKeyFile,
}) {
  const args = [
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--model',
    launch.modelPath,
    '--alias',
    'klar-local',
    '--ctx-size',
    String(launch.contextTokens),
    '--parallel',
    '1',
    '--api-key-file',
    apiKeyFile,
    '--no-webui',
    '--offline',
    '--log-verbosity',
    '2',
  ]
  const adapters = [
    launch.adapters.precision,
    launch.adapters.writer,
  ].filter(Boolean)
  if (adapters.length > 0) {
    args.push('--lora', adapters.join(','), '--lora-init-without-apply')
  }
  return args
}

export function buildRuntimeGenerationBody(request, adapterIndexes) {
  const adapterIndex =
    request.adapter === 'base' ? undefined : adapterIndexes[request.adapter]
  if (request.adapter !== 'base' && !Number.isSafeInteger(adapterIndex)) {
    throw new RuntimeOperationError(
      'adapter_unavailable',
      `The ${request.adapter} adapter is not installed.`,
    )
  }
  return {
    model: 'klar-local',
    messages: request.messages,
    max_tokens: request.maxOutputTokens,
    temperature: request.temperature,
    stream: false,
    ...(request.adapter === 'base'
      ? { lora: [] }
      : { lora: [{ id: adapterIndex, scale: 1 }] }),
    ...(request.jsonSchema
      ? {
          // Verified against the pinned b10199 runtime with Qwen3.5-9B.
          // b10199 accepts both labels, but json_schema did not constrain this
          // model correctly; json_object + schema produced schema-valid keys.
          response_format: {
            type: 'json_object',
            schema: request.jsonSchema,
          },
        }
      : {}),
    chat_template_kwargs: { enable_thinking: false },
  }
}

function createStatus(overrides = {}) {
  return {
    phase: 'stopped',
    adapters: [],
    warmed: false,
    activeRequests: 0,
    ...overrides,
  }
}

function finishReason(value) {
  if (value === 'stop' || value === 'length') return value
  return 'unknown'
}

function responseUsage(value) {
  if (!value || typeof value !== 'object') return undefined
  const usage = {}
  if (Number.isFinite(value.prompt_tokens)) usage.inputTokens = value.prompt_tokens
  if (Number.isFinite(value.completion_tokens)) usage.outputTokens = value.completion_tokens
  if (Number.isFinite(value.total_tokens)) usage.totalTokens = value.total_tokens
  return Object.keys(usage).length > 0 ? usage : undefined
}

export class LocalRuntimeManager {
  #child = null
  #endpoint = null
  #apiKey = null
  #status = createStatus()
  #requests = new Map()
  #cancelled = new Set()
  #adapterIndexes = Object.freeze({})
  #crashEpoch = 0
  #startPromise = null
  #startingArtifactId = null
  #operationEpoch = 0

  constructor({
    paths,
    resolveLaunch,
    spawnProcess = spawn,
    fetcher = globalThis.fetch,
    allocatePort = allocateLoopbackPort,
    randomSecret = () => randomBytes(32).toString('base64url'),
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now = () => Date.now(),
    diagnostics = { record() {} },
    startupTimeoutMs = 120_000,
  }) {
    this.paths = paths
    this.resolveLaunch = resolveLaunch
    this.spawnProcess = spawnProcess
    this.fetcher = fetcher
    this.allocatePort = allocatePort
    this.randomSecret = randomSecret
    this.sleep = sleep
    this.now = now
    this.diagnostics = diagnostics
    this.startupTimeoutMs = startupTimeoutMs
  }

  status() {
    return structuredClone(this.#status)
  }

  async start(artifactId) {
    if (
      this.#status.phase === 'ready' &&
      this.#status.artifactId === artifactId
    ) {
      return this.status()
    }
    // Reusing an in-flight start for a different artifact would resolve with
    // the other model's ready status, and every later generation would silently
    // run on the wrong weights.
    if (this.#startPromise) {
      if (this.#startingArtifactId === artifactId) return this.#startPromise
      throw new RuntimeOperationError(
        'runtime_busy',
        'The local runtime is already starting a different model. Stop it first.',
      )
    }
    this.#startingArtifactId = artifactId
    this.#startPromise = this.#start(artifactId)
    try {
      return await this.#startPromise
    } finally {
      this.#startPromise = null
      this.#startingArtifactId = null
    }
  }

  async #start(artifactId) {
    const operationEpoch = ++this.#operationEpoch
    if (this.#child) await this.#stopChild()
    this.#assertStartCurrent(operationEpoch)
    this.#status = createStatus({ phase: 'verifying', artifactId })
    this.diagnostics.record('runtime.verifying')
    let launch
    try {
      launch = await this.resolveLaunch(artifactId)
    } catch (error) {
      this.#assertStartCurrent(operationEpoch)
      this.#status = createStatus({
        phase: 'error',
        artifactId,
        lastErrorCode: error.code ?? 'verification_failed',
      })
      this.diagnostics.record('runtime.verification_failed', {
        code: error.code ?? 'verification_failed',
      })
      throw new RuntimeOperationError(
        'verification_failed',
        'The local model package failed verification.',
        error,
      )
    }
    this.#assertStartCurrent(operationEpoch)

    await mkdir(this.paths.runtimeStateRoot, { recursive: true, mode: 0o700 })
    const port = await this.allocatePort()
    this.#assertStartCurrent(operationEpoch)
    const apiKey = this.randomSecret()
    const apiKeyFile = path.join(this.paths.runtimeStateRoot, 'llama-api-key')
    await writeFile(apiKeyFile, `${apiKey}\n`, { mode: 0o600 })
    await chmod(apiKeyFile, 0o600).catch(() => undefined)
    if (operationEpoch !== this.#operationEpoch) {
      await rm(apiKeyFile, { force: true })
      this.#assertStartCurrent(operationEpoch)
    }
    const args = buildManagedRuntimeArgs({ launch, port, apiKeyFile })
    const startedAt = this.now()
    const orderedAdapters = [
      ...(launch.adapters.precision
        ? [['precision', launch.adapters.precision]]
        : []),
      ...(launch.adapters.writer
        ? [['writer', launch.adapters.writer]]
        : []),
    ]
    this.#adapterIndexes = Object.freeze(
      Object.fromEntries(
        orderedAdapters.map(([slot], index) => [slot, index]),
      ),
    )
    this.#status = createStatus({
      phase: 'starting',
      artifactId,
      modelId: launch.modelId,
      runtimeVersion: launch.runtimeVersion,
      adapters: ['base', ...orderedAdapters.map(([slot]) => slot)],
    })
    this.#endpoint = `http://127.0.0.1:${port}`
    this.#apiKey = apiKey

    let child
    try {
      child = this.spawnProcess(
        this.paths.runtimeExecutable,
        args,
        {
          cwd: this.paths.runtimeStateRoot,
          env: cleanRuntimeEnvironment(),
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
    } catch (error) {
      await rm(apiKeyFile, { force: true })
      this.#endpoint = null
      this.#apiKey = null
      this.#status = createStatus({
        phase: 'error',
        artifactId,
        lastErrorCode: 'spawn_failed',
      })
      throw new RuntimeOperationError(
        'spawn_failed',
        'The local runtime could not start.',
        error,
      )
    }
    this.#child = child
    const expectedChild = child
    child.once('exit', (code, signal) => {
      this.#handleExit(expectedChild, code, signal)
    })
    child.once('error', (error) => {
      this.diagnostics.record('runtime.process_error', {
        code: error.code ?? 'process_error',
      })
    })
    this.#captureProcessLog(child.stdout, 'runtime.stdout')
    this.#captureProcessLog(child.stderr, 'runtime.stderr')

    let rejectSpawnError
    const spawnError = new Promise((_resolve, reject) => {
      rejectSpawnError = reject
    })
    const onSpawnError = (error) => {
      rejectSpawnError(new RuntimeOperationError(
        'spawn_failed',
        'The local runtime could not start.',
        error,
      ))
    }
    child.once('error', onSpawnError)
    try {
      await Promise.race([
        this.#waitUntilReady(expectedChild),
        spawnError,
      ])
    } catch (error) {
      await rm(apiKeyFile, { force: true })
      const cancelled = operationEpoch !== this.#operationEpoch
      if (!cancelled && this.#child === expectedChild) {
        if (Number.isSafeInteger(expectedChild.pid)) {
          await this.#stopChild()
        } else {
          // An asynchronous spawn error can occur before the operating system
          // creates a process. There is then nothing to signal or wait for.
          this.#child = null
        }
      }
      this.#endpoint = null
      this.#apiKey = null
      this.#adapterIndexes = Object.freeze({})
      if (cancelled) {
        this.#status = createStatus()
        throw new RuntimeOperationError(
          'start_cancelled',
          'The local runtime start was cancelled.',
          error,
        )
      }
      this.#status = createStatus({
        phase: 'error',
        artifactId,
        lastErrorCode: error.code ?? 'startup_failed',
      })
      this.diagnostics.record('runtime.start_failed', {
        code: error.code ?? 'startup_failed',
      })
      throw error
    } finally {
      child.off('error', onSpawnError)
    }
    await rm(apiKeyFile, { force: true })
    this.#assertStartCurrent(operationEpoch)
    const warmupMs = this.now() - startedAt
    this.#status = {
      ...this.#status,
      phase: 'ready',
      warmed: true,
      warmupMs,
    }
    this.diagnostics.record('runtime.ready', {
      warmupMs,
      adapterCount: this.#status.adapters.length,
    })
    return this.status()
  }

  #assertStartCurrent(operationEpoch) {
    if (operationEpoch === this.#operationEpoch) return
    this.#status = createStatus()
    throw new RuntimeOperationError(
      'start_cancelled',
      'The local runtime start was cancelled.',
    )
  }

  #captureProcessLog(stream, eventType) {
    if (!stream?.on) return
    let pending = ''
    stream.setEncoding?.('utf8')
    stream.on('data', (chunk) => {
      pending += String(chunk)
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ''
      for (const line of lines.slice(-20)) {
        // `message` matches the sensitive-key pattern, so every captured line
        // would collapse to a placeholder and still consume a journal slot,
        // evicting the lifecycle events the export exists to carry.
        if (line.trim()) this.diagnostics.record(eventType, { line })
      }
      if (pending.length > 4_000) pending = pending.slice(-4_000)
    })
  }

  async #waitUntilReady(expectedChild) {
    const deadline = this.now() + this.startupTimeoutMs
    while (this.now() < deadline) {
      if (this.#child !== expectedChild) {
        throw new RuntimeOperationError(
          'runtime_crashed',
          'The local runtime exited during startup.',
        )
      }
      try {
        const response = await this.fetcher(`${this.#endpoint}/health`, {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(2_000),
        })
        if (response.ok) return
        if (response.status !== 503) {
          throw new RuntimeOperationError(
            'health_failed',
            `Local runtime health check failed (${response.status}).`,
          )
        }
      } catch (error) {
        if (error instanceof RuntimeOperationError) throw error
      }
      await this.sleep(250)
    }
    throw new RuntimeOperationError(
      'startup_timeout',
      'The local runtime did not become ready in time.',
    )
  }

  #handleExit(child, code, signal) {
    if (this.#child !== child) return
    const expected =
      this.#status.phase === 'stopping' || this.#status.phase === 'stopped'
    this.#child = null
    this.#endpoint = null
    this.#apiKey = null
    this.#adapterIndexes = Object.freeze({})
    this.#crashEpoch += expected ? 0 : 1
    for (const request of this.#requests.values()) request.abort()
    this.#requests.clear()
    this.#status = createStatus({
      phase: expected ? 'stopped' : 'crashed',
      artifactId: this.#status.artifactId,
      modelId: this.#status.modelId,
      runtimeVersion: this.#status.runtimeVersion,
      adapters: this.#status.adapters,
      lastErrorCode: expected ? undefined : 'runtime_crashed',
    })
    this.diagnostics.record(expected ? 'runtime.stopped' : 'runtime.crashed', {
      exitCode: code,
      signal: signal ?? null,
    })
  }

  async #stopChild() {
    const child = this.#child
    if (!child) {
      this.#status = createStatus()
      return this.status()
    }
    this.#status = { ...this.#status, phase: 'stopping' }
    for (const [requestId, request] of this.#requests) {
      this.#cancelled.add(requestId)
      request.abort()
    }
    this.#requests.clear()
    const exited = new Promise((resolve) => child.once('exit', resolve))
    try {
      child.kill('SIGTERM')
    } catch (error) {
      this.diagnostics.record('runtime.signal_failed', {
        signal: 'SIGTERM',
        code: error.code ?? 'signal_failed',
      })
    }
    const graceful = await Promise.race([
      exited.then(() => true),
      this.sleep(GRACEFUL_STOP_TIMEOUT_MS).then(() => false),
    ])
    if (!graceful && this.#child === child) {
      try {
        child.kill('SIGKILL')
      } catch (error) {
        this.diagnostics.record('runtime.signal_failed', {
          signal: 'SIGKILL',
          code: error.code ?? 'signal_failed',
        })
      }
      const forced = await Promise.race([
        exited.then(() => true),
        this.sleep(FORCED_STOP_TIMEOUT_MS).then(() => false),
      ])
      if (!forced && this.#child === child) {
        this.diagnostics.record('runtime.stop_timeout', {})
        // Leaving #child set would make every later start and stop rethrow for
        // the lifetime of the process, and would let a rejected shutdown quit
        // the application while the child is still alive. Surrender ownership,
        // record the failure and let the next start spawn cleanly.
        this.#child = null
        this.#endpoint = null
        this.#apiKey = null
        this.#status = createStatus({
          phase: 'error',
          lastErrorCode: 'stop_timeout',
        })
        throw new RuntimeOperationError(
          'stop_timeout',
          'The local runtime did not exit after forced termination.',
        )
      }
    }
    return this.status()
  }

  async stop() {
    ++this.#operationEpoch
    const pendingStart = this.#startPromise
    try {
      await this.#stopChild()
    } finally {
      // A cancelled start must not be replayed to the next caller.
      this.#startPromise = null
      this.#startingArtifactId = null
    }
    await pendingStart?.catch(() => undefined)
    this.#status = createStatus()
    return this.status()
  }

  async generate(request) {
    if (this.#status.phase !== 'ready' || !this.#endpoint || !this.#apiKey) {
      throw new RuntimeOperationError(
        'runtime_unavailable',
        'The local runtime is not ready.',
      )
    }
    if (this.#requests.has(request.requestId)) {
      throw new RuntimeOperationError(
        'invalid_request',
        'A request with this id is already running.',
      )
    }
    if (this.#requests.size >= MAX_CONCURRENT_REQUESTS) {
      throw new RuntimeOperationError(
        'runtime_busy',
        'The local runtime is already serving another request.',
      )
    }
    const body = buildRuntimeGenerationBody(request, this.#adapterIndexes)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs)
    const startedAt = this.now()
    const crashEpoch = this.#crashEpoch
    this.#requests.set(request.requestId, controller)
    this.#status = { ...this.#status, activeRequests: this.#requests.size }
    try {
      const response = await this.fetcher(
        `${this.#endpoint}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: 'no-store',
        },
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new RuntimeOperationError(
          'generation_failed',
          `The local runtime rejected the request (${response.status}).`,
        )
      }
      const choice = payload?.choices?.[0]
      const content = choice?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        throw new RuntimeOperationError(
          'invalid_response',
          'The local runtime returned no usable content.',
        )
      }
      const totalMs = this.now() - startedAt
      this.diagnostics.record('runtime.generation_completed', {
        capability: request.capability,
        adapter: request.adapter,
        totalMs,
      })
      return {
        requestId: request.requestId,
        providerId: 'klar-local',
        modelId: this.#status.modelId,
        adapter: request.adapter,
        content,
        finishReason: finishReason(choice.finish_reason),
        ...(responseUsage(payload.usage)
          ? { usage: responseUsage(payload.usage) }
          : {}),
        timings: { totalMs },
      }
    } catch (error) {
      if (this.#crashEpoch !== crashEpoch) {
        throw new RuntimeOperationError(
          'runtime_crashed',
          'The local runtime stopped unexpectedly. Restart it and try again.',
          error,
        )
      }
      if (this.#cancelled.delete(request.requestId)) {
        throw new RuntimeOperationError(
          'cancelled',
          'The local generation was cancelled.',
          error,
        )
      }
      if (controller.signal.aborted) {
        throw new RuntimeOperationError(
          'timeout',
          'The local generation timed out.',
          error,
        )
      }
      if (error instanceof RuntimeOperationError) throw error
      throw new RuntimeOperationError(
        'generation_failed',
        'The local runtime request failed.',
        error,
      )
    } finally {
      clearTimeout(timeout)
      this.#requests.delete(request.requestId)
      this.#cancelled.delete(request.requestId)
      this.#status = {
        ...this.#status,
        activeRequests: this.#requests.size,
      }
    }
  }

  cancel(requestId) {
    const request = this.#requests.get(requestId)
    if (!request) return false
    this.#cancelled.add(requestId)
    request.abort()
    this.diagnostics.record('runtime.generation_cancelled')
    return true
  }
}
