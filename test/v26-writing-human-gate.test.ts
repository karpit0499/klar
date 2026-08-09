import { strict as assert } from 'node:assert'
import {
  WRITING_RELEASE_GATES,
  evaluateWritingHumanGate,
  writingGateMetricInternals,
} from '../qa/writing/gate.ts'
import {
  MIN_SAMPLES_PER_KIND_LANGUAGE,
  sha256Of,
  validateWritingReviewBundle,
  writingSampleHash,
  type AdjudicatedWritingSample,
  type WritingEvaluationCorpus,
  type WritingEvaluationSample,
  type WritingReviewBundle,
  type WritingReviewerSubmission,
} from '../qa/writing/humanReview.ts'

assert.equal(MIN_SAMPLES_PER_KIND_LANGUAGE, 10)
assert.deepEqual(WRITING_RELEASE_GATES, {
  recruiterSendableRate: 0.90,
  unsupportedClaims: 0,
  unclearClaims: 0,
})
assert.equal(writingGateMetricInternals.sendable('send_as_is'), true)
assert.equal(writingGateMetricInternals.sendable('light_edit'), true)
assert.equal(writingGateMetricInternals.sendable('major_edit'), false)

const bundle = makeTestBundle()
assert.deepEqual(validateWritingReviewBundle(bundle, false), [])

{
  const report = evaluateWritingHumanGate(bundle, { releaseMode: false })
  assert.equal(report.evaluated, true)
  assert.equal(report.releaseEligible, false)
  assert.equal(report.passed, false)
  assert.equal(report.decision, 'HOLD')
  assert.equal(report.aggregate?.recruiterMessageSampleCount, 20)
  assert.equal(report.aggregate?.recruiterReviewerRatingCount, 40)
  assert.equal(report.aggregate?.recruiterSendableRate, 1)
  assert.equal(report.aggregate?.unsupportedFinalClaimCount, 0)
  assert.equal(report.aggregate?.unclearFinalClaimCount, 0)
  assert.equal(report.slices.length, 4)
  assert.equal(
    report.slices.find((slice) =>
      slice.kind === 'recruiter_message' && slice.language === 'de')?.sendableRate,
    1,
  )
}

{
  const report = evaluateWritingHumanGate(bundle)
  assert.equal(report.evaluated, false)
  assert.equal(report.decision, 'HOLD')
  assert.ok(report.validationIssues.some((issue) =>
    /refuses corpus evidenceKind=test_fixture/.test(issue)))
}

{
  const synthetic = structuredClone(bundle)
  synthetic.corpus.evidenceKind = 'synthetic_fixture'
  const report = evaluateWritingHumanGate(synthetic)
  assert.equal(report.evaluated, false)
  assert.equal(report.decision, 'HOLD')
  assert.ok(report.validationIssues.some((issue) => /synthetic_fixture/.test(issue)))
}

{
  const machine = structuredClone(bundle)
  machine.corpus.evidenceKind = 'human_release'
  machine.reviewers[0].evidenceKind = 'human_release'
  machine.reviewers[1].evidenceKind = 'human_release'
  machine.adjudication.evidenceKind = 'human_release'
  const report = evaluateWritingHumanGate(machine)
  assert.equal(report.evaluated, false)
  assert.equal(report.decision, 'HOLD')
  assert.ok(report.validationIssues.some((issue) => /human reviewer required/.test(issue)))
  assert.ok(report.validationIssues.some((issue) => /human adjudicator required/.test(issue)))
}

{
  const nonBilingual = structuredClone(bundle)
  ;(nonBilingual.reviewers[0].languageCompetence as { de: string }).de = 'basic'
  const report = evaluateWritingHumanGate(nonBilingual, { releaseMode: false })
  assert.equal(report.evaluated, false)
  assert.ok(report.validationIssues.some((issue) =>
    /professional English and German|must equal "professional"/.test(issue)))
}

{
  const missing = structuredClone(bundle)
  missing.reviewers[0].reviews.pop()
  const report = evaluateWritingHumanGate(missing, { releaseMode: false })
  assert.equal(report.evaluated, false)
  assert.equal(report.decision, 'HOLD')
  assert.ok(report.validationIssues.some((issue) =>
    /missing row|at least 40 item/.test(issue)))
}

{
  const schemaInvalid = structuredClone(bundle) as WritingReviewBundle & {
    corpus: WritingEvaluationCorpus & { unexpectedField?: string }
  }
  schemaInvalid.corpus.unexpectedField = 'must be rejected'
  const report = evaluateWritingHumanGate(schemaInvalid, { releaseMode: false })
  assert.equal(report.evaluated, false)
  assert.ok(report.validationIssues.some((issue) =>
    /additional property is not allowed/.test(issue)))
}

