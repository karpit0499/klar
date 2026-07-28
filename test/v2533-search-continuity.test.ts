import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { db } from '../src/db/db'
import { invalidateEngineCache } from '../src/llm/provider'
import { isLocalMatch } from '../src/match/fallback'
import {
  runMatching,
  type MatchRunDiagnostics,
} from '../src/match'
import { judgeCareerRelevance } from '../src/match/relevance'
import { buildResultDisplayState } from '../src/search/diagnostics'
import { makeJob } from '../src/sources/normalize'
import type { NormalizedJob, Preferences, Profile } from '../src/types'

const profile: Profile = {
  summary: 'Master student in data science with Python, SQL and digital marketing experience.',
  titles: [
    { title: 'Account Management Executive', seniority: 'junior', years: 2 },
    { title: 'Digital Marketing Specialist', seniority: 'junior', years: 1 },
  ],
  skills: [{ name: 'Python' }, { name: 'Machine Learning' }, { name: 'SQL' }],
  domains: ['Data Science', 'Digital Marketing'],
  totalYears: 3,
  education: [],
  languages: [{ lang: 'German', level: 'B2' }, { lang: 'English', level: 'C2' }],
  certifications: [],
}

const prefs: Preferences = {
  targetTitles: ['Data Engineer', 'Data Scientist'],
  fields: ['Data Science'],
  seniority: 'junior',
  salary: { currency: 'EUR', period: 'year' },
  locations: [{ city: 'Berlin', radius_km: 50 }],
  remoteOnly: false,
  workAuth: {},
  languages: [],
  mustHaves: [],
  dealbreakers: [],
}

for (const title of [
  'Data Engineer',
  'Junior Data Scientist',
  'ML Engineer',
  'AI Engineer',
  'Analytics Engineer',
  'BI Developer',
  'Data Platform Engineer',
  'Data Warehouse Engineer',
  'Machine Learning Scientist',
  'Dateningenieur',
  'Datenanalyst',
  'Datenwissenschaftler',
  'KI Entwickler',
  'Business-Intelligence-Entwickler',
]) {
  const decision = judgeCareerRelevance(job(title, 0), profile, prefs)
  assert.equal(decision.keep, true, `${title} should pass the data-role relevance gate`)
}
assert.equal(
  judgeCareerRelevance(job('Senior Data Scientist', 99), profile, prefs).keep,
  false,
  'an explicitly senior role must still fail a junior search',
)

// Hard-filtered rows remain inspectable but must never fall back into the main
// result grid or a visible-results export when every shown row is removed.
const hiddenOnly = buildResultDisplayState<NormalizedJob>([], 5)
assert.equal(hiddenOnly.hasAny, true)
assert.equal(hiddenOnly.hasShown, false)
assert.deepEqual(hiddenOnly.shown, [])
const oneShown = job('Data Engineer', 100, 'shown')
const mixedDisplay = buildResultDisplayState([oneShown], 4)
assert.equal(mixedDisplay.hasAny, true)
assert.equal(mixedDisplay.hasShown, true)
assert.deepEqual(mixedDisplay.shown.map((item) => item.id), [oneShown.id])
const searchStepSource = readFileSync(
  new URL('../src/ui/SearchStep.tsx', import.meta.url),
  'utf8',
)
assert.match(searchStepSource, /buildResultDisplayState\(view\.withScore, view\.hidden\.length\)/)
assert.doesNotMatch(
  searchStepSource,
  /view\.withScore\.length\s*\?\s*view\.withScore\.map\(\(x\) => x\.job\)\s*:\s*jobs/,
  'an empty hard-filtered main set must never fall back to every candidate job',
)

const originalFetch = globalThis.fetch

