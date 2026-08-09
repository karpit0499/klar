import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

export type OwnedServerConfig = {
  runtimePath: string
  modelPath: string
  precisionAdapterPath?: string
  writerAdapterPath?: string
  contextTokens: number
  startupTimeoutMs: number
}

export function buildOwnedServerArgs({
  config,
  port,
  apiKeyFile,
}: {
  config: OwnedServerConfig
  port: number
  apiKeyFile: string
}): string[] {
  const args = [
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--model',
    config.modelPath,
    '--alias',
    'klar-local',
    '--ctx-size',
    String(config.contextTokens),
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
    config.precisionAdapterPath,
    config.writerAdapterPath,
  ].filter((entry): entry is string => !!entry)
  if (adapters.length > 0) {
    args.push('--lora', adapters.join(','), '--lora-init-without-apply')
  }
  return args
}

async function allocatePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  if (!port) throw new Error('Could not allocate a loopback benchmark port.')
  return port
}

function cleanEnvironment(): NodeJS.ProcessEnv {
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
      .filter((name) => typeof process.env[name] === 'string')
      .map((name) => [name, process.env[name] as string]),
  )
}

async function waitForExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

export class OwnedLlamaServer {
  private child: ChildProcess | null = null
  private workRoot: string | null = null
  private apiKeyFile: string | null = null
  private endpointValue: string | null = null
  private apiKeyValue: string | null = null
  private logs = ''

  constructor(readonly config: OwnedServerConfig) {}

  get endpoint(): string {
    if (!this.endpointValue) throw new Error('Owned server is not running.')
    return this.endpointValue
  }

  get apiKey(): string {
    if (!this.apiKeyValue) throw new Error('Owned server is not running.')
    return this.apiKeyValue
  }

  get pid(): number | undefined {
    return this.child?.pid
  }

  adapterIndexes(): { precision?: number; writer?: number } {
    let next = 0
    const indexes: { precision?: number; writer?: number } = {}
    if (this.config.precisionAdapterPath) indexes.precision = next++
    if (this.config.writerAdapterPath) indexes.writer = next
    return indexes
  }

  private captureLogs(child: ChildProcess): void {
    const append = (chunk: Buffer | string) => {
      this.logs = `${this.logs}${String(chunk)}`.slice(-32_000)
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
  }

  private async healthReady(timeoutMs = 2_000): Promise<boolean> {
    if (!this.endpointValue) return false
    try {
      const response = await fetch(`${this.endpointValue}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async start(): Promise<{ warmupMs: number; pid: number }> {
    if (this.child) throw new Error('Owned server is already running.')
    this.workRoot ??= await mkdtemp(path.join(os.tmpdir(), 'klar-model-benchmark-'))
    const port = await allocatePort()
    this.apiKeyValue = randomBytes(32).toString('base64url')
    this.apiKeyFile = path.join(this.workRoot, 'llama-api-key')
    await writeFile(this.apiKeyFile, `${this.apiKeyValue}\n`, { mode: 0o600 })
    await chmod(this.apiKeyFile, 0o600).catch(() => undefined)
    this.endpointValue = `http://127.0.0.1:${port}`
    const args = buildOwnedServerArgs({
      config: this.config,
      port,
      apiKeyFile: this.apiKeyFile,
    })
    const startedAt = performance.now()
    const child = spawn(this.config.runtimePath, args, {
      cwd: this.workRoot,
      env: cleanEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    this.captureLogs(child)
    const spawnState: { error?: Error } = {}
    child.once('error', (error) => {
      spawnState.error = error
    })
    const deadline = Date.now() + this.config.startupTimeoutMs
    while (Date.now() < deadline) {
      if (spawnState.error) {
        this.child = null
        throw new Error(
          `Owned llama.cpp server could not launch (${spawnState.error.name}).`,
        )
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        this.child = null
        throw new Error(
          `Owned llama.cpp server exited during startup. Log tail: ${this.logs.slice(-2_000)}`,
        )
      }
      if (await this.healthReady()) {
        await rm(this.apiKeyFile, { force: true })
        this.apiKeyFile = null
        return {
          warmupMs: Math.round(performance.now() - startedAt),
          pid: child.pid as number,
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    child.kill('SIGKILL')
    await waitForExit(child, 5_000)
    this.child = null
    throw new Error(
      `Owned llama.cpp server did not become ready within ${this.config.startupTimeoutMs} ms.`,
    )
  }

  async isHealthy(): Promise<boolean> {
    return this.healthReady()
  }

  async crashAndRestart(): Promise<{
    stoppedHealthCheckPassed: boolean
    restartedHealthCheckPassed: boolean
    totalMs: number
  }> {
    const child = this.child
    if (!child) throw new Error('Owned server is not running.')
    const startedAt = performance.now()
    child.kill('SIGKILL')
    const exited = await waitForExit(child, 10_000)
    if (!exited) throw new Error('Owned server did not exit for the crash probe.')
    this.child = null
    const stoppedHealthCheckPassed = !(await this.healthReady(500))
    await this.start()
    const restartedHealthCheckPassed = await this.healthReady(2_000)
    return {
      stoppedHealthCheckPassed,
      restartedHealthCheckPassed,
      totalMs: Math.round(performance.now() - startedAt),
    }
  }

  async stop(): Promise<void> {
    const child = this.child
    if (child) {
      child.kill('SIGTERM')
      if (!(await waitForExit(child, 5_000))) {
        child.kill('SIGKILL')
        await waitForExit(child, 5_000)
      }
    }
    this.child = null
    this.endpointValue = null
    this.apiKeyValue = null
    if (this.apiKeyFile) await rm(this.apiKeyFile, { force: true })
    this.apiKeyFile = null
    if (this.workRoot) await rm(this.workRoot, { recursive: true, force: true })
    this.workRoot = null
  }
}
