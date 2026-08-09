import { strict as assert } from 'node:assert'
import {
  BASELINE_V255_COMMIT,
  BASELINE_V255_VERSION,
  rankCandidateSetV255,
  scoreJobV255,
} from '../qa/ranking/baselineV255.ts'
import {
  FROZEN_RANKING_GATES_6A,
  evaluateHumanRankingGate,
  rankingGateMetricInternals,
} from '../qa/ranking/humanGate.ts'
import {
  RANKING_ELIGIBILITY_KEYS,
  sha256Of,
  validateHumanReviewBundle,
  type AdjudicatedScenario,
  type HumanReviewBundle,
  type RankingHumanCorpus,
  type RankingReviewerSubmission,
} from '../qa/ranking/humanReview.ts'
import { SYNTHETIC_RANKING_CORPUS } from '../qa/ranking/syntheticCorpus.ts'

assert.equal(
  BASELINE_V255_COMMIT,
  'fd9589edf42a7086e6745a90d9dfa854231298aa',
)
assert.equal(BASELINE_V255_VERSION, 'v2.5.5-prefilter-frozen-1')
assert.deepEqual(FROZEN_RANKING_GATES_6A, {
  relativeNdcg10Improvement: 0.20,
  pairwiseAgreement: 0.80,
  knownHardConstraintViolationRateAt10: 0.02,
})

{
  const { profile, preferences } = SYNTHETIC_RANKING_CORPUS[0]
  const first = SYNTHETIC_RANKING_CORPUS[0].items[0].job
  const fixedNow = Date.parse('2026-07-01T12:00:00.000Z')
  assert.equal(scoreJobV255(first, profile, preferences, fixedNow), 93.45)
  const tiedA = { ...structuredClone(first), id: 'tie-a', source_id: 'tie-a' }
  const tiedB = { ...structuredClone(first), id: 'tie-b', source_id: 'tie-b' }
  assert.deepEqual(
    rankCandidateSetV255(
      [tiedB, tiedA],
      profile,
      preferences,
      '2026-07-01T12:00:00.000Z',
    ).map((row) => row.job.id),
    ['tie-b', 'tie-a'],
    'the archive preserves v2.5.5 stable input-order ties',
  )
}

{
  const { ndcgAtKAgainstUniverse, precisionFixedK, calibrationBands } =
    rankingGateMetricInternals
  assert.equal(ndcgAtKAgainstUniverse([3, 2, 0], [3, 2, 0], 3), 1)
  assert.ok(
    ndcgAtKAgainstUniverse([3], [3, 3], 2) < 1,
    'a filtered relevant job must remain in the ideal denominator',
  )
  assert.equal(precisionFixedK([3, 2], 5), 0.4)
  const bands = calibrationBands([
    { score: 20, label: 0 },
    { score: 80, label: 3 },
  ])
  assert.equal(bands.find((band) => band.band === '0-24')?.count, 1)
  assert.equal(bands.find((band) => band.band === '75-100')?.strongRate, 1)
}

const bundle = makeDevelopmentBundle()
assert.deepEqual(validateHumanReviewBundle(bundle, false), [])

{
  const development = evaluateHumanRankingGate(bundle, { releaseMode: false })
  assert.equal(development.evaluated, true)
  assert.equal(development.releaseEligible, false)
  assert.equal(development.passed, false)
  assert.equal(development.decision, 'HOLD')
  assert.ok(development.aggregate)
  assert.ok(development.aggregate!.baseline.ndcg5 >= 0)
  assert.ok(development.aggregate!.current.ndcg10 >= 0)
  assert.equal(development.aggregate!.current.calibrationBands.length, 4)
  assert.ok(development.slices.some((slice) => slice.dimension === 'language'))
  assert.ok(development.slices.some((slice) => slice.dimension === 'job_family'))
  assert.ok(development.slices.some((slice) =>
    slice.dimension === 'candidate_seniority'))
  assert.equal(development.determinism.length, 6)
}

{
  const releaseAttempt = evaluateHumanRankingGate(bundle)
  assert.equal(releaseAttempt.evaluated, false)
  assert.equal(releaseAttempt.releaseEligible, false)
  assert.equal(releaseAttempt.passed, false)
  assert.equal(releaseAttempt.decision, 'HOLD')
  assert.ok(releaseAttempt.validationIssues.some((issue) =>
    /refuses corpus evidenceKind=test_fixture/.test(issue)))
}

