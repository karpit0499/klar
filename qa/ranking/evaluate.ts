import {
  hardConstraintViolationRate,
  meanReciprocalRank,
  ndcgAtK,
  pairwiseAgreement,
} from '../../src/match/evalMetrics.ts'
import { RANKING_MODEL_VERSION, rankCandidateSetV2 } from '../../src/match/rankingV2.ts'
import {
  SYNTHETIC_RANKING_CORPUS,
  type SyntheticRankingScenario,
} from './syntheticCorpus.ts'
import { validateReviewScenario } from './reviewerProtocol.ts'

export type RankingScenarioMetrics = {
  scenarioId: string
  jobFamily: string
  language: string
  candidateCount: number
  ndcg10: number
  reciprocalRank: number
  pairwiseAgreement: number
  hardConstraintViolationRate10: number
  deterministic: boolean
}

export type RankingEvaluationReport = {
  schemaVersion: 1
  rankingVersion: string
  corpusKind: 'synthetic_fixture'
  releaseEvidenceEligible: false
  disclaimer: string
  scenarioCount: number
  candidateCount: number
  aggregate: {
    meanNdcg10: number
    mrr: number
    meanPairwiseAgreement: number
    hardConstraintViolationRate10: number
  }
  slices: RankingScenarioMetrics[]
  validationIssues: string[]
}

export function evaluateSyntheticScenario(
  scenario: SyntheticRankingScenario,
): RankingScenarioMetrics {
  const options = {
    asOf: '2026-07-01T12:00:00.000Z',
    includeKnownMismatches: true,
  } as const
  const first = rankCandidateSetV2(
    scenario.items.map((item) => item.job),
    scenario.profile,
    scenario.preferences,
    options,
  )
  const second = rankCandidateSetV2(
    [...scenario.items].reverse().map((item) => item.job),
    scenario.profile,
    scenario.preferences,
    options,
  )
  const labelById = new Map(scenario.items.map((item) => [item.job.id, item.label]))
  const mismatchById = new Map(
    scenario.items.map((item) => [item.job.id, item.knownHardMismatch]),
  )
  const labels = first.map((entry) => labelById.get(entry.job.id) ?? 0)
  // Agreement measures the complete deterministic order, including documented
  // tie-breaks, rather than treating equal rounded display scores as no order.
  const scoreById = new Map(
    first.map((entry, index) => [entry.job.id, first.length - index]),
  )
  const order = first.map((entry) => entry.job.id)
  const reverseInputOrder = second.map((entry) => entry.job.id)
  const pairs = scenario.review.pairs.map((pair) => ({
    preferredId: pair.preferredId,
    otherId: pair.otherId,
  }))
  return {
    scenarioId: scenario.id,
    jobFamily: scenario.review.jobFamily,
    language: scenario.review.language,
    candidateCount: first.length,
    ndcg10: ndcgAtK(labels, 10),
    reciprocalRank: labels.findIndex((label) => label >= 2) < 0
      ? 0
      : 1 / (labels.findIndex((label) => label >= 2) + 1),
    pairwiseAgreement: pairwiseAgreement(scoreById, pairs),
    hardConstraintViolationRate10: hardConstraintViolationRate(
      first.map((entry) => ({
        knownHardMismatch: mismatchById.get(entry.job.id) ?? false,
      })),
      10,
    ),
    deterministic:
      JSON.stringify(order) === JSON.stringify(reverseInputOrder) &&
      first.every((entry, index) =>
        entry.snapshot.inputHash === second[index]?.snapshot.inputHash),
  }
}

export function evaluateSyntheticCorpus(): RankingEvaluationReport {
  const slices = SYNTHETIC_RANKING_CORPUS.map(evaluateSyntheticScenario)
  const validationIssues = SYNTHETIC_RANKING_CORPUS.flatMap((scenario) =>
    validateReviewScenario(scenario.review).map((issue) => `${scenario.id}: ${issue}`))
  const candidateCount = slices.reduce((sum, slice) => sum + slice.candidateCount, 0)
  const totalTopRows = slices.reduce(
    (sum, slice) => sum + Math.min(10, slice.candidateCount),
    0,
  )
  const weightedViolations = slices.reduce(
    (sum, slice) =>
      sum + slice.hardConstraintViolationRate10 * Math.min(10, slice.candidateCount),
    0,
  )
  return {
    schemaVersion: 1,
    rankingVersion: RANKING_MODEL_VERSION,
    corpusKind: 'synthetic_fixture',
    releaseEvidenceEligible: false,
    disclaimer:
      'Synthetic diagnostics are test fixtures only and can never satisfy the human release gate.',
    scenarioCount: slices.length,
    candidateCount,
    aggregate: {
      meanNdcg10: average(slices.map((slice) => slice.ndcg10)),
      mrr: meanReciprocalRank(
        SYNTHETIC_RANKING_CORPUS.map((scenario) => {
          const ranked = rankCandidateSetV2(
            scenario.items.map((item) => item.job),
            scenario.profile,
            scenario.preferences,
            {
              asOf: '2026-07-01T12:00:00.000Z',
              includeKnownMismatches: true,
            },
          )
          const labelById = new Map(scenario.items.map((item) => [item.job.id, item.label]))
          return ranked.map((entry) => labelById.get(entry.job.id) ?? 0)
        }),
      ),
      meanPairwiseAgreement: average(slices.map((slice) => slice.pairwiseAgreement)),
      hardConstraintViolationRate10: totalTopRows ? weightedViolations / totalTopRows : 0,
    },
    slices,
    validationIssues,
  }
}

export function syntheticGateFailures(report: RankingEvaluationReport): string[] {
  const failures = [...report.validationIssues]
  for (const slice of report.slices) {
    if (slice.candidateCount < 50) {
      failures.push(`${slice.scenarioId}: requires at least 50 candidates`)
    }
    if (slice.ndcg10 < 0.9) {
      failures.push(`${slice.scenarioId}: NDCG@10 ${slice.ndcg10.toFixed(3)} < 0.900`)
    }
    if (slice.pairwiseAgreement < 0.8) {
      failures.push(
        `${slice.scenarioId}: pairwise agreement ${slice.pairwiseAgreement.toFixed(3)} < 0.800`,
      )
    }
    if (slice.hardConstraintViolationRate10 > 0.02) {
      failures.push(
        `${slice.scenarioId}: hard-constraint rate ${slice.hardConstraintViolationRate10.toFixed(3)} > 0.020`,
      )
    }
    if (!slice.deterministic) failures.push(`${slice.scenarioId}: ranking is not deterministic`)
  }
  return failures
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}
