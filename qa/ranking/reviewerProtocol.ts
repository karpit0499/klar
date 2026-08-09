import type { RankingEligibilityKey } from '../../src/types.ts'

export type RelevanceLabel = 0 | 1 | 2 | 3

export type ReviewerLabel = {
  reviewerId: string
  label: RelevanceLabel
  rationale: string
}

export type RequirementAnnotation = {
  text: string
  priority: 'required' | 'preferred'
  evidencePaths: string[]
}

export type ConstraintAnnotation = {
  key: RankingEligibilityKey
  judgment: 'match' | 'known_mismatch' | 'unknown' | 'not_applicable'
  rationale: string
}

export type ReviewedJob = {
  jobId: string
  sourceSnapshotId: string
  extractionConfidence: 'high' | 'medium' | 'low'
  difficulty: 'routine' | 'difficult'
  requirements: RequirementAnnotation[]
  constraints: ConstraintAnnotation[]
  reviewerLabels: ReviewerLabel[]
  adjudication: {
    finalLabel: RelevanceLabel
    adjudicatorId: string
    reason: string
  }
}

export type ReviewedPair = {
  preferredId: string
  otherId: string
  difficulty: 'routine' | 'difficult'
  reviewerIds: string[]
  reason: string
}

export type ReviewScenario = {
  schemaVersion: 1
  id: string
  status: 'synthetic_fixture' | 'human_reviewed'
  language: 'en' | 'de' | 'mixed'
  jobFamily: string
  seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'exec'
  candidateProfileVersion: string
  candidateProfileHash: string
  jobs: ReviewedJob[]
  pairs: ReviewedPair[]
  adjudicationNotes: string[]
}

