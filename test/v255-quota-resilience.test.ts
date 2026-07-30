// Run with: npx tsx test/v255-quota-resilience.test.ts
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import 'fake-indexeddb/auto'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  RollingTokenLedger,
  canAfford,
  costOf,
  resetSpendLedgerForTests,
  requestsInLastMinute,
  spentInLastMinute,
} from '../src/llm/budget.ts'
import {
  estimateTailoringChunkRequests,
  estimateTailoringRequest,
  tailorResumeWithAi,
} from '../src/llm/tailorResume.ts'
import { generationCacheKey } from '../src/packets/cache.ts'
import { runMatching, type MatchRunDiagnostics } from '../src/match/index.ts'
import { buildLocalMatch, isLocalMatch } from '../src/match/fallback.ts'
import { makeJob } from '../src/sources/normalize.ts'
import { normalizeResume, deriveProfile } from '../src/resume/canonical.ts'
import { LocaleProvider } from '../src/i18n/LocaleProvider.tsx'
import { BudgetNotice } from '../src/ui/BudgetNotice.tsx'
import type { EngineSettings } from '../src/llm/provider.ts'
import type { Preferences } from '../src/types.ts'
import { chatComplete } from '../src/llm/groq.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = (path: string) => readFileSync(`${root}/${path}`, 'utf8')

// The two affordability failures are different products and different copy.
{
  const request = costOf({ system: 'a'.repeat(1_000), user: 'b'.repeat(1_000), maxTokens: 1_000 })
  const permanent = canAfford({ ...request, billedTokens: 8_001 }, 8_000, 0)
  assert.equal(permanent.ok, false)
  assert.equal(!permanent.ok && permanent.reason, 'exceeds_budget')
  const transient = canAfford(request, 8_000, 7_500, 12_345)
  assert.equal(transient.ok, false)
  assert.equal(!transient.ok && transient.reason, 'no_headroom_now')
  assert.equal(!transient.ok && transient.reason === 'no_headroom_now' && transient.retryAfterMs, 12_345)
}

// Rolling window: reservations disappear only after their own 60-second age.
{
  let now = 1_000
  const ledger = new RollingTokenLedger(() => now)
  const first = ledger.record({ inputTokens: 600, reservedTokens: 400, billedTokens: 1_000 })
  ledger.settle(first, 700)
  now += 20_000
  ledger.record({ inputTokens: 300, reservedTokens: 200, billedTokens: 500 })
  assert.equal(ledger.spent(), 1_200)
  assert.equal(ledger.requests(), 2)
  assert.equal(ledger.retryAfterMs(7_000, 8_000), 40_000)
  now += 40_001
  assert.equal(ledger.spent(), 500)
  assert.equal(ledger.requests(), 1)
}

// RPM is a rolling-minute limit too. A token-cheap request waits when the
// request window is full instead of firing a provider call that must fail.
{
  const cheap = costOf({ system: 's', user: 'u', maxTokens: 20 })
  const verdict = canAfford(
    cheap,
    { tpm: 8_000, rpm: 2, source: 'default' },
    50,
    9_000,
    2,
  )
  assert.equal(verdict.ok, false)
  assert.equal(!verdict.ok && verdict.reason, 'no_headroom_now')
  assert.equal(!verdict.ok && verdict.reason === 'no_headroom_now' && verdict.retryAfterMs, 9_000)
}

