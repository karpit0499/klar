import { dcgAtK } from '../../src/match/evalMetrics.ts'
import {
  RANKING_MODEL_VERSION,
  REQUIREMENT_MODEL_VERSION,
  rankCandidateSetV2,
} from '../../src/match/rankingV2.ts'
import type { NormalizedJob } from '../../src/types.ts'
import {
  BASELINE_V255_COMMIT,
  BASELINE_V255_VERSION,
  rankCandidateSetV255,
} from './baselineV255.ts'
import {
  sha256Of,
  validateHumanReviewBundle,
  type AdjudicatedScenario,
  type DisagreementCategory,
  type HumanRelevanceLabel,
  type HumanReviewBundle,
  type RankingCorpusScenario,
} from './humanReview.ts'

export const FROZEN_RANKING_GATES_6A = {
  relativeNdcg10Improvement: 0.20,
  pairwiseAgreement: 0.80,
  knownHardConstraintViolationRateAt10: 0.02,
} as const

const RELEVANCE_THRESHOLD = 2
const EPSILON = 1e-12

export type CalibrationBand = {
  band: '0-24' | '25-49' | '50-74' | '75-100'
  count: number
  meanScore: number
  meanLabel: number
  relevantRate: number
  strongRate: number
}

export type RankingSystemMetrics = {
  scenarioCount: number
  rankedCandidateCount: number
  ndcg5: number
  ndcg10: number
  precision5: number
  precision10: number
  mrr: number
  pairwiseAgreement: number
  decisivePairCount: number
  knownHardConstraintViolationRate10: number
  knownHardConstraintTop10Count: number
  inspectedTop10Count: number
  severeSeniorityMismatchRate10: number
  severeSeniorityMismatchTop10Count: number
  calibrationBands: CalibrationBand[]
}

export type RankingComparisonMetrics = {
  baseline: RankingSystemMetrics
  current: RankingSystemMetrics
  relativeNdcg10Improvement: number | null
}

export type RankingSliceReport = RankingComparisonMetrics & {
  dimension: 'language' | 'job_family' | 'candidate_seniority'
  value: string
  scenarioIds: string[]
  failures: string[]
}

export type RankingDeterminismReport = {
  scenarioId: string
  identicalInput: boolean
  inputOrderInvariant: boolean
  inputHashesStable: boolean
}

export type GateCheck = {
  id: string
  threshold: string
  value: number | boolean | null
  passed: boolean
  evidence: string
}

export type HumanRankingGateReport = {
  schemaVersion: 1
  evaluated: boolean
  releaseEligible: boolean
  passed: boolean
  decision: 'PASS' | 'HOLD'
  corpusId: string
  evidenceKind: string
  evaluatedAt: string
  bundleSha256: string
  baseline: {
    version: string
    commit: string
  }
  current: {
    rankingVersion: string
    requirementVersion: string
  }
  frozenGates: typeof FROZEN_RANKING_GATES_6A
  validationIssues: string[]
  gates: GateCheck[]
  aggregate?: RankingComparisonMetrics
  slices: RankingSliceReport[]
  determinism: RankingDeterminismReport[]
  disagreementCategories: Record<DisagreementCategory, number>
  reviewerDisagreementCount: number
  modelDisagreementCount: number
  note: string
}

type RankedRow = {
  jobId: string
  rank: number
  score: number
}

type ScenarioRun = {
  scenario: RankingCorpusScenario
  adjudication: AdjudicatedScenario
  baseline: RankedRow[]
  current: RankedRow[]
  determinism: RankingDeterminismReport
}

