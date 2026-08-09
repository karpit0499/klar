import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import {
  buildLocalMatch,
  mergeAiExplanationWithLocal,
} from '../src/match/fallback.ts'
import { runMatching } from '../src/match/index.ts'
import {
  RANKING_EXPLANATION_VERSION,
  RANKING_MODEL_VERSION,
  REQUIREMENT_MODEL_VERSION,
  evaluateJobV2,
  extractRankingRequirements,
  normalizeHistoricalRanking,
  rankCandidateSetV2,
} from '../src/match/rankingV2.ts'
import { prefilter } from '../src/match/prefilter.ts'
import { defaultEmbedder } from '../src/match/embeddings.ts'
import { semanticPrefilter } from '../src/match/semantic.ts'
import { semanticPrefilterAsync, syncToAsync } from '../src/match/neuralEmbedder.ts'
import { db } from '../src/db/db.ts'
import type { MatchResult, NormalizedJob, Preferences, Profile } from '../src/types.ts'

const profile: Profile = {
  summary: 'Data analyst building reliable product and marketing reports.',
  titles: [{ title: 'Data Analyst', seniority: 'mid', years: 4 }],
  skills: [{ name: 'SQL' }, { name: 'Excel' }, { name: 'Power BI' }],
  domains: ['Data', 'Business Intelligence'],
  totalYears: 4,
  education: [{ degree: 'Bachelor', field: 'Business Analytics', institution: 'Example University' }],
  languages: [{ lang: 'German', level: 'B2' }, { lang: 'English', level: 'C1' }],
  certifications: [],
}

const prefs: Preferences = {
  targetTitles: ['Data Analyst'],
  fields: ['Data', 'Business Intelligence'],
  seniority: 'mid',
  salary: { min: 60_000, currency: 'EUR', period: 'year' },
  locations: [{ city: 'Berlin', radius_km: 40 }],
  hybridOk: true,
  workAuth: { needsVisaSponsorship: true },
  languages: [],
  mustHaves: ['SQL'],
  dealbreakers: [],
  contractType: ['full time'],
}

const exact = job('exact', {
  description: [
    'Requirements:',
    '- SQL is required.',
    '- Excel is required.',
    '- German B2 is required.',
    'Preferred:',
    '- Power BI is preferred.',
  ].join('\n'),
})

{
  const requirements = extractRankingRequirements(exact, profile, prefs)
  const required = requirements.filter((requirement) => requirement.priority === 'required')
  const preferred = requirements.filter((requirement) => requirement.priority === 'preferred')
  assert.ok(required.some((requirement) => requirement.normalized === 'sql' && requirement.status === 'met'))
  assert.ok(required.some((requirement) => requirement.normalized === 'excel' && requirement.status === 'met'))
  assert.ok(required.some((requirement) =>
    requirement.kind === 'language' && requirement.status === 'met'))
  assert.ok(preferred.some((requirement) =>
    requirement.normalized === 'power bi' && requirement.status === 'met'))
  assert.ok(required.every((requirement) =>
    requirement.status !== 'met' || requirement.evidence.length > 0))
}

{
  const mixed = job('mixed-known-and-unknown', {
    description: 'SQL and COBOL are required.',
    tags: ['Data', 'SQL'],
  })
  const withoutCobol = extractRankingRequirements(mixed, profile, prefs)
  const withCobol = extractRankingRequirements(
    mixed,
    { ...profile, skills: [...profile.skills, { name: 'COBOL' }] },
    prefs,
  )
  assert.deepEqual(
    withoutCobol.map(({ normalized, priority, kind }) => ({ normalized, priority, kind })),
    withCobol.map(({ normalized, priority, kind }) => ({ normalized, priority, kind })),
    'posting requirement extraction must not change with the candidate profile',
  )
  const retained = withoutCobol.find((requirement) => requirement.normalized.includes('cobol'))
  assert.ok(retained, 'an unknown conjunct beside a known skill must remain visible')
  assert.notEqual(retained.status, 'met')
  assert.ok(evaluateJobV2(mixed, profile, prefs).snapshot.features.scores.requiredCoverage < 100)
  assert.equal(
    withCobol.find((requirement) => requirement.normalized.includes('cobol'))?.status,
    'met',
  )
}