{
  const syntheticAttempt = structuredClone(bundle)
  syntheticAttempt.corpus.evidenceKind = 'synthetic_fixture'
  const report = evaluateHumanRankingGate(syntheticAttempt)
  assert.equal(report.evaluated, false)
  assert.equal(report.passed, false)
  assert.equal(report.decision, 'HOLD')
  assert.ok(report.validationIssues.some((issue) => /synthetic_fixture/.test(issue)))
}

{
  const unresolved = structuredClone(bundle)
  unresolved.reviewers[1].scenarios[0].jobs[0].relevanceLabel =
    unresolved.reviewers[1].scenarios[0].jobs[0].relevanceLabel === 3 ? 2 : 3
  const issues = validateHumanReviewBundle(unresolved, false)
  assert.ok(issues.some((issue) => /unresolved reviewer disagreement/.test(issue)))
}

{
  const incompleteConstraints = structuredClone(bundle)
  incompleteConstraints.reviewers[0].scenarios[0].jobs[0].constraints.pop()
  assert.ok(validateHumanReviewBundle(incompleteConstraints, false).some((issue) =>
    /constraints.*at least 8 item/.test(issue)))

  const incompleteFinal = structuredClone(bundle)
  incompleteFinal.adjudication.scenarios[0].jobs[0].finalRequirements = []
  assert.ok(validateHumanReviewBundle(incompleteFinal, false).some((issue) =>
    /finalRequirements.*at least 1 item/.test(issue)))

  const consensusOverride = structuredClone(bundle)
  consensusOverride.adjudication.scenarios[0].jobs[0].finalConstraints
    .find((constraint) => constraint.key === 'location')!.status = 'match'
  assert.ok(validateHumanReviewBundle(consensusOverride, false).some((issue) =>
    /final constraint location must preserve reviewer consensus/.test(issue)))

  const invalidRequirementEnums = structuredClone(bundle)
  for (const reviewer of invalidRequirementEnums.reviewers) {
    const requirement = reviewer.scenarios[0].jobs[0].requirements[0]
    requirement.priority = 'banana' as never
    requirement.judgment = 'banana' as never
  }
  const finalRequirement = invalidRequirementEnums.adjudication.scenarios[0]
    .jobs[0].finalRequirements[0]
  finalRequirement.priority = 'banana' as never
  finalRequirement.judgment = 'banana' as never
  const enumIssues = validateHumanReviewBundle(invalidRequirementEnums, false)
  assert.ok(enumIssues.some((issue) => /priority.*must be one of/.test(issue)))
  assert.ok(enumIssues.some((issue) => /judgment.*must be one of/.test(issue)))

  const inventedEvidence = structuredClone(bundle)
  const invented = inventedEvidence.reviewers[0].scenarios[0].jobs[0].requirements[0]
  invented.judgment = 'met'
  invented.candidateEvidencePaths = ['profile.does.not.exist']
  assert.ok(validateHumanReviewBundle(inventedEvidence, false).some((issue) =>
    /unresolved evidence path/.test(issue)))

  const inventedSource = structuredClone(bundle)
  inventedSource.corpus.scenarios[0].jobs[0].requirementInventory[0].sourceText =
    'This clause is not present in the posting.'
  inventedSource.corpus.scenarios[0].jobs[0].requirementInventorySha256 = sha256Of(
    inventedSource.corpus.scenarios[0].jobs[0].requirementInventory,
  )
  assert.ok(validateHumanReviewBundle(inventedSource, false).some((issue) =>
    /sourceText is not in the frozen posting/.test(issue)))

  const inventedConstraintSource = structuredClone(bundle)
  const constraint = inventedConstraintSource.reviewers[0].scenarios[0].jobs[0]
    .constraints.find((entry) => entry.key === 'work_authorization')!
  constraint.status = 'known_mismatch'
  constraint.sourceText = 'An invented posting clause.'
  inventedConstraintSource.reviewers[0].scenarios[0].jobs[0]
    .knownHardMismatch = true
  assert.ok(validateHumanReviewBundle(inventedConstraintSource, false).some((issue) =>
    /constraint work_authorization sourceText is not in the frozen posting/.test(issue)))
}