{
  const unresolved = structuredClone(bundle)
  unresolved.reviewers[1].reviews[0].sendability = 'major_edit'
  const report = evaluateWritingHumanGate(unresolved, { releaseMode: false })
  assert.equal(report.evaluated, false)
  assert.ok(report.validationIssues.some((issue) =>
    /unresolved reviewer conflict/.test(issue)))
}

{
  const duplicateWithinClaim = structuredClone(bundle)
  const finalClaim = duplicateWithinClaim.adjudication.samples[0].finalClaims[0]
  finalClaim.sourceClaimIds.push(finalClaim.sourceClaimIds[0])
  const report = evaluateWritingHumanGate(duplicateWithinClaim, {
    releaseMode: false,
  })
  assert.equal(report.evaluated, false)
  assert.ok(report.validationIssues.some((issue) =>
    /sourceClaimId .* appears 2 times across finalClaims/.test(issue)))
}

{
  const duplicateAcrossClaims = structuredClone(bundle)
  const finalClaims = duplicateAcrossClaims.adjudication.samples[0].finalClaims
  finalClaims.push({
    ...structuredClone(finalClaims[0]),
    finalClaimId: `${finalClaims[0].finalClaimId}_duplicate`,
  })
  const report = evaluateWritingHumanGate(duplicateAcrossClaims, {
    releaseMode: false,
  })
  assert.equal(report.evaluated, false)
  assert.ok(report.validationIssues.some((issue) =>
    /sourceClaimId .* appears 2 times across finalClaims/.test(issue)))
}

{
  const evidenceOnlyOverride = structuredClone(bundle)
  const sample = evidenceOnlyOverride.corpus.samples[0]
  const evidenceText = 'Test-only alternative evidence for override detection.'
  const evidenceId = 'evidence_override_detection'
  sample.evidence.push({
    evidenceId,
    source: 'candidate',
    text: evidenceText,
    sourceSha256: sha256Of(evidenceText),
  })
  const { sampleSha256: _previousHash, ...unhashedSample } = sample
  sample.sampleSha256 = writingSampleHash(unhashedSample)
  evidenceOnlyOverride.adjudication.samples[0].finalClaims[0].evidenceIds = [
    evidenceId,
  ]
  const report = evaluateWritingHumanGate(evidenceOnlyOverride, {
    releaseMode: false,
  })
  assert.equal(report.evaluated, false)
  assert.ok(report.validationIssues.some((issue) =>
    /unresolved reviewer conflict .*:claim_support:claim_/.test(issue)))
}

{
  const leakage = structuredClone(bundle)
  leakage.corpus.datasetSeparation.trainingDataUsedForThisRelease = true
  leakage.corpus.datasetSeparation.trainingManifestSha256 = 'a'.repeat(64)
  leakage.corpus.datasetSeparation.trainingContentSha256 = [
    leakage.corpus.samples[0].sampleSha256,
  ]
  leakage.corpus.datasetSeparation.exactHashOverlapCount = 1
  const report = evaluateWritingHumanGate(leakage, { releaseMode: false })
  assert.equal(report.evaluated, false)
  assert.ok(report.validationIssues.some((issue) =>
    /evaluation content hash appears in training data/.test(issue)))
}

{
  const unsupported = structuredClone(bundle)
  unsupported.adjudication.samples[0].finalClaims[0].support = 'unsupported'
  unsupported.adjudication.samples[0].finalClaims[0].evidenceIds = []
  unsupported.adjudication.samples[0].finalClaims[0].rationale =
    'Test-only unsupported-claim branch.'
  unsupported.adjudication.conflicts.push({
    sampleId: unsupported.adjudication.samples[0].sampleId,
    subject: 'claim_support',
    subjectId:
      unsupported.adjudication.samples[0].finalClaims[0].sourceClaimIds[0],
    category: 'evidence_interpretation',
    resolution: 'Test-only override recorded so the unsupported gate can be exercised.',
  })
  const report = evaluateWritingHumanGate(unsupported, { releaseMode: false })
  assert.equal(report.evaluated, true)
  assert.equal(report.decision, 'HOLD')
  assert.equal(
    report.gates.find((gate) => gate.id === 'unsupported_claims')?.passed,
    false,
  )
}

console.log('v26-writing-human-gate.test.ts: all tests passed')