{
  const hard = evaluateJobV2(job('no-sponsorship', {
    description: `${exact.description}\nNo visa sponsorship is available.`,
  }), profile, prefs)
  assert.equal(hard.excludedByKnownMismatch, true)
  assert.equal(
    hard.snapshot.features.eligibility.find((fact) => fact.key === 'work_authorization')?.status,
    'known_mismatch',
  )
  assert.ok(hard.snapshot.features.scores.final <= 10)

  const unknown = evaluateJobV2(exact, profile, prefs)
  assert.equal(unknown.excludedByKnownMismatch, false)
  assert.equal(
    unknown.snapshot.features.eligibility.find((fact) => fact.key === 'work_authorization')?.status,
    'unknown',
  )
}

{
  const belowLanguage: Profile = {
    ...profile,
    languages: [{ lang: 'German', level: 'B1' }, { lang: 'English', level: 'C1' }],
  }
  const mismatch = evaluateJobV2(exact, belowLanguage, prefs)
  assert.equal(
    mismatch.snapshot.features.eligibility.find((fact) => fact.key === 'language')?.status,
    'known_mismatch',
  )
  const unknownLanguage = evaluateJobV2(exact, { ...profile, languages: [] }, prefs)
  assert.equal(
    unknownLanguage.snapshot.features.eligibility.find((fact) => fact.key === 'language')?.status,
    'unknown',
  )
}

{
  const weak = evaluateJobV2(job('weak-role', {
    title: 'Marketing Analyst',
    location: { city: 'Berlin', country: 'Germany', remote: true },
    salary: { min: 120_000, max: 140_000, currency: 'EUR', period: 'year' },
    description: 'Campaign content, social media, and brand partnerships.',
    tags: [],
  }), profile, prefs)
  assert.ok(weak.snapshot.features.scores.coreFit < 50)
  assert.ok(weak.snapshot.features.scores.preferenceAdjustment <= 2)
  assert.ok(weak.snapshot.features.scores.final < 55, 'soft preferences cannot rescue weak core fit')
}

{
  const remotePrefs: Preferences = { ...prefs, remoteOnly: true, hybridOk: false }
  const unstated = evaluateJobV2(job('remote-unstated', {
    location: { city: 'Berlin', country: 'Germany', remote: false },
    description: `${exact.description}\nThe posting does not state a work arrangement.`,
  }), profile, remotePrefs)
  assert.equal(
    unstated.snapshot.features.eligibility.find((fact) => fact.key === 'location')?.status,
    'unknown',
    'a false normalized remote flag without explicit text is not a proven mismatch',
  )
  assert.equal(unstated.excludedByKnownMismatch, false)
  assert.equal(unstated.snapshot.features.preferenceSignals.location, 50)
  assert.equal(unstated.snapshot.features.preferenceSignals.workMode, 50)

  const onSite = evaluateJobV2(job('remote-explicit-onsite', {
    location: { city: 'Berlin', country: 'Germany', remote: false },
    description: `${exact.description}\nThis position must be performed fully on-site in Berlin.`,
  }), profile, remotePrefs)
  const locationFact = onSite.snapshot.features.eligibility.find((fact) => fact.key === 'location')
  assert.equal(locationFact?.status, 'known_mismatch')
  assert.match(locationFact?.sourceText ?? '', /on-site/i)
  assert.equal(onSite.excludedByKnownMismatch, true)
  assert.equal(onSite.snapshot.features.preferenceSignals.location, 0)
  assert.equal(onSite.snapshot.features.preferenceSignals.workMode, 0)
}

