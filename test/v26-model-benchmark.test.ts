import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import {
  BENCHMARK_FIXTURES,
  fixtureFor,
} from '../model/benchmarks/fixtures.ts'
import {
  probeStreamingCancellation,
  streamStructuredGeneration,
} from '../model/benchmarks/http.ts'
import {
  buildOwnedServerArgs,
  type OwnedServerConfig,
} from '../model/benchmarks/ownedServer.ts'
import {
  emptyArtifactReport,
  runBenchmarkSuite,
} from '../model/benchmarks/runner.ts'
import {
  PeakRssSampler,
  memoryTier,
  parsePmsetThermalOutput,
  summarizeReport,
} from '../model/benchmarks/system.ts'
import {
  BENCHMARK_LANGUAGES,
  BENCHMARK_TASKS,
  type BenchmarkCaseResult,
  type BenchmarkReport,
} from '../model/benchmarks/types.ts'
import {
  validateBenchmarkOutput,
} from '../model/benchmarks/validation.ts'

assert.equal(BENCHMARK_FIXTURES.length, 12)
for (const task of BENCHMARK_TASKS) {
  for (const language of BENCHMARK_LANGUAGES) {
    assert.equal(fixtureFor(task, language).task, task)
  }
}
assert.equal(
  new Set(BENCHMARK_FIXTURES.map((fixture) => fixture.id)).size,
  BENCHMARK_FIXTURES.length,
)

const extractionFixture = fixtureFor('extraction', 'en')
const validExtraction = JSON.stringify({
  title: 'Data Operations Analyst',
  company: 'Northstar Logistics GmbH',
  requiredSkills: ['SQL', 'Python'],
  preferredSkills: ['Tableau'],
})
assert.deepEqual(validateBenchmarkOutput(extractionFixture, validExtraction), {
  validStructuredOutput: true,
  evidenceGrounded: true,
  issues: [],
  parsed: JSON.parse(validExtraction),
})
assert.equal(
  validateBenchmarkOutput(
    extractionFixture,
    `\`\`\`json\n${validExtraction}\n\`\`\``,
  ).validStructuredOutput,
  false,
)

const misplacedExtraction = JSON.stringify({
  title: 'Data Operations Analyst',
  company: 'Northstar Logistics GmbH',
  requiredSkills: ['SQL'],
  preferredSkills: ['Tableau', 'Python'],
})
const misplacedExtractionValidation = validateBenchmarkOutput(
  extractionFixture,
  misplacedExtraction,
)
assert.equal(misplacedExtractionValidation.validStructuredOutput, true)
assert.equal(misplacedExtractionValidation.evidenceGrounded, false)
assert.ok(
  misplacedExtractionValidation.issues.some((issue) =>
    issue.includes('requiredSkills membership must match'),
  ),
)
assert.ok(
  misplacedExtractionValidation.issues.some((issue) =>
    issue.includes('preferredSkills membership must match'),
  ),
)

const evidenceFixture = fixtureFor('evidence_linking', 'en')
const validEvidence = JSON.stringify({
  links: [
    {
      requirementId: 'req-sql',
      evidenceId: 'exp-01',
      rationale: 'The SQL evidence directly supports this requirement.',
    },
    {
      requirementId: 'req-sap',
      evidenceId: null,
      rationale: 'No SAP evidence is present.',
    },
  ],
})
assert.deepEqual(validateBenchmarkOutput(evidenceFixture, validEvidence), {
  validStructuredOutput: true,
  evidenceGrounded: true,
  issues: [],
  parsed: JSON.parse(validEvidence),
})
const inventedEvidence = JSON.stringify({
  links: [
    {
      requirementId: 'req-sql',
      evidenceId: 'exp-02',
      rationale: 'Invented support.',
    },
    {
      requirementId: 'req-sap',
      evidenceId: null,
      rationale: 'No support.',
    },
  ],
})
const inventedValidation = validateBenchmarkOutput(
  evidenceFixture,
  inventedEvidence,
)
assert.equal(inventedValidation.validStructuredOutput, true)
assert.equal(inventedValidation.evidenceGrounded, false)
assert.ok(
  inventedValidation.issues.some((issue) =>
    issue.includes('unknown evidence id'),
  ),
)

