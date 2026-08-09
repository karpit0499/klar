import { AI_CAPABILITIES, capabilityDefinition } from './capabilities'
import {
  AiProviderError,
  type AdapterSlot,
  type AiCapability,
  type AiLanguage,
  type AiMessage,
  type GenerationRequest,
  type JsonValue,
} from './contracts'

const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,95}$/
const CAPABILITIES = new Set<AiCapability>(
  Object.keys(AI_CAPABILITIES) as AiCapability[],
)
const LANGUAGES = new Set<AiLanguage>(['de', 'en'])
const ADAPTERS = new Set<AdapterSlot>(['base', 'precision', 'writer'])
const ALLOWED_ROLES = new Set<AiMessage['role']>(['system', 'user', 'assistant'])
const MAX_MESSAGE_CHARS = 120_000
const MAX_SCHEMA_CHARS = 32_000

function fail(message: string): never {
  throw new AiProviderError('invalid_request', message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allow = new Set(allowed)
  const unknown = Object.keys(value).find((key) => !allow.has(key))
  if (unknown) fail(`Unknown generation field: ${unknown}`)
}

function finiteNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} must be a finite number.`)
  }
  if (value < minimum || value > maximum) {
    fail(`${label} must be between ${minimum} and ${maximum}.`)
  }
  return value
}

function validateMessages(value: unknown): AiMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    fail('messages must contain between 1 and 32 entries.')
  }
  let total = 0
  return value.map((entry, index) => {
    if (!isRecord(entry)) fail(`messages[${index}] must be an object.`)
    exactKeys(entry, ['role', 'content'])
    if (!ALLOWED_ROLES.has(entry.role as AiMessage['role'])) {
      fail(`messages[${index}].role is invalid.`)
    }
    if (typeof entry.content !== 'string' || !entry.content.trim()) {
      fail(`messages[${index}].content must be non-empty text.`)
    }
    total += entry.content.length
    if (total > MAX_MESSAGE_CHARS) fail('The combined prompt is too large.')
    return {
      role: entry.role as AiMessage['role'],
      content: entry.content,
    }
  })
}

function validateSchema(value: unknown): Record<string, JsonValue> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) fail('jsonSchema must be an object.')
  let encoded = ''
  try {
    encoded = JSON.stringify(value)
  } catch {
    fail('jsonSchema must be JSON serializable.')
  }
  if (encoded.length > MAX_SCHEMA_CHARS) fail('jsonSchema is too large.')
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    fail('jsonSchema must be a plain object.')
  }
  return value as Record<string, JsonValue>
}

export function validateGenerationRequest(value: unknown): GenerationRequest {
  if (!isRecord(value)) fail('Generation request must be an object.')
  exactKeys(value, [
    'requestId',
    'capability',
    'language',
    'messages',
    'adapter',
    'maxOutputTokens',
    'temperature',
    'timeoutMs',
    'jsonSchema',
  ])
  if (typeof value.requestId !== 'string' || !REQUEST_ID.test(value.requestId)) {
    fail('requestId has an invalid format.')
  }
  if (!CAPABILITIES.has(value.capability as AiCapability)) {
    fail('capability is not allow-listed.')
  }
  if (!LANGUAGES.has(value.language as AiLanguage)) {
    fail('language is not supported.')
  }
  if (!ADAPTERS.has(value.adapter as AdapterSlot)) {
    fail('adapter is not allow-listed.')
  }

  const capability = value.capability as AiCapability
  const definition = capabilityDefinition(capability)
  const adapter = value.adapter as AdapterSlot
  if (adapter !== 'base' && adapter !== definition.adapter) {
    fail(`${capability} cannot use the ${adapter} adapter.`)
  }

  const jsonSchema = validateSchema(value.jsonSchema)
  if (definition.structuredOutput === 'required' && !jsonSchema) {
    fail(`${capability} requires a JSON schema.`)
  }

  return {
    requestId: value.requestId,
    capability,
    language: value.language as AiLanguage,
    messages: validateMessages(value.messages),
    adapter,
    maxOutputTokens: Math.floor(
      finiteNumber(
        value.maxOutputTokens,
        'maxOutputTokens',
        1,
        definition.maxOutputTokens,
      ),
    ),
    temperature: finiteNumber(value.temperature, 'temperature', 0, 2),
    timeoutMs: Math.floor(finiteNumber(value.timeoutMs, 'timeoutMs', 1_000, 120_000)),
    ...(jsonSchema ? { jsonSchema } : {}),
  }
}

export function validateRequestId(value: unknown): string {
  if (typeof value !== 'string' || !REQUEST_ID.test(value)) {
    fail('requestId has an invalid format.')
  }
  return value
}