{
  const constraintConflict = structuredClone(bundle)
  const right = constraintConflict.reviewers[1].scenarios[0].jobs[0]
  const location = right.constraints.find((constraint) => constraint.key === 'location')!
  location.status = location.status === 'unknown' ? 'match' : 'unknown'
  const issues = validateHumanReviewBundle(constraintConflict, false)
  assert.ok(issues.some((issue) =>
    /hard_constraint:.*:location/.test(issue)),
  'per-key status conflicts require adjudication even when aggregate mismatch is unchanged')

  const evidenceConflict = structuredClone(bundle)
  evidenceConflict.reviewers[1].scenarios[0].jobs[0].constraints
    .find((constraint) => constraint.key === 'location')!.sourceText =
      'A different posting fragment.'
  assert.ok(validateHumanReviewBundle(evidenceConflict, false).some((issue) =>
    /hard_constraint:.*:location/.test(issue)),
  'constraint source evidence differences require adjudication')

  const requirementConflict = structuredClone(bundle)
  requirementConflict.reviewers[1].scenarios[0].jobs[0].requirements[0].priority = 'preferred'
  assert.ok(validateHumanReviewBundle(requirementConflict, false).some((issue) =>
    /requirement:.*:test-requirement-1/.test(issue)),
  'priority/evidence/judgment conflicts require per-requirement adjudication')
}

{
  const malformedComparator = structuredClone(bundle)
  malformedComparator.adjudication.aiComparator = {
    used: true,
    modelVersion: 'test-comparator',
    largeRankGap: 10,
    rankings: [{
      scenarioId: malformedComparator.corpus.scenarios[0].scenarioId,
      ranks: malformedComparator.corpus.scenarios[0].jobs.map((entry, index) => ({
        jobId: entry.job.id,
        rank: index + 101,
      })),
    }],
  }
  malformedComparator.adjudication.modelDisagreements = [{
    scenarioId: malformedComparator.corpus.scenarios[0].scenarioId,
    jobId: malformedComparator.corpus.scenarios[0].jobs[0].job.id,
    deterministicRank: 1,
    comparatorRank: 101,
    category: 'genuine_ambiguity',
    resolution: 'Malformed category regression fixture.',
  }]
  const issues = validateHumanReviewBundle(malformedComparator, false)
  assert.ok(issues.some((issue) => /exact 1\.\.N permutation/.test(issue)))
  assert.ok(issues.some((issue) => /missing scenario/.test(issue)))

  const invalidCategory = structuredClone(bundle)
  invalidCategory.adjudication.modelDisagreements = [{
    scenarioId: invalidCategory.corpus.scenarios[0].scenarioId,
    jobId: invalidCategory.corpus.scenarios[0].jobs[0].job.id,
    deterministicRank: 1,
    comparatorRank: 2,
    category: 'banana' as never,
    resolution: 'Invalid category regression fixture.',
  }]
  assert.ok(validateHumanReviewBundle(invalidCategory, false).some((issue) =>
    /category.*must be one of/.test(issue)))

  const extraTopology = structuredClone(bundle)
  const extraScenario = structuredClone(extraTopology.reviewers[0].scenarios[0])
  extraScenario.scenarioId = 'unexpected-scenario'
  extraTopology.reviewers[0].scenarios.push(extraScenario)
  assert.ok(validateHumanReviewBundle(extraTopology, false).some((issue) =>
    /unexpected scenario/.test(issue)))
}