const swappedEvidence = JSON.stringify({
  links: [
    {
      requirementId: 'req-sql',
      evidenceId: null,
      rationale: 'The known evidence was deliberately assigned elsewhere.',
    },
    {
      requirementId: 'req-sap',
      evidenceId: 'exp-01',
      rationale: 'This swaps the otherwise present requirement and evidence IDs.',
    },
  ],
})
const swappedEvidenceValidation = validateBenchmarkOutput(
  evidenceFixture,
  swappedEvidence,
)
assert.equal(swappedEvidenceValidation.validStructuredOutput, true)
assert.equal(swappedEvidenceValidation.evidenceGrounded, false)
assert.ok(
  swappedEvidenceValidation.issues.includes('req-sql must map to exp-01.'),
)
assert.ok(
  swappedEvidenceValidation.issues.includes('req-sap must map to null.'),
)

const duplicateEvidenceLink = JSON.stringify({
  links: [
    {
      requirementId: 'req-sql',
      evidenceId: 'exp-01',
      rationale: 'First copy.',
    },
    {
      requirementId: 'req-sql',
      evidenceId: 'exp-01',
      rationale: 'Duplicate copy in place of req-sap.',
    },
  ],
})
const duplicateEvidenceValidation = validateBenchmarkOutput(
  evidenceFixture,
  duplicateEvidenceLink,
)
assert.equal(duplicateEvidenceValidation.validStructuredOutput, true)
assert.equal(duplicateEvidenceValidation.evidenceGrounded, false)
assert.ok(
  duplicateEvidenceValidation.issues.includes(
    'links contains duplicate requirement id: req-sql.',
  ),
)
assert.ok(
  duplicateEvidenceValidation.issues.includes(
    'links omits required requirement id: req-sap.',
  ),
)

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(
            encoder.encode(
              event === '[DONE]'
                ? 'data: [DONE]\n\n'
                : `data: ${JSON.stringify(event)}\n\n`,
            ),
          )
        }
        controller.close()
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  )
}

let capturedBody: Record<string, unknown> | undefined
const streamingFetch: typeof fetch = async (_input, init) => {
  capturedBody = JSON.parse(String(init?.body))
  return sseResponse([
    {
      choices: [
        {
          delta: { content: validExtraction.slice(0, 24) },
          finish_reason: null,
        },
      ],
    },
    {
      choices: [
        {
          delta: { content: validExtraction.slice(24) },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 25,
        total_tokens: 75,
      },
    },
    '[DONE]',
  ])
}
const streamed = await streamStructuredGeneration(
  {
    endpoint: 'http://127.0.0.1:18080',
    apiKey: 'unit-test-key',
    model: 'klar-local',
    schemaDialect: 'llama-json-object',
    lora: [],
    fetcher: streamingFetch,
  },
  extractionFixture,
)
assert.equal(streamed.content, validExtraction)
assert.equal(streamed.measurement.finishReason, 'stop')
assert.equal(streamed.measurement.totalTokens, 75)
assert.equal(typeof streamed.measurement.firstTokenMs, 'number')
assert.deepEqual(capturedBody?.response_format, {
  type: 'json_object',
  schema: extractionFixture.schema,
})
assert.deepEqual(capturedBody?.lora, [])
assert.deepEqual(capturedBody?.chat_template_kwargs, {
  enable_thinking: false,
})
assert.equal(capturedBody?.stream, true)

let healthCalls = 0
const cancellableFetch: typeof fetch = async (input, init) => {
  if (String(input).endsWith('/health')) {
    healthCalls += 1
    return new Response('{"status":"ok"}', { status: 200 })
  }
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener(
      'abort',
      () => reject(new DOMException('Aborted', 'AbortError')),
      { once: true },
    )
  })
}
const cancellation = await probeStreamingCancellation(
  {
    endpoint: 'http://127.0.0.1:18080',
    model: 'klar-local',
    schemaDialect: 'llama-json-object',
    fetcher: cancellableFetch,
  },
  fixtureFor('cover_letter', 'en'),
  { abortAfterMs: 1 },
)
assert.equal(cancellation.cancelled, true)
assert.equal(cancellation.healthReady, true)
assert.equal(healthCalls, 1)

