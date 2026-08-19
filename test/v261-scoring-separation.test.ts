import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { mergeAiExplanationWithLocal } from '../src/match/fallback'
import { buildRerankPrompt, parseRerank } from '../src/match/rerank'
import type { MatchResult, NormalizedJob, Preferences, Profile } from '../src/types'

const local: MatchResult = {
  jobId: 'job-261',
  fitScore: 61,
  verdict: 'good',
  rationale: 'Private deterministic evidence.',
  matchedSkills: ['TypeScript'],
  missingSkills: ['Kubernetes'],
  salaryFit: 'unknown',
  locationFit: 'exact',
  seniorityFit: 'match',
  redFlags: [],
  factors: { skills: 65, salary: 50, location: 90, seniority: 70 },
  scoredAt: '2026-08-11T08:00:00.000Z',
  modelVersion: 'local-v2.3',
}

const ai: MatchResult = {
  jobId: 'job-261',
  fitScore: 84,
  verdict: 'strong',
  rationale: 'Independent provider assessment.',
  matchedSkills: ['TypeScript', 'React'],
  missingSkills: [],
  salaryFit: 'in-range',
  locationFit: 'remote',
  seniorityFit: 'match',
  redFlags: ['Confirm travel expectations.'],
  factors: { skills: 87, salary: 78, location: 96, seniority: 82 },
  confidence: 0.73,
  scoredAt: '2026-08-11T08:01:00.000Z',
  modelVersion: 'provider-model-test',
  aiProvenance: {
    scorerVersion: 'ai-match-scorer-v2.6.1',
    promptVersion: 'ai-match-prompt-v2.6.1',
    responseSchemaVersion: 'ai-match-schema-v1',
    engineHost: 'api.example.test',
    cacheStatus: 'fresh',
    locale: 'de',
  },
}

test('the deterministic row and provider assessment remain independent', () => {
  const merged = mergeAiExplanationWithLocal(local, ai)
  assert.equal(merged.fitScore, 61)
  assert.equal(merged.modelVersion, 'local-v2.3')
  assert.equal(merged.rationale, 'Private deterministic evidence.')
  assert.equal(merged.aiAssessment?.fitScore, 84)
  assert.equal(merged.aiAssessment?.modelVersion, 'provider-model-test')
  assert.equal(merged.aiAssessment?.rationale, 'Independent provider assessment.')
  assert.deepEqual(merged.aiAssessment?.factors, ai.factors)
  assert.deepEqual(merged.aiAssessment?.provenance, ai.aiProvenance)

  const mergedTwice = mergeAiExplanationWithLocal(local, merged)
  assert.equal(mergedTwice.fitScore, 61)
  assert.equal(mergedTwice.aiAssessment?.fitScore, 84)
  assert.equal(mergedTwice.aiAssessment?.modelVersion, 'provider-model-test')
  assert.notEqual(mergedTwice.aiAssessment, merged.aiAssessment)

  ai.matchedSkills.push('mutated later')
  if (ai.factors) ai.factors.skills = 0
  assert.doesNotMatch(merged.aiAssessment?.matchedSkills.join(' ') ?? '', /mutated/)
  assert.equal(merged.aiAssessment?.factors?.skills, 87)
})

test('provider parsing never fabricates factor evidence from the holistic score', () => {
  const [parsed] = parseRerank(JSON.stringify({
    results: [{
      jobId: 'job-261',
      fitScore: 72.5,
      verdict: 'good',
      rationale: 'Thin posting.',
      matchedSkills: [],
      missingSkills: [],
      redFlags: [],
      confidence: 0.4,
    }],
  }), '2026-08-11T08:00:00.000Z', 'provider-model-test', ['job-261'])
  assert.equal(parsed.fitScore, 72.5)
  assert.equal(parsed.factors, undefined)
})

test('the provider prompt follows the selected German response language', () => {
  const profile: Profile = {
    summary: 'Frontend developer',
    titles: [{ title: 'Frontend Developer' }],
    skills: [{ name: 'React' }],
    domains: ['software'],
    education: [],
    languages: [{ lang: 'German', level: 'B2' }],
    certifications: [],
  }
  const prefs: Preferences = {
    targetTitles: ['Frontend Developer'],
    fields: ['software'],
    seniority: 'mid',
    salary: { currency: 'EUR', period: 'year' },
    locations: [{ city: 'Berlin', radius_km: 25 }],
    workAuth: {},
    languages: [],
    mustHaves: [],
    dealbreakers: [],
  }
  const job: NormalizedJob = {
    id: 'job-261',
    source: 'arbeitnow',
    source_id: 'job-261',
    title: 'Frontend Developer',
    company: 'Example GmbH',
    location: { city: 'Berlin', country: 'DE', remote: false },
    description: 'React role',
    url: 'https://example.test/jobs/261',
    salary: {},
    tags: [],
    fetched_at: '2026-08-11T08:00:00.000Z',
  }
  assert.match(buildRerankPrompt(profile, prefs, [job], 'de'), /clear German/)
})

test('the comparison UI reads the nested provider score and exposes provenance', async () => {
  const drawer = await readFile(new URL('../src/ui/JobDrawer.tsx', import.meta.url), 'utf8')
  const search = await readFile(new URL('../src/ui/SearchStep.tsx', import.meta.url), 'utf8')
  assert.match(drawer, /match\.aiAssessment\.fitScore/)
  assert.match(drawer, /match\.aiAssessment\.provenance\.scorerVersion/)
  assert.match(drawer, /match\.aiAssessment\.fitScore - match\.fitScore/)
  assert.doesNotMatch(drawer, /Math\.abs\(match\.fitScore - match\.aiAssessment\.fitScore\)/)
  assert.doesNotMatch(
    search,
    /mergeAiExplanationWithLocal\(existing, next\)/,
    'the one-job AI result is not merged a second time by SearchStep',
  )
  assert.match(
    search,
    /\{ \.\.\.next, ranking: existing\.ranking \}/,
    'the already-separated result preserves the existing deterministic ranking snapshot',
  )
})
