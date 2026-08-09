import {
  sha256Of,
  validateWritingReviewBundle,
  type ClaimSupport,
  type WritingConflictCategory,
  type WritingKind,
  type WritingLanguage,
  type WritingReviewBundle,
  type WritingSampleReview,
} from './humanReview.ts'

export const WRITING_RELEASE_GATES = {
  recruiterSendableRate: 0.90,
  unsupportedClaims: 0,
  unclearClaims: 0,
} as const

export type WritingSliceMetrics = {
  kind: WritingKind
  language: WritingLanguage
  sampleCount: number
  reviewerRatingCount: number
  sendableRate: number | null
  adjudicatedSendableRate: number | null
  unsupportedFinalClaimCount: number
  unclearFinalClaimCount: number
  finalClaimCount: number
  soundsHumanYesRate: number
  reasonClearYesRate: number
  requestFitYesRate: number
  germanFormalityYesRate: number | null
  inventoryComplete: boolean
}

export type WritingGateCheck = {
  id: string
  threshold: string
  value: number | boolean | null
  passed: boolean
  evidence: string
}

export type WritingHumanGateReport = {
  schemaVersion: 1
  evaluated: boolean
  releaseEligible: boolean
  passed: boolean
  decision: 'PASS' | 'HOLD'
  corpusId: string
  evidenceKind: string
  evaluatedAt: string
  bundleSha256: string
  validationIssues: string[]
  gates: WritingGateCheck[]
  aggregate?: {
    recruiterMessageSampleCount: number
    recruiterReviewerRatingCount: number
    recruiterSendableRate: number
    unsupportedFinalClaimCount: number
    unclearFinalClaimCount: number
    finalClaimCount: number
    inventoryComplete: boolean
  }
  slices: WritingSliceMetrics[]
  conflicts: {
    total: number
    byCategory: Record<WritingConflictCategory, number>
  }
  note: string
}

export function evaluateWritingHumanGate(
  bundle: WritingReviewBundle,
  options: { releaseMode?: boolean } = {},
): WritingHumanGateReport {
  const releaseMode = options.releaseMode ?? true
  const validationIssues = validateWritingReviewBundle(bundle, releaseMode)
  const base = reportShell(bundle)
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
      note:
        'HOLD: no writing-quality claim was computed because the human evidence bundle is incomplete or ineligible.',
    }
  }

  const slices = buildSlices(bundle)
  const recruiterSlices = slices.filter((slice) => slice.kind === 'recruiter_message')
  const recruiterReviewerRatingCount = recruiterSlices.reduce(
    (sum, slice) => sum + slice.reviewerRatingCount,
    0,
  )
  const recruiterSendableCount = bundle.reviewers
    .flatMap((reviewer) => reviewer.reviews)
    .filter((review) => {
      const sample = bundle.corpus.samples.find((entry) =>
        entry.sampleId === review.sampleId)
      return sample?.kind === 'recruiter_message' && sendable(review.sendability)
    }).length
  const allFinalClaims = bundle.adjudication.samples.flatMap((sample) =>
    sample.finalClaims)
  const unsupportedFinalClaimCount = countSupport(allFinalClaims, 'unsupported')
  const unclearFinalClaimCount = countSupport(allFinalClaims, 'unclear')
  const inventoryComplete = bundle.adjudication.samples.every((sample) =>
    sample.inventoryComplete)
  const recruiterSendableRate = recruiterReviewerRatingCount
    ? recruiterSendableCount / recruiterReviewerRatingCount
    : 0
  const aggregate = {
    recruiterMessageSampleCount: bundle.corpus.samples.filter((sample) =>
      sample.kind === 'recruiter_message').length,
    recruiterReviewerRatingCount,
    recruiterSendableRate,
    unsupportedFinalClaimCount,
    unclearFinalClaimCount,
    finalClaimCount: allFinalClaims.length,
    inventoryComplete,
  }
  const gates = buildGates(aggregate, recruiterSlices)
  const releaseEligible =
    releaseMode &&
    bundle.corpus.evidenceKind === 'human_release' &&
    bundle.reviewers.every((reviewer) =>
      reviewer.evidenceKind === 'human_release' && reviewer.isHuman) &&
    bundle.adjudication.evidenceKind === 'human_release' &&
    bundle.adjudication.adjudicatorIsHuman
  const passed =
    releaseEligible &&
    validationIssues.length === 0 &&
    gates.every((gate) => gate.passed)
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
    conflicts: conflictCounts(bundle),
    note: releaseEligible
      ? 'Human bilingual writing evidence was evaluated against the frozen v2.6 gates.'
      : 'HOLD: development-only metrics. Synthetic, test, and machine ratings never become release evidence.',
  }
}

