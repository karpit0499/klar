const SENSITIVE_KEY =
  /(?:api.?key|authorization|credential|secret|token|passphrase|password|request.?id|artifact.?id|resume|résumé|cover.?letter|application.?content|prompt|messages?|generated.?text|raw.?text|body)/i
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi
const LIKELY_SECRET =
  /\b(?:gsk_|sk-|hf_|ghp_|github_pat_)[A-Za-z0-9_./+-]{8,}\b/g
const WINDOWS_PATH = /\b[A-Za-z]:\\[^\s<>"']+/g
const WINDOWS_UNC_PATH = /\\\\[A-Za-z0-9._-]+\\[^\s<>"']+/g
// Any non-alphanumeric may precede an absolute path, including '=' in
// --model=/Users/... and ':' after a label. A narrower prefix class leaks the
// operating-system user name.
const UNIX_PATH = /(^|[^A-Za-z0-9])\/(?:Users|home|private|tmp|var|opt|Volumes|Applications|Library|mnt|workspace|data|srv|etc)(?:\/[^\s<>"'`)]*)?/gim
const URL_WITH_PRIVATE_PARTS = /\bhttps?:\/\/[^\s)"'`]+/gi

function redactUrl(candidate) {
  try {
    const parsed = new URL(candidate)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return '[REDACTED_URL]'
  }
}

export function redactText(input, maximumLength = 2_000) {
  if (typeof input !== 'string') return input
  const redacted = input
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(LIKELY_SECRET, '[REDACTED_SECRET]')
    .replace(EMAIL, '[REDACTED_EMAIL]')
    .replace(WINDOWS_PATH, '[REDACTED_PATH]')
    .replace(WINDOWS_UNC_PATH, '[REDACTED_PATH]')
    .replace(UNIX_PATH, (match, prefix = '') => `${prefix}[REDACTED_PATH]`)
    .replace(URL_WITH_PRIVATE_PARTS, redactUrl)
  return redacted.length > maximumLength
    ? `${redacted.slice(0, maximumLength)}…[TRUNCATED]`
    : redacted
}

function redactValue(value, depth, seen) {
  if (depth > 6) return '[TRUNCATED_DEPTH]'
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value
  }
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redactValue(item, depth + 1, seen))
  }
  if (!value || typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  const output = {}
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    output[key] = SENSITIVE_KEY.test(key)
      ? '[REDACTED_CONTENT]'
      : redactValue(child, depth + 1, seen)
  }
  seen.delete(value)
  return output
}

export function redactDiagnosticValue(value) {
  return redactValue(value, 0, new WeakSet())
}

export function safeDiagnosticDetail(value) {
  const redacted = redactDiagnosticValue(value)
  if (!redacted || typeof redacted !== 'object' || Array.isArray(redacted)) {
    return { value: redactText(String(redacted)) }
  }
  const safe = {}
  for (const [key, child] of Object.entries(redacted)) {
    if (
      child === null ||
      typeof child === 'string' ||
      typeof child === 'boolean' ||
      (typeof child === 'number' && Number.isFinite(child))
    ) {
      safe[key] = child
    } else {
      safe[key] = redactText(JSON.stringify(child), 1_000)
    }
  }
  return safe
}
