#!/usr/bin/env -S npx tsx

import { rename, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { OwnedLlamaServer } from './ownedServer.ts'
import { runBenchmarkSuite, type BenchmarkRunConfig } from './runner.ts'

type CliOptions = {
  output: string
  includeOutputs: boolean
  hashArtifacts: boolean
  crashRecovery: boolean
  contextTokens: number
}

function usage(): string {
  return `
Klar v2.6 local-model benchmark

Usage:
  npx tsx model/benchmarks/run.ts --output /absolute/report.json [options]

Options:
  --include-outputs       Store complete synthetic model outputs in the report.
  --hash-artifacts        SHA-256 every configured runtime/model/adapter file.
  --crash-recovery       Kill and restart a server owned by this harness.
  --context-tokens N     Owned-server context size (default: 8192).
  --help                 Show this help.

Owned local mode (preferred for genuine process measurements):
  KLAR_BENCH_RUNTIME_PATH=/verified/llama-server
  KLAR_BENCH_MODEL_PATH=/verified/model.gguf
  KLAR_BENCH_PRECISION_ADAPTER_PATH=/verified/precision.gguf  (optional)
  KLAR_BENCH_WRITER_ADAPTER_PATH=/verified/writer.gguf        (optional)

External local mode:
  KLAR_BENCH_LOCAL_URL=http://127.0.0.1:8080
  KLAR_BENCH_LOCAL_API_KEY=...                                (optional)
  KLAR_BENCH_LOCAL_PID=12345                                  (optional RSS)
  KLAR_BENCH_PRECISION_LORA_ID=0                              (optional)
  KLAR_BENCH_WRITER_LORA_ID=1                                 (optional)

Optional Groq comparison:
  GROQ_API_KEY=...
  KLAR_BENCH_GROQ_MODEL=openai/gpt-oss-120b

Exit codes: 0 = all required evidence passed; 1 = a required case failed;
2 = evidence is on hold or was not run; 64 = invalid command/configuration.
`.trim()
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return parsed
}

function parseCli(argv: string[]): CliOptions {
  let output = ''
  let includeOutputs = false
  let hashArtifacts = false
  let crashRecovery = false
  let contextTokens = 8_192
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help') {
      console.log(usage())
      process.exit(0)
    }
    if (argument === '--output') {
      output = argv[++index] ?? ''
      continue
    }
    if (argument === '--include-outputs') {
      includeOutputs = true
      continue
    }
    if (argument === '--hash-artifacts') {
      hashArtifacts = true
      continue
    }
    if (argument === '--crash-recovery') {
      crashRecovery = true
      continue
    }
    if (argument === '--context-tokens') {
      contextTokens = positiveInteger(
        argv[++index] ?? '',
        '--context-tokens',
      )
      if (contextTokens < 1_024 || contextTokens > 32_768) {
        throw new Error('--context-tokens must be between 1024 and 32768.')
      }
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }
  if (!output) throw new Error('--output is required.')
  if (!path.isAbsolute(output)) {
    throw new Error('--output must be an absolute path.')
  }
  return {
    output,
    includeOutputs,
    hashArtifacts,
    crashRecovery,
    contextTokens,
  }
}

function optionalInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined || value === '') return undefined
  return positiveInteger(value, label)
}

function optionalNonNegativeInteger(
  value: string | undefined,
  label: string,
): number | undefined {
  if (value === undefined || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }
  return parsed
}

function assertLoopbackEndpoint(value: string): string {
  const endpoint = new URL(value)
  if (
    endpoint.protocol !== 'http:' ||
    !new Set(['127.0.0.1', 'localhost', '[::1]']).has(endpoint.hostname)
  ) {
    throw new Error(
      'KLAR_BENCH_LOCAL_URL must be an HTTP loopback address.',
    )
  }
  return endpoint.toString().replace(/\/+$/, '')
}