export function evaluateHumanRankingGate(
  input: unknown,
  options: { releaseMode?: boolean } = {},
): HumanRankingGateReport {
  const releaseMode = options.releaseMode ?? true
  const validationIssues = validateHumanReviewBundle(input, releaseMode)
  if (!validationIssues.length) {
    const candidate = input as HumanReviewBundle
    if (candidate.corpus.rankingVersion !== RANKING_MODEL_VERSION) {
      validationIssues.push(
        `corpus rankingVersion must be ${RANKING_MODEL_VERSION}`,
      )
    }
    if (candidate.corpus.requirementVersion !== REQUIREMENT_MODEL_VERSION) {
      validationIssues.push(
        `corpus requirementVersion must be ${REQUIREMENT_MODEL_VERSION}`,
      )
    }
  }
  const base = reportShell(input)
  if (validationIssues.length) {
    return {
      ...base,
      evaluated: false,
      releaseEligible: false,
      passed: false,
      decision: 'HOLD',
      validationIssues,
      gates: [],
      slices: [],
      determinism: [],
      note:
        'No ranking claim was computed because the evidence bundle is incomplete or ineligible.',
    }
  }
  const bundle = input as HumanReviewBundle

  const adjudicationByScenario = new Map(
    bundle.adjudication.scenarios.map((scenario) => [scenario.scenarioId, scenario]),
  )
  const runs = bundle.corpus.scenarios.map((scenario) =>
    runScenario(
      scenario,
      adjudicationByScenario.get(scenario.scenarioId)!,
      bundle.corpus.asOf,
    ))
  const comparatorIssues = validateModelDisagreementCoverage(bundle, runs)
  validationIssues.push(...comparatorIssues)
  const aggregate = compareRuns(runs)
  const slices = buildSlices(runs)
  const determinism = runs.map((run) => run.determinism)
  const sliceFailures = slices.flatMap((slice) =>
    slice.failures.map((failure) =>
      `${slice.dimension}=${slice.value}: ${failure}`))
  const gates = buildGateChecks(aggregate, determinism, sliceFailures)
  const releaseEligible =
    releaseMode &&
    bundle.corpus.evidenceKind === 'human_release' &&
    bundle.reviewers.every((reviewer) =>
      reviewer.evidenceKind === 'human_release' && reviewer.isHuman) &&
    bundle.adjudication.evidenceKind === 'human_release' &&
    bundle.adjudication.adjudicatorIsHuman
  const disagreementCategories = categoryCounts(bundle)
  const allGatePass = gates.every((gate) => gate.passed)
  const passed =
    releaseEligible &&
    validationIssues.length === 0 &&
    allGatePass &&
    sliceFailures.length === 0
  return {
    ...base,
    evaluated: true,
    releaseEligible,
    passed,
    decision: passed ? 'PASS' : 'HOLD',
    validationIssues,
    gates,
    aggregate,
    slices,
    determinism,
    disagreementCategories,
    reviewerDisagreementCount: bundle.adjudication.reviewerDisagreements.length,
    modelDisagreementCount: bundle.adjudication.modelDisagreements.length,
    note: releaseEligible
      ? 'Human release evidence was evaluated against frozen decision 6A.'
      : 'Development-only result. Synthetic and test fixtures can never satisfy the release gate.',
  }
}

function reportShell(input: unknown): Omit<
  HumanRankingGateReport,
  | 'evaluated'
  | 'releaseEligible'
  | 'passed'
  | 'decision'
  | 'validationIssues'
  | 'gates'
  | 'slices'
  | 'determinism'
  | 'note'
