import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { submitFeedback, type FeedbackEnv } from '../worker/src/feedback'
import worker from '../worker/src/index'

const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function report(overrides: Record<string, unknown> = {}) {
  return {
    requestId: REQUEST_ID,
    title: 'Search results disappear',
    body: 'Steps: search for logistics work, then change the distance filter.',
    category: 'bug',
    severity: 'medium',
    turnstileToken: 'valid-token',
    ...overrides,
  }
}

function request(input = report(), headers: Record<string, string> = {}) {
  return new Request('https://worker.example/feedback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'CF-Connecting-IP': '203.0.113.42',
      'user-agent': 'klar-test',
      ...headers,
    },
    body: JSON.stringify(input),
  })
}

function env(overrides: Partial<FeedbackEnv> = {}): FeedbackEnv {
  return {
    GITHUB_ISSUES_TOKEN: 'github-test-token',
    GITHUB_REPO_OWNER: 'karpit0499',
    GITHUB_REPO_NAME: 'klar',
    TURNSTILE_SECRET: 'turnstile-test-secret',
    TURNSTILE_EXPECTED_HOSTNAMES: 'karpit0499.github.io,preview.example',
    ...overrides,
  }
}

test('feedback accepts JSON only and routes security reports away from public issues', async () => {
  const wrongType = request(report(), { 'content-type': 'text/plain' })
  assert.equal((await submitFeedback(wrongType, env())).status, 415)

  const privateReport = request(report({ category: 'privacy_security' }))
  const result = await submitFeedback(privateReport, env())
  assert.equal(result.status, 400)
  assert.equal(result.body.code, 'private_report_required')
})

test('feedback verifies Turnstile, hashes the rate-limit actor, redacts secrets, and creates one issue', async () => {
  let rateKey = ''
  let githubBody = ''
  const calls: string[] = []
  const limiter = {
    async limit(input: { key: string }) {
      rateKey = input.key
      return { success: true }
    },
  } as unknown as RateLimit
  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('/siteverify')) {
      assert.ok(init?.body instanceof FormData)
      assert.equal(init.body.get('response'), 'valid-token')
      assert.equal(init.body.get('remoteip'), '203.0.113.42')
      assert.equal(init.body.get('idempotency_key'), REQUEST_ID)
      return Response.json({
        success: true,
        action: 'klar_feedback',
        hostname: 'karpit0499.github.io',
      })
    }
    assert.match(url, /api\.github\.com\/repos\/karpit0499\/klar\/issues$/)
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('X-GitHub-Api-Version'), '2026-03-10')
    githubBody = String(init?.body)
    return Response.json({ number: 261, html_url: 'https://github.com/karpit0499/klar/issues/261' }, { status: 201 })
  }

  const input = report({
    title: 'Token sk-abcdefghijklmnopqrstuvwxyz leaked',
    body: 'Contact me@example.com and inspect /Users/alice/private/resume.pdf before retrying.',
  })
  const result = await submitFeedback(
    request(input),
    env({ FEEDBACK_RATE_LIMITER: limiter }),
    mockFetch,
  )

  assert.equal(result.status, 201)
  assert.deepEqual(calls.length, 2)
  assert.match(rateKey, /^[a-f0-9]{32}$/)
  assert.doesNotMatch(rateKey, /203\.0\.113\.42/)
  assert.doesNotMatch(githubBody, /sk-abcdefghijklmnopqrstuvwxyz|me@example\.com|\/Users\/alice/)
  assert.match(githubBody, /\[secret redacted\]|\[email redacted\]|\[local path redacted\]/)
  assert.match(githubBody, new RegExp(`klar-report-id: ${REQUEST_ID}`))
})

test('feature requests use the fixed enhancement label', async () => {
  let call = 0
  const result = await submitFeedback(
    request(report({
      requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      category: 'feature_request',
    })),
    env(),
    async (_input, init) => {
      call += 1
      if (call === 1) {
        return Response.json({
          success: true,
          action: 'klar_feedback',
          hostname: 'karpit0499.github.io',
        })
      }
      const payload = JSON.parse(String(init?.body)) as { labels?: unknown }
      assert.deepEqual(payload.labels, ['enhancement'])
      return Response.json({
        number: 262,
        html_url: 'https://github.com/karpit0499/klar/issues/262',
      }, { status: 201 })
    },
  )
  assert.equal(result.status, 201)
  assert.equal(call, 2)
})

test('feedback rejects a valid token from an unexpected hostname before GitHub', async () => {
  let calls = 0
  const mockFetch = async () => {
    calls += 1
    return Response.json({
      success: true,
      action: 'klar_feedback',
      hostname: 'attacker.example',
    })
  }
  const result = await submitFeedback(request(), env(), mockFetch)
  assert.equal(result.status, 400)
  assert.equal(result.body.code, 'turnstile_hostname')
  assert.equal(calls, 1)
})

test('feedback returns the stored issue for an idempotent retry without external calls', async () => {
  const dedup = {
    async get() {
      return { issueNumber: 261, issueUrl: 'https://github.com/karpit0499/klar/issues/261' }
    },
  } as unknown as KVNamespace
  let calls = 0
  const result = await submitFeedback(
    request(),
    env({ FEEDBACK_DEDUP: dedup }),
    async () => {
      calls += 1
      throw new Error('external fetch must not run')
    },
  )
  assert.equal(result.status, 200)
  assert.equal(result.body.duplicate, true)
  assert.equal(calls, 0)
})

