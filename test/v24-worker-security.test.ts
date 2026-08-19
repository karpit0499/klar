import { strict as assert } from 'node:assert'
import {
  isAllowedTarget, isBlockedHost, hardenXml, fabricFetch, isFabricFailure, FABRIC_HOSTS,
} from '../worker/src/fabric'

// --- Pure allowlist + network guards ----------------------------------------
assert.equal(isAllowedTarget('jobs.rewe-group.com', '/rss'), false, 'candidate connector hosts are not production-allowlisted')
assert.equal(isAllowedTarget('rest.arbeitsagentur.de', '/jobboerse/x'), true)
assert.equal(isAllowedTarget('rest.arbeitsagentur.de', '/secret'), false, 'path prefix enforced for API hosts')
assert.equal(isAllowedTarget('evil.example.com', '/'), false, 'unknown host rejected')

assert.equal(isBlockedHost('localhost'), true)
assert.equal(isBlockedHost('127.0.0.1'), true)
assert.equal(isBlockedHost('10.0.0.5'), true)
assert.equal(isBlockedHost('192.168.1.1'), true)
assert.equal(isBlockedHost('169.254.1.1'), true)
assert.equal(isBlockedHost('172.16.0.1'), true)
assert.equal(isBlockedHost('jobs.lidl.de'), false)

assert.ok(!hardenXml('<!DOCTYPE x [ <!ENTITY a "b"> ]><rss/>').includes('DOCTYPE'))
assert.ok(!hardenXml('<!ENTITY xxe SYSTEM "file:///etc/passwd">').includes('ENTITY'))

// --- fabricFetch with a mocked global fetch ---------------------------------
const realFetch = globalThis.fetch
type StubInit = { status: number; type?: string; body?: string; location?: string; contentLength?: string }
function stub(map: Record<string, StubInit>) {
  globalThis.fetch = (async (url: string) => {
    const key = new URL(url).host + new URL(url).pathname
    const s = map[key] ?? { status: 404 }
    const headers: Record<string, string> = {}
    if (s.type) headers['content-type'] = s.type
    if (s.location) headers['location'] = s.location
    if (s.contentLength) headers['content-length'] = s.contentLength
    return new Response(s.status >= 300 && s.status < 400 ? null : (s.body ?? ''), { status: s.status, headers })
  }) as typeof fetch
}

try {
  // Blocked host: rejected WITHOUT any fetch.
  {
    const r = await fabricFetch({ host: 'evil.example.com', path: '/', accept: 'json', maxBytes: 1000 })
    assert.ok(isFabricFailure(r) && r.httpStatus === 403, 'unknown host → 403')
  }
  // Allowed host, 200 XML → hardened envelope.
  {
    stub({ 'rest.arbeitsagentur.de/jobboerse/test': { status: 200, type: 'application/json', body: '{"jobs":[]}' } })
    const r = await fabricFetch({ host: 'rest.arbeitsagentur.de', path: '/jobboerse/test', accept: 'json', maxBytes: 1_000_000 })
    assert.ok(!isFabricFailure(r), 'allowed host succeeds')
  }
  // Redirect to a disallowed host → 403.
  {
    stub({ 'rest.arbeitsagentur.de/jobboerse/go': { status: 302, location: 'https://evil.example.com/x' } })
    const r = await fabricFetch({ host: 'rest.arbeitsagentur.de', path: '/jobboerse/go', accept: 'json', maxBytes: 1000 })
    assert.ok(isFabricFailure(r) && r.httpStatus === 403, 'redirect off the allowlist → 403')
  }
  // Content-type mismatch → 502.
  {
    stub({ 'rest.arbeitsagentur.de/jobboerse/x': { status: 200, type: 'text/html', body: '<html/>' } })
    const r = await fabricFetch({ host: 'rest.arbeitsagentur.de', path: '/jobboerse/x', accept: 'json', maxBytes: 1000 })
    assert.ok(isFabricFailure(r) && r.httpStatus === 502, 'json expected, html returned → 502')
  }
  // Byte cap: oversized body is rejected before it can consume unbounded memory.
  {
    stub({ 'rest.arbeitsagentur.de/jobboerse/big': { status: 200, type: 'application/json', body: 'x'.repeat(5000) } })
    const r = await fabricFetch({ host: 'rest.arbeitsagentur.de', path: '/jobboerse/big', accept: 'json', maxBytes: 100 })
    assert.ok(isFabricFailure(r) && r.httpStatus === 413, 'oversized body rejected at the byte cap')
  }
} finally {
  globalThis.fetch = realFetch
}

// --- Allowlist sanity --------------------------------------------------------
assert.deepEqual(Object.keys(FABRIC_HOSTS).sort(), [
  'api.adzuna.com',
  'rest.arbeitsagentur.de',
  'www.arbeitnow.com',
], 'Worker allowlist contains only verified runtime hosts')

console.log('v24-worker-security.test.ts: all tests passed')
