import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  ArtifactMeasurement,
  BenchmarkCaseResult,
  BenchmarkReport,
  BenchmarkStatus,
  RssMeasurement,
  ThermalSample,
} from './types.ts'

const execFileAsync = promisify(execFile)
const GIB = 1_024 ** 3

export function memoryTier(
  totalMemoryBytes: number,
): 'unsupported' | 'minimum' | 'recommended' {
  if (totalMemoryBytes < 12 * GIB) return 'unsupported'
  if (totalMemoryBytes < 24 * GIB) return 'minimum'
  return 'recommended'
}

export function collectHardware(): BenchmarkReport['hardware'] {
  const cpus = os.cpus()
  const totalMemoryBytes = os.totalmem()
  return {
    platform: process.platform,
    architecture: process.arch,
    cpuModel: cpus[0]?.model?.trim() || 'unknown',
    logicalCpuCount: cpus.length,
    totalMemoryBytes,
    memoryTier: memoryTier(totalMemoryBytes),
  }
}

function numericValue(output: string, label: string): number | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = output.match(new RegExp(`${escaped}\\s*=\\s*(\\d+)`, 'i'))
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

export function parsePmsetThermalOutput(
  output: string,
  capturedAt = new Date().toISOString(),
): ThermalSample {
  const cpuSpeedLimitPercent = numericValue(output, 'CPU_Speed_Limit')
  const schedulerLimitPercent = numericValue(output, 'Scheduler_Limit')
  const availableCpuCount = numericValue(output, 'CPU_Available_CPUs')
  const explicitlyNominal =
    /no thermal warning level has been recorded/i.test(output)
  const pressured =
    (cpuSpeedLimitPercent !== undefined && cpuSpeedLimitPercent < 100) ||
    (schedulerLimitPercent !== undefined && schedulerLimitPercent < 100)
  return {
    capturedAt,
    status: 'measured',
    source: 'pmset',
    pressure: pressured
      ? 'pressured'
      : explicitlyNominal ||
          cpuSpeedLimitPercent !== undefined ||
          schedulerLimitPercent !== undefined
        ? 'nominal'
        : 'unknown',
    ...(cpuSpeedLimitPercent === undefined ? {} : { cpuSpeedLimitPercent }),
    ...(schedulerLimitPercent === undefined ? {} : { schedulerLimitPercent }),
    ...(availableCpuCount === undefined ? {} : { availableCpuCount }),
  }
}

export async function sampleThermalPressure(): Promise<ThermalSample> {
  const capturedAt = new Date().toISOString()
  if (process.platform !== 'darwin') {
    return {
      capturedAt,
      status: 'unsupported',
      source: 'unsupported',
      pressure: 'unknown',
      reason: `No safe built-in thermal-pressure sampler is defined for ${process.platform}.`,
    }
  }
  try {
    const { stdout } = await execFileAsync('/usr/bin/pmset', ['-g', 'therm'], {
      timeout: 5_000,
      maxBuffer: 64 * 1_024,
    })
    return parsePmsetThermalOutput(stdout, capturedAt)
  } catch (error) {
    return {
      capturedAt,
      status: 'error',
      source: 'pmset',
      pressure: 'unknown',
      reason:
        error instanceof Error
          ? `pmset thermal sample failed: ${error.name}`
          : 'pmset thermal sample failed.',
    }
  }
}

export async function readRssBytes(
  pid: number,
  platform = process.platform,
): Promise<number | null> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null
  if (platform === 'linux') {
    const status = await readFile(`/proc/${pid}/status`, 'utf8')
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m)
    return match ? Number(match[1]) * 1_024 : null
  }
  if (platform === 'darwin') {
    const { stdout } = await execFileAsync('/bin/ps', [
      '-o',
      'rss=',
      '-p',
      String(pid),
    ])
    const kibibytes = Number(stdout.trim())
    return Number.isFinite(kibibytes) && kibibytes >= 0
      ? kibibytes * 1_024
      : null
  }
  return null
}

export class PeakRssSampler {
  private peakBytes = 0
  private samples = 0
  private failure: string | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private pending: Promise<void> = Promise.resolve()

