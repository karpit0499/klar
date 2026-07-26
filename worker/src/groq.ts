// ============================================================================
// Fixed Groq relay for browser-safe AI requests.
//
// Groq's production guidance requires browser clients to use a trusted backend
// proxy. Klar still uses each person's own key: it is relayed in the
// Authorization header for this one request, never stored, never added to a
// URL, and never written to a response. Only the two required Groq endpoints
// are reachable, so this cannot become a general-purpose proxy.
// ============================================================================

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
export const MAX_GROQ_REQUEST_BYTES = 1_000_000
export const MAX_GROQ_RESPONSE_BYTES = 2_000_000

export type GroqProxyResult = {
  status: number
  body: string
}

type GroqEndpoint = {
  method: 'GET' | 'POST'
  upstreamPath: '/models' | '/chat/completions'
}

export function resolveGroqEndpoint(path: string): GroqEndpoint | null {
  if (path === 'models') return { method: 'GET', upstreamPath: '/models' }
  if (path === 'chat/completions') {
    return { method: 'POST', upstreamPath: '/chat/completions' }
  }
  return null
}

function error(status: number, message: string): GroqProxyResult {
  return { status, body: JSON.stringify({ error: { message } }) }
}

type BoundedBody =
  | { ok: true; text: string }
  | { ok: false }

/**
 * Read only up to `maxBytes`. Checking after `request.text()`/`response.text()`
 * would already have buffered an attacker-controlled body, defeating the cap.
 */
async function readBoundedBody(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<BoundedBody> {
  if (!stream) return { ok: true, text: '' }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return { ok: false }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(bytes) }
}

/**
 * Relay one allowlisted Groq request. `upstreamFetch` is injectable so the
 * security boundary can be tested without making a network request.
 */
export async function proxyGroqRequest(
  request: Request,
  path: string,
  upstreamFetch: typeof fetch = fetch,
): Promise<GroqProxyResult> {
  const endpoint = resolveGroqEndpoint(path)
  if (!endpoint) return error(404, 'Unknown Groq route.')
  if (request.method !== endpoint.method) return error(405, 'Method not allowed.')

  const authorization = request.headers.get('Authorization')?.trim() ?? ''
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return error(401, 'A Groq API key is required.')
  }

  let body: string | undefined
  if (endpoint.method === 'POST') {
    const contentType = (request.headers.get('Content-Type') ?? '').toLowerCase()
    if (!contentType.includes('application/json')) {
      return error(415, 'Groq requests must use JSON.')
    }
    const declaredLength = Number(request.headers.get('Content-Length') ?? '0')
    if (declaredLength > MAX_GROQ_REQUEST_BYTES) {
      return error(413, 'The Groq request is too large for the relay.')
    }
    let requestBody: BoundedBody
    try {
      requestBody = await readBoundedBody(request.body, MAX_GROQ_REQUEST_BYTES)
    } catch {
      return error(400, 'The Groq request body could not be read.')
    }
    if (!requestBody.ok) return error(413, 'The Groq request is too large for the relay.')
    body = requestBody.text
    try {
      const parsed: unknown = JSON.parse(body)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return error(400, 'The Groq request body must be a JSON object.')
      }
    } catch {
      return error(400, 'The Groq request body is not valid JSON.')
    }
  }

  let upstream: Response
  try {
    upstream = await upstreamFetch(`${GROQ_BASE_URL}${endpoint.upstreamPath}`, {
      method: endpoint.method,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body,
    })
  } catch {
    return error(502, 'Klar could not reach Groq through the secure relay.')
  }

  const contentType = (upstream.headers.get('Content-Type') ?? '').toLowerCase()
  if (!contentType.includes('application/json')) {
    return error(502, 'Groq returned an unreadable response.')
  }
  const declaredLength = Number(upstream.headers.get('Content-Length') ?? '0')
  if (declaredLength > MAX_GROQ_RESPONSE_BYTES) {
    return error(502, 'Groq returned a response that was too large.')
  }
  let responseBody: BoundedBody
  try {
    responseBody = await readBoundedBody(upstream.body, MAX_GROQ_RESPONSE_BYTES)
  } catch {
    return error(502, 'The response from Groq could not be read.')
  }
  if (!responseBody.ok) return error(502, 'Groq returned a response that was too large.')
  if (!responseBody.text) return error(502, 'Groq returned an empty response.')

  return { status: upstream.status, body: responseBody.text }
}