// Provider-reported usage replaces the conservative reservation in the live
// ledger; engines that omit usage safely retain the estimate.
{
  resetSpendLedgerForTests()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
      usage: { total_tokens: 123 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch
  try {
    assert.equal(await chatComplete({
      apiKey: 'test-key',
      system: 'system',
      user: 'user',
      maxTokens: 600,
    }), 'ok')
    assert.equal(spentInLastMinute(), 123)
    assert.equal(requestsInLastMinute(), 1)
  } finally {
    globalThis.fetch = originalFetch
    resetSpendLedgerForTests()
  }
}

function resumeWithRoles(roles: number, bullets = 6) {
  return normalizeResume({
    contact: { name: 'Amara Okafor', email: 'amara@example.com' },
    summary: 'Analyst moving from lifecycle marketing into product analytics.',
    experience: Array.from({ length: roles }, (_, roleIndex) => ({
      title: `Analyst role ${roleIndex + 1}`,
      company: `Employer ${roleIndex + 1}`,
      start: '01/2022',
      end: '12/2023',
      bullets: Array.from({ length: bullets }, (_, bulletIndex) =>
        `Built SQL audience reports and weekly campaign analysis item ${bulletIndex + 1}.`),
    })),
    education: [],
    skills: [{ group: 'Tools', items: ['SQL', 'Excel', 'Power BI'] }],
    languages: [],
    projects: [],
    certifications: [],
  })
}

function posting(chars: number, id = `job-${chars}`) {
  const description = 'SQL Power BI reporting product analytics experimentation. '.repeat(300).slice(0, chars)
  return makeJob({
    source: 'greenhouse',
    source_id: id,
    title: 'Junior Data Analyst',
    company: 'Datenhaus GmbH',
    location: { country: 'DE', city: 'Berlin', remote: false },
    description,
    url: `https://example.test/${id}`,
    language: 'en',
  })
}

// Regression grid: every accepted résumé shape either fits whole or has only
// bounded role requests. The posting tail cannot inflate a chunk.
{
  for (let roles = 1; roles <= 14; roles += 1) {
    for (const chars of [500, 1_500, 6_000, 12_000]) {
      const resume = resumeWithRoles(roles)
      const job = posting(chars, `shape-${roles}-${chars}`)
      const whole = estimateTailoringRequest(resume, job, 'en')
      const chunks = estimateTailoringChunkRequests(resume, job, 'en', ['SQL', 'Power BI'])
      const largestChunk = Math.max(...chunks.map((request) => request.cost.billedTokens))
      assert.ok(
        whole.cost.billedTokens <= 8_000 || largestChunk <= 2_000,
        `${roles} roles / ${chars} chars must fit whole or use bounded chunks`,
      )
      assert.ok(largestChunk <= 2_000, `${roles} roles / ${chars} chars: chunk <= 2,000`)
    }
  }
}

// A mid-run chunk failure and a fabricated number are both contained: completed
// roles survive, the failed role keeps source text, and truthfulness is not relaxed.
{
  const longResume = resumeWithRoles(14)
  const longJob = posting(12_000, 'chunk-live')
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      messages?: { role: string; content: string }[]
    }
    const user = JSON.parse(body.messages?.find((message) => message.role === 'user')?.content ?? '{}') as {
      role?: { sourceIndex?: number; title?: string; bullets?: { sourceBulletIndex: number; text: string }[] }
    }
    const role = user.role!
    if (role.sourceIndex === 1) {
      return new Response(JSON.stringify({ error: { message: 'temporary source failure' } }), { status: 500 })
    }
    const content = JSON.stringify({
      sourceIndex: role.sourceIndex,
      title: role.title,
      bullets: role.bullets?.map((bullet) => ({
        text: role.sourceIndex === 2
          ? `${bullet.text} Increased conversion by 99%.`
          : bullet.text,
        sourceBulletIndexes: [bullet.sourceBulletIndex],
      })),
    })
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const result = await tailorResumeWithAi(longResume, longJob, 'test-key', 'en')
    assert.equal(result.strategy, 'chunked')
    assert.equal(result.data.experience.length, 14)
    assert.ok(result.unresolved.some((issue) => /original evidence unchanged/.test(issue.detail)))
    assert.ok(result.unresolved.some((issue) => issue.code === 'unsupported_number'))
    assert.equal(result.data.experience[1].bullets[0].text, longResume.experience[1].bullets[0].text)
  } finally {
    globalThis.fetch = originalFetch
  }
}

const resume = resumeWithRoles(3, 3)
const profile = deriveProfile(resume)
const prefs: Preferences = {
  targetTitles: ['Data Analyst'],
  fields: ['Data', 'Business Intelligence'],
  seniority: 'junior',
  salary: { currency: 'EUR', period: 'year' },
  locations: [{ city: 'Berlin', radius_km: 30 }],
  workAuth: {},
  languages: [],
  mustHaves: [],
  dealbreakers: [],
}

// Headline behavior: even with a configured key, the default search makes no
// AI request and every selected candidate receives a private explanation.
{
  const jobs = Array.from({ length: 137 }, (_, index) =>
    posting(900, `zero-token-${index}`))
  let calls = 0
  let diagnostics: MatchRunDiagnostics | undefined
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    calls += 1
    throw new Error('Default matching must not call the provider.')
  }) as typeof fetch
  try {
    const matches = await runMatching(jobs, profile, prefs, 'configured-key', {
      locale: 'en',
      onDiagnostics: (value) => {
        diagnostics = value
      },
    })
    assert.equal(matches.length, jobs.length)
    assert.equal(calls, 0)
    assert.ok(matches.every(isLocalMatch))
    assert.ok(matches.every((match) => match.rationale.trim().length > 20))
    assert.ok(matches.every((match) => match.factors != null))
    assert.equal(diagnostics?.candidateCount, 137)
    assert.equal(diagnostics?.notPrioritizedCount, 97)
    assert.equal(diagnostics?.localFallbackCount, 137)
  } finally {
    globalThis.fetch = originalFetch
  }
}

