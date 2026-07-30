import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { db } from '../src/db/db'
import { invalidateEngineCache } from '../src/llm/provider'
import { buildLocalMatch, isLocalMatch } from '../src/match/fallback'
import { explainMatchWithAi, runMatching, type MatchRunDiagnostics } from '../src/match'
import { compositeScore } from '../src/match/weights'
import { makeJob } from '../src/sources/normalize'
import type { NormalizedJob, Preferences, Profile, ScoreWeights } from '../src/types'

const profile: Profile = {
  summary: 'Data engineer building Python and SQL platforms.',
  titles: [{ title: 'Data Engineer', seniority: 'mid', years: 4 }],
  skills: [{ name: 'Python' }, { name: 'SQL' }, { name: 'Docker' }],
  domains: ['Data Engineering'],
  totalYears: 4,
  education: [],
  languages: [{ lang: 'English', level: 'C2' }],
  certifications: [],
}

const prefs: Preferences = {
  targetTitles: ['Data Engineer'],
  fields: ['Data Engineering'],
  seniority: 'mid',
  salary: { min: 60_000, currency: 'EUR', period: 'year' },
  locations: [{ city: 'Berlin', radius_km: 50 }],
  remoteOnly: false,
  workAuth: {},
  languages: [],
  mustHaves: [],
  dealbreakers: [],
}

const originalFetch = globalThis.fetch
const RELEVANT_JOB_COUNT = 137
const AI_PRIORITY_COUNT = 40
const LOCAL_OVERFLOW_COUNT = RELEVANT_JOB_COUNT - AI_PRIORITY_COUNT