function makeTestBundle(): WritingReviewBundle {
  const frozenAt = '2026-07-01T12:00:00.000Z'
  const samples: WritingEvaluationSample[] = []
  let index = 0
  for (const kind of ['recruiter_message', 'cover_letter'] as const) {
    for (const language of ['en', 'de'] as const) {
      for (let row = 0; row < MIN_SAMPLES_PER_KIND_LANGUAGE; row += 1) {
        index += 1
        const suffix = index.toString(16).padStart(12, '0')
        const evidenceText =
          `Test-only ${language} ${kind} evidence ${row}; never release data.`
        const withoutHash: Omit<WritingEvaluationSample, 'sampleSha256'> = {
          sampleId: `sample_${suffix}`,
          blindVariantId: `variant_${(index + 1000).toString(16).padStart(12, '0')}`,
          kind,
          language,
          sourceStatus: 'synthetic',
          personalDataRemoved: true,
          outputText:
            `Test-only ${language} ${kind} output ${row}; never release evidence.`,
          applicationState: kind === 'recruiter_message'
            ? 'not_applied'
            : 'not_applicable',
          channel: kind === 'recruiter_message' ? 'linkedin' : 'not_applicable',
          evidence: [{
            evidenceId: `evidence_${suffix}`,
            source: 'candidate',
            text: evidenceText,
            sourceSha256: sha256Of(evidenceText),
          }],
          claimInventory: [{
            claimId: `claim_${suffix}`,
            text: `Test-only claim ${row}.`,
            proposedEvidenceIds: [`evidence_${suffix}`],
          }],
        }
        samples.push({
          ...withoutHash,
          sampleSha256: writingSampleHash(withoutHash),
        })
      }
    }
  }
  const corpus: WritingEvaluationCorpus = {
    schemaVersion: 1,
    corpusId: 'test-only-writing-corpus',
    evidenceKind: 'test_fixture',
    split: 'final_held_out',
    frozenAt,
    generatorIdentityWithheldFromReviewers: true,
    variantMappingStoredSeparately: true,
    datasetSeparation: {
      evaluationExcludedFromTraining: true,
      evaluationExcludedFromPromptExamples: true,
      trainingDataUsedForThisRelease: false,
      trainingContentSha256: [],
      exactHashOverlapCount: 0,
      nearDuplicateCheck: {
        completed: true,
        method: 'test-only exact normalized text comparison',
        threshold: 'no exact normalized match',
        checkedAt: frozenAt,
        unresolvedPairs: [],
      },
    },
    samples,
  }
  const reviewerA = reviewer(corpus, 'reviewer_aaaaaaaaaaaa')
  const reviewerB = reviewer(corpus, 'reviewer_bbbbbbbbbbbb')
  const adjudicated: AdjudicatedWritingSample[] = corpus.samples.map((sample) => ({
    sampleId: sample.sampleId,
    finalSendability: sample.kind === 'recruiter_message'
      ? 'light_edit'
      : 'not_applicable',
    soundsHuman: 'yes',
    reasonForWritingClear: 'yes',
    requestFitsChannelAndState: 'yes',
    germanFormalityAppropriate: sample.language === 'de' ? 'yes' : 'not_applicable',
    inventoryComplete: true,
    finalClaims: sample.claimInventory.map((claim) => ({
      finalClaimId: `final_${claim.claimId}`,
      sourceClaimIds: [claim.claimId],
      text: claim.text,
      support: 'supported',
      evidenceIds: [...claim.proposedEvidenceIds],
      rationale: 'Test-only final claim; never human release evidence.',
    })),
    rationale: 'Test-only adjudication; never human release evidence.',
  }))
  return {
    corpus,
    reviewers: [reviewerA, reviewerB],
    adjudication: {
      schemaVersion: 1,
      evidenceKind: 'test_fixture',
      corpusId: corpus.corpusId,
      adjudicatorId: 'adjudicator_cccccccccccc',
      adjudicatorIsHuman: false,
      completedAt: frozenAt,
      reviewerIds: [reviewerA.reviewerId, reviewerB.reviewerId],
      blindToGeneratorAndVariantMapping: true,
      samples: adjudicated,
      conflicts: [],
      notes: ['Test fixture only; never release evidence.'],
    },
  }
}

function reviewer(
  corpus: WritingEvaluationCorpus,
  reviewerId: string,
): WritingReviewerSubmission {
  return {
    schemaVersion: 1,
    evidenceKind: 'test_fixture',
    corpusId: corpus.corpusId,
    reviewerId,
    isHuman: false,
    completedAt: corpus.frozenAt,
    languageCompetence: { en: 'professional', de: 'professional' },
    independence: {
      identityStoredSeparately: true,
      blindToGeneratorAndVariantMapping: true,
      blindToOtherReviewer: true,
      noMachineGeneratedFinalRatings: true,
      conflictOfInterestDeclared: true,
    },
    reviews: corpus.samples.map((sample) => ({
      sampleId: sample.sampleId,
      sendability: sample.kind === 'recruiter_message'
        ? 'light_edit'
        : 'not_applicable',
      soundsHuman: 'yes',
      reasonForWritingClear: 'yes',
      requestFitsChannelAndState: 'yes',
      germanFormalityAppropriate: sample.language === 'de' ? 'yes' : 'not_applicable',
      inventoryComplete: true,
      claims: sample.claimInventory.map((claim) => ({
        claimId: claim.claimId,
        support: 'supported',
        evidenceIds: [...claim.proposedEvidenceIds],
        rationale: 'Test-only reviewer row; never human release evidence.',
      })),
      additionalClaims: [],
      notes: 'Test-only reviewer row; never human release evidence.',
    })),
  }
}