function reportShell(bundle: WritingReviewBundle): Omit<
  WritingHumanGateReport,
  | 'evaluated'
  | 'releaseEligible'
  | 'passed'
  | 'decision'
  | 'validationIssues'
  | 'gates'
  | 'slices'
  | 'note'
> {
  return {
    schemaVersion: 1,
    corpusId: bundle.corpus.corpusId,
    evidenceKind: bundle.corpus.evidenceKind,
    evaluatedAt: bundle.corpus.frozenAt,
    bundleSha256: sha256Of(bundle),
    conflicts: {
      total: 0,
      byCategory: {
        claim_boundary: 0,
        evidence_interpretation: 0,
        language_or_tone: 0,
        application_state: 0,
        edit_effort: 0,
        genuine_ambiguity: 0,
      },
    },
  }
}

function buildSlices(bundle: WritingReviewBundle): WritingSliceMetrics[] {
  const reviewBySample = bundle.reviewers.map((reviewer) =>
    new Map(reviewer.reviews.map((review) => [review.sampleId, review])))
  const finalBySample = new Map(bundle.adjudication.samples.map((sample) => [
    sample.sampleId,
    sample,
  ]))
  const slices: WritingSliceMetrics[] = []
  for (const kind of ['recruiter_message', 'cover_letter'] as const) {
    for (const language of ['en', 'de'] as const) {
      const samples = bundle.corpus.samples.filter((sample) =>
        sample.kind === kind && sample.language === language)
      const reviews = samples.flatMap((sample) =>
        reviewBySample.map((map) => map.get(sample.sampleId)!))
      const finals = samples.map((sample) => finalBySample.get(sample.sampleId)!)
      const finalClaims = finals.flatMap((sample) => sample.finalClaims)
      const recruiterReviews = kind === 'recruiter_message' ? reviews : []
      const finalRecruiter = kind === 'recruiter_message' ? finals : []
      slices.push({
        kind,
        language,
        sampleCount: samples.length,
        reviewerRatingCount: recruiterReviews.length,
        sendableRate: recruiterReviews.length
          ? recruiterReviews.filter((review) => sendable(review.sendability)).length /
            recruiterReviews.length
          : null,
        adjudicatedSendableRate: finalRecruiter.length
          ? finalRecruiter.filter((sample) => sendable(sample.finalSendability)).length /
            finalRecruiter.length
          : null,
        unsupportedFinalClaimCount: countSupport(finalClaims, 'unsupported'),
        unclearFinalClaimCount: countSupport(finalClaims, 'unclear'),
        finalClaimCount: finalClaims.length,
        soundsHumanYesRate: yesRate(reviews, (review) => review.soundsHuman),
        reasonClearYesRate: yesRate(reviews, (review) => review.reasonForWritingClear),
        requestFitYesRate: yesRate(reviews, (review) =>
          review.requestFitsChannelAndState),
        germanFormalityYesRate: language === 'de'
          ? yesRate(reviews, (review) => review.germanFormalityAppropriate)
          : null,
        inventoryComplete: finals.every((sample) => sample.inventoryComplete),
      })
    }
  }
  return slices
}