// The private explanation is genuinely bilingual.
{
  const [english] = await runMatching([posting(800, 'locale-en')], profile, prefs, undefined, { locale: 'en' })
  const [german] = await runMatching([posting(800, 'locale-de')], profile, prefs, undefined, { locale: 'de' })
  assert.match(english.rationale, /Private local/)
  assert.match(german.rationale, /Private lokale/)
}

// Local factors normalize salary periods and expose remote/seniority mismatch
// semantics instead of turning unlike units into confident scores.
{
  const hourlySenior = makeJob({
    source: 'greenhouse',
    source_id: 'hourly-senior',
    title: 'Senior QA Engineer',
    company: 'Klar Eval GmbH',
    location: { country: 'DE', city: 'Berlin', remote: false },
    description: 'Playwright TypeScript quality assurance.',
    url: 'https://example.test/hourly-senior',
    salary: { min: 40, max: 40, currency: 'EUR', period: 'hour' },
  })
  const result = buildLocalMatch(hourlySenior, profile, {
    ...prefs,
    seniority: 'junior',
    remoteOnly: true,
    salary: { min: 65_000, currency: 'EUR', period: 'year' },
  })
  assert.equal(result.salaryFit, 'above')
  assert.equal(result.factors?.salary, 100)
  assert.equal(result.locationFit, 'mismatch')
  assert.equal(result.seniorityFit, 'over')
}

// Cache identity changes for every input that can change generated prose.
{
  const engine: EngineSettings = {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    fastModel: 'openai/gpt-oss-20b',
    requiresKey: true,
    fastMatching: false,
  }
  const base = generationCacheKey({ kind: 'resume', source: resume, job: posting(800, 'cache'), language: 'en', engine })
  const german = generationCacheKey({ kind: 'resume', source: resume, job: posting(800, 'cache'), language: 'de', engine })
  const changedResume = generationCacheKey({ kind: 'resume', source: resumeWithRoles(4, 3), job: posting(800, 'cache'), language: 'en', engine })
  const changedModel = generationCacheKey({
    kind: 'resume',
    source: resume,
    job: posting(800, 'cache'),
    language: 'en',
    engine: { ...engine, model: 'another-model' },
  })
  assert.notEqual(base, german)
  assert.notEqual(base, changedResume)
  assert.notEqual(base, changedModel)
  assert.notEqual(
    base,
    generationCacheKey({
      kind: 'resume',
      source: resume,
      job: posting(800, 'cache'),
      language: 'en',
      engine,
      context: { rationale: 'changed match context' },
    }),
  )
  assert.notEqual(
    base,
    generationCacheKey({
      kind: 'resume',
      source: resume,
      job: { ...posting(800, 'cache'), company: 'Changed GmbH' },
      language: 'en',
      engine,
    }),
  )
}

// Visible budget state is labelled, textual, and live-region compatible.
{
  const html = renderToStaticMarkup(h(LocaleProvider, null, h(BudgetNotice, {
    pending: { inputTokens: 100, reservedTokens: 500, billedTokens: 600 },
    waitingMs: 5_000,
  })))
  assert.match(html, /aria-labelledby="ai-budget-heading"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /600/)
}

// Static invariants protect the cumulative v2.5.3.4 handoff.
assert.match(source('src/lib/config.ts'), /llmRerank: 'off'/)
assert.match(source('src/match/index.ts'), /prefilter\(jobs, profile, prefs, jobs\.length\)/)
assert.doesNotMatch(
  source('src/match/index.ts'),
  /prefilter\(jobs, profile, prefs, MATCH\.candidateLimit\)/,
)
assert.match(
  source('src/match/index.ts'),
  /aiPriority = candidates\.slice\(0, MATCH\.candidateLimit\)/,
)
assert.match(source('src/ui/SearchStep.tsx'), /buildResultDisplayState/)
assert.match(source('src/ui/SearchStep.tsx'), /deterministicMatching/)
assert.match(source('src/ui/JobDrawer.tsx'), /explainMatchWithAi/)
assert.match(source('src/llm/tailorResume.ts'), /auditTailoringResponse\(merged/)
assert.match(source('src/llm/groq.ts'), /waitForHeadroom/)
assert.match(source('src/db/db.ts'), /this\.version\(7\)/)
assert.doesNotMatch(source('src/db/db.ts'), /this\.version\(8\)/)
const manifest = JSON.parse(source('package.json')) as { version: string; klarRelease: string }
assert.equal(manifest.version, '2.5.5')
assert.equal(manifest.klarRelease, '2.5.5')
assert.match(source('public/sw.js'), /klar-shell-v8/)
assert.doesNotMatch(source('public/sw.js'), /client\.navigate/)
assert.match(source('CHANGELOG.md'), /^## v2\.5\.5 — Quota-resilient private matching/m)

console.log('v255-quota-resilience.test.ts: all tests passed')