/** Portable schema for reviewer tooling outside the TypeScript application. */
export const REVIEW_SCENARIO_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://klar.example/schemas/ranking-review-v1.json',
  title: 'Klar ranking review scenario',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion', 'id', 'status', 'language', 'jobFamily', 'seniority',
    'candidateProfileVersion', 'candidateProfileHash', 'jobs', 'pairs',
    'adjudicationNotes',
  ],
  properties: {
    schemaVersion: { const: 1 },
    id: { type: 'string', minLength: 1 },
    status: { enum: ['synthetic_fixture', 'human_reviewed'] },
    language: { enum: ['en', 'de', 'mixed'] },
    jobFamily: { type: 'string', minLength: 1 },
    seniority: { enum: ['intern', 'junior', 'mid', 'senior', 'lead', 'exec'] },
    candidateProfileVersion: { type: 'string', minLength: 1 },
    candidateProfileHash: { type: 'string', minLength: 8 },
    jobs: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/reviewedJob' },
    },
    pairs: {
      type: 'array',
      items: { $ref: '#/$defs/reviewedPair' },
    },
    adjudicationNotes: { type: 'array', items: { type: 'string' } },
  },
  $defs: {
    reviewerLabel: {
      type: 'object',
      additionalProperties: false,
      required: ['reviewerId', 'label', 'rationale'],
      properties: {
        reviewerId: { type: 'string', minLength: 1 },
        label: { type: 'integer', minimum: 0, maximum: 3 },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    requirement: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'priority', 'evidencePaths'],
      properties: {
        text: { type: 'string', minLength: 1 },
        priority: { enum: ['required', 'preferred'] },
        evidencePaths: { type: 'array', items: { type: 'string', minLength: 1 } },
      },
    },
    constraint: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'judgment', 'rationale'],
      properties: {
        key: {
          enum: [
            'work_authorization', 'location', 'language', 'employment_type',
            'working_hours', 'start_date', 'certification', 'dealbreaker',
          ],
        },
        judgment: { enum: ['match', 'known_mismatch', 'unknown', 'not_applicable'] },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    reviewedJob: {
      type: 'object',
      additionalProperties: false,
      required: [
        'jobId', 'sourceSnapshotId', 'extractionConfidence', 'difficulty',
        'requirements', 'constraints', 'reviewerLabels', 'adjudication',
      ],
      properties: {
        jobId: { type: 'string', minLength: 1 },
        sourceSnapshotId: { type: 'string', minLength: 1 },
        extractionConfidence: { enum: ['high', 'medium', 'low'] },
        difficulty: { enum: ['routine', 'difficult'] },
        requirements: { type: 'array', items: { $ref: '#/$defs/requirement' } },
        constraints: { type: 'array', items: { $ref: '#/$defs/constraint' } },
        reviewerLabels: { type: 'array', items: { $ref: '#/$defs/reviewerLabel' } },
        adjudication: {
          type: 'object',
          additionalProperties: false,
          required: ['finalLabel', 'adjudicatorId', 'reason'],
          properties: {
            finalLabel: { type: 'integer', minimum: 0, maximum: 3 },
            adjudicatorId: { type: 'string', minLength: 1 },
            reason: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    reviewedPair: {
      type: 'object',
      additionalProperties: false,
      required: ['preferredId', 'otherId', 'difficulty', 'reviewerIds', 'reason'],
      properties: {
        preferredId: { type: 'string', minLength: 1 },
        otherId: { type: 'string', minLength: 1 },
        difficulty: { enum: ['routine', 'difficult'] },
        reviewerIds: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        reason: { type: 'string', minLength: 1 },
      },
    },
  },
} as const

export const REVIEWER_PROTOCOL = [
  'Freeze the candidate profile, job snapshots, extraction output, and schema versions before labels are collected.',
  'Reviewers label jobs independently on a 0–3 scale: irrelevant, weak/tangential, plausible, strong.',
  'Reviewers annotate explicit hard constraints as match, known mismatch, unknown, or not applicable.',
  'A missing fact is unknown unless the frozen candidate record establishes its absence.',
  'Required and preferred qualifications are annotated separately and linked to candidate evidence paths.',
  'Collect pairwise preferences around positions 1–15; do not reveal model order or score.',
  'Use at least two human reviewers for difficult judgments and adjudicate every disagreement.',
  'Preserve disagreement reasons as label, extraction, feature, calibration, or genuine ambiguity.',
  'Never promote AI-proposed labels into the gold set without human review.',
  'Freeze the final held-out set and exclude it, including near-duplicates, from training and calibration.',
] as const

export function validateReviewScenario(scenario: ReviewScenario): string[] {
  const issues: string[] = []
  if (scenario.schemaVersion !== 1) issues.push('schemaVersion must be 1')
  if (!scenario.id.trim()) issues.push('scenario id is required')
  if (!scenario.candidateProfileVersion.trim()) issues.push('candidate profile version is required')
  if (scenario.candidateProfileHash.length < 8) issues.push('candidate profile hash is too short')
  if (!scenario.jobs.length) issues.push('at least one reviewed job is required')

  const ids = new Set<string>()
  for (const job of scenario.jobs) {
    if (ids.has(job.jobId)) issues.push(`duplicate job id: ${job.jobId}`)
    ids.add(job.jobId)
    if (!job.sourceSnapshotId.trim()) issues.push(`${job.jobId}: source snapshot id is required`)
    if (!job.adjudication.reason.trim()) issues.push(`${job.jobId}: adjudication reason is required`)
    const reviewerCount = new Set(job.reviewerLabels.map((label) => label.reviewerId)).size
    const requiredReviewers = job.difficulty === 'difficult' ? 2 : 1
    if (scenario.status === 'human_reviewed' && reviewerCount < requiredReviewers) {
      issues.push(
        `${job.jobId}: ${job.difficulty} human-reviewed jobs require ${requiredReviewers} independent reviewer(s)`,
      )
    }
    if (
      scenario.status === 'human_reviewed' &&
      job.reviewerLabels.some((label) => !label.rationale.trim())
    ) {
      issues.push(`${job.jobId}: every human label needs a rationale`)
    }
  }

  for (const pair of scenario.pairs) {
    if (!ids.has(pair.preferredId) || !ids.has(pair.otherId)) {
      issues.push(`pair references an unknown job: ${pair.preferredId}/${pair.otherId}`)
    }
    if (pair.preferredId === pair.otherId) issues.push(`pair compares ${pair.preferredId} with itself`)
    if (!pair.reason.trim()) issues.push(`pair ${pair.preferredId}/${pair.otherId} needs a reason`)
    const requiredReviewers = pair.difficulty === 'difficult' ? 2 : 1
    if (
      scenario.status === 'human_reviewed' &&
      new Set(pair.reviewerIds).size < requiredReviewers
    ) {
      issues.push(
        `pair ${pair.preferredId}/${pair.otherId} requires ${requiredReviewers} reviewer(s)`,
      )
    }
  }
  return issues
}