  constructor(
    private readonly pid: number | undefined,
    private readonly read = readRssBytes,
    private readonly intervalMs = 100,
  ) {}

  private sample(): Promise<void> {
    if (!this.pid) return Promise.resolve()
    this.pending = this.pending.then(async () => {
      try {
        const bytes = await this.read(this.pid as number)
        if (bytes === null) {
          this.failure ??= 'RSS is unsupported for this process/platform.'
          return
        }
        this.samples += 1
        this.peakBytes = Math.max(this.peakBytes, bytes)
      } catch (error) {
        this.failure ??=
          error instanceof Error ? `RSS sampling failed: ${error.name}` : 'RSS sampling failed.'
      }
    })
    return this.pending
  }

  async start(): Promise<void> {
    if (!this.pid) return
    await this.sample()
    this.timer = setInterval(() => {
      void this.sample()
    }, this.intervalMs)
    this.timer.unref?.()
  }

  async stop(): Promise<RssMeasurement> {
    if (this.timer) clearInterval(this.timer)
    await this.sample()
    await this.pending
    if (!this.pid) {
      return {
        status: 'unsupported',
        samples: 0,
        reason: 'No local runtime process id was supplied.',
      }
    }
    if (this.samples === 0) {
      return {
        status: this.failure ? 'error' : 'unsupported',
        pid: this.pid,
        samples: 0,
        reason: this.failure ?? 'RSS sampling is unsupported.',
      }
    }
    return {
      status: 'measured',
      pid: this.pid,
      peakBytes: this.peakBytes,
      samples: this.samples,
      ...(this.failure ? { reason: this.failure } : {}),
    }
  }
}

async function sha256File(file: string): Promise<string> {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(file)) digest.update(chunk)
  return digest.digest('hex')
}

type ArtifactConfig = {
  runtimePath?: string
  modelPath?: string
  precisionAdapterPath?: string
  writerAdapterPath?: string
  hashArtifacts: boolean
}

export async function collectArtifactMeasurements(
  config: ArtifactConfig,
): Promise<BenchmarkReport['artifacts']> {
  const declarations: Array<{
    role: ArtifactMeasurement['role']
    file?: string
  }> = [
    { role: 'runtime', file: config.runtimePath },
    { role: 'base_model', file: config.modelPath },
    { role: 'precision_adapter', file: config.precisionAdapterPath },
    { role: 'writer_adapter', file: config.writerAdapterPath },
  ]
  const entries: ArtifactMeasurement[] = []
  for (const declaration of declarations) {
    if (!declaration.file) {
      entries.push({
        role: declaration.role,
        configured: false,
        status: 'not_configured',
      })
      continue
    }
    try {
      const info = await stat(declaration.file)
      if (!info.isFile()) {
        entries.push({
          role: declaration.role,
          configured: true,
          status: 'error',
          fileName: path.basename(declaration.file),
          reason: 'Configured artifact is not a regular file.',
        })
        continue
      }
      entries.push({
        role: declaration.role,
        configured: true,
        status: 'measured',
        fileName: path.basename(declaration.file),
        bytes: info.size,
        ...(config.hashArtifacts
          ? { sha256: await sha256File(declaration.file) }
          : {}),
      })
    } catch (error) {
      entries.push({
        role: declaration.role,
        configured: true,
        status:
          (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'missing' : 'error',
        fileName: path.basename(declaration.file),
        reason:
          error instanceof Error
            ? `Artifact measurement failed: ${error.name}`
            : 'Artifact measurement failed.',
      })
    }
  }
  const modelEntries = entries.filter((entry) => entry.role !== 'runtime')
  const measuredModelEntries = modelEntries.filter(
    (entry) => entry.status === 'measured' && entry.bytes !== undefined,
  )
  const runtime = entries.find((entry) => entry.role === 'runtime')
  const modelPackageBytes = measuredModelEntries.reduce(
    (sum, entry) => sum + (entry.bytes ?? 0),
    0,
  )
  return {
    entries,
    ...(measuredModelEntries.length > 0 ? { modelPackageBytes } : {}),
    ...(runtime?.bytes === undefined ? {} : { runtimeBytes: runtime.bytes }),
    status:
      measuredModelEntries.length === 0
        ? 'unavailable'
        : measuredModelEntries.length === modelEntries.length
          ? 'measured'
          : 'partial',
  }
}

export async function sourceCommit(cwd = process.cwd()): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd, timeout: 5_000, maxBuffer: 4_096 },
    )
    return /^[a-f0-9]{40}$/.test(stdout.trim()) ? stdout.trim() : null
  } catch {
    return null
  }
}