{
  const conservativePrefs: Preferences = {
    ...prefs,
    remoteOnly: true,
    hybridOk: false,
    dealbreakers: ['on-site'],
  }
  const unstatedAndNegated = job('integration-remote-unknown', {
    location: { city: 'Berlin', country: 'Germany', remote: false },
    description: `${exact.description}\nThis role is not on-site; the work arrangement is still to be confirmed.`,
  })
  const explicitOnSite = job('integration-explicit-onsite', {
    location: { city: 'Berlin', country: 'Germany', remote: false },
    description: `${exact.description}\nThis position is fully on-site in Berlin.`,
  })
  const negatedEvaluation = evaluateJobV2(unstatedAndNegated, profile, conservativePrefs)
  assert.equal(
    negatedEvaluation.snapshot.features.eligibility.find((fact) => fact.key === 'dealbreaker')?.status,
    'unknown',
    'a negated phrase is not affirmative dealbreaker evidence',
  )
  assert.equal(negatedEvaluation.excludedByKnownMismatch, false)

  const candidates = [explicitOnSite, unstatedAndNegated]
  const keywordIds = prefilter(candidates, profile, conservativePrefs, 10).map((entry) => entry.id)
  const semanticIds = (await semanticPrefilter(
    candidates,
    profile,
    conservativePrefs,
    10,
    defaultEmbedder,
  )).map((entry) => entry.id)
  const neuralIds = (await semanticPrefilterAsync(
    candidates,
    profile,
    conservativePrefs,
    10,
    syncToAsync(defaultEmbedder),
  )).map((entry) => entry.id)
  for (const [mode, ids] of [
    ['keyword', keywordIds],
    ['semantic', semanticIds],
    ['async semantic', neuralIds],
  ] as const) {
    assert.ok(ids.includes(unstatedAndNegated.id), `${mode} keeps unknown remote evidence`)
    assert.ok(!ids.includes(explicitOnSite.id), `${mode} removes explicit on-site mismatch`)
  }
}

{
  const trusted = evaluateJobV2(exact, profile, prefs)
  const stale = evaluateJobV2(job('stale', {
    description: 'SQL required.',
    posted_at: '2024-01-01T00:00:00.000Z',
    sourceConfidence: 'unknown',
  }), profile, prefs)
  assert.ok(trusted.snapshot.features.scores.postingConfidence >
    stale.snapshot.features.scores.postingConfidence)
  assert.ok(stale.snapshot.features.scores.postingPenalty > 0)
  assert.equal(
    stale.snapshot.features.scores.coreFit +
      stale.snapshot.features.scores.preferenceAdjustment -
      stale.snapshot.features.scores.postingPenalty,
    stale.snapshot.features.scores.final,
  )
}

{
  const sameA = job('tie-a', { company: 'Alpha GmbH' })
  const sameB = job('tie-b', { company: 'Beta GmbH' })
  const forward = rankCandidateSetV2([sameB, sameA], profile, prefs)
  const reverse = rankCandidateSetV2([sameA, sameB], profile, prefs)
  assert.deepEqual(
    forward.map((entry) => entry.job.id),
    reverse.map((entry) => entry.job.id),
    'tie-breaking is stable and independent of connector order',
  )
  assert.deepEqual(
    forward.map((entry) => entry.snapshot.rank),
    [1, 2],
  )
  assert.equal(forward[0].snapshot.candidateSetHash, forward[1].snapshot.candidateSetHash)
}

