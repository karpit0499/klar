import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import worker from '../worker/src/index'
import {
  MAX_GROQ_REQUEST_BYTES,
  proxyGroqRequest,
  resolveGroqEndpoint,
} from '../worker/src/groq'
import {
  DEFAULT_ENGINE,
  engineRequestUrl,
  probeEngineAccess,
  type EngineSettings,
} from '../src/llm/provider'
import { resolveAvailableGroqKey } from '../src/settings/keys'

const workerConfig = readFileSync(
  new URL('../worker/wrangler.toml', import.meta.url),
  'utf8',
)
assert.match(
  workerConfig,
  /compatibility_flags\s*=\s*\[[^\]]*"global_fetch_strictly_public"/,
  'the deployed Worker must route Groq through Cloudflare’s public front door',
)

assert.deepEqual(resolveGroqEndpoint('models'), {
  method: 'GET',
  upstreamPath: '/models',
})
assert.deepEqual(resolveGroqEndpoint('chat/completions'), {
  method: 'POST',
  upstreamPath: '/chat/completions',
})
assert.equal(resolveGroqEndpoint('https://evil.example'), null, 'relay is not open')

assert.equal(
  engineRequestUrl(DEFAULT_ENGINE, '/chat/completions', 'https://worker.example/'),
  'https://worker.example/groq/chat/completions',
  'default Groq requests use the browser-safe relay',
)
assert.equal(
  engineRequestUrl(DEFAULT_ENGINE, '/models', ''),
  'https://api.groq.com/openai/v1/models',
  'self-hosting without a Worker keeps the direct fallback',
)
const customEngine: EngineSettings = {
  ...DEFAULT_ENGINE,
  baseUrl: 'https://models.example/v1',
}
assert.equal(
  engineRequestUrl(customEngine, '/chat/completions', 'https://worker.example'),
  'https://models.example/v1/chat/completions',
  'custom engines are never silently sent through Klar',
)

{
  let requestedUrl = ''
  let requestedInit: RequestInit | undefined
  const result = await probeEngineAccess(DEFAULT_ENGINE, 'gsk_integration_test', {
    fetcher: (async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(input)
      requestedInit = init
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch,
  })
  assert.deepEqual(result, { ok: true }, 'an empty model list can still authenticate a valid key')
  assert.equal(requestedUrl, 'https://api.groq.com/openai/v1/models')
  assert.equal(requestedInit?.method, 'GET', 'validation does not spend completion quota')
  assert.equal(
    new Headers(requestedInit?.headers).get('Authorization'),
    'Bearer gsk_integration_test',
  )
}

{
  let loads = 0
  const current = await resolveAvailableGroqKey(' gsk_current ', async () => {
    loads += 1
    return 'gsk_stored'
  })
  assert.equal(current, 'gsk_current')
  assert.equal(loads, 0, 'an in-memory key does not trigger a storage read')

  const stored = await resolveAvailableGroqKey(undefined, async () => {
    loads += 1
    return ' gsk_stored '
  })
  assert.equal(stored, 'gsk_stored', 'a returning user’s saved key is recovered at action time')
  assert.equal(loads, 1)
}

{
  let upstreamUrl = ''
  let upstreamInit: RequestInit | undefined
  const upstreamFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    upstreamUrl = String(input)
    upstreamInit = init
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'OK' } }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const result = await proxyGroqRequest(new Request(
    'https://worker.example/groq/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer gsk_integration_test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: 'OK' }],
      }),
    },
  ), 'chat/completions', upstreamFetch)

  assert.equal(result.status, 200)
  assert.equal(upstreamUrl, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(upstreamInit?.method, 'POST')
  assert.equal(
    upstreamInit?.redirect,
    'manual',
    'the Worker uses the redirect mode supported at the edge',
  )
  assert.equal(
    new Headers(upstreamInit?.headers).get('Authorization'),
    'Bearer gsk_integration_test',
    'the key is relayed only in the Authorization header',
  )
  assert.ok(!upstreamUrl.includes('gsk_integration_test'), 'the key never enters a URL')
  assert.ok(!result.body.includes('gsk_integration_test'), 'the key is never echoed')
}

{
  let calls = 0
  const noFetch = (async () => {
    calls += 1
    return new Response()
  }) as typeof fetch
  const missingKey = await proxyGroqRequest(new Request(
    'https://worker.example/groq/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  ), 'chat/completions', noFetch)
  assert.equal(missingKey.status, 401)
  assert.equal(calls, 0, 'invalid requests are rejected before Groq')

  const tooLarge = await proxyGroqRequest(new Request(
    'https://worker.example/groq/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer gsk_test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'x'.repeat(MAX_GROQ_REQUEST_BYTES) }),
    },
  ), 'chat/completions', noFetch)
  assert.equal(tooLarge.status, 413)
  assert.equal(calls, 0, 'oversized requests are not forwarded')
}

{
  const preflight = await worker.fetch(new Request(
    'https://worker.example/groq/chat/completions',
    {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://karpit0499.github.io',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    },
  ), { ALLOWED_ORIGINS: 'https://karpit0499.github.io' })
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('Access-Control-Allow-Methods') ?? '', /POST/)
  assert.match(preflight.headers.get('Access-Control-Allow-Headers') ?? '', /authorization/)
  assert.equal(
    preflight.headers.get('Access-Control-Allow-Origin'),
    'https://karpit0499.github.io',
  )

  const missingKey = await worker.fetch(new Request(
    'https://worker.example/groq/chat/completions',
    {
      method: 'POST',
      headers: {
        Origin: 'https://karpit0499.github.io',
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  ), { ALLOWED_ORIGINS: 'https://karpit0499.github.io' })
  assert.equal(missingKey.status, 401, 'the Worker wires the fixed Groq route')
  assert.equal(missingKey.headers.get('Cache-Control'), 'no-store')
}

{
  const redirected = await proxyGroqRequest(new Request(
    'https://worker.example/groq/models',
    {
      method: 'GET',
      headers: { Authorization: 'Bearer gsk_test' },
    },
  ), 'models', (async () => new Response(null, {
    status: 307,
    headers: { location: 'https://unexpected.example/models' },
  })) as typeof fetch)
  assert.equal(redirected.status, 502)
  assert.ok(
    !redirected.body.includes('unexpected.example'),
    'redirect locations are not exposed or followed with the user key',
  )
}

console.log('groq-reliability-hotfix.test.ts: all tests passed')
