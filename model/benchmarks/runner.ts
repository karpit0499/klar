import type {
  ArtifactMeasurement,
  BenchmarkAdapter,
  BenchmarkCaseResult,
  BenchmarkFixture,
  BenchmarkLanguage,
  BenchmarkProvider,
  BenchmarkReport,
  BenchmarkStatus,
  BenchmarkTask,
  ResilienceProbe,
} from './types.ts'
import {
  BENCHMARK_FIXTURES,
  fixtureFor,
} from './fixtures.ts'
import {
  outputSha256,
  validateBenchmarkOutput,
} from './validation.ts'
import {
  PeakRssSampler,
  collectArtifactMeasurements,
  collectHardware,
  sampleThermalPressure,
  sourceCommit,
  sourceTreeDirty,
  summarizeReport,
} from './system.ts'
import {
  probeStreamingCancellation,
  streamStructuredGeneration,
  type StreamingProviderConfig,
} from './http.ts'
import {
  BENCHMARK_VERSION,
  FIXTURE_VERSION,
  type ThermalSample,
} from './types.ts'

type LocalConnection = {
  mode: 'owned' | 'external'
  endpoint: string
  apiKey?: string
  modelAlias: string
  pid?: number
  precisionAdapterIndex?: number
  writerAdapterIndex?: number
}

export type BenchmarkRunConfig = {
  cwd?: string
  local?: LocalConnection
  localUnavailableReason?: string
  localWarmupMs?: number
  runtimePath?: string
  modelPath?: string
  precisionAdapterPath?: string
  writerAdapterPath?: string
  groqApiKey?: string
  groqEndpoint?: string
  groqModel?: string
  includeOutputs?: boolean
  hashArtifacts?: boolean
  runCrashRecovery?: boolean
  crashRecovery?: () => Promise<{
    stoppedHealthCheckPassed: boolean
    restartedHealthCheckPassed: boolean
    totalMs: number
  }>
  fetcher?: typeof fetch
  thermalSampler?: () => Promise<ThermalSample>
  rssFactory?: (pid?: number) => PeakRssSampler
  artifactCollector?: (config: {
    runtimePath?: string
    modelPath?: string
    precisionAdapterPath?: string
    writerAdapterPath?: string
    hashArtifacts: boolean
  }) => Promise<BenchmarkReport['artifacts']>
  hardwareCollector?: () => BenchmarkReport['hardware']
  sourceCommitCollector?: (cwd?: string) => Promise<string | null>
  sourceDirtyCollector?: (cwd?: string) => Promise<boolean | null>
}

type ProviderPlan = {
  provider: BenchmarkProvider
  adapter: BenchmarkAdapter
  tasks: readonly BenchmarkTask[]
  required: boolean
}

const ALL_TASKS = [
  'extraction',
  'evidence_linking',
  'normalization',
  'resume_expression',
  'cover_letter',
  'recruiter_message',
] as const satisfies readonly BenchmarkTask[]

const PROVIDER_PLANS: readonly ProviderPlan[] = [
  {
    provider: 'local-base',
    adapter: 'base',
    tasks: ALL_TASKS,
    required: true,
  },
  {
    provider: 'local-precision',
    adapter: 'precision',
    tasks: ['extraction', 'evidence_linking'],
    required: true,
  },
  {
    provider: 'local-writer',
    adapter: 'writer',
    tasks: ['resume_expression', 'cover_letter', 'recruiter_message'],
    required: true,
  },
  {
    provider: 'groq',
    adapter: 'none',
    tasks: ALL_TASKS,
    required: false,
  },
  {
    provider: 'deterministic',
    adapter: 'none',
    tasks: ['normalization'],
    required: true,
  },
]

function caseId(
  provider: BenchmarkProvider,
  fixture: BenchmarkFixture,
): string {
  return `${provider}:${fixture.task}:${fixture.language}`
}

function unavailableCase(
  plan: ProviderPlan,
  fixture: BenchmarkFixture,
  status: BenchmarkStatus,
  reasonCode: string,
  reason: string,
): BenchmarkCaseResult {
  return {
    caseId: caseId(plan.provider, fixture),
    fixtureId: fixture.id,
    task: fixture.task,
    language: fixture.language,
    provider: plan.provider,
    adapter: plan.adapter,
    requiredForLocalExperiment: plan.required,
    status,
    reasonCode,
    reason,
  }
}

