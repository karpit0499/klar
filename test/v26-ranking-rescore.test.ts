import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { db } from '../src/db/db'
import { RANKING_MODEL_VERSION } from '../src/match/rankingV2'
import { makeJob } from '../src/sources/normalize'
import { addToTracker, rescoreTrackedJob } from '../src/tracker/store'
import type { MatchResult, Preferences, Profile } from '../src/types'

const profile: Profile = {
  summary: 'Data analyst building reliable reporting.',
  titles: [{ title: 'Data Analyst', seniority: 'mid', years: 4 }],
  skills: [{ name: 'SQL' }, { name: 'Power BI' }],
  domains: ['Data'],
  totalYears: 4,
  education: [],
  languages: [{ lang: 'English', level: 'C1' }],
  certifications: [],
}

const prefs: Preferences = {
  targetTitles: ['Data Analyst'],
  fields: ['Data'],
  seniority: 'mid',
  salary: { currency: 'EUR', period: 'year' },
  locations: [{ city: 'Berlin', radius_km: 50 }],
  hybridOk: true,
  workAuth: { needsVisaSponsorship: false },
  languages: [],
  mustHaves: ['SQL'],
  dealbreakers: [],
  contractType: ['full time'],
}

const job = makeJob({
  source: 'greenhouse',
  source_id: 'ranking-rescore',
  title: 'Data Analyst',
  company: 'Example GmbH',
  location: { country: 'DE', city: 'Berlin', remote: false },
  description: 'SQL is required. Power BI is preferred.',
  url: 'https://example.test/jobs/ranking-rescore',
})

const historical: MatchResult = {
  jobId: job.id,
  fitScore: 42,
  verdict: 'stretch',
  rationale: 'Historical score.',
  matchedSkills: [],
  missingSkills: [],
  redFlags: [],
  scoredAt: '2025-01-01T00:00:00.000Z',
  modelVersion: 'local-v2.5.5',
}

await db.tracked.clear()
await addToTracker(job, historical)

const rescored = await rescoreTrackedJob(job.id, profile, prefs, 'en')
assert.ok(rescored)
assert.equal(rescored.ranking?.rankingVersion, RANKING_MODEL_VERSION)
assert.equal(rescored.ranking?.historical, false)
assert.notEqual(rescored.fitScore, historical.fitScore)
assert.match(rescored.rationale, /reproducible/i)

const stored = await db.tracked.get(job.id)
assert.equal(stored?.match?.ranking?.rankingVersion, RANKING_MODEL_VERSION)
assert.equal(stored?.match?.ranking?.inputHash, rescored.ranking?.inputHash)

await db.tracked.clear()
await db.close()

console.log('v26-ranking-rescore.test.ts: all tests passed')
