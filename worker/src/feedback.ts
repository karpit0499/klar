export type FeedbackEnv = {
  GITHUB_ISSUES_TOKEN?: string
  GITHUB_REPO_OWNER?: string
  GITHUB_REPO_NAME?: string
  TURNSTILE_SECRET?: string
  TURNSTILE_EXPECTED_HOSTNAMES?: string
  FEEDBACK_RATE_LIMITER?: RateLimit
  FEEDBACK_DEDUP?: KVNamespace
}

type FeedbackFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type PublicCategory = 'bug' | 'incorrect_result' | 'source_problem' | 'accessibility' | 'feature_request'
type Severity = 'low' | 'medium' | 'high' | 'critical'

type FeedbackInput = {
  requestId: string
  title: string
  body: string
  category: PublicCategory | 'privacy_security'
  severity: Severity
  turnstileToken: string
  website?: string
}

export type FeedbackResult = {
  status: number
  body: Record<string, unknown>
}

const CATEGORIES = new Set<PublicCategory>([
  'bug',
  'incorrect_result',
  'source_problem',
  'accessibility',
  'feature_request',
])
const SEVERITIES = new Set<Severity>(['low', 'medium', 'high', 'critical'])
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function submitFeedback(
  request: Request,
  env: FeedbackEnv,
  requestFetch: FeedbackFetch = fetch,
): Promise<FeedbackResult> {
  if (request.method !== 'POST') return fail(405, 'method_not_allowed')
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('application/json')) return fail(415, 'json_required')
  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > 24_000) return fail(413, 'report_too_large')

  let raw = ''
  try {
    raw = await request.text()
  } catch {
    return fail(400, 'invalid_body')
  }
  if (new TextEncoder().encode(raw).byteLength > 24_000) return fail(413, 'report_too_large')

  let input: FeedbackInput
  try {
    input = JSON.parse(raw) as FeedbackInput
  } catch {
    return fail(400, 'invalid_json')
  }
  if (input.website?.trim()) return { status: 202, body: { ok: true } }
  if (!REQUEST_ID.test(input.requestId ?? '')) return fail(400, 'invalid_request_id')
  if (input.category === 'privacy_security') return fail(400, 'private_report_required')
  if (!CATEGORIES.has(input.category) || !SEVERITIES.has(input.severity)) {
    return fail(400, 'invalid_category')
  }
  if (typeof input.title !== 'string' || input.title.trim().length < 5 || input.title.length > 180) {
    return fail(400, 'invalid_title')
  }
  if (typeof input.body !== 'string' || input.body.trim().length < 10 || input.body.length > 16_000) {
    return fail(400, 'invalid_report')
  }
  if (typeof input.turnstileToken !== 'string' || input.turnstileToken.length < 1 || input.turnstileToken.length > 2_048) {
    return fail(400, 'turnstile_required')
  }

  const token = env.GITHUB_ISSUES_TOKEN?.trim()
  const owner = env.GITHUB_REPO_OWNER?.trim() || 'karpit0499'
  const repo = env.GITHUB_REPO_NAME?.trim() || 'klar'
  if (!token || !env.TURNSTILE_SECRET) return fail(503, 'feedback_not_configured')

  let prior: { issueNumber?: unknown; issueUrl?: unknown } | null | undefined
  try {
    prior = await env.FEEDBACK_DEDUP?.get(`report:${input.requestId}`, 'json') as typeof prior
  } catch {
    // De-duplication is defence in depth. A temporary KV outage must not make
    // the public reporting route unavailable or expose internal details.
  }
  if (typeof prior?.issueNumber === 'number' && typeof prior.issueUrl === 'string') {
    return {
      status: 200,
      body: {
        ok: true,
        requestId: input.requestId,
        issueNumber: prior.issueNumber,
        issueUrl: prior.issueUrl,
        duplicate: true,
      },
    }
  }

  const remoteIp = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const clientKey = await anonymousActorKey(request)
  if (env.FEEDBACK_RATE_LIMITER) {
    const outcome = await env.FEEDBACK_RATE_LIMITER.limit({ key: clientKey })
    if (!outcome.success) return fail(429, 'rate_limited')
  }

  const challenge = await verifyTurnstile(
    input.turnstileToken,
    input.requestId,
    remoteIp,
    env,
    requestFetch,
  )
  if (!challenge.ok) return fail(400, challenge.code)

  const title = redact(input.title).replace(/\s+/g, ' ').trim().slice(0, 180)
  const body = `${redact(input.body).trim()}\n\n<!-- klar-report-id: ${input.requestId} -->`
  let response: Response
  try {
    response = await requestFetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'klar-feedback-worker',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        title,
        body,
        labels: [input.category === 'feature_request' ? 'enhancement' : 'bug'],
      }),
    })
  } catch {
    return fail(502, 'github_unavailable')
  }

  const payload = await response.json().catch(() => ({})) as {
    number?: unknown
    html_url?: unknown
  }
  if (response.status !== 201 || typeof payload.html_url !== 'string' || typeof payload.number !== 'number') {
    if (response.status === 401 || response.status === 403) return fail(503, 'github_credentials')
    if (response.status === 422) return fail(400, 'github_rejected')
    if (response.status === 429) return fail(429, 'github_rate_limited')
    return fail(502, 'github_unavailable')
  }

  const result: FeedbackResult = {
    status: 201,
    body: {
      ok: true,
      requestId: input.requestId,
      issueNumber: payload.number,
      issueUrl: payload.html_url,
    },
  }
  try {
    await env.FEEDBACK_DEDUP?.put(
      `report:${input.requestId}`,
      JSON.stringify({ issueNumber: payload.number, issueUrl: payload.html_url }),
      { expirationTtl: 60 * 60 * 24 * 30 },
    )
  } catch {
    // The issue already exists. Return its URL instead of turning a successful
    // GitHub write into an ambiguous client error that invites a duplicate.
  }
  return result
}