{
  const first = evaluateJobV2(exact, profile, prefs).snapshot
  const repeated = evaluateJobV2(structuredClone(exact), structuredClone(profile), structuredClone(prefs)).snapshot
  assert.equal(first.inputHash, repeated.inputHash)
  assert.equal(first.rankingVersion, RANKING_MODEL_VERSION)
  assert.equal(first.requirementVersion, REQUIREMENT_MODEL_VERSION)
  assert.equal(first.explanationVersion, RANKING_EXPLANATION_VERSION)
  assert.match(first.explanation.disclaimer, /not the probability of being hired/i)

  const changed = evaluateJobV2(
    { ...exact, description: `${exact.description}\n- Tableau is required.` },
    profile,
    prefs,
  ).snapshot
  assert.notEqual(first.inputHash, changed.inputHash)

  const withoutUrl = evaluateJobV2({ ...exact, url: '' }, profile, prefs).snapshot
  assert.notEqual(first.inputHash, withoutUrl.inputHash, 'every posting-completeness input is hashed')
  assert.equal(
    first.features.postingSignals.completeness - withoutUrl.features.postingSignals.completeness,
    10,
  )
  assert.notEqual(first.features.scores.postingConfidence, withoutUrl.features.scores.postingConfidence)
}

{
  const candidates = [
    job('integration-b', { company: 'Beta GmbH' }),
    job('integration-a', { company: 'Alpha GmbH' }),
  ]
  const matches = await runMatching(candidates, profile, prefs, undefined, {
    rerankMode: 'off',
    locale: 'en',
  })
  assert.deepEqual(matches.map((match) => match.ranking?.rank), [1, 2])
  assert.ok(matches[0].ranking?.candidateSetHash)
  assert.equal(
    matches[0].ranking?.candidateSetHash,
    matches[1].ranking?.candidateSetHash,
    'the visible run preserves one candidate-set snapshot',
  )

  const local = matches[0]
  const ai: MatchResult = {
    ...local,
    fitScore: 100,
    verdict: 'strong',
    rationale: 'Provider prose explanation.',
    redFlags: ['Provider warning'],
    modelVersion: 'cloud-test',
    ranking: undefined,
  }
  const merged = mergeAiExplanationWithLocal(local, ai)
  assert.equal(merged.rationale, 'Provider prose explanation.')
  assert.equal(merged.modelVersion, 'cloud-test')
  assert.equal(merged.fitScore, local.fitScore)
  assert.equal(merged.ranking?.inputHash, local.ranking?.inputHash)
  assert.ok(merged.redFlags.includes('Provider warning'))
}

{
  const legacy: MatchResult = {
    jobId: 'legacy',
    fitScore: 67,
    verdict: 'good',
    rationale: 'Old score.',
    matchedSkills: [],
    missingSkills: [],
    redFlags: [],
    scoredAt: '2025-01-01T00:00:00.000Z',
    modelVersion: 'local-v2.3',
  }
  const normalized = normalizeHistoricalRanking(legacy)
  assert.equal(normalized.historical, true)
  assert.equal(normalized.features.scores.final, 67)
  assert.match(normalized.rankingVersion, /^historical:/)
  assert.match(normalized.explanation.disclaimer, /not been reinterpreted/i)

  const current = buildLocalMatch(exact, profile, prefs, '2026-07-01T12:00:00.000Z')
  assert.ok(current.ranking)
  assert.equal(normalizeHistoricalRanking(current).historical, false)
  assert.equal(current.ranking?.features.scores.final, current.fitScore)
}

await db.close()
console.log('v26-ranking-v2.test.ts: all tests passed')

function job(id: string, patch: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    id,
    source: 'greenhouse',
    source_id: id,
    title: 'Data Analyst',
    company: 'Example Analytics GmbH',
    location: { city: 'Berlin', country: 'Germany', remote: false },
    description: 'SQL and Excel reporting.',
    url: `https://example.invalid/${id}`,
    posted_at: '2026-06-28T00:00:00.000Z',
    salary: { min: 62_000, max: 72_000, currency: 'EUR', period: 'year' },
    employment_type: 'full time',
    seniority: 'mid',
    language: 'en',
    tags: ['Data', 'SQL'],
    fetched_at: '2026-07-01T12:00:00.000Z',
    sourceConfidence: 'published',
    ...patch,
  }
}
