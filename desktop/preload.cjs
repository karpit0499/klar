'use strict'

// Sandboxed Electron preloads do not support ESM imports. Keep this file
// self-contained and CommonJS; the privileged main process repeats every
// validation before acting.
const { contextBridge, ipcRenderer } = require('electron')

const IPC = Object.freeze({
  systemInfo: 'klar:system:info',
  runtimeStatus: 'klar:runtime:status',
  runtimeStart: 'klar:runtime:start',
  runtimeStop: 'klar:runtime:stop',
  aiGenerate: 'klar:ai:generate',
  aiCancel: 'klar:ai:cancel',
  diagnosticsReport: 'klar:diagnostics:report',
})
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
const LIMITS = Object.freeze({
  structured_job_extraction: 2048,
  evidence_selection: 2048,
  recruiter_message: 768,
  cover_letter: 2048,
  resume_bullet_revision: 1024,
})

function fail(message) {
  const error = new Error(message)
  error.code = 'invalid_request'
  throw error
}

function plainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value, allowed) {
  const known = new Set(allowed)
  const unexpected = Object.keys(value).find((key) => !known.has(key))
  if (unexpected) fail(`Unexpected field: ${unexpected}`)
}

function artifactId(value) {
  if (typeof value !== 'string' || !ARTIFACT_ID.test(value)) {
    fail('Invalid artifact id.')
  }
  return value
}

function requestId(value) {
  if (typeof value !== 'string' || !REQUEST_ID.test(value)) {
    fail('Invalid request id.')
  }
  return value
}

function generationRequest(value) {
  if (!plainRecord(value)) fail('Generation request must be an object.')
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
  requestId(value.requestId)
  if (!CAPABILITIES.has(value.capability)) fail('Capability is not allow-listed.')
  if (!LANGUAGES.has(value.language)) fail('Language is not supported.')
  if (!ADAPTERS.has(value.adapter)) fail('Adapter is not allow-listed.')
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 32) {
    fail('messages are invalid.')
  }
  let promptCharacters = 0
  const messages = value.messages.map((message) => {
    if (!plainRecord(message)) fail('Message must be an object.')
    exactKeys(message, ['role', 'content'])
    if (!ROLES.has(message.role)) fail('Message role is invalid.')
    if (typeof message.content !== 'string' || !message.content.trim()) {
      fail('Message content is invalid.')
    }
    promptCharacters += message.content.length
    if (promptCharacters > 120000) fail('Prompt exceeds the local limit.')
    return { role: message.role, content: message.content }
  })
  if (
    !Number.isSafeInteger(value.maxOutputTokens) ||
    value.maxOutputTokens < 1 ||
    value.maxOutputTokens > LIMITS[value.capability]
  ) {
    fail('maxOutputTokens is invalid.')
  }
  if (
    typeof value.temperature !== 'number' ||
    !Number.isFinite(value.temperature) ||
    value.temperature < 0 ||
    value.temperature > 2
  ) {
    fail('temperature is invalid.')
  }
  if (
    !Number.isSafeInteger(value.timeoutMs) ||
    value.timeoutMs < 1000 ||
    value.timeoutMs > 120000
  ) {
    fail('timeoutMs is invalid.')
  }
  let jsonSchema
  if (value.jsonSchema !== undefined) {
    if (!plainRecord(value.jsonSchema)) fail('jsonSchema must be an object.')
    const encoded = JSON.stringify(value.jsonSchema)
    if (encoded.length > 32000) fail('jsonSchema exceeds the local limit.')
    jsonSchema = JSON.parse(encoded)
  }
  return {
    requestId: value.requestId,
    capability: value.capability,
    language: value.language,
    messages,
    adapter: value.adapter,
    maxOutputTokens: value.maxOutputTokens,
    temperature: value.temperature,
    timeoutMs: value.timeoutMs,
    ...(jsonSchema ? { jsonSchema } : {}),
  }
}

const bridge = Object.freeze({
  desktop: true,
  system: Object.freeze({
    getInfo: () => ipcRenderer.invoke(IPC.systemInfo),
  }),
  runtime: Object.freeze({
    getStatus: () => ipcRenderer.invoke(IPC.runtimeStatus),
    start: (value) => ipcRenderer.invoke(IPC.runtimeStart, artifactId(value)),
    stop: () => ipcRenderer.invoke(IPC.runtimeStop),
  }),
  ai: Object.freeze({
    generate: (value) =>
      ipcRenderer.invoke(IPC.aiGenerate, generationRequest(value)),
    cancel: (value) => ipcRenderer.invoke(IPC.aiCancel, requestId(value)),
  }),
  diagnostics: Object.freeze({
    getRedactedReport: () => ipcRenderer.invoke(IPC.diagnosticsReport),
  }),
})

contextBridge.exposeInMainWorld('klarDesktop', bridge)
