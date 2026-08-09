import { strict as assert } from 'node:assert'
import {
  hardConstraintViolationRate,
  meanReciprocalRank,
  ndcgAtK,
  pairwiseAgreement,
  reciprocalRank,
} from '../src/match/evalMetrics.ts'
import {
  evaluateSyntheticCorpus,
  syntheticGateFailures,
} from '../qa/ranking/evaluate.ts'
import {
  REVIEWER_PROTOCOL,
  validateReviewScenario,
  type ReviewScenario,
} from '../qa/ranking/reviewerProtocol.ts'
import { SYNTHETIC_RANKING_CORPUS } from '../qa/ranking/syntheticCorpus.ts'

assert.equal(ndcgAtK([3, 2, 1, 0], 4), 1)
assert.ok(ndcgAtK([0, 1, 2, 3], 4) < 1)
assert.equal(ndcgAtK([], 10), 0)
assert.equal(reciprocalRank([0, 1, 3], 2), 1 / 3)
assert.equal(meanReciprocalRank([[0, 2], [3, 0]], 2), 0.75)
assert.equal(pairwiseAgreement(
  new Map([['a', 10], ['b', 5], ['c', 1]]),
  [{ preferredId: 'a', otherId: 'b' }, { preferredId: 'b', otherId: 'c' }],
), 1)
assert.equal(hardConstraintViolationRate(
  [{ knownHardMismatch: false }, { knownHardMismatch: true }],
  2,
), 0.5)

assert.ok(REVIEWER_PROTOCOL.some((step) => /two human reviewers/i.test(step)))
assert.ok(REVIEWER_PROTOCOL.some((step) => /AI-proposed labels/i.test(step)))
assert.equal(SYNTHETIC_RANKING_CORPUS.length, 6)
assert.equal(SYNTHETIC_RANKING_CORPUS.every((scenario) => scenario.items.length >= 50), true)
assert.deepEqual(
  new Set(SYNTHETIC_RANKING_CORPUS.map((scenario) => scenario.review.language)),
  new Set(['en', 'de', 'mixed']),
)
assert.ok(new Set(SYNTHETIC_RANKING_CORPUS.map((scenario) => scenario.review.seniority)).size >= 3)
assert.equal(
  SYNTHETIC_RANKING_CORPUS.flatMap((scenario) => validateReviewScenario(scenario.review)).length,
  0,
)

const invalidHumanReview: ReviewScenario = {
  ...structuredClone(SYNTHETIC_RANKING_CORPUS[0].review),
  status: 'human_reviewed',
}
assert.ok(
  validateReviewScenario(invalidHumanReview).some((issue) =>
    /independent reviewer/.test(issue)),
)

const report = evaluateSyntheticCorpus()
const failures = syntheticGateFailures(report)
console.log(JSON.stringify(report, null, 2))
assert.equal(report.releaseEvidenceEligible, false)
assert.match(report.disclaimer, /never satisfy the human release gate/i)
assert.deepEqual(failures, [])
assert.equal(report.scenarioCount, 6)
assert.equal(report.candidateCount, 300)
assert.ok(report.aggregate.meanNdcg10 >= 0.9)
assert.ok(report.aggregate.mrr >= 0.9)
assert.ok(report.aggregate.meanPairwiseAgreement >= 0.8)
assert.ok(report.aggregate.hardConstraintViolationRate10 <= 0.02)
assert.equal(report.slices.every((slice) => slice.deterministic), true)

console.log('v26-ranking-eval.test.ts: all tests passed')