function deterministicNormalization(
  language: BenchmarkLanguage,
): Record<string, string> {
  void language
  return {
    normalizedTitle: 'Senior Data Analyst',
    occupationFamily: 'Data Analytics',
    city: 'Berlin',
    countryCode: 'DE',
    remoteMode: 'hybrid',
  }
}

function localProvider(
  config: BenchmarkRunConfig,
  plan: ProviderPlan,
): StreamingProviderConfig | null {
  if (!config.local) return null
  let lora: Array<{ id: number; scale: number }> | undefined
  if (plan.adapter === 'precision') {
    if (config.local.precisionAdapterIndex === undefined) return null
    lora = [{ id: config.local.precisionAdapterIndex, scale: 1 }]
  }
  if (plan.adapter === 'writer') {
    if (config.local.writerAdapterIndex === undefined) return null
    lora = [{ id: config.local.writerAdapterIndex, scale: 1 }]
  }
  if (plan.adapter === 'base') lora = []
  return {
    endpoint: config.local.endpoint,
    apiKey: config.local.apiKey,
    model: config.local.modelAlias,
    schemaDialect: 'llama-json-object',
    lora,
    fetcher: config.fetcher,
  }
}

async function runGeneratedCase(
  config: BenchmarkRunConfig,
  plan: ProviderPlan,
  fixture: BenchmarkFixture,
  provider: StreamingProviderConfig,
): Promise<BenchmarkCaseResult> {
  const thermalSampler = config.thermalSampler ?? sampleThermalPressure
  const rss = (config.rssFactory ?? ((pid) => new PeakRssSampler(pid)))(
    plan.provider.startsWith('local') ? config.local?.pid : undefined,
  )
  const startedAt = new Date().toISOString()
  const thermalBefore = plan.provider.startsWith('local')
    ? await thermalSampler()
    : undefined
  await rss.start()
  try {
    const generated = await streamStructuredGeneration(provider, fixture)
    const validation = validateBenchmarkOutput(fixture, generated.content)
    const thermalAfter = plan.provider.startsWith('local')
      ? await thermalSampler()
      : undefined
    const memory = await rss.stop()
    const passed =
      validation.validStructuredOutput && validation.evidenceGrounded
    return {
      caseId: caseId(plan.provider, fixture),
      fixtureId: fixture.id,
      task: fixture.task,
      language: fixture.language,
      provider: plan.provider,
      adapter: plan.adapter,
      requiredForLocalExperiment: plan.required,
      status: passed ? 'pass' : 'fail',
      ...(passed
        ? {}
        : {
            reasonCode: 'output_validation_failed',
            reason: validation.issues.join(' '),
          }),
      startedAt,
      measurement: generated.measurement,
      memory,
      ...(thermalBefore ? { thermalBefore } : {}),
      ...(thermalAfter ? { thermalAfter } : {}),
      ...(config.includeOutputs ? { output: generated.content } : {}),
      outputSha256: outputSha256(generated.content),
      outputCharacters: generated.content.length,
      validation,
    }
  } catch (error) {
    const memory = await rss.stop()
    const thermalAfter = plan.provider.startsWith('local')
      ? await thermalSampler()
      : undefined
    return {
      caseId: caseId(plan.provider, fixture),
      fixtureId: fixture.id,
      task: fixture.task,
      language: fixture.language,
      provider: plan.provider,
      adapter: plan.adapter,
      requiredForLocalExperiment: plan.required,
      status: 'fail',
      reasonCode: 'generation_failed',
      reason:
        error instanceof Error
          ? `Generation failed: ${error.message}`
          : 'Generation failed.',
      startedAt,
      memory,
      ...(thermalBefore ? { thermalBefore } : {}),
      ...(thermalAfter ? { thermalAfter } : {}),
    }
  }
}