const ownedConfig: OwnedServerConfig = {
  runtimePath: '/verified/llama-server',
  modelPath: '/verified/model.gguf',
  precisionAdapterPath: '/verified/precision.gguf',
  writerAdapterPath: '/verified/writer.gguf',
  contextTokens: 8192,
  startupTimeoutMs: 120_000,
}
const ownedArgs = buildOwnedServerArgs({
  config: ownedConfig,
  port: 18080,
  apiKeyFile: '/private/key',
})
assert.deepEqual(ownedArgs.slice(0, 8), [
  '--host',
  '127.0.0.1',
  '--port',
  '18080',
  '--model',
  '/verified/model.gguf',
  '--alias',
  'klar-local',
])
assert.equal(
  ownedArgs[ownedArgs.indexOf('--lora') + 1],
  '/verified/precision.gguf,/verified/writer.gguf',
)
assert.ok(ownedArgs.includes('--lora-init-without-apply'))
assert.ok(ownedArgs.includes('--offline'))

assert.equal(memoryTier(8 * 1_024 ** 3), 'unsupported')
assert.equal(memoryTier(16 * 1_024 ** 3), 'minimum')
assert.equal(memoryTier(32 * 1_024 ** 3), 'recommended')
assert.deepEqual(
  parsePmsetThermalOutput(
    [
      'CPU_Speed_Limit = 80',
      'Scheduler_Limit = 100',
      'CPU_Available_CPUs = 8',
    ].join('\n'),
    '2026-07-31T00:00:00.000Z',
  ),
  {
    capturedAt: '2026-07-31T00:00:00.000Z',
    status: 'measured',
    source: 'pmset',
    pressure: 'pressured',
    cpuSpeedLimitPercent: 80,
    schedulerLimitPercent: 100,
    availableCpuCount: 8,
  },
)

const rssValues = [100, 250, 175]
const rss = new PeakRssSampler(
  123,
  async () => rssValues.shift() ?? 175,
  60_000,
)
await rss.start()
const rssResult = await rss.stop()
assert.equal(rssResult.status, 'measured')
assert.equal(rssResult.peakBytes, 250)
assert.equal(rssResult.samples, 2)

const scopedSummaryCases = [
  {
    caseId: 'local-base:extraction:en',
    fixtureId: 'extraction-en-01',
    task: 'extraction',
    language: 'en',
    provider: 'local-base',
    adapter: 'base',
    requiredForLocalExperiment: true,
    status: 'pass',
    measurement: { firstTokenMs: 100, totalMs: 200, finishReason: 'stop' },
    memory: { status: 'measured', pid: 10, peakBytes: 500, samples: 2 },
    validation: {
      validStructuredOutput: true,
      evidenceGrounded: true,
      issues: [],
    },
  },
  {
    caseId: 'local-base:normalization:en',
    fixtureId: 'normalization-en-01',
    task: 'normalization',
    language: 'en',
    provider: 'local-base',
    adapter: 'base',
    requiredForLocalExperiment: true,
    status: 'fail',
    measurement: { firstTokenMs: 300, totalMs: 600, finishReason: 'stop' },
    memory: { status: 'measured', pid: 10, peakBytes: 900, samples: 2 },
    validation: {
      validStructuredOutput: false,
      evidenceGrounded: false,
      issues: ['Synthetic validation failure.'],
    },
  },
  {
    caseId: 'local-writer:cover_letter:en',
    fixtureId: 'cover-en-01',
    task: 'cover_letter',
    language: 'en',
    provider: 'local-writer',
    adapter: 'writer',
    requiredForLocalExperiment: true,
    status: 'fail',
    reasonCode: 'generation_failed',
  },
  {
    caseId: 'local-precision:extraction:en',
    fixtureId: 'extraction-en-01',
    task: 'extraction',
    language: 'en',
    provider: 'local-precision',
    adapter: 'precision',
    requiredForLocalExperiment: true,
    status: 'hold',
  },
  {
    caseId: 'deterministic:normalization:en',
    fixtureId: 'normalization-en-01',
    task: 'normalization',
    language: 'en',
    provider: 'deterministic',
    adapter: 'none',
    requiredForLocalExperiment: true,
    status: 'pass',
    measurement: { totalMs: 0, finishReason: 'stop' },
    memory: { status: 'measured', pid: 11, peakBytes: 9_999, samples: 2 },
    validation: {
      validStructuredOutput: true,
      evidenceGrounded: true,
      issues: [],
    },
  },
  {
    caseId: 'groq:extraction:en',
    fixtureId: 'extraction-en-01',
    task: 'extraction',
    language: 'en',
    provider: 'groq',
    adapter: 'none',
    requiredForLocalExperiment: false,
    status: 'pass',
    measurement: { firstTokenMs: 1, totalMs: 1, finishReason: 'stop' },
    memory: { status: 'measured', pid: 12, peakBytes: 99_999, samples: 2 },
    validation: {
      validStructuredOutput: true,
      evidenceGrounded: true,
      issues: [],
    },
  },
] satisfies BenchmarkCaseResult[]
const scopedSummaryResilience = {
  cancellation: { requiredForLocalExperiment: true, status: 'pass' },
  crashRecovery: { requiredForLocalExperiment: true, status: 'pass' },
} satisfies BenchmarkReport['resilience']
const scopedSummary = summarizeReport(
  scopedSummaryCases,
  scopedSummaryResilience,
)
assert.deepEqual(scopedSummary.localModelMetrics, {
  scope: 'executed_local_model_cases',
  executedCaseCount: 3,
  structuredOutputPassRate: 1 / 3,
  evidenceGroundingPassRate: 1 / 3,
  measuredFirstTokenP50Ms: 100,
  measuredFirstTokenP95Ms: 300,
  measuredTotalLatencyP50Ms: 200,
  measuredTotalLatencyP95Ms: 600,
  peakRssBytes: 900,
})