async function atomicWriteJson(file: string, value: unknown): Promise<void> {
  const directory = path.dirname(file)
  await mkdir(directory, { recursive: true })
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.tmp`,
  )
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporary, file)
}

async function main(): Promise<void> {
  let options: CliOptions
  try {
    options = parseCli(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error('\n' + usage())
    process.exitCode = 64
    return
  }

  const runtimePath = process.env.KLAR_BENCH_RUNTIME_PATH
  const modelPath = process.env.KLAR_BENCH_MODEL_PATH
  const precisionAdapterPath =
    process.env.KLAR_BENCH_PRECISION_ADAPTER_PATH
  const writerAdapterPath = process.env.KLAR_BENCH_WRITER_ADAPTER_PATH
  const externalUrl = process.env.KLAR_BENCH_LOCAL_URL
  if ((runtimePath && !modelPath) || (!runtimePath && modelPath)) {
    console.error(
      'KLAR_BENCH_RUNTIME_PATH and KLAR_BENCH_MODEL_PATH must be set together.',
    )
    process.exitCode = 64
    return
  }
  if (runtimePath && externalUrl) {
    console.error(
      'Choose owned mode paths or KLAR_BENCH_LOCAL_URL, not both.',
    )
    process.exitCode = 64
    return
  }

  let owned: OwnedLlamaServer | undefined
  let localUnavailableReason: string | undefined
  const runConfig: BenchmarkRunConfig = {
    cwd: process.cwd(),
    runtimePath,
    modelPath,
    precisionAdapterPath,
    writerAdapterPath,
    groqApiKey: process.env.GROQ_API_KEY,
    groqEndpoint:
      process.env.KLAR_BENCH_GROQ_ENDPOINT ??
      'https://api.groq.com/openai',
    groqModel:
      process.env.KLAR_BENCH_GROQ_MODEL ?? 'openai/gpt-oss-120b',
    includeOutputs: options.includeOutputs,
    hashArtifacts: options.hashArtifacts,
    runCrashRecovery: options.crashRecovery,
  }

  try {
    if (runtimePath && modelPath) {
      owned = new OwnedLlamaServer({
        runtimePath,
        modelPath,
        precisionAdapterPath,
        writerAdapterPath,
        contextTokens: options.contextTokens,
        startupTimeoutMs: 120_000,
      })
      try {
        const start = await owned.start()
        const indexes = owned.adapterIndexes()
        console.log(
          `Owned local runtime ready in ${start.warmupMs} ms (PID ${start.pid}).`,
        )
        runConfig.local = {
          mode: 'owned',
          endpoint: owned.endpoint,
          apiKey: owned.apiKey,
          modelAlias: 'klar-local',
          pid: owned.pid,
          precisionAdapterIndex: indexes.precision,
          writerAdapterIndex: indexes.writer,
        }
        runConfig.localWarmupMs = start.warmupMs
        runConfig.crashRecovery = () => owned!.crashAndRestart()
      } catch (error) {
        console.error(
          error instanceof Error
            ? `Owned local runtime could not start: ${error.message}`
            : 'Owned local runtime could not start.',
        )
        localUnavailableReason =
          'Owned local runtime could not start; inspect the local terminal output.'
      }
    } else if (externalUrl) {
      let endpoint: string
      try {
        endpoint = assertLoopbackEndpoint(externalUrl)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 64
        return
      }
      runConfig.local = {
        mode: 'external',
        endpoint,
        apiKey: process.env.KLAR_BENCH_LOCAL_API_KEY,
        modelAlias: process.env.KLAR_BENCH_LOCAL_MODEL ?? 'klar-local',
        pid: optionalInteger(
          process.env.KLAR_BENCH_LOCAL_PID,
          'KLAR_BENCH_LOCAL_PID',
        ),
        precisionAdapterIndex: optionalNonNegativeInteger(
          process.env.KLAR_BENCH_PRECISION_LORA_ID,
          'KLAR_BENCH_PRECISION_LORA_ID',
        ),
        writerAdapterIndex: optionalNonNegativeInteger(
          process.env.KLAR_BENCH_WRITER_LORA_ID,
          'KLAR_BENCH_WRITER_LORA_ID',
        ),
      }
    } else {
      localUnavailableReason =
        'No owned runtime/model paths or external loopback endpoint were configured.'
    }
    runConfig.localUnavailableReason = localUnavailableReason

    const report = await runBenchmarkSuite(runConfig)
    await atomicWriteJson(options.output, report)
    console.log(`Benchmark report written to ${options.output}`)
    console.log(
      `Overall: ${report.summary.overallStatus}; ` +
        `${report.summary.releaseBlockers.length} release blocker(s); ` +
        `${report.summary.warnings.length} optional warning(s).`,
    )
    process.exitCode =
      report.summary.overallStatus === 'pass'
        ? 0
        : report.summary.overallStatus === 'fail'
          ? 1
          : 2
  } finally {
    await owned?.stop()
  }
}

await main()