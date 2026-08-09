const ARTIFACT_ID = /^[a-z0-9][a-z0-9._-]{2,95}$/
const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,95}$/
const CAPABILITIES = new Set([
  'structured_job_extraction',
  'evidence_selection',
  'recruiter_message',
  'cover_letter',
  'resume_bullet_revision',
])
const LANGUAGES = new Set(['de', 'en'])
const ADAPTERS = new Set(['base', 'precision', 'writer'])
const ROLES = new Set(['system', 'user', 'assistant'])
const MAX_PROMPT_CHARS = 120_000
const MAX_SCHEMA_CHARS = 32_000
const OUTPUT_LIMITS = Object.freeze({
  structured_job_extraction: 2_048,
  evidence_selection: 2_048,
  recruiter_message: 768,
  cover_letter: 2_048,
  resume_bullet_revision: 1_024,
})
const REQUIRED_ADAPTER = Object.freeze({
  structured_job_extraction: 'precision',
  evidence_selection: 'precision',
  recruiter_message: 'writer',
  cover_letter: 'writer',
  resume_bullet_revision: 'writer',
})
const STRUCTURED_REQUIRED = new Set([
  'structured_job_extraction',
  'evidence_selection',
  'resume_bullet_revision',
])

export class IpcValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'IpcValidationError'
    this.code = 'invalid_request'
  }
}

function fail(message) {
  throw new IpcValidationError(message)
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value, allowed) {
  const known = new Set(allowed)
  const unexpected = Object.keys(value).find((key) => !known.has(key))
  if (unexpected) fail(`Unexpected field: ${unexpected}`)
}

function boundedNumber(value, label, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} must be a finite number.`)
  }
  if (value < minimum || value > maximum) {
    fail(`${label} is outside the allowed range.`)
  }
  return value
}

export function validateNoArguments(value) {
  if (value !== undefined && value !== null) fail('This operation accepts no arguments.')
}

export function validateArtifactId(value) {
  if (typeof value !== 'string' || !ARTIFACT_ID.test(value)) {
    fail('Invalid model artifact id.')
  }
  return value
}

export function validateRequestId(value) {
  if (typeof value !== 'string' || !REQUEST_ID.test(value)) {
    fail('Invalid request id.')
  }
  return value
}

function validateMessages(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    fail('messages must contain between 1 and 32 items.')
  }
  let totalCharacters = 0
  return value.map((entry, index) => {
    if (!isPlainRecord(entry)) fail(`messages[${index}] must be an object.`)
    exactKeys(entry, ['role', 'content'])
    if (!ROLES.has(entry.role)) fail(`messages[${index}].role is invalid.`)
    if (typeof entry.content !== 'string' || !entry.content.trim()) {
      fail(`messages[${index}].content must be non-empty text.`)
    }
    totalCharacters += entry.content.length
    if (totalCharacters > MAX_PROMPT_CHARS) fail('Prompt exceeds the local limit.')
    return Object.freeze({ role: entry.role, content: entry.content })
  })
}

function validateJsonSchema(value) {
  if (value === undefined) return undefined
  if (!isPlainRecord(value)) fail('jsonSchema must be a plain object.')
  let encoded
  try {
    encoded = JSON.stringify(value)
  } catch {
    fail('jsonSchema must be JSON serializable.')
  }
  if (encoded.length > MAX_SCHEMA_CHARS) fail('jsonSchema exceeds the local limit.')
  return JSON.parse(encoded)
}

export function validateGenerationRequest(value) {
  if (!isPlainRecord(value)) fail('Generation request must be an object.')
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
  const requestId = validateRequestId(value.requestId)
  if (!CAPABILITIES.has(value.capability)) fail('Capability is not allow-listed.')
  if (!LANGUAGES.has(value.language)) fail('Language is not supported.')
  if (!ADAPTERS.has(value.adapter)) fail('Adapter is not allow-listed.')
  if (
    value.adapter !== 'base' &&
    value.adapter !== REQUIRED_ADAPTER[value.capability]
  ) {
    fail('The selected adapter cannot serve this capability.')
  }
  const jsonSchema = validateJsonSchema(value.jsonSchema)
  if (STRUCTURED_REQUIRED.has(value.capability) && !jsonSchema) {
    fail('This capability requires a JSON schema.')
  }
  return Object.freeze({
    requestId,
    capability: value.capability,
    language: value.language,
    messages: Object.freeze(validateMessages(value.messages)),
    adapter: value.adapter,
    maxOutputTokens: Math.floor(
      boundedNumber(
        value.maxOutputTokens,
        'maxOutputTokens',
        1,
        OUTPUT_LIMITS[value.capability],
      ),
    ),
    temperature: boundedNumber(value.temperature, 'temperature', 0, 2),
    timeoutMs: Math.floor(
      boundedNumber(value.timeoutMs, 'timeoutMs', 1_000, 120_000),
    ),
    ...(jsonSchema ? { jsonSchema: Object.freeze(jsonSchema) } : {}),
  })
}