> {
  const root = isRecord(input) ? input : {}
  const corpus = isRecord(root.corpus) ? root.corpus : {}
  return {
    schemaVersion: 1,
    corpusId: stringOr(corpus.corpusId, '<invalid>'),
    evidenceKind: stringOr(corpus.evidenceKind, '<invalid>'),
    evaluatedAt: stringOr(corpus.asOf, '<invalid>'),
    bundleSha256: sha256Of(input),
    baseline: {
      version: BASELINE_V255_VERSION,
      commit: BASELINE_V255_COMMIT,
    },
    current: {
      rankingVersion: RANKING_MODEL_VERSION,
      requirementVersion: REQUIREMENT_MODEL_VERSION,
    },
    frozenGates: FROZEN_RANKING_GATES_6A,
    disagreementCategories: {
      label_error: 0,
      extraction_error: 0,
      feature_error: 0,
      calibration_error: 0,
      genuine_ambiguity: 0,
    },
    reviewerDisagreementCount: 0,
    modelDisagreementCount: 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length ? value : fallback
}

function runScenario(
  scenario: RankingCorpusScenario,
  adjudication: AdjudicatedScenario,
  asOf: string,
): ScenarioRun {
  const jobs = scenario.jobs.map((entry) => entry.job)
  const baseline = rankCandidateSetV255(
    jobs,
    scenario.profile,
    scenario.preferences,
    asOf,
  ).map((entry, index) => ({
    jobId: entry.job.id,
    rank: index + 1,
    score: entry.score,
  }))
  const currentFirst = rankCandidateSetV2(
    jobs,
    scenario.profile,
    scenario.preferences,
    { asOf },
  )
  const currentSecond = rankCandidateSetV2(
    structuredClone(jobs),
    structuredClone(scenario.profile),
    structuredClone(scenario.preferences),
    { asOf },
  )
  const currentReordered = rankCandidateSetV2(
    [...jobs].reverse(),
    scenario.profile,
    scenario.preferences,
    { asOf },
  )
  const current = currentFirst.map((entry, index) => ({
    jobId: entry.job.id,
    rank: index + 1,
    score: entry.snapshot.features.scores.final,
  }))
  const order = currentFirst.map((entry) => entry.job.id)
  const repeatedOrder = currentSecond.map((entry) => entry.job.id)
  const reorderedOrder = currentReordered.map((entry) => entry.job.id)
  return {
    scenario,
    adjudication,
    baseline,
    current,
    determinism: {
      scenarioId: scenario.scenarioId,
      identicalInput: equalStringArrays(order, repeatedOrder),
      inputOrderInvariant: equalStringArrays(order, reorderedOrder),
      inputHashesStable:
        currentFirst.length === currentSecond.length &&
        currentFirst.every((entry, index) =>
          entry.snapshot.inputHash === currentSecond[index]?.snapshot.inputHash &&
          entry.snapshot.candidateSetHash === currentSecond[index]?.snapshot.candidateSetHash),
    },
  }
}

function compareRuns(runs: ScenarioRun[]): RankingComparisonMetrics {
  const baseline = systemMetrics(runs, 'baseline')
  const current = systemMetrics(runs, 'current')
  return {
    baseline,
    current,
    relativeNdcg10Improvement:
      baseline.ndcg10 > 0
        ? (current.ndcg10 - baseline.ndcg10) / baseline.ndcg10
        : null,
  }
}

function systemMetrics(
  runs: ScenarioRun[],
  system: 'baseline' | 'current',
): RankingSystemMetrics {
  const ndcg5: number[] = []
  const ndcg10: number[] = []
  const precision5: number[] = []
  const precision10: number[] = []
  const reciprocalRanks: number[] = []
  const calibration: { score: number; label: HumanRelevanceLabel }[] = []
  let pairAgreements = 0
  let decisivePairs = 0
  let hardViolations = 0
  let severeMismatches = 0
  let inspectedTop10 = 0
  let rankedCandidateCount = 0

  for (const run of runs) {
    const rows = run[system]
    rankedCandidateCount += rows.length
    const labels = labelMap(run.adjudication)
    const allLabels = run.scenario.jobs.map((entry) =>
      labels.get(entry.job.id)?.finalRelevanceLabel ?? 0)
    const rankedLabels = rows.map((row) =>
      labels.get(row.jobId)?.finalRelevanceLabel ?? 0)
    ndcg5.push(ndcgAtKAgainstUniverse(rankedLabels, allLabels, 5))
    ndcg10.push(ndcgAtKAgainstUniverse(rankedLabels, allLabels, 10))
    precision5.push(precisionFixedK(rankedLabels, 5))
    precision10.push(precisionFixedK(rankedLabels, 10))
    reciprocalRanks.push(reciprocalRank(rankedLabels))
    for (const row of rows) {
      calibration.push({
        score: row.score,
        label: labels.get(row.jobId)?.finalRelevanceLabel ?? 0,
      })
    }
    const top = rows.slice(0, 10)
    inspectedTop10 += top.length
    hardViolations += top.filter((row) =>
      labels.get(row.jobId)?.knownHardMismatch).length
    severeMismatches += top.filter((row) =>
      labels.get(row.jobId)?.severeSeniorityMismatch).length

    const rankById = new Map(rows.map((row) => [row.jobId, row.rank]))
    for (const pair of run.adjudication.pairs) {
      if (pair.preference === 'tie' || pair.preference === 'cannot_judge') continue
      const sourcePair = run.scenario.pairs.find((entry) => entry.pairId === pair.pairId)
      if (!sourcePair) continue
      decisivePairs += 1
      const preferredRank = rankById.get(pair.preference)
      const otherId =
        pair.preference === sourcePair.leftJobId
          ? sourcePair.rightJobId
          : sourcePair.leftJobId
      const otherRank = rankById.get(otherId)
      if (
        preferredRank != null &&
        (otherRank == null || preferredRank < otherRank)
      ) pairAgreements += 1
    }
  }
  return {
    scenarioCount: runs.length,
    rankedCandidateCount,
    ndcg5: average(ndcg5),
    ndcg10: average(ndcg10),
    precision5: average(precision5),
    precision10: average(precision10),
    mrr: average(reciprocalRanks),
    pairwiseAgreement: decisivePairs ? pairAgreements / decisivePairs : 0,
    decisivePairCount: decisivePairs,
    knownHardConstraintViolationRate10:
      inspectedTop10 ? hardViolations / inspectedTop10 : 0,
    knownHardConstraintTop10Count: hardViolations,
    inspectedTop10Count: inspectedTop10,
    severeSeniorityMismatchRate10:
      inspectedTop10 ? severeMismatches / inspectedTop10 : 0,
    severeSeniorityMismatchTop10Count: severeMismatches,
    calibrationBands: calibrationBands(calibration),
  }
}

function buildSlices(runs: ScenarioRun[]): RankingSliceReport[] {
  const dimensions: {
    dimension: RankingSliceReport['dimension']
    value: (run: ScenarioRun) => string
  }[] = [
    { dimension: 'language', value: (run) => run.scenario.language },
    { dimension: 'job_family', value: (run) => run.scenario.jobFamily },
    {
      dimension: 'candidate_seniority',
      value: (run) => run.scenario.candidateSeniority,
    },
  ]
  const slices: RankingSliceReport[] = []
  for (const definition of dimensions) {
    const groups = new Map<string, ScenarioRun[]>()
    for (const run of runs) {
      const value = definition.value(run)
      groups.set(value, [...(groups.get(value) ?? []), run])
    }
    for (const [value, grouped] of [...groups].sort(([left], [right]) =>
      left.localeCompare(right))) {
      const comparison = compareRuns(grouped)
      slices.push({
        dimension: definition.dimension,
        value,
        scenarioIds: grouped.map((run) => run.scenario.scenarioId),
        ...comparison,
        failures: sliceFailures(comparison, grouped),
      })
    }
  }
  return slices
}

function sliceFailures(
  comparison: RankingComparisonMetrics,
  runs: ScenarioRun[],
): string[] {
  const failures: string[] = []
  const { baseline, current } = comparison
  if (current.ndcg10 + EPSILON < baseline.ndcg10) {
    failures.push('NDCG@10 regressed below the frozen v2.5.5 baseline')
  }
  if (current.precision5 + EPSILON < baseline.precision5) {
    failures.push('precision@5 regressed below the frozen v2.5.5 baseline')
  }
  if (current.precision10 + EPSILON < baseline.precision10) {
    failures.push('precision@10 regressed below the frozen v2.5.5 baseline')
  }
  if (
    current.decisivePairCount < 1 ||
    current.pairwiseAgreement + EPSILON < FROZEN_RANKING_GATES_6A.pairwiseAgreement
  ) failures.push('pairwise agreement is below 80% or has no decisive pair')
  if (
    current.knownHardConstraintViolationRate10 - EPSILON >
    FROZEN_RANKING_GATES_6A.knownHardConstraintViolationRateAt10
  ) failures.push('known hard-constraint violation rate exceeds 2%')
  if (
    current.severeSeniorityMismatchRate10 - EPSILON >
    baseline.severeSeniorityMismatchRate10
  ) failures.push('severe seniority mismatch rate regressed')
  if (runs.some((run) =>
    !run.determinism.identicalInput ||
    !run.determinism.inputHashesStable ||
    !run.determinism.inputOrderInvariant)
  ) failures.push('determinism or input-order robustness failed')
  return failures
}

function buildGateChecks(
  comparison: RankingComparisonMetrics,
  determinism: RankingDeterminismReport[],
  sliceFailures: string[],
): GateCheck[] {
  const relative = comparison.relativeNdcg10Improvement
  const current = comparison.current
  const baseline = comparison.baseline
  return [
    {
      id: 'relative_ndcg10_improvement',
      threshold: '>= 20% relative to frozen v2.5.5',
      value: relative,
      passed:
        relative != null &&
        relative + EPSILON >= FROZEN_RANKING_GATES_6A.relativeNdcg10Improvement,
      evidence: `current=${current.ndcg10.toFixed(6)}, baseline=${baseline.ndcg10.toFixed(6)}`,
    },
    {
      id: 'human_pairwise_agreement',
      threshold: '>= 80%',
      value: current.pairwiseAgreement,
      passed:
        current.decisivePairCount > 0 &&
        current.pairwiseAgreement + EPSILON >=
          FROZEN_RANKING_GATES_6A.pairwiseAgreement,
      evidence: `${current.decisivePairCount} adjudicated decisive pair(s)`,
    },
    {
      id: 'known_hard_constraint_violation_at_10',
      threshold: '<= 2%',
      value: current.knownHardConstraintViolationRate10,
      passed:
        current.inspectedTop10Count > 0 &&
        current.knownHardConstraintViolationRate10 - EPSILON <=
          FROZEN_RANKING_GATES_6A.knownHardConstraintViolationRateAt10,
      evidence:
        `${current.knownHardConstraintTop10Count}/${current.inspectedTop10Count} inspected top-10 rows`,
    },
    {
      id: 'obvious_match_precision_no_regression',
      threshold: 'current P@5 and P@10 >= frozen v2.5.5',
      value:
        current.precision5 - baseline.precision5 +
        current.precision10 - baseline.precision10,
      passed:
        current.precision5 + EPSILON >= baseline.precision5 &&
        current.precision10 + EPSILON >= baseline.precision10,
      evidence:
        `P@5 ${current.precision5.toFixed(6)} vs ${baseline.precision5.toFixed(6)}; ` +
        `P@10 ${current.precision10.toFixed(6)} vs ${baseline.precision10.toFixed(6)}`,
    },
    {
      id: 'severe_seniority_no_regression',
      threshold: 'current top-10 rate <= frozen v2.5.5',
      value: current.severeSeniorityMismatchRate10,
      passed:
        current.severeSeniorityMismatchRate10 - EPSILON <=
          baseline.severeSeniorityMismatchRate10,
      evidence:
        `current=${current.severeSeniorityMismatchRate10.toFixed(6)}, ` +
        `baseline=${baseline.severeSeniorityMismatchRate10.toFixed(6)}`,
    },
    {
      id: 'determinism',
      threshold: 'identical input/version and reordered candidate input are stable',
      value: determinism.every((entry) =>
        entry.identicalInput &&
        entry.inputHashesStable &&
        entry.inputOrderInvariant),
      passed: determinism.length > 0 && determinism.every((entry) =>
        entry.identicalInput &&
        entry.inputHashesStable &&
        entry.inputOrderInvariant),
      evidence: `${determinism.length} scenario(s) repeated`,
    },
    {
      id: 'slice_regression',
      threshold: 'no language or job-family average may hide a failed slice',
      value: sliceFailures.length === 0,
      passed: sliceFailures.length === 0,
      evidence: sliceFailures.length
        ? sliceFailures.join('; ')
        : 'all language, job-family, and seniority slices passed',
    },
  ]
}

function validateModelDisagreementCoverage(
  bundle: HumanReviewBundle,
  runs: ScenarioRun[],
): string[] {
  const audit = bundle.adjudication.aiComparator
  if (!audit.used) return []
  const issues: string[] = []
  const runByScenario = new Map(runs.map((run) => [run.scenario.scenarioId, run]))
  const supplied = new Map(bundle.adjudication.modelDisagreements.map((entry) => [
    `${entry.scenarioId}:${entry.jobId}`,
    entry,
  ]))
  const expectedLarge = new Set<string>()
  for (const comparator of audit.rankings) {
    const run = runByScenario.get(comparator.scenarioId)
    if (!run) continue
    if (comparator.ranks.length !== run.scenario.jobs.length) {
      issues.push(
        `AI comparator ${comparator.scenarioId} must rank every frozen candidate`,
      )
    }
    const comparatorRanks = new Set(comparator.ranks.map((entry) => entry.rank))
    if (comparatorRanks.size !== comparator.ranks.length) {
      issues.push(`AI comparator ${comparator.scenarioId} contains duplicate ranks`)
    }
    const currentRanks = new Map(run.current.map((entry) => [entry.jobId, entry.rank]))
    const excludedRank = run.scenario.jobs.length + 1
    for (const entry of comparator.ranks) {
      const deterministicRank = currentRanks.get(entry.jobId) ?? excludedRank
      if (Math.abs(deterministicRank - entry.rank) < audit.largeRankGap) continue
      const key = `${comparator.scenarioId}:${entry.jobId}`
      expectedLarge.add(key)
      const disagreement = supplied.get(key)
      if (!disagreement) {
        issues.push(`uncategorized large model disagreement ${key}`)
        continue
      }
      if (
        disagreement.deterministicRank !== deterministicRank ||
        disagreement.comparatorRank !== entry.rank
      ) issues.push(`model disagreement ${key} records incorrect ranks`)
    }
  }
  for (const key of supplied.keys()) {
    if (!expectedLarge.has(key)) {
      issues.push(`model disagreement ${key} is not a frozen-threshold large gap`)
    }
  }
  return issues
}

function labelMap(
  adjudication: AdjudicatedScenario,
): Map<string, AdjudicatedScenario['jobs'][number]> {
  return new Map(adjudication.jobs.map((job) => [job.jobId, job]))
}

function ndcgAtKAgainstUniverse(
  rankedLabels: number[],
  universeLabels: number[],
  k: number,
): number {
  const actual = dcgAtK(rankedLabels, k)
  const ideal = dcgAtK([...universeLabels].sort((left, right) => right - left), k)
  return ideal > 0 ? actual / ideal : 0
}

function precisionFixedK(labels: number[], k: number): number {
  if (k < 1) return 0
  const relevant = labels
    .slice(0, k)
    .filter((label) => label >= RELEVANCE_THRESHOLD).length
  return relevant / k
}

function reciprocalRank(labels: number[]): number {
  const index = labels.findIndex((label) => label >= RELEVANCE_THRESHOLD)
  return index < 0 ? 0 : 1 / (index + 1)
}

function calibrationBands(
  rows: { score: number; label: HumanRelevanceLabel }[],
): CalibrationBand[] {
  const definitions: {
    band: CalibrationBand['band']
    min: number
    max: number
  }[] = [
    { band: '0-24', min: 0, max: 24 },
    { band: '25-49', min: 25, max: 49 },
    { band: '50-74', min: 50, max: 74 },
    { band: '75-100', min: 75, max: 100 },
  ]
  return definitions.map((definition) => {
    const selected = rows.filter((row) =>
      row.score >= definition.min && row.score <= definition.max + 0.999999)
    return {
      band: definition.band,
      count: selected.length,
      meanScore: average(selected.map((row) => row.score)),
      meanLabel: average(selected.map((row) => row.label)),
      relevantRate: average(selected.map((row) =>
        row.label >= RELEVANCE_THRESHOLD ? 1 : 0)),
      strongRate: average(selected.map((row) => row.label === 3 ? 1 : 0)),
    }
  })
}

function categoryCounts(
  bundle: HumanReviewBundle,
): Record<DisagreementCategory, number> {
  const counts: Record<DisagreementCategory, number> = {
    label_error: 0,
    extraction_error: 0,
    feature_error: 0,
    calibration_error: 0,
    genuine_ambiguity: 0,
  }
  for (const disagreement of [
    ...bundle.adjudication.reviewerDisagreements,
    ...bundle.adjudication.modelDisagreements,
  ]) counts[disagreement.category] += 1
  return counts
}

function average(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0
}

function equalStringArrays(left: string[], right: string[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index])
}

/** Exported only for narrow unit tests of ideal-set accounting. */
export const rankingGateMetricInternals = {
  ndcgAtKAgainstUniverse,
  precisionFixedK,
  calibrationBands,
}