function buildGates(
  aggregate: NonNullable<WritingHumanGateReport['aggregate']>,
  recruiterSlices: WritingSliceMetrics[],
): WritingGateCheck[] {
  const english = recruiterSlices.find((slice) => slice.language === 'en')
  const german = recruiterSlices.find((slice) => slice.language === 'de')
  return [
    {
      id: 'recruiter_sendable_overall',
      threshold: '>= 90% of independent human ratings are send-as-is or light-edit',
      value: aggregate.recruiterSendableRate,
      passed:
        aggregate.recruiterReviewerRatingCount > 0 &&
        aggregate.recruiterSendableRate + Number.EPSILON >=
          WRITING_RELEASE_GATES.recruiterSendableRate,
      evidence: `${aggregate.recruiterReviewerRatingCount} reviewer-message rating(s)`,
    },
    {
      id: 'recruiter_sendable_english',
      threshold: '>= 90%',
      value: english?.sendableRate ?? null,
      passed:
        english?.sendableRate != null &&
        english.reviewerRatingCount > 0 &&
        english.sendableRate + Number.EPSILON >= WRITING_RELEASE_GATES.recruiterSendableRate,
      evidence: `${english?.reviewerRatingCount ?? 0} English rating(s)`,
    },
    {
      id: 'recruiter_sendable_german',
      threshold: '>= 90%',
      value: german?.sendableRate ?? null,
      passed:
        german?.sendableRate != null &&
        german.reviewerRatingCount > 0 &&
        german.sendableRate + Number.EPSILON >= WRITING_RELEASE_GATES.recruiterSendableRate,
      evidence: `${german?.reviewerRatingCount ?? 0} German rating(s)`,
    },
    {
      id: 'unsupported_claims',
      threshold: 'exactly 0 adjudicated unsupported claims',
      value: aggregate.unsupportedFinalClaimCount,
      passed:
        aggregate.finalClaimCount > 0 &&
        aggregate.unsupportedFinalClaimCount === WRITING_RELEASE_GATES.unsupportedClaims,
      evidence: `${aggregate.unsupportedFinalClaimCount}/${aggregate.finalClaimCount} final claim(s)`,
    },
    {
      id: 'unclear_claims',
      threshold: 'exactly 0 unresolved/unclear claims',
      value: aggregate.unclearFinalClaimCount,
      passed:
        aggregate.finalClaimCount > 0 &&
        aggregate.unclearFinalClaimCount === WRITING_RELEASE_GATES.unclearClaims,
      evidence: `${aggregate.unclearFinalClaimCount}/${aggregate.finalClaimCount} final claim(s)`,
    },
    {
      id: 'claim_inventory',
      threshold: '100% complete after both reviewers and adjudication',
      value: aggregate.inventoryComplete,
      passed: aggregate.inventoryComplete,
      evidence: `${aggregate.finalClaimCount} adjudicated claim(s)`,
    },
  ]
}

function sendable(value: string): boolean {
  return value === 'send_as_is' || value === 'light_edit'
}

function countSupport(
  claims: { support: ClaimSupport }[],
  support: ClaimSupport,
): number {
  return claims.filter((claim) => claim.support === support).length
}

function yesRate(
  reviews: WritingSampleReview[],
  value: (review: WritingSampleReview) => string,
): number {
  return reviews.length
    ? reviews.filter((review) => value(review) === 'yes').length / reviews.length
    : 0
}

function conflictCounts(bundle: WritingReviewBundle): {
  total: number
  byCategory: Record<WritingConflictCategory, number>
} {
  const byCategory: Record<WritingConflictCategory, number> = {
    claim_boundary: 0,
    evidence_interpretation: 0,
    language_or_tone: 0,
    application_state: 0,
    edit_effort: 0,
    genuine_ambiguity: 0,
  }
  for (const conflict of bundle.adjudication.conflicts) {
    byCategory[conflict.category] += 1
  }
  return { total: bundle.adjudication.conflicts.length, byCategory }
}

export const writingGateMetricInternals = {
  sendable,
  countSupport,
}