test('feedback rejects methods, malformed bodies, oversized input, and invalid fields', async () => {
  const get = new Request('https://worker.example/feedback', { method: 'GET' })
  assert.deepEqual(await submitFeedback(get, env()), {
    status: 405,
    body: { ok: false, code: 'method_not_allowed' },
  })

  const malformed = new Request('https://worker.example/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not-json',
  })
  assert.equal((await submitFeedback(malformed, env())).body.code, 'invalid_json')

  const declaredLarge = request(report(), { 'content-length': '24001' })
  assert.equal((await submitFeedback(declaredLarge, env())).status, 413)
  const actualLarge = request(report({ body: 'x'.repeat(24_001) }))
  assert.equal((await submitFeedback(actualLarge, env())).status, 413)

  assert.equal((await submitFeedback(request(report({ requestId: 'not-a-uuid' })), env())).body.code, 'invalid_request_id')
  assert.equal((await submitFeedback(request(report({ category: 'unknown' })), env())).body.code, 'invalid_category')
  assert.equal((await submitFeedback(request(report({ title: 'no' })), env())).body.code, 'invalid_title')
  assert.equal((await submitFeedback(request(report({ body: 'short' })), env())).body.code, 'invalid_report')
  assert.equal((await submitFeedback(request(report({ turnstileToken: '' })), env())).body.code, 'turnstile_required')
})

test('feedback honeypot is a quiet success and disallowed browser origins fail closed', async () => {
  let externalCalls = 0
  const honeypot = await submitFeedback(
    request(report({ website: 'https://spam.example' })),
    env(),
    async () => {
      externalCalls += 1
      throw new Error('honeypot must not call an external service')
    },
  )
  assert.deepEqual(honeypot, { status: 202, body: { ok: true } })
  assert.equal(externalCalls, 0)

  const denied = await worker.fetch(new Request('https://worker.example/feedback', {
    method: 'POST',
    headers: {
      Origin: 'https://attacker.example',
      'content-type': 'application/json',
    },
    body: JSON.stringify(report()),
  }), {
    ALLOWED_ORIGINS: 'https://karpit0499.github.io',
  } as Env)
  assert.equal(denied.status, 403)
  assert.equal(denied.headers.get('cache-control'), 'no-store')
})

test('feedback enforces the limiter and every Turnstile decision before GitHub', async () => {
  const limited = await submitFeedback(
    request(),
    env({
      FEEDBACK_RATE_LIMITER: {
        async limit() { return { success: false } },
      } as unknown as RateLimit,
    }),
    async () => { throw new Error('rate-limited request must not reach Turnstile') },
  )
  assert.equal(limited.status, 429)
  assert.equal(limited.body.code, 'rate_limited')

  for (const [name, turnstile, expected] of [
    ['invalid or expired', { success: false }, 'turnstile_failed'],
    ['wrong action', { success: true, action: 'different_action', hostname: 'karpit0499.github.io' }, 'turnstile_failed'],
    ['missing hostname', { success: true, action: 'klar_feedback' }, 'turnstile_hostname'],
  ] as const) {
    let calls = 0
    const result = await submitFeedback(request(), env(), async () => {
      calls += 1
      return Response.json(turnstile)
    })
    assert.equal(result.body.code, expected, name)
    assert.equal(calls, 1, `${name} must stop before GitHub`)
  }

  const unavailable = await submitFeedback(
    request(),
    env(),
    async () => { throw new Error('network down') },
  )
  assert.equal(unavailable.body.code, 'turnstile_unavailable')
})

test('feedback maps GitHub failures without leaking the credential or report', async () => {
  assert.doesNotMatch(
    readFileSync('worker/src/feedback.ts', 'utf8'),
    /console\.(?:log|info|warn|error)/,
    'the public feedback handler must not log reports, tokens, or credentials',
  )
  const cases = [
    [401, 'github_credentials', 503],
    [403, 'github_credentials', 503],
    [422, 'github_rejected', 400],
    [429, 'github_rate_limited', 429],
    [500, 'github_unavailable', 502],
  ] as const
  for (const [githubStatus, code, status] of cases) {
    let call = 0
    const result = await submitFeedback(request(), env(), async () => {
      call += 1
      if (call === 1) {
        return Response.json({
          success: true,
          action: 'klar_feedback',
          hostname: 'karpit0499.github.io',
        })
      }
      return Response.json({ message: 'upstream detail must not escape' }, { status: githubStatus })
    })
    assert.equal(result.status, status)
    assert.equal(result.body.code, code)
    const serialized = JSON.stringify(result.body)
    assert.doesNotMatch(serialized, /github-test-token|valid-token|Search results disappear/)
  }

  let call = 0
  const networkFailure = await submitFeedback(request(), env(), async () => {
    call += 1
    if (call === 1) {
      return Response.json({
        success: true,
        action: 'klar_feedback',
        hostname: 'karpit0499.github.io',
      })
    }
    throw new Error('GitHub network failure with internal detail')
  })
  assert.deepEqual(networkFailure, {
    status: 502,
    body: { ok: false, code: 'github_unavailable' },
  })
})

test('temporary KV read/write failures preserve a successful protected submission', async () => {
  let putAttempts = 0
  const dedup = {
    async get() { throw new Error('temporary KV read failure') },
    async put() {
      putAttempts += 1
      throw new Error('temporary KV write failure')
    },
  } as unknown as KVNamespace
  let call = 0
  const result = await submitFeedback(
    request(),
    env({ FEEDBACK_DEDUP: dedup }),
    async () => {
      call += 1
      if (call === 1) {
        return Response.json({
          success: true,
          action: 'klar_feedback',
          hostname: 'karpit0499.github.io',
        })
      }
      return Response.json({
        number: 261,
        html_url: 'https://github.com/karpit0499/klar/issues/261',
      }, { status: 201 })
    },
  )
  assert.equal(result.status, 201)
  assert.equal(result.body.issueNumber, 261)
  assert.equal(putAttempts, 1)
})
