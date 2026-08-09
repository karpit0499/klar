import { strict as assert } from 'node:assert'
import {
  AI_CAPABILITIES,
  AiProviderError,
  AiProviderRegistry,
  LocalAiProvider,
  OpenAiCompatibleCloudProvider,
  capabilityDefinition,
  createDefaultAiProviderRegistry,
  providerSupports,
  validateGenerationRequest,
  type AiProvider,
  type GenerationRequest,
  type KlarDesktopBridge,
} from '../src/ai/index.ts'
import type { ChatOptions } from '../src/llm/groq.ts'
import type { EngineSettings } from '../src/llm/provider.ts'

const structuredRequest: GenerationRequest = {
  requestId: 'request-v26-0001',
  capability: 'structured_job_extraction',
  language: 'de',
  messages: [
    { role: 'system', content: 'Return grounded JSON.' },
    { role: 'user', content: 'SQL ist erforderlich.' },
  ],
  adapter: 'precision',
  maxOutputTokens: 512,
  temperature: 0,
  timeoutMs: 30_000,
  jsonSchema: {
    type: 'object',
    properties: {
      required_skills: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['required_skills'],
    additionalProperties: false,
  },
}

assert.deepEqual(validateGenerationRequest(structuredRequest), structuredRequest)
assert.equal(
  capabilityDefinition('structured_job_extraction').adapter,
  'precision',
)
assert.equal(capabilityDefinition('cover_letter').adapter, 'writer')
assert.deepEqual(
  Object.keys(AI_CAPABILITIES).sort(),
  [
    'cover_letter',
    'evidence_selection',
    'recruiter_message',
    'resume_bullet_revision',
    'structured_job_extraction',
  ],
)

assert.throws(
  () =>
    validateGenerationRequest({
      ...structuredRequest,
      path: '/tmp/model.gguf',
    }),
  (error: unknown) =>
    error instanceof AiProviderError && error.code === 'invalid_request',
)
assert.throws(
  () =>
    validateGenerationRequest({
      ...structuredRequest,
      adapter: 'writer',
    }),
  /cannot use the writer adapter/,
)
assert.throws(
  () => {
    const { jsonSchema: _schema, ...withoutSchema } = structuredRequest
    return validateGenerationRequest(withoutSchema)
  },
  /requires a JSON schema/,
)
assert.throws(
  () =>
    validateGenerationRequest({
      ...structuredRequest,
      maxOutputTokens: 99_999,
    }),
  /maxOutputTokens/,
)

const bridgeCalls: string[] = []
const bridge: KlarDesktopBridge = {
  desktop: true,
  system: {
    async getInfo() {
      throw new Error('not needed')
    },
  },
  runtime: {
    async getStatus() {
      return {
        phase: 'ready',
        artifactId: 'qwen-lab',
        modelId: 'Qwen/Qwen3.5-9B',
        runtimeVersion: 'b10199',
        adapters: ['base', 'precision', 'writer'],
        warmed: true,
        activeRequests: 0,
      }
    },
    async start() {
      return this.getStatus()
    },
    async stop() {
      return {
        phase: 'stopped',
        adapters: [],
        warmed: false,
        activeRequests: 0,
      }
    },
  },
  ai: {
    async generate(request) {
      bridgeCalls.push(`generate:${request.requestId}`)
      return {
        requestId: request.requestId,
        providerId: 'klar-local',
        modelId: 'Qwen/Qwen3.5-9B',
        adapter: request.adapter,
        content: '{"required_skills":["SQL"]}',
        finishReason: 'stop',
        timings: { totalMs: 10 },
      }
    },
    async cancel(requestId) {
      bridgeCalls.push(`cancel:${requestId}`)
      return true
    },
  },
  diagnostics: {
    async getRedactedReport() {
      throw new Error('not needed')
    },
  },
}

const local = new LocalAiProvider(bridge)
const health = await local.health()
assert.equal(health.status, 'ready')
assert.equal(
  providerSupports(
    local.describeCapabilities(),
    'cover_letter',
    'de',
  ),
  true,
)
const generated = await local.generate(structuredRequest)
assert.equal(generated.content, '{"required_skills":["SQL"]}')
assert.deepEqual(bridgeCalls, ['generate:request-v26-0001'])

const registry = new AiProviderRegistry()
registry.register(local)
assert.equal(registry.require('klar-local', 'cover_letter', 'en'), local)
assert.equal(registry.eligible('evidence_selection', 'de').length, 1)
assert.throws(() => registry.register(local), /already registered/)

const baseOnly: AiProvider = {
  id: 'base-only',
  kind: 'local',
  describeCapabilities: () => ({
    providerId: 'base-only',
    kind: 'local',
    capabilities: new Set(['cover_letter']),
    languages: new Set(['en']),
    adapters: new Set(['base']),
    structuredOutput: false,
    cancellation: false,
  }),
  async health() {
    return { status: 'unavailable', providerId: 'base-only', reason: 'test' }
  },
  async generate() {
    throw new Error('not used')
  },
  async cancel() {
    return false
  },
}
registry.register(baseOnly)
assert.throws(
  () => registry.require('base-only', 'cover_letter', 'en'),
  (error: unknown) =>
    error instanceof AiProviderError &&
    error.code === 'capability_unavailable',
)

const cloudEngine: EngineSettings = {
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'openai/gpt-oss-120b',
  fastModel: 'openai/gpt-oss-20b',
  requiresKey: true,
  fastMatching: false,
}
let capturedCloudOptions: ChatOptions | undefined
const cloud = new OpenAiCompatibleCloudProvider({
  loadEngine: async () => cloudEngine,
  loadApiKey: async () => 'test-key-resolved-at-call-time',
  probeAccess: async () => ({ ok: true }),
  complete: async (options) => {
    capturedCloudOptions = options
    return '{"required_skills":["SQL"]}'
  },
  now: (() => {
    let value = 100
    return () => {
      value += 5
      return value
    }
  })(),
})
const cloudHealth = await cloud.health()
assert.equal(cloudHealth.status, 'ready')
const cloudResult = await cloud.generate({
  ...structuredRequest,
  requestId: 'cloud-request-0001',
})
assert.equal(cloudResult.providerId, 'klar-cloud-openai-compatible')
assert.equal(cloudResult.modelId, 'openai/gpt-oss-120b')
assert.equal(cloudResult.content, '{"required_skills":["SQL"]}')
assert.equal(capturedCloudOptions?.apiKey, 'test-key-resolved-at-call-time')
assert.equal(
  capturedCloudOptions?.jsonSchema?.name,
  'klar_structured_job_extraction_v1',
)
assert.deepEqual(
  capturedCloudOptions?.jsonSchema?.schema,
  structuredRequest.jsonSchema,
)

const unavailableCloud = new OpenAiCompatibleCloudProvider({
  loadEngine: async () => cloudEngine,
  loadApiKey: async () => undefined,
  probeAccess: async () => {
    throw new Error('probe should not run without a required key')
  },
})
assert.deepEqual(await unavailableCloud.health(), {
  status: 'unavailable',
  providerId: 'klar-cloud-openai-compatible',
  reason: 'missing_credentials',
})
await assert.rejects(
  unavailableCloud.generate({
    ...structuredRequest,
    requestId: 'cloud-request-0002',
  }),
  (error: unknown) =>
    error instanceof AiProviderError && error.code === 'provider_unavailable',
)

const cancellableCloud = new OpenAiCompatibleCloudProvider({
  loadEngine: async () => cloudEngine,
  loadApiKey: async () => 'test-key',
  complete: (options) =>
    new Promise<string>((_resolve, reject) => {
      options.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      )
    }),
})
const cloudPending = cancellableCloud.generate({
  ...structuredRequest,
  requestId: 'cloud-cancel-0001',
})
await new Promise((resolve) => setImmediate(resolve))
assert.equal(await cancellableCloud.cancel('cloud-cancel-0001'), true)
await assert.rejects(
  cloudPending,
  (error: unknown) =>
    error instanceof AiProviderError && error.code === 'cancelled',
)

const defaultRegistry = createDefaultAiProviderRegistry({
  cloud: {
    loadEngine: async () => cloudEngine,
    loadApiKey: async () => 'test-key',
    complete: async () => 'cloud output',
  },
  localBridge: bridge,
})
assert.deepEqual(
  defaultRegistry.list().map((provider) => provider.id).sort(),
  ['klar-cloud-openai-compatible', 'klar-local'],
)

console.log('v26-ai-foundation.test.ts: all tests passed')