try {
  // A partial provider response must enrich the valid rows and retain a local
  // result for every missing ID.
  await resetDb()
  {
    const jobs = jobsFor('partial', 5)
    let selected: NormalizedJob[] = []
    let diagnostics: MatchRunDiagnostics | undefined
    const snapshots: string[][] = []
    const diagnosticsSnapshots: MatchRunDiagnostics[] = []
    globalThis.fetch = (async () => jsonResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            results: selected.slice(0, 2).map((candidate, index) => ({
              jobId: candidate.id,
              fitScore: 82 - index,
              verdict: 'strong',
              rationale: 'Provider score.',
              matchedSkills: ['Python'],
              missingSkills: [],
              salaryFit: 'unknown',
              locationFit: 'exact',
              seniorityFit: 'match',
              redFlags: [],
              factors: { skills: 80, salary: 50, location: 90, seniority: 80 },
              confidence: 0.8,
            })),
          }),
        },
      }],
    })) as typeof fetch

    const matches = await runMatching(jobs, profile, prefs, 'test-key', {
      onCandidates: (candidates) => {
        selected = candidates
      },
      onMatches: (snapshot) => {
        snapshots.push(snapshot.filter(isLocalMatch).map((match) => match.jobId))
      },
      onDiagnostics: (value) => {
        diagnostics = value
        diagnosticsSnapshots.push(value)
      },
    })

    assert.equal(selected.length, 5)
    assert.equal(matches.length, 5)
    assert.equal(matches.filter(isLocalMatch).length, 3)
    assert.equal(snapshots[0].length, 5, 'the first published snapshot must be complete and local')
    assert.equal(diagnosticsSnapshots[0]?.candidateCount, 5)
    assert.equal(diagnosticsSnapshots[0]?.aiFreshCount, 0)
    assert.equal(diagnosticsSnapshots[0]?.localFallbackCount, 5)
    for (const value of diagnosticsSnapshots) {
      assert.equal(
        value.aiCachedCount + value.aiFreshCount + value.localFallbackCount,
        value.candidateCount,
        'every published diagnostic snapshot must reconcile with its candidate set',
      )
    }
    assert.equal(diagnostics?.aiFreshCount, 2)
    assert.equal(diagnostics?.localFallbackCount, 3)
    assert.equal(diagnostics?.partialBatchCount, 1)
    assert.equal(diagnostics?.failedBatchCount, 0)
  }

  // A provider rate limit is terminal for this search run, but it must not
  // remove any candidate or create fake AI rows.
  await resetDb()
  {
    const jobs = jobsFor('rate-limit', 5)
    let diagnostics: MatchRunDiagnostics | undefined
    globalThis.fetch = (async () => jsonResponse({
      error: {
        message: 'Rate limit reached.',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      },
    }, 429)) as typeof fetch

    const matches = await runMatching(jobs, profile, prefs, 'test-key', {
      onDiagnostics: (value) => {
        diagnostics = value
      },
    })

    assert.equal(matches.length, 5)
    assert.equal(matches.every(isLocalMatch), true)
    assert.equal(diagnostics?.localFallbackCount, 5)
    assert.equal(diagnostics?.failedBatchCount, 1)
    assert.equal(diagnostics?.failuresByCategory.rate_limit, 1)
  }

  // Candidate limiting is a prioritization decision, not an AI failure.
  await resetDb()
  {
    const jobs = jobsFor('bounded', 45)
    let diagnostics: MatchRunDiagnostics | undefined
    const matches = await runMatching(jobs, profile, prefs, undefined, {
      onDiagnostics: (value) => {
        diagnostics = value
      },
    })

    assert.equal(matches.length, 40)
    assert.equal(matches.every(isLocalMatch), true)
    assert.equal(diagnostics?.candidateCount, 40)
    assert.equal(diagnostics?.notPrioritizedCount, 5)
    assert.equal(diagnostics?.aiRequestedCount, 0)
    assert.equal(diagnostics?.failedBatchCount, 0)
  }
} finally {
  globalThis.fetch = originalFetch
  await resetDb()
}

console.log('v2533-search-continuity.test.ts: all tests passed')

function jobsFor(prefix: string, count: number): NormalizedJob[] {
  return Array.from({ length: count }, (_, index) => job('Data Engineer', index, prefix))
}

function job(title: string, index: number, prefix = 'role'): NormalizedJob {
  return makeJob({
    source: 'arbeitnow',
    source_id: `${prefix}-${index}`,
    title,
    company: 'Example Data GmbH',
    location: { city: 'Berlin', country: 'Germany', remote: false },
    description:
      'Build predictive pipelines, reporting products, production platforms and analytical systems for customers.',
    url: `https://example.test/${prefix}/${index}`,
    posted_at: '2026-07-26T00:00:00.000Z',
    tags: [],
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function resetDb(): Promise<void> {
  db.close()
  await db.delete()
  await db.open()
  invalidateEngineCache()
}