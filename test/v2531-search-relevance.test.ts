import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { makeJob } from '../src/sources/normalize'
import type { MatchResult, NormalizedJob, Preferences, Profile } from '../src/types'
import {
  filterCareerRelevantJobs,
  judgeCareerRelevance,
} from '../src/match/relevance'
import { prefilter, scoreJob } from '../src/match/prefilter'
import { scoreBySimilarity } from '../src/match/semantic'
import { applyLocalFiltersWithDiagnostics } from '../src/match/localFilters'
import { regionDE } from '../src/regions/de'
import { buildRerankPrompt } from '../src/match/rerank'
import { matchContextHash } from '../src/match'
import { compositeScore, DEFAULT_WEIGHTS } from '../src/match/weights'
import { buildSearchDiagnostics } from '../src/search/diagnostics'
import type { GatherResult } from '../src/sources'

// Regression fixture derived from the user-supplied résumé. It deliberately
// includes strong data skills: those skills must never override the requested
// account-management role or its email/digital-marketing market.
const profile: Profile = {
  summary: 'Account management executive with digital marketing, email campaigns, CRM, retention and client reporting experience.',
  titles: [
    { title: 'Account Management Executive', seniority: 'junior', years: 2 },
    { title: 'Digital Marketing Specialist', seniority: 'junior', years: 1 },
  ],
  skills: [
    { name: 'Python' }, { name: 'Machine Learning' }, { name: 'SQL' },
    { name: 'Klaviyo' }, { name: 'Mailchimp' }, { name: 'HubSpot' }, { name: 'GA4' },
  ],
  domains: ['Data Science', 'Digital Marketing'],
  totalYears: 3,
  education: [],
  languages: [{ lang: 'German', level: 'B2' }, { lang: 'English', level: 'C2' }],
  certifications: [],
}

const prefs: Preferences = {
  targetTitles: ['Junior Account Management Executive'],
  fields: ['Digital Marketing', 'Email Marketing', 'CRM'],
  seniority: 'junior',
  salary: { currency: 'EUR', period: 'year' },
  locations: [{ city: 'Berlin', radius_km: 50 }],
  remoteOnly: false,
  workAuth: {},
  languages: [],
  mustHaves: [],
  dealbreakers: [],
}

const relevant = [
  job('good-email', 'Junior Account Manager — Email Marketing', 'Berlin', 'Germany',
    'Own email marketing campaigns in Klaviyo, CRM lifecycle programmes, retention reporting and client relationships.'),
  job('good-crm', 'Account Executive, CRM & Lifecycle Marketing', 'Berlin', 'Deutschland',
    'Manage client accounts for a digital marketing agency. Deliver CRM campaigns, automation and newsletters.'),
  job('good-customer', 'Junior Customer Success Manager — Marketing Automation', 'Berlin', 'DE',
    'Support marketing clients using HubSpot and Mailchimp campaign automation.'),
]

const irrelevant = [
  job('car-rental', 'Account Manager — Car Rental Sales', 'Berlin', 'Germany',
    'Grow fleet rental revenue, negotiate vehicle contracts and hit automotive sales targets.'),
  job('iam', 'Account Executive — Identity and Access Management', 'Berlin', 'Germany',
    'Sell cybersecurity IAM software and cloud security subscriptions to enterprise IT teams.'),
  job('data', 'Senior Data Scientist, Growth', 'Toronto, Ontario, Canada', 'Canada',
    'Build machine learning models in Python and production ML pipelines.'),
  job('engineering', 'Software Engineering Manager, Content Agent', 'London, UK', 'United Kingdom',
    'Lead a software engineering organisation and ship AI infrastructure.'),
  job('planning', 'Director, Planning Value Stream', 'Berlin', 'Germany',
    'Lead supply chain planning, manufacturing operations and procurement.'),
  job('media-lead', 'Strategic Partnerships & Media Investment Lead', 'Berlin', 'Germany',
    'Lead media partnerships and investment strategy across the organisation.'),
]

for (const candidate of relevant) {
  const decision = judgeCareerRelevance(candidate, profile, prefs)
  assert.equal(decision.keep, true, `${candidate.title} should pass role + market relevance`)
}
assert.equal(judgeCareerRelevance(irrelevant[0], profile, prefs).keep, false)
assert.equal(
  judgeCareerRelevance(irrelevant[0], profile, prefs).keep
    ? undefined
    : judgeCareerRelevance(irrelevant[0], profile, prefs).reason,
  'market',
  'same title in car-rental sales must fail the market gate',
)
assert.equal(judgeCareerRelevance(irrelevant[1], profile, prefs).keep, false, 'IAM sales is the wrong market')
assert.equal(
  judgeCareerRelevance(
    job('sdr', 'Account Development Representative I — DACH', 'Remote', 'Deutschland',
      'Qualify prospects, build a sales pipeline and work with marketing on enterprise software demand generation.'),
    profile,
    prefs,
  ).keep,
  false,
  'an account-development sales title is not account management',
)
assert.equal(
  judgeCareerRelevance(
    job('saas-ae', 'Account Executive', 'Berlin', 'Germany',
      'Own the SaaS sales cycle, close quota and use CRM. Work with the marketing team on pipeline targets.'),
    profile,
    prefs,
  ).keep,
  false,
  'incidental marketing/CRM words must not turn SaaS sales into digital-marketing account work',
)
assert.equal(
  judgeCareerRelevance(
    irrelevant[0],
    { ...profile, summary: '', titles: [], domains: [] },
    prefs,
  ).keep,
  false,
  'the explicit job-market field must work even for a manually-created profile',
)
for (const candidate of irrelevant.slice(2)) {
  assert.equal(judgeCareerRelevance(candidate, profile, prefs).keep, false, candidate.title)
}