{
  const missingIndependence = structuredClone(bundle) as unknown as Record<string, unknown>
  delete ((missingIndependence.reviewers as RankingReviewerSubmission[])[0] as Partial<
    RankingReviewerSubmission
  >).independence
  assert.ok(validateHumanReviewBundle(missingIndependence, false).some((issue) =>
    /independence.*is required/.test(issue)))
  assert.doesNotThrow(() => evaluateHumanRankingGate(missingIndependence, {
    releaseMode: false,
  }))
  const malformedReport = evaluateHumanRankingGate(missingIndependence, {
    releaseMode: false,
  })
  assert.equal(malformedReport.evaluated, false)
  assert.equal(malformedReport.decision, 'HOLD')

  for (const malformed of [null, {}, { reviewers: [] }]) {
    assert.doesNotThrow(() => evaluateHumanRankingGate(malformed, {
      releaseMode: false,
    }))
    const report = evaluateHumanRankingGate(malformed, { releaseMode: false })
    assert.equal(report.evaluated, false)
    assert.equal(report.passed, false)
    assert.equal(report.decision, 'HOLD')
    assert.ok(report.validationIssues.length > 0)
  }
}

// --- the anti-fabrication guards must have teeth -------------------------
{
  // A second reviewer file that is a copy of the first, renamed, is the
  // cheapest way to fake unanimous agreement. It must be refused.
  const copied = structuredClone(bundle)
  copied.reviewers[1] = {
    ...structuredClone(copied.reviewers[0]),
    reviewerId: copied.reviewers[1].reviewerId,
    completedAt: copied.reviewers[1].completedAt,
  }
  assert.ok(
    validateHumanReviewBundle(copied, false).some((issue) =>
      issue.includes('identical apart from their id')),
    'a copied reviewer file is rejected',
  )

  // Preferences drive both rankers, so editing them after the freeze must
  // break the corpus hash rather than silently move the improvement gate.
  const tampered = structuredClone(bundle)
  tampered.corpus.scenarios[0].preferences = {
    ...tampered.corpus.scenarios[0].preferences,
    remoteOnly: !tampered.corpus.scenarios[0].preferences.remoteOnly,
  }
  assert.ok(
    validateHumanReviewBundle(tampered, false).some((issue) =>
      issue.includes('preferencesSha256')),
    'edited preferences break the frozen corpus hash',
  )
}

console.log('v26-ranking-human-gate.test.ts: all tests passed')

function makeDevelopmentBundle(): HumanReviewBundle {
  const asOf = '2026-07-01T12:00:00.000Z'
  const corpus: RankingHumanCorpus = {
    schemaVersion: 1,
    corpusId: 'test-only-synthetic-ranking-bundle',
    evidenceKind: 'test_fixture',
    split: 'final_held_out',
    heldOutFromTrainingAndCalibration: true,
    containsPersonalData: false,
    frozenAt: asOf,
    asOf,
    baselineCommit: BASELINE_V255_COMMIT,
    baselineVersion: BASELINE_V255_VERSION,
    rankingVersion: 'ranking-v2.6.0',
    requirementVersion: 'requirements-v2.6.0',
    scenarios: SYNTHETIC_RANKING_CORPUS.map((scenario) => ({
      scenarioId: scenario.id,
      language: scenario.review.language,
      jobFamily: scenario.review.jobFamily,
      candidateSeniority: scenario.review.seniority,
      candidateProfileVersion: 'test-only-synthetic-profile-v1',
      candidateProfileSha256: sha256Of(scenario.profile),
      preferencesSha256: sha256Of(scenario.preferences),
      profile: scenario.profile,
      preferences: scenario.preferences,
      jobs: scenario.items.map((item) => {
        const requirementInventory = [{
          requirementId: 'test-requirement-1',
          text: 'Synthetic fixture requirement',
          sourceText: item.job.description.slice(0, 240) || item.job.title,
        }]
        return {
          snapshotId: `test-only:${item.job.id}`,
          snapshotSha256: sha256Of(item.job),
          requirementInventorySha256: sha256Of(requirementInventory),
          sourceConfidence: item.job.sourceConfidence ?? 'unknown',
          extractionConfidence: 'high' as const,
          job: item.job,
          requirementInventory,
        }
      }),
      pairs: scenario.review.pairs.map((pair, index) => ({
        pairId: `${scenario.id}-pair-${index + 1}`,
        leftJobId: pair.preferredId,
        rightJobId: pair.otherId,
        selectionReason: 'Test-only deterministic pair; never release evidence.',
      })),
    })),
  }
  const reviewerA = reviewerFromCorpus(corpus, 'test-reviewer-a')
  const reviewerB = reviewerFromCorpus(corpus, 'test-reviewer-b', ' Reviewed independently.')
  const adjudicationScenarios: AdjudicatedScenario[] = corpus.scenarios.map(
    (scenario) => ({
      scenarioId: scenario.scenarioId,
      jobs: reviewerA.scenarios
        .find((entry) => entry.scenarioId === scenario.scenarioId)!
        .jobs.map((job) => ({
          jobId: job.jobId,
          finalRelevanceLabel: job.relevanceLabel,
          knownHardMismatch: job.knownHardMismatch,
          severeSeniorityMismatch: job.severeSeniorityMismatch,
          finalConstraints: structuredClone(job.constraints),
          finalRequirements: structuredClone(job.requirements),
          rationale: 'Test-only adjudication copied from the synthetic fixture.',
        })),
      pairs: reviewerA.scenarios
        .find((entry) => entry.scenarioId === scenario.scenarioId)!
        .pairs.map((pair) => ({
          pairId: pair.pairId,
          preference: pair.preference,
          rationale: 'Test-only adjudicated preference.',
        })),
    }),
  )
  return {
    corpus,
    reviewers: [reviewerA, reviewerB],
    adjudication: {
      schemaVersion: 1,
      evidenceKind: 'test_fixture',
      corpusId: corpus.corpusId,
      adjudicatorId: 'test-adjudicator',
      adjudicatorIsHuman: false,
      completedAt: asOf,
      reviewerIds: [reviewerA.reviewerId, reviewerB.reviewerId],
      scenarios: adjudicationScenarios,
      reviewerDisagreements: [],
      aiComparator: { used: false, largeRankGap: 10, rankings: [] },
      modelDisagreements: [],
      notes: ['Synthetic test fixture only. It is never release evidence.'],
    },
  }
}