export async function sourceTreeDirty(
  cwd = process.cwd(),
): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=normal'],
      { cwd, timeout: 5_000, maxBuffer: 4 * 1_024 * 1_024 },
    )
    return stdout.length > 0
  } catch {
    return null
  }
}

function emptyCounts(): Record<BenchmarkStatus, number> {
  return { pass: 0, fail: 0, hold: 0, not_run: 0 }
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1),
  )
  return sorted[index]
}

export function summarizeReport(
  cases: BenchmarkCaseResult[],
  resilience: BenchmarkReport['resilience'],
): BenchmarkReport['summary'] {
  const required = emptyCounts()
  const optional = emptyCounts()
  for (const result of cases) {
    ;(result.requiredForLocalExperiment ? required : optional)[result.status] += 1
  }
  for (const probe of Object.values(resilience)) {
    ;(probe.requiredForLocalExperiment ? required : optional)[probe.status] += 1
  }
  const localExecuted = cases.filter(
    (result) =>
      result.provider.startsWith('local-') &&
      (result.status === 'pass' || result.status === 'fail'),
  )
  const firstTokenValues = localExecuted.flatMap((result) =>
    result.measurement?.firstTokenMs === undefined
      ? []
      : [result.measurement.firstTokenMs],
  )
  const totalValues = localExecuted.flatMap((result) =>
    result.measurement ? [result.measurement.totalMs] : [],
  )
  const rssValues = localExecuted.flatMap((result) =>
    result.memory?.peakBytes === undefined ? [] : [result.memory.peakBytes],
  )
  const releaseBlockers = [
    ...cases
      .filter(
        (result) =>
          result.requiredForLocalExperiment &&
          (result.status === 'fail' ||
            result.status === 'hold' ||
            result.status === 'not_run'),
      )
      .map(
        (result) =>
          `${result.caseId}: ${result.reasonCode ?? result.status}`,
      ),
    ...Object.entries(resilience)
      .filter(
        ([, probe]) =>
          probe.requiredForLocalExperiment && probe.status !== 'pass',
      )
      .map(
        ([name, probe]) =>
          `${name}: ${probe.reasonCode ?? probe.status}`,
      ),
  ]
  const warnings = cases
    .filter(
      (result) =>
        !result.requiredForLocalExperiment && result.status !== 'pass',
    )
    .map(
      (result) => `${result.caseId}: ${result.reasonCode ?? result.status}`,
    )
  return {
    overallStatus:
      required.fail > 0
        ? 'fail'
        : required.hold > 0 || required.not_run > 0
          ? 'hold'
          : 'pass',
    required,
    optional,
    localModelMetrics: {
      scope: 'executed_local_model_cases',
      executedCaseCount: localExecuted.length,
      structuredOutputPassRate:
        localExecuted.length === 0
          ? null
          : localExecuted.filter(
                (result) => result.validation?.validStructuredOutput === true,
              ).length / localExecuted.length,
      evidenceGroundingPassRate:
        localExecuted.length === 0
          ? null
          : localExecuted.filter(
                (result) => result.validation?.evidenceGrounded === true,
              ).length / localExecuted.length,
      measuredFirstTokenP50Ms: percentile(firstTokenValues, 0.5),
      measuredFirstTokenP95Ms: percentile(firstTokenValues, 0.95),
      measuredTotalLatencyP50Ms: percentile(totalValues, 0.5),
      measuredTotalLatencyP95Ms: percentile(totalValues, 0.95),
      peakRssBytes: rssValues.length > 0 ? Math.max(...rssValues) : null,
    },
    releaseBlockers,
    warnings,
  }
}