async function verifyTurnstile(
  token: string,
  requestId: string,
  remoteIp: string,
  env: FeedbackEnv,
  requestFetch: FeedbackFetch,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const secret = env.TURNSTILE_SECRET?.trim()
  if (!secret) return { ok: false, code: 'feedback_not_configured' }
  const form = new FormData()
  form.set('secret', secret)
  form.set('response', token)
  if (remoteIp !== 'unknown') form.set('remoteip', remoteIp)
  form.set('idempotency_key', requestId)

  let response: Response
  try {
    response = await requestFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      body: form,
    })
  } catch {
    return { ok: false, code: 'turnstile_unavailable' }
  }
  const result = await response.json().catch(() => null) as {
    success?: boolean
    action?: string
    hostname?: string
  } | null
  if (!result?.success || result.action !== 'klar_feedback') {
    return { ok: false, code: 'turnstile_failed' }
  }
  const expected = new Set(
    (env.TURNSTILE_EXPECTED_HOSTNAMES ?? '')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  )
  if (expected.size === 0 || !result.hostname || !expected.has(result.hostname.toLowerCase())) {
    return { ok: false, code: 'turnstile_hostname' }
  }
  return { ok: true }
}

async function anonymousActorKey(request: Request): Promise<string> {
  const source = [
    request.headers.get('CF-Connecting-IP') ?? 'unknown',
    request.headers.get('user-agent') ?? 'unknown',
  ].join('\n')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fail(status: number, code: string): FeedbackResult {
  return { status, body: { ok: false, code } }
}

function redact(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\b(?:gsk_[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|Bearer\s+[A-Za-z0-9._~-]{12,})\b/gi, '[secret redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]')
    .replace(/file:\/{2,3}[^\s<>"'`\)\]]+/gi, '[local path redacted]')
    .replace(/(^|[^A-Za-z0-9])[A-Za-z]:[\\/][^\s<>"'`\)\]]+/gm, '$1[local path redacted]')
    .replace(/(^|[^A-Za-z0-9])\/(?:Users|home|private|tmp|var|opt|Volumes|Library|mnt|workspace|data)(?:\/[^\s<>"'`\)\]]*)?/gim, '$1[local path redacted]')
    .replace(/\b(?:data:image\/[a-z0-9.+-]+;base64,|[A-Za-z0-9+/]{500,}={0,2})/gi, '[embedded data redacted]')
}