const all = [...irrelevant, ...relevant]
const gated = filterCareerRelevantJobs(all, profile, prefs)
assert.deepEqual(gated.jobs.map((candidate) => candidate.id), relevant.map((candidate) => candidate.id))
assert.equal(gated.diagnostics.removed, irrelevant.length)
assert.equal(gated.diagnostics.removedBy.market, 2)

const keyword = prefilter(all, profile, prefs, 40)
assert.deepEqual(keyword.map((candidate) => candidate.id).sort(), relevant.map((candidate) => candidate.id).sort())
assert.ok(
  scoreJob(relevant[0], profile, prefs) > scoreJob(irrelevant[2], profile, prefs),
  'data skills cannot make a data-science role outrank the requested marketing account role',
)

const semantic = scoreBySimilarity(all, profile, prefs)
assert.deepEqual(semantic.map((candidate) => candidate.job.id).sort(), relevant.map((candidate) => candidate.id).sort())
assert.ok(
  [relevant[0].id, relevant[1].id].includes(semantic[0]?.job.id ?? ''),
  'email/CRM lifecycle account roles should lead semantic results',
)

// A 50 km Berlin search must reject explicit global locations even when an ATS
// omitted coordinates, and must use the region resolver for known German cities.
const berlin = relevant[0]
const london = job('london', 'Junior Account Manager — Email Marketing', 'London, UK', 'United Kingdom', relevant[0].description)
const toronto = job('toronto', 'Junior Account Manager — Email Marketing', 'Toronto, Canada', 'Canada', relevant[0].description)
const munich = job('munich', 'Junior Account Manager — Email Marketing', 'Munich', 'Germany', relevant[0].description)
const falseGermany = job('new-york', 'Junior Account Manager — Email Marketing', 'New York, NY', 'Deutschland', relevant[0].description)
const unknownRemote = job('unknown-remote', 'Junior Account Manager — Email Marketing', 'Remote', 'Deutschland', relevant[0].description)
const distance = applyLocalFiltersWithDiagnostics([berlin, london, toronto, munich, falseGermany, unknownRemote], {
  maxDistanceKm: 50,
  origin: { lat: 52.52, lng: 13.405 },
  targetCity: 'Berlin',
  targetCountries: ['DE', 'Germany', 'Deutschland'],
  resolveLocation: regionDE.resolveLocation,
  keepRemoteRegardlessOfDistance: false,
  keepUnlocatable: false,
})
assert.deepEqual(distance.jobs.map((candidate) => candidate.id), [berlin.id])
assert.equal(distance.diagnostics.removed.distance, 5)

const prompt = buildRerankPrompt(profile, prefs, relevant.slice(0, 1))
assert.match(prompt, /Account management executive with digital marketing/)
assert.match(prompt, /Email Marketing/)
assert.match(prompt, /job market\/field/)

assert.notEqual(
  matchContextHash(profile, prefs),
  matchContextHash({ ...profile, summary: `${profile.summary} Updated.` }, prefs),
  'summary changes must invalidate cached scores',
)
assert.notEqual(
  matchContextHash(profile, prefs),
  matchContextHash(profile, { ...prefs, fields: ['Automotive'] }),
  'job-market changes must invalidate cached scores',
)

const strongRole = match('strong', 90, 40)
const weakRoleWithSkills = match('weak', 30, 100)
assert.ok(
  compositeScore(strongRole, DEFAULT_WEIGHTS) > compositeScore(weakRoleWithSkills, DEFAULT_WEIGHTS),
  'holistic role/market fit must survive the adjustable factor blend',
)

const gathered: GatherResult = {
  jobs: all,
  status: [{ source: 'greenhouse', requested: true, ok: true, count: all.length }],
  sourcesRequested: ['greenhouse'],
  rawCount: all.length,
  duplicatesRemoved: 0,
}
const diagnostics = buildSearchDiagnostics(gathered, {
  inputCount: all.length,
  removed: { employment: 0, hideList: 0, recency: 0, distance: 0 },
  unlocatableCount: 0,
  distanceRequested: false,
  distanceEnforced: false,
  finalCount: all.length,
}, {
  relevanceRemoved: irrelevant.length,
  finalCount: relevant.length,
})
assert.equal(diagnostics.relevanceRemoved, irrelevant.length)

console.log('v2531-search-relevance.test.ts: all tests passed')

function job(
  id: string,
  title: string,
  city: string,
  country: string,
  description: string,
): NormalizedJob {
  return makeJob({
    source: 'ba',
    source_id: id,
    title,
    company: 'Example',
    location: { city, country, remote: false },
    description,
    url: `https://example.test/${id}`,
    posted_at: '2026-07-25T00:00:00.000Z',
    tags: [],
  })
}

function match(jobId: string, fitScore: number, factor: number): MatchResult {
  return {
    jobId,
    fitScore,
    verdict: fitScore >= 60 ? 'good' : 'weak',
    rationale: '',
    matchedSkills: [],
    missingSkills: [],
    redFlags: [],
    factors: { skills: factor, salary: factor, location: factor, seniority: factor },
    scoredAt: '2026-07-26T00:00:00.000Z',
    modelVersion: 'test',
  }
}