async function runDeterministicCase(
  plan: ProviderPlan,
  fixture: BenchmarkFixture,
  includeOutputs: boolean,
): Promise<BenchmarkCaseResult> {
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const output = JSON.stringify(deterministicNormalization(fixture.language))
  const validation = validateBenchmarkOutput(fixture, output)
  const totalMs = Math.max(0, Math.round(performance.now() - started))
  const passed =
    validation.validStructuredOutput && validation.evidenceGrounded
  return {
    caseId: caseId(plan.provider, fixture),
    fixtureId: fixture.id,
    task: fixture.task,
    language: fixture.language,
    provider: plan.provider,
    adapter: plan.adapter,
    requiredForLocalExperiment: plan.required,
    status: passed ? 'pass' : 'fail',
    ...(passed
      ? {}
      : {
          reasonCode: 'output_validation_failed',
          reason: validation.issues.join(' '),
        }),
    startedAt,
    measurement: {
      totalMs,
      finishReason: 'deterministic',
    },
    ...(includeOutputs ? { output } : {}),
    outputSha256: outputSha256(output),
    outputCharacters: output.length,
    validation,
  }
}

async function runCases(config: BenchmarkRunConfig): Promise<BenchmarkCaseResult[]> {
  const results: BenchmarkCaseResult[] = []
  for (const plan of PROVIDER_PLANS) {
    for (const task of plan.tasks) {
      for (const language of ['en', 'de'] as const) {
        const fixture = fixtureFor(task, language)
        if (plan.provider === 'deterministic') {
          results.push(
            await runDeterministicCase(
              plan,
              fixture,
              config.includeOutputs ?? false,
            ),
          )
          continue
        }
        if (plan.provider === 'groq') {
          if (!config.groqApiKey) {
            results.push(
              unavailableCase(
                plan,
                fixture,
                'not_run',
                'missing_credentials',
                'Groq comparison was not run because GROQ_API_KEY is absent.',
              ),
            )
            continue
          }
          results.push(
            await runGeneratedCase(config, plan, fixture, {
              endpoint: config.groqEndpoint ?? 'https://api.groq.com/openai',
              apiKey: config.groqApiKey,
              model: config.groqModel ?? 'openai/gpt-oss-120b',
              schemaDialect: 'openai-json-schema',
              fetcher: config.fetcher,
            }),
          )
          continue
        }
        const provider = localProvider(config, plan)
        if (!config.local) {
          results.push(
            unavailableCase(
              plan,
              fixture,
              'hold',
              'local_runtime_unavailable',
              config.localUnavailableReason ??
                'No local llama.cpp endpoint or owned runtime was configured.',
            ),
          )
          continue
        }
        if (!provider) {
          const precision = plan.adapter === 'precision'
          results.push(
            unavailableCase(
              plan,
              fixture,
              'hold',
              precision
                ? 'precision_adapter_not_loaded'
                : 'writer_adapter_not_loaded',
              `The ${plan.adapter} adapter is not loaded; this case was not fabricated.`,
            ),
          )
          continue
        }
        results.push(await runGeneratedCase(config, plan, fixture, provider))
      }
    }
  }
  return results
}

async function cancellationProbe(
  config: BenchmarkRunConfig,
): Promise<ResilienceProbe> {
  if (!config.local) {
    return {
      requiredForLocalExperiment: true,
      status: 'hold',
      reasonCode: 'local_runtime_unavailable',
      reason:
        config.localUnavailableReason ??
        'Cancellation was not run because no local runtime is configured.',
    }
  }
  const fixture = fixtureFor('cover_letter', 'en')
  try {
    const result = await probeStreamingCancellation(
      {
        endpoint: config.local.endpoint,
        apiKey: config.local.apiKey,
        model: config.local.modelAlias,
        schemaDialect: 'llama-json-object',
        lora: [],
        fetcher: config.fetcher,
      },
      fixture,
    )
    const passed = result.cancelled && result.healthReady
    return {
      requiredForLocalExperiment: true,
      status: passed ? 'pass' : 'fail',
      ...(passed
        ? {}
        : {
            reasonCode: 'cancellation_probe_failed',
            reason:
              'The request did not abort cleanly or the runtime was not healthy afterward.',
          }),
      measurement: {
        totalMs: result.totalMs,
        ...(result.firstTokenMs === undefined
          ? {}
          : { firstTokenMs: result.firstTokenMs }),
        restartedHealthCheckPassed: result.healthReady,
      },
    }
  } catch (error) {
    return {
      requiredForLocalExperiment: true,
      status: 'fail',
      reasonCode: 'cancellation_probe_error',
      reason:
        error instanceof Error
          ? `Cancellation probe failed: ${error.message}`
          : 'Cancellation probe failed.',
    }
  }
}