const dryReport = await runBenchmarkSuite({
  includeOutputs: true,
  artifactCollector: async () => emptyArtifactReport(),
  hardwareCollector: () => ({
    platform: 'darwin',
    architecture: 'arm64',
    cpuModel: 'Unit Test CPU',
    logicalCpuCount: 8,
    totalMemoryBytes: 16 * 1_024 ** 3,
    memoryTier: 'minimum',
  }),
  sourceCommitCollector: async () =>
    '0123456789abcdef0123456789abcdef01234567',
  sourceDirtyCollector: async () => true,
})
assert.equal(dryReport.cases.length, 36)
assert.equal(dryReport.summary.overallStatus, 'hold')
assert.equal(dryReport.sourceTreeDirty, true)
assert.deepEqual(dryReport.summary.required, {
  pass: 2,
  fail: 0,
  hold: 24,
  not_run: 0,
})
assert.deepEqual(dryReport.summary.optional, {
  pass: 0,
  fail: 0,
  hold: 0,
  not_run: 12,
})
assert.deepEqual(dryReport.summary.localModelMetrics, {
  scope: 'executed_local_model_cases',
  executedCaseCount: 0,
  structuredOutputPassRate: null,
  evidenceGroundingPassRate: null,
  measuredFirstTokenP50Ms: null,
  measuredFirstTokenP95Ms: null,
  measuredTotalLatencyP50Ms: null,
  measuredTotalLatencyP95Ms: null,
  peakRssBytes: null,
})
assert.equal(
  dryReport.cases.filter(
    (result) =>
      result.provider === 'deterministic' && result.status === 'pass',
  ).length,
  2,
)
assert.equal(
  dryReport.cases.filter(
    (result) =>
      result.provider === 'groq' &&
      result.status === 'not_run' &&
      result.reasonCode === 'missing_credentials',
  ).length,
  12,
)
assert.equal(
  dryReport.cases.filter(
    (result) =>
      result.provider === 'local-precision' &&
      result.status === 'hold',
  ).length,
  4,
)

const schema = JSON.parse(
  await readFile(
    new URL('../model/schemas/benchmark-report.schema.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown>
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal(schema.title, 'Klar local-model benchmark report')
assert.equal((schema.properties as Record<string, unknown>).cases !== undefined, true)
const schemaDefinitions = schema.$defs as Record<string, Record<string, unknown>>
const summarySchema = schemaDefinitions.summary
assert.ok((summarySchema.required as string[]).includes('localModelMetrics'))
assert.equal(
  (summarySchema.required as string[]).includes('structuredOutputPassRate'),
  false,
)

console.log('v26-model-benchmark.test.ts: all tests passed')