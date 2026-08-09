import type { BenchmarkFixture, GenerationMeasurement } from './types.ts'

export type StreamingProviderConfig = {
  endpoint: string
  apiKey?: string
  model: string
  schemaDialect: 'llama-json-object' | 'openai-json-schema'
  lora?: Array<{ id: number; scale: number }>
  fetcher?: typeof fetch
}

export type StreamingGeneration = {
  content: string
  measurement: GenerationMeasurement
}

function completionUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`
}

function responseFormat(
  fixture: BenchmarkFixture,
  dialect: StreamingProviderConfig['schemaDialect'],
): Record<string, unknown> {
  if (dialect === 'llama-json-object') {
    return {
      type: 'json_object',
      schema: fixture.schema,
    }
  }
  return {
    type: 'json_schema',
    json_schema: {
      name: `klar_benchmark_${fixture.task}_v1`,
      strict: true,
      schema: fixture.schema,
    },
  }
}

function maxOutputTokens(fixture: BenchmarkFixture): number {
  switch (fixture.task) {
    case 'cover_letter':
      return 512
    case 'resume_expression':
      return 320
    case 'recruiter_message':
      return 256
    default:
      return 320
  }
}

function parseUsage(
  value: unknown,
): Pick<
  GenerationMeasurement,
  'inputTokens' | 'outputTokens' | 'totalTokens'
> {
  if (!value || typeof value !== 'object') return {}
  const usage = value as Record<string, unknown>
  return {
    ...(typeof usage.prompt_tokens === 'number'
      ? { inputTokens: usage.prompt_tokens }
      : {}),
    ...(typeof usage.completion_tokens === 'number'
      ? { outputTokens: usage.completion_tokens }
      : {}),
    ...(typeof usage.total_tokens === 'number'
      ? { totalTokens: usage.total_tokens }
      : {}),
  }
}

export async function streamStructuredGeneration(
  provider: StreamingProviderConfig,
  fixture: BenchmarkFixture,
  options: {
    signal?: AbortSignal
    onFirstToken?: (milliseconds: number) => void
  } = {},
): Promise<StreamingGeneration> {
  const fetcher = provider.fetcher ?? fetch
  const startedAt = performance.now()
  const response = await fetcher(completionUrl(provider.endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.apiKey
        ? { Authorization: `Bearer ${provider.apiKey}` }
        : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: fixture.system },
        { role: 'user', content: fixture.user },
      ],
      max_tokens: maxOutputTokens(fixture),
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
      response_format: responseFormat(fixture, provider.schemaDialect),
      ...(provider.lora ? { lora: provider.lora } : {}),
      ...(provider.schemaDialect === 'llama-json-object'
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
    }),
    signal: options.signal,
    cache: 'no-store',
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`Generation endpoint returned HTTP ${response.status}.`)
  }
  if (!response.body) {
    throw new Error('Generation endpoint returned no streaming body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let content = ''
  let firstTokenMs: number | undefined
  let finishReason = 'unknown'
  let usage: ReturnType<typeof parseUsage> = {}

  const acceptData = (encoded: string): boolean => {
    const data = encoded.trim()
    if (!data) return false
    if (data === '[DONE]') return true
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(data) as Record<string, unknown>
    } catch {
      throw new Error('Generation endpoint emitted malformed SSE JSON.')
    }
    usage = { ...usage, ...parseUsage(payload.usage) }
    const choices = Array.isArray(payload.choices) ? payload.choices : []
    const choice =
      choices[0] && typeof choices[0] === 'object'
        ? (choices[0] as Record<string, unknown>)
        : undefined
    if (!choice) return false
    if (typeof choice.finish_reason === 'string') {
      finishReason = choice.finish_reason
    }
    const delta =
      choice.delta && typeof choice.delta === 'object'
        ? (choice.delta as Record<string, unknown>)
        : undefined
    const token =
      typeof delta?.content === 'string'
        ? delta.content
        : typeof choice.text === 'string'
          ? choice.text
          : ''
    if (token) {
      if (firstTokenMs === undefined) {
        firstTokenMs = Math.round(performance.now() - startedAt)
        options.onFirstToken?.(firstTokenMs)
      }
      content += token
    }
    return false
  }

  let done = false
  while (!done) {
    const next = await reader.read()
    if (next.done) break
    pending += decoder.decode(next.value, { stream: true })
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      if (acceptData(line.slice(5))) {
        done = true
        break
      }
    }
  }
  pending += decoder.decode()
  if (!done && pending.startsWith('data:')) {
    acceptData(pending.slice(5))
  }
  if (!content.trim()) {
    throw new Error('Generation endpoint returned no usable content.')
  }
  return {
    content,
    measurement: {
      ...(firstTokenMs === undefined ? {} : { firstTokenMs }),
      totalMs: Math.round(performance.now() - startedAt),
      ...usage,
      finishReason,
    },
  }
}

export async function probeStreamingCancellation(
  provider: StreamingProviderConfig,
  fixture: BenchmarkFixture,
  options: {
    abortAfterMs?: number
    healthFetcher?: typeof fetch
  } = {},
): Promise<{
  cancelled: boolean
  healthReady: boolean
  totalMs: number
  firstTokenMs?: number
}> {
  const controller = new AbortController()
  const abortAfterMs = options.abortAfterMs ?? 250
  const timer = setTimeout(() => controller.abort(), abortAfterMs)
  const startedAt = performance.now()
  let firstTokenMs: number | undefined
  let cancelled = false
  try {
    await streamStructuredGeneration(provider, fixture, {
      signal: controller.signal,
      onFirstToken: (milliseconds) => {
        firstTokenMs = milliseconds
        controller.abort()
      },
    })
  } catch (error) {
    cancelled =
      controller.signal.aborted &&
      (error instanceof DOMException
        ? error.name === 'AbortError'
        : /abort|cancel/i.test(error instanceof Error ? error.message : ''))
  } finally {
    clearTimeout(timer)
  }
  const healthFetcher = options.healthFetcher ?? provider.fetcher ?? fetch
  let healthReady = false
  try {
    const health = await healthFetcher(
      `${provider.endpoint.replace(/\/+$/, '')}/health`,
      {
        headers: provider.apiKey
          ? { Authorization: `Bearer ${provider.apiKey}` }
          : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(2_000),
      },
    )
    healthReady = health.ok
  } catch {
    healthReady = false
  }
  return {
    cancelled,
    healthReady,
    totalMs: Math.round(performance.now() - startedAt),
    ...(firstTokenMs === undefined ? {} : { firstTokenMs }),
  }
}