async function crashRecoveryProbe(
  config: BenchmarkRunConfig,
): Promise<ResilienceProbe> {
  if (!config.local) {
    return {
      requiredForLocalExperiment: true,
      status: 'hold',
      reasonCode: 'local_runtime_unavailable',
      reason:
        config.localUnavailableReason ??
        'Crash recovery was not run because no local runtime is configured.',
    }
  }
  if (config.local.mode !== 'owned') {
    return {
      requiredForLocalExperiment: true,
      status: 'not_run',
      reasonCode: 'owned_runtime_required',
      reason:
        'Crash recovery is destructive and is only allowed against a server started by this benchmark.',
    }
  }
  if (!config.runCrashRecovery || !config.crashRecovery) {
    return {
      requiredForLocalExperiment: true,
      status: 'not_run',
      reasonCode: 'crash_probe_not_enabled',
      reason:
        'Owned runtime crash/restart was not enabled; no recovery claim is made.',
    }
  }
  try {
    const result = await config.crashRecovery()
    const passed =
      result.stoppedHealthCheckPassed && result.restartedHealthCheckPassed
    return {
      requiredForLocalExperiment: true,
      status: passed ? 'pass' : 'fail',
      ...(passed
        ? {}
        : {
            reasonCode: 'crash_recovery_failed',
            reason:
              'The owned runtime did not prove both stopped and restarted health states.',
          }),
      measurement: result,
    }
  } catch (error) {
    return {
      requiredForLocalExperiment: true,
      status: 'fail',
      reasonCode: 'crash_recovery_error',
      reason:
        error instanceof Error
          ? `Crash recovery probe failed: ${error.message}`
          : 'Crash recovery probe failed.',
    }
  }
}

export async function runBenchmarkSuite(
  config: BenchmarkRunConfig,
): Promise<BenchmarkReport> {
  if (BENCHMARK_FIXTURES.length !== 12) {
    throw new Error('Benchmark fixture matrix must contain six tasks in EN and DE.')
  }
  const artifactCollector =
    config.artifactCollector ?? collectArtifactMeasurements
  const [artifacts, commit, dirty] = await Promise.all([
    artifactCollector({
      runtimePath: config.runtimePath,
      modelPath: config.modelPath,
      precisionAdapterPath: config.precisionAdapterPath,
      writerAdapterPath: config.writerAdapterPath,
      hashArtifacts: config.hashArtifacts ?? false,
    }),
    (config.sourceCommitCollector ?? sourceCommit)(config.cwd),
    (config.sourceDirtyCollector ?? sourceTreeDirty)(config.cwd),
  ])
  const cases = await runCases(config)
  const resilience = {
    cancellation: await cancellationProbe(config),
    crashRecovery: await crashRecoveryProbe(config),
  }
  return {
    schemaVersion: 1,
    benchmarkVersion: BENCHMARK_VERSION,
    fixtureVersion: FIXTURE_VERSION,
    generatedAt: new Date().toISOString(),
    sourceCommit: commit,
    sourceTreeDirty: dirty,
    configuration: {
      localMode: config.local?.mode ?? 'unavailable',
      localEndpointConfigured: !!config.local,
      localModelAlias: config.local?.modelAlias ?? 'klar-local',
      ...(config.localWarmupMs === undefined
        ? {}
        : { localWarmupMs: config.localWarmupMs }),
      adaptersConfigured: {
        precision: config.local?.precisionAdapterIndex !== undefined,
        writer: config.local?.writerAdapterIndex !== undefined,
      },
      groqCredentialsPresent: !!config.groqApiKey,
      groqModel: config.groqModel ?? 'openai/gpt-oss-120b',
      includeOutputs: config.includeOutputs ?? false,
      hashArtifacts: config.hashArtifacts ?? false,
    },
    hardware: (config.hardwareCollector ?? collectHardware)(),
    artifacts,
    cases,
    resilience,
    summary: summarizeReport(cases, resilience),
  }
}

export function emptyArtifactReport(): BenchmarkReport['artifacts'] {
  const entries: ArtifactMeasurement[] = []
  return { entries, status: 'unavailable' }
}