try {
  // Both local ranking modes must retain every relevant job, even without AI.
  for (const prefilterMode of ['keyword', 'semantic'] as const) {
    await resetDb()
    let diagnostics: MatchRunDiagnostics | undefined
    const matches = await runMatching(jobsFor(`${prefilterMode}-local`, RELEVANT_JOB_COUNT), profile, prefs, undefined, {
      prefilterMode,
      onDiagnostics: (value) => {
        diagnostics = value
      },
    })

    assert.equal(matches.length, RELEVANT_JOB_COUNT, `${prefilterMode}: all relevant jobs remain visible`)
    assert.equal(matches.every(isLocalMatch), true)
    assert.equal(matches.every((match) => match.factors != null), true)
    assert.equal(diagnostics?.candidateCount, RELEVANT_JOB_COUNT)
    assert.equal(diagnostics?.notPrioritizedCount, LOCAL_OVERFLOW_COUNT)
    assert.equal(diagnostics?.aiRequestedCount, 0)
    assert.equal(diagnostics?.localFallbackCount, RELEVANT_JOB_COUNT)
  }

  // AI remains cost-bounded: only the top 40 are enriched, but all 137 stay in
  // the returned snapshot and the overflow retains responsive local scores.
  await resetDb()
  {
    let calls = 0
    let diagnostics: MatchRunDiagnostics | undefined
    globalThis.fetch = (async (_input, init) => {
      calls += 1
      const batch = jobsFromRequest(init)
      return jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              results: batch.map((job, index) => ({
                jobId: job.jobId,
                fitScore: 85 - index,
                verdict: 'strong',
                rationale: 'Provider score.',
                matchedSkills: ['Python'],
                missingSkills: [],
                salaryFit: 'in-range',
                locationFit: 'exact',
                seniorityFit: 'match',
                redFlags: [],
                factors: { skills: 90, salary: 80, location: 100, seniority: 90 },
                confidence: 0.9,
              })),
            }),
          },
        }],
      })
    }) as typeof fetch

    const matches = await runMatching(jobsFor('ai-bounded', RELEVANT_JOB_COUNT), profile, prefs, 'test-key', {
      rerankMode: 'all',
      onDiagnostics: (value) => {
        diagnostics = value
      },
    })

    assert.equal(calls, 8, '40 AI candidates are scored in eight five-job batches')
    assert.equal(matches.length, RELEVANT_JOB_COUNT)
    assert.equal(matches.filter(isLocalMatch).length, LOCAL_OVERFLOW_COUNT)
    assert.equal(matches.every((match) => match.factors != null), true)
    assert.equal(diagnostics?.candidateCount, RELEVANT_JOB_COUNT)
    assert.equal(diagnostics?.notPrioritizedCount, LOCAL_OVERFLOW_COUNT)
    assert.equal(diagnostics?.aiRequestedCount, AI_PRIORITY_COUNT)
    assert.equal(diagnostics?.aiFreshCount, AI_PRIORITY_COUNT)
    assert.equal(diagnostics?.localFallbackCount, LOCAL_OVERFLOW_COUNT)
    assert.equal(diagnostics?.failedBatchCount, 0)
    assert.equal(diagnostics?.partialBatchCount, 0)
  }

  // Any locally ranked result can still receive an explicit, cached one-job AI
  // explanation, including a job that started beyond the automatic top 40.
  await resetDb()
  {
    const overflowJob = job('explicit-overflow-136', 136)
    let calls = 0
    globalThis.fetch = (async (_input, init) => {
      calls += 1
      const [requested] = jobsFromRequest(init)
      return jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              results: [{
                jobId: requested.jobId,
                fitScore: 91,
                verdict: 'strong',
                rationale: 'Explicit provider explanation.',
                matchedSkills: ['Python', 'SQL'],
                missingSkills: [],
                salaryFit: 'in-range',
                locationFit: 'exact',
                seniorityFit: 'match',
                redFlags: [],
                factors: { skills: 95, salary: 90, location: 100, seniority: 90 },
                confidence: 0.94,
              }],
            }),
          },
        }],
      })
    }) as typeof fetch

    const fresh = await explainMatchWithAi(overflowJob, profile, prefs, 'test-key')
    const cached = await explainMatchWithAi(overflowJob, profile, prefs, 'test-key')
    assert.equal(fresh.jobId, overflowJob.id)
    assert.equal(isLocalMatch(fresh), false)
    assert.equal(cached.jobId, fresh.jobId)
    assert.equal(cached.fitScore, fresh.fitScore)
    assert.equal(cached.rationale, fresh.rationale)
    assert.equal(calls, 1, 'the beyond-40 one-job explanation is cached')
  }

  // The controls must change local scores and can reverse two jobs whose factor
  // strengths oppose each other. This catches the v2.5.3.3 no-factors bug.
  {
    const skillsJob = job('slider-skills', 0, {
      description: 'Build Python and SQL pipelines in Docker for production analytics.',
      salary: { min: 30_000, max: 40_000, currency: 'EUR', period: 'year' },
    })
    const salaryJob = job('slider-salary', 1, {
      description: 'Build Java, Kubernetes and Terraform reporting systems.',
      salary: { min: 90_000, max: 100_000, currency: 'EUR', period: 'year' },
    })
    const skillsMatch = buildLocalMatch(skillsJob, profile, prefs)
    const salaryMatch = buildLocalMatch(salaryJob, profile, prefs)
    const skillsOnly: ScoreWeights = { skills: 1, salary: 0, location: 0, seniority: 0 }
    const salaryOnly: ScoreWeights = { skills: 0, salary: 1, location: 0, seniority: 0 }

    assert.ok(skillsMatch.factors)
    assert.ok(salaryMatch.factors)
    assert.ok(
      compositeScore(skillsMatch, skillsOnly) > compositeScore(salaryMatch, skillsOnly),
      'skills weighting puts the skill-aligned local job first',
    )
    assert.ok(
      compositeScore(skillsMatch, salaryOnly) < compositeScore(salaryMatch, salaryOnly),
      'salary weighting puts the higher-paying local job first',
    )
    assert.notEqual(
      compositeScore(skillsMatch, skillsOnly),
      compositeScore(skillsMatch, salaryOnly),
      'moving the sliders changes a local card score',
    )

    const straddlingSalary = buildLocalMatch(
      job('salary-range', 2, {
        salary: { min: 30_000, max: 70_000, currency: 'EUR', period: 'year' },
      }),
      profile,
      prefs,
    )
    assert.equal(straddlingSalary.salaryFit, 'in-range')
    assert.ok(
      (straddlingSalary.factors?.salary ?? 100) < 100,
      'a wide range is not treated as fully above the preference because only its maximum clears it',
    )

    const juniorManager = buildLocalMatch(
      job('junior-manager', 3, { title: 'Junior Account Manager', seniority: undefined }),
      profile,
      { ...prefs, targetTitles: ['Account Manager'], fields: [], seniority: 'junior' },
    )
    assert.equal(juniorManager.seniorityFit, 'match')
    assert.equal(juniorManager.factors?.seniority, 100)

    const malformedSalary = buildLocalMatch(
      job('invalid-salary', 4, {
        salary: { min: Number.NaN, max: Number.POSITIVE_INFINITY, currency: 'EUR', period: 'year' },
      }),
      profile,
      prefs,
    )
    assert.equal(malformedSalary.salaryFit, 'unknown')
    assert.equal(malformedSalary.factors?.salary, 50)
    assert.equal(Number.isFinite(compositeScore(malformedSalary, salaryOnly)), true)
  }
} finally {
  globalThis.fetch = originalFetch
  await resetDb()
}

console.log('v2534-unbounded-results.test.ts: all tests passed')

function jobsFor(prefix: string, count: number): NormalizedJob[] {
  return Array.from({ length: count }, (_, index) => job(`${prefix}-${index}`, index))
}

function job(
  id: string,
  index: number,
  patch: Partial<NormalizedJob> = {},
): NormalizedJob {
  return makeJob({
    source: 'arbeitnow',
    source_id: id,
    title: 'Data Engineer',
    company: `Example Data ${index}`,
    location: { city: 'Berlin', country: 'Germany', remote: false },
    description: 'Build data pipelines and analytical systems for production customers.',
    url: `https://example.test/${id}`,
    posted_at: '2026-07-28T00:00:00.000Z',
    salary: { min: 60_000, max: 70_000, currency: 'EUR', period: 'year' },
    seniority: 'mid',
    tags: [],
    ...patch,
  })
}

function jobsFromRequest(init: RequestInit | undefined): { jobId: string }[] {
  const body = JSON.parse(String(init?.body)) as {
    messages?: { role?: string; content?: string }[]
  }
  const prompt = body.messages?.find((message) => message.role === 'user')?.content ?? ''
  const match = prompt.match(/JOBS TO SCORE:\n(\[[\s\S]*?\])\n\nFor EACH job/)
  assert.ok(match, 'the rerank request includes its job batch')
  return JSON.parse(match[1]) as { jobId: string }[]
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function resetDb(): Promise<void> {
  db.close()
  await db.delete()
  await db.open()
  invalidateEngineCache()
}