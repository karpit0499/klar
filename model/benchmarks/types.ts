export const BENCHMARK_VERSION = 'klar-local-benchmark-v1' as const
export const FIXTURE_VERSION = 'klar-synthetic-bilingual-v1' as const

export const BENCHMARK_TASKS = [
  'extraction',
  'evidence_linking',
  'normalization',
  'resume_expression',
  'cover_letter',
  'recruiter_message',
] as const

export const BENCHMARK_LANGUAGES = ['en', 'de'] as const

export const BENCHMARK_PROVIDERS = [
  'local-base',
  'local-precision',
  'local-writer',
  'groq',
  'deterministic',
] as const

export type BenchmarkTask = (typeof BENCHMARK_TASKS)[number]
export type BenchmarkLanguage = (typeof BENCHMARK_LANGUAGES)[number]
export type BenchmarkProvider = (typeof BENCHMARK_PROVIDERS)[number]
export type BenchmarkStatus = 'pass' | 'fail' | 'hold' | 'not_run'
export type BenchmarkAdapter = 'base' | 'precision' | 'writer' | 'none'

export type JsonSchema = Record<string, unknown>

export type BenchmarkFixture = {
  id: string
  task: BenchmarkTask
  language: BenchmarkLanguage
  system: string
  user: string
  schema: JsonSchema
  expected: {
    exact?: Record<string, string | null>
    requiredSkills?: string[]
    preferredSkills?: string[]
    evidenceLinks?: Record<string, string | null>
    requiredStrings?: string[]
    requiredEvidenceIds?: string[]
    allowedEvidenceIds?: string[]
    forbiddenStrings?: string[]
  }
}

export type OutputValidation = {
  validStructuredOutput: boolean
  evidenceGrounded: boolean
  issues: string[]
  parsed?: Record<string, unknown>
}

export type ThermalSample = {
  capturedAt: string
  status: 'measured' | 'unsupported' | 'error'
  source: 'pmset' | 'unsupported'
  pressure: 'nominal' | 'pressured' | 'unknown'
  cpuSpeedLimitPercent?: number
  schedulerLimitPercent?: number
  availableCpuCount?: number
  reason?: string
}

export type RssMeasurement = {
  status: 'measured' | 'unsupported' | 'error'
  pid?: number
  peakBytes?: number
  samples: number
  reason?: string
}

export type GenerationMeasurement = {
  firstTokenMs?: number
  totalMs: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  finishReason: string
}

export type BenchmarkCaseResult = {
  caseId: string
  fixtureId: string
  task: BenchmarkTask
  language: BenchmarkLanguage
  provider: BenchmarkProvider
  adapter: BenchmarkAdapter
  requiredForLocalExperiment: boolean
  status: BenchmarkStatus
  reasonCode?: string
  reason?: string
  startedAt?: string
  measurement?: GenerationMeasurement
  memory?: RssMeasurement
  thermalBefore?: ThermalSample
  thermalAfter?: ThermalSample
  output?: string
  outputSha256?: string
  outputCharacters?: number
  validation?: OutputValidation
}

export type ArtifactMeasurement = {
  role: 'runtime' | 'base_model' | 'precision_adapter' | 'writer_adapter'
  configured: boolean
  status: 'measured' | 'missing' | 'not_configured' | 'error'
  fileName?: string
  bytes?: number
  sha256?: string
  reason?: string
}

export type ResilienceProbe = {
  requiredForLocalExperiment: boolean
  status: BenchmarkStatus
  reasonCode?: string
  reason?: string
  measurement?: {
    totalMs?: number
    firstTokenMs?: number
    stoppedHealthCheckPassed?: boolean
    restartedHealthCheckPassed?: boolean
  }
}

export type BenchmarkReport = {
  schemaVersion: 1
  benchmarkVersion: typeof BENCHMARK_VERSION
  fixtureVersion: typeof FIXTURE_VERSION
  generatedAt: string
  sourceCommit: string | null
  sourceTreeDirty: boolean | null
  configuration: {
    localMode: 'owned' | 'external' | 'unavailable'
    localEndpointConfigured: boolean
    localModelAlias: string
    localWarmupMs?: number
    adaptersConfigured: {
      precision: boolean
      writer: boolean
    }
    groqCredentialsPresent: boolean
    groqModel: string
    includeOutputs: boolean
    hashArtifacts: boolean
  }
  hardware: {
    platform: string
    architecture: string
    cpuModel: string
    logicalCpuCount: number
    totalMemoryBytes: number
    memoryTier: 'unsupported' | 'minimum' | 'recommended'
  }
  artifacts: {
    entries: ArtifactMeasurement[]
    modelPackageBytes?: number
    runtimeBytes?: number
    status: 'measured' | 'partial' | 'unavailable'
  }
  cases: BenchmarkCaseResult[]
  resilience: {
    cancellation: ResilienceProbe
    crashRecovery: ResilienceProbe
  }
  summary: {
    overallStatus: 'pass' | 'fail' | 'hold'
    required: Record<BenchmarkStatus, number>
    optional: Record<BenchmarkStatus, number>
    localModelMetrics: {
      scope: 'executed_local_model_cases'
      executedCaseCount: number
      structuredOutputPassRate: number | null
      evidenceGroundingPassRate: number | null
      measuredFirstTokenP50Ms: number | null
      measuredFirstTokenP95Ms: number | null
      measuredTotalLatencyP50Ms: number | null
      measuredTotalLatencyP95Ms: number | null
      peakRssBytes: number | null
    }
    releaseBlockers: string[]
    warnings: string[]
  }
}