// Two genuinely independent reviewers never file byte-identical judgments, and
// the validator now rejects a submission that is a copy of the other. The
// second reviewer therefore differs on one rationale, which is enough to prove
// separate review without changing any label the metrics depend on.
function reviewerFromCorpus(
  corpus: RankingHumanCorpus,
  reviewerId: string,
  rationaleSuffix = '',
): RankingReviewerSubmission {
  return {
    schemaVersion: 1,
    evidenceKind: 'test_fixture',
    corpusId: corpus.corpusId,
    reviewerId,
    isHuman: false,
    completedAt: corpus.asOf,
    languageCompetence: { en: 'professional', de: 'professional' },
    independence: {
      blindToModelScoresAndOrder: true,
      blindToOtherReviewer: true,
      noAiGeneratedFinalLabels: true,
      conflictOfInterestDeclared: true,
    },
    scenarios: corpus.scenarios.map((scenario) => {
      const source = SYNTHETIC_RANKING_CORPUS.find((entry) =>
        entry.id === scenario.scenarioId)!
      const labelById = new Map(source.items.map((item) => [item.job.id, item]))
      return {
        scenarioId: scenario.scenarioId,
        jobs: scenario.jobs.map((entry) => {
          const item = labelById.get(entry.job.id)!
          const status = item.knownHardMismatch ? 'known_mismatch' : 'unknown'
          return {
            jobId: entry.job.id,
            relevanceLabel: item.label,
            knownHardMismatch: item.knownHardMismatch,
            severeSeniorityMismatch: false,
            constraints: RANKING_ELIGIBILITY_KEYS.map((key) => ({
              key,
              status: key === 'work_authorization' ? status : 'unknown',
              sourceText: key === 'work_authorization' && item.knownHardMismatch
                ? 'No visa sponsorship is available.'
                : '',
              rationale: `Test-only ${key} constraint copied from the synthetic generator.`,
            })),
            requirements: entry.requirementInventory.map((requirement) => ({
              requirementId: requirement.requirementId,
              text: requirement.text,
              priority: 'required',
              candidateEvidencePaths: [],
              judgment: 'unknown',
              rationale: 'Test-only requirement judgment.',
            })),
            rationale: `Test-only label copied from the synthetic generator.${rationaleSuffix}`,
          }
        }),
        pairs: scenario.pairs.map((pair) => ({
          pairId: pair.pairId,
          preference: pair.leftJobId,
          rationale: 'Test-only preference copied from the synthetic generator.',
        })),
      }
    }),
  }
}