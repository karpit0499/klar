import { createHash } from 'node:crypto'
import type {
  NormalizedJob,
  Preferences,
  Profile,
  RankingEligibilityKey,
  RankingEligibilityStatus,
} from '../../src/types.ts'
import {
  BASELINE_V255_COMMIT,
  BASELINE_V255_VERSION,
} from './baselineV255.ts'
import { normalizeKey } from '../../src/lib/hash.ts'

export type EvaluationEvidenceKind =
  | 'human_release'
  | 'synthetic_fixture'
  | 'test_fixture'

export type EvaluationLanguage = 'en' | 'de' | 'mixed'
export type EvaluationSeniority =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'lead'
  | 'exec'
export type HumanRelevanceLabel = 0 | 1 | 2 | 3
export type DisagreementCategory =
  | 'label_error'
  | 'extraction_error'
  | 'feature_error'
  | 'calibration_error'
  | 'genuine_ambiguity'

export type RankingCorpusJob = {
  snapshotId: string
  snapshotSha256: string
  requirementInventorySha256: string
  sourceConfidence: 'published' | 'structured' | 'inferred' | 'unknown'
  extractionConfidence: 'high' | 'medium' | 'low'
  job: NormalizedJob
  /** Frozen posting-only clauses every reviewer must judge by stable id. */
  requirementInventory: RankingCorpusRequirement[]
}

export type RankingCorpusRequirement = {
  requirementId: string
  text: string
  sourceText: string
}

export type RankingPair = {
  pairId: string
  leftJobId: string
  rightJobId: string
  selectionReason: string
}

export type RankingCorpusScenario = {
  scenarioId: string
  language: EvaluationLanguage
  jobFamily: string
  candidateSeniority: EvaluationSeniority
  candidateProfileVersion: string
  candidateProfileSha256: string
  preferencesSha256: string
  profile: Profile
  preferences: Preferences
  jobs: RankingCorpusJob[]
  pairs: RankingPair[]
}

export type RankingHumanCorpus = {
  schemaVersion: 1
  corpusId: string
  evidenceKind: EvaluationEvidenceKind
  split: 'final_held_out'
  heldOutFromTrainingAndCalibration: boolean
  containsPersonalData: boolean
  frozenAt: string
  asOf: string
  baselineCommit: string
  baselineVersion: string
  rankingVersion: string
  requirementVersion: string
  scenarios: RankingCorpusScenario[]
}

export type ReviewerConstraintJudgment = {
  key: RankingEligibilityKey
  status: RankingEligibilityStatus
  sourceText: string
  rationale: string
}

export type ReviewerRequirementJudgment = {
  requirementId: string
  text: string
  priority: 'required' | 'preferred'
  candidateEvidencePaths: string[]
  judgment: 'met' | 'partial' | 'missing' | 'unknown'
  rationale: string
}

export type ReviewerJobJudgment = {
  jobId: string
  relevanceLabel: HumanRelevanceLabel
  knownHardMismatch: boolean
  severeSeniorityMismatch: boolean
  constraints: ReviewerConstraintJudgment[]
  requirements: ReviewerRequirementJudgment[]
  rationale: string
}

export type ReviewerPairJudgment = {
  pairId: string
  preference: string | 'tie' | 'cannot_judge'
  rationale: string
}

export type ReviewerScenarioSubmission = {
  scenarioId: string
  jobs: ReviewerJobJudgment[]
  pairs: ReviewerPairJudgment[]
}

export type RankingReviewerSubmission = {
  schemaVersion: 1
  evidenceKind: 'human_release' | 'test_fixture'
  corpusId: string
  reviewerId: string
  isHuman: boolean
  completedAt: string
  languageCompetence: {
    en: 'professional'
    de: 'professional'
  }
  independence: {
    blindToModelScoresAndOrder: true
    blindToOtherReviewer: true
    noAiGeneratedFinalLabels: true
    conflictOfInterestDeclared: true
  }
  scenarios: ReviewerScenarioSubmission[]
}

export type AdjudicatedJob = {
  jobId: string
  finalRelevanceLabel: HumanRelevanceLabel
  knownHardMismatch: boolean
  severeSeniorityMismatch: boolean
  finalConstraints: ReviewerConstraintJudgment[]
  finalRequirements: ReviewerRequirementJudgment[]
  rationale: string
}

export type AdjudicatedPair = {
  pairId: string
  preference: string | 'tie' | 'cannot_judge'
  rationale: string
}

export type ReviewerDisagreement = {
  scenarioId: string
  subjectType: 'job_label' | 'hard_constraint' | 'requirement' | 'seniority' | 'pairwise'
  subjectId: string
  category: DisagreementCategory
  resolution: string
}

export type AiComparatorRanking = {
  scenarioId: string
  ranks: { jobId: string; rank: number }[]
}

export type AiComparatorAudit = {
  used: boolean
  modelVersion?: string
  largeRankGap: number
  rankings: AiComparatorRanking[]
}

export type ModelDisagreement = {
  scenarioId: string
  jobId: string
  deterministicRank: number
  comparatorRank: number
  category: DisagreementCategory
  resolution: string
}

export type AdjudicatedScenario = {
  scenarioId: string
  jobs: AdjudicatedJob[]
  pairs: AdjudicatedPair[]
}

export type RankingAdjudication = {
  schemaVersion: 1
  evidenceKind: 'human_release' | 'test_fixture'
  corpusId: string
  adjudicatorId: string
  adjudicatorIsHuman: boolean
  completedAt: string
  reviewerIds: [string, string]
  scenarios: AdjudicatedScenario[]
  reviewerDisagreements: ReviewerDisagreement[]
  aiComparator: AiComparatorAudit
  modelDisagreements: ModelDisagreement[]
  notes: string[]
}

export type HumanReviewBundle = {
  corpus: RankingHumanCorpus
  reviewers: [RankingReviewerSubmission, RankingReviewerSubmission]
  adjudication: RankingAdjudication
}

/**
 * JSON Schemas are exported for an editor or collection form. Runtime release
 * validation below performs the cross-file checks JSON Schema cannot express.
 */
export const HUMAN_CORPUS_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://klar.local/schemas/ranking-human-corpus-v1.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion', 'corpusId', 'evidenceKind', 'split',
    'heldOutFromTrainingAndCalibration', 'containsPersonalData', 'frozenAt',
    'asOf', 'baselineCommit', 'baselineVersion', 'rankingVersion',
    'requirementVersion', 'scenarios',
  ],
  properties: {
    schemaVersion: { const: 1 },
    corpusId: { type: 'string', minLength: 1 },
    evidenceKind: {
      enum: ['human_release', 'synthetic_fixture', 'test_fixture'],
    },
    split: { const: 'final_held_out' },
    heldOutFromTrainingAndCalibration: { type: 'boolean' },
    containsPersonalData: { type: 'boolean' },
    frozenAt: { type: 'string', format: 'date-time' },
    asOf: { type: 'string', format: 'date-time' },
    baselineCommit: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    baselineVersion: { type: 'string', minLength: 1 },
    rankingVersion: { type: 'string', minLength: 1 },
    requirementVersion: { type: 'string', minLength: 1 },
    scenarios: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/scenario' },
    },
  },
  $defs: {
    scenario: {
      type: 'object',
      additionalProperties: false,
      required: [
        'scenarioId', 'language', 'jobFamily', 'candidateSeniority',
        'candidateProfileVersion', 'candidateProfileSha256', 'preferencesSha256',
        'profile', 'preferences', 'jobs', 'pairs',
      ],
      properties: {
        scenarioId: { type: 'string', minLength: 1 },
        language: { enum: ['en', 'de', 'mixed'] },
        jobFamily: { type: 'string', minLength: 1 },
        candidateSeniority: {
          enum: ['intern', 'junior', 'mid', 'senior', 'lead', 'exec'],
        },
        candidateProfileVersion: { type: 'string', minLength: 1 },
        candidateProfileSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        preferencesSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        profile: { $ref: '#/$defs/profile' },
        preferences: { $ref: '#/$defs/preferences' },
        jobs: {
          type: 'array',
          minItems: 50,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'snapshotId', 'snapshotSha256', 'sourceConfidence',
              'extractionConfidence', 'job', 'requirementInventorySha256',
              'requirementInventory',
            ],
            properties: {
              snapshotId: { type: 'string', minLength: 1 },
              snapshotSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
              requirementInventorySha256: {
                type: 'string',
                pattern: '^[0-9a-f]{64}$',
              },
              sourceConfidence: {
                enum: ['published', 'structured', 'inferred', 'unknown'],
              },
              extractionConfidence: { enum: ['high', 'medium', 'low'] },
              job: { $ref: '#/$defs/job' },
              requirementInventory: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['requirementId', 'text', 'sourceText'],
                  properties: {
                    requirementId: { type: 'string', minLength: 1 },
                    text: { type: 'string', minLength: 1 },
                    sourceText: { type: 'string', minLength: 1 },
                  },
                },
              },
            },
          },
        },
        pairs: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['pairId', 'leftJobId', 'rightJobId', 'selectionReason'],
            properties: {
              pairId: { type: 'string', minLength: 1 },
              leftJobId: { type: 'string', minLength: 1 },
              rightJobId: { type: 'string', minLength: 1 },
              selectionReason: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
    job: {
      type: 'object',
      required: [
        'id', 'source', 'source_id', 'title', 'company', 'location',
        'description', 'url', 'salary', 'tags', 'fetched_at',
      ],
      properties: {
        id: { type: 'string', minLength: 1 },
        source: { type: 'string', minLength: 1 },
        source_id: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1 },
        company: { type: 'string', minLength: 1 },
        location: {
          type: 'object',
          required: ['country', 'remote'],
          properties: {
            city: { type: 'string' },
            region: { type: 'string' },
            country: { type: 'string', minLength: 1 },
            remote: { type: 'boolean' },
            lat: { type: 'number' },
            lng: { type: 'number' },
          },
        },
        description: { type: 'string', minLength: 1 },
        url: { type: 'string', minLength: 1 },
        posted_at: { type: 'string' },
        salary: {
          type: 'object',
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
            currency: { type: 'string' },
            period: { enum: ['year', 'month', 'hour'] },
          },
        },
        employment_type: { type: 'string' },
        seniority: { type: 'string' },
        language: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        fetched_at: { type: 'string', minLength: 1 },
      },
    },
    profile: {
      type: 'object',
      required: [
        'summary', 'titles', 'skills', 'domains', 'education', 'languages',
        'certifications',
      ],
      properties: {
        summary: { type: 'string' },
        titles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string' },
              seniority: { type: 'string' },
              years: { type: 'number' },
            },
          },
        },
        skills: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              level: { type: 'string' },
            },
          },
        },
        domains: { type: 'array', items: { type: 'string' } },
        totalYears: { type: 'number' },
        education: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              degree: { type: 'string' },
              field: { type: 'string' },
              institution: { type: 'string' },
            },
          },
        },
        languages: {
          type: 'array',
          items: {
            type: 'object',
            required: ['lang'],
            properties: {
              lang: { type: 'string' },
              level: { type: 'string' },
            },
          },
        },
        certifications: { type: 'array', items: { type: 'string' } },
      },
    },
    preferences: {
      type: 'object',
      required: [
        'targetTitles', 'fields', 'seniority', 'salary', 'locations',
        'workAuth', 'languages', 'mustHaves', 'dealbreakers',
      ],
      properties: {
        targetTitles: { type: 'array', items: { type: 'string' } },
        fields: { type: 'array', items: { type: 'string' } },
        seniority: {
          enum: ['intern', 'junior', 'mid', 'senior', 'lead', 'exec'],
        },
        salary: {
          type: 'object',
          required: ['currency', 'period'],
          properties: {
            min: { type: 'number' },
            currency: { const: 'EUR' },
            period: { enum: ['year', 'month'] },
          },
        },
        locations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['city', 'radius_km'],
            properties: {
              city: { type: 'string' },
              radius_km: { type: 'number' },
            },
          },
        },
        remoteOnly: { type: 'boolean' },
        hybridOk: { type: 'boolean' },
        workAuth: {
          type: 'object',
          properties: {
            needsVisaSponsorship: { type: 'boolean' },
            euWorkPermit: { type: 'boolean' },
          },
        },
        languages: {
          type: 'array',
          items: {
            type: 'object',
            required: ['lang', 'min_level'],
            properties: {
              lang: { type: 'string' },
              min_level: { type: 'string' },
            },
          },
        },
        mustHaves: { type: 'array', items: { type: 'string' } },
        dealbreakers: { type: 'array', items: { type: 'string' } },
        contractType: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const

export const REVIEWER_SUBMISSION_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://klar.local/schemas/ranking-reviewer-submission-v1.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion', 'evidenceKind', 'corpusId', 'reviewerId', 'isHuman',
    'completedAt', 'languageCompetence', 'independence', 'scenarios',
  ],
  properties: {
    schemaVersion: { const: 1 },
    evidenceKind: { enum: ['human_release', 'test_fixture'] },
    corpusId: { type: 'string', minLength: 1 },
    reviewerId: { type: 'string', minLength: 1 },
    isHuman: { type: 'boolean' },
    completedAt: { type: 'string', format: 'date-time' },
    languageCompetence: {
      type: 'object',
      additionalProperties: false,
      required: ['en', 'de'],
      properties: {
        en: { const: 'professional' },
        de: { const: 'professional' },
      },
    },
    independence: {
      type: 'object',
      additionalProperties: false,
      required: [
        'blindToModelScoresAndOrder', 'blindToOtherReviewer',
        'noAiGeneratedFinalLabels', 'conflictOfInterestDeclared',
      ],
      properties: {
        blindToModelScoresAndOrder: { const: true },
        blindToOtherReviewer: { const: true },
        noAiGeneratedFinalLabels: { const: true },
        conflictOfInterestDeclared: { const: true },
      },
    },
    scenarios: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/scenario' },
    },
  },
  $defs: {
    constraint: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'status', 'sourceText', 'rationale'],
      properties: {
        key: {
          enum: [
            'work_authorization', 'location', 'language', 'employment_type',
            'working_hours', 'start_date', 'certification', 'dealbreaker',
          ],
        },
        status: { enum: ['match', 'known_mismatch', 'unknown', 'not_applicable'] },
        sourceText: { type: 'string' },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    requirement: {
      type: 'object',
      additionalProperties: false,
      required: [
        'requirementId', 'text', 'priority', 'candidateEvidencePaths',
        'judgment', 'rationale',
      ],
      properties: {
        requirementId: { type: 'string', minLength: 1 },
        text: { type: 'string', minLength: 1 },
        priority: { enum: ['required', 'preferred'] },
        candidateEvidencePaths: {
          type: 'array',
          uniqueItems: true,
          items: { type: 'string', minLength: 1 },
        },
        judgment: { enum: ['met', 'partial', 'missing', 'unknown'] },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    job: {
      type: 'object',
      additionalProperties: false,
      required: [
        'jobId', 'relevanceLabel', 'knownHardMismatch',
        'severeSeniorityMismatch', 'constraints', 'requirements', 'rationale',
      ],
      properties: {
        jobId: { type: 'string', minLength: 1 },
        relevanceLabel: { type: 'integer', minimum: 0, maximum: 3 },
        knownHardMismatch: { type: 'boolean' },
        severeSeniorityMismatch: { type: 'boolean' },
        constraints: {
          type: 'array',
          minItems: 8,
          maxItems: 8,
          items: { $ref: '#/$defs/constraint' },
        },
        requirements: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/requirement' },
        },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    pair: {
      type: 'object',
      additionalProperties: false,
      required: ['pairId', 'preference', 'rationale'],
      properties: {
        pairId: { type: 'string', minLength: 1 },
        preference: { type: 'string', minLength: 1 },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    scenario: {
      type: 'object',
      additionalProperties: false,
      required: ['scenarioId', 'jobs', 'pairs'],
      properties: {
        scenarioId: { type: 'string', minLength: 1 },
        jobs: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/job' },
        },
        pairs: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/pair' },
        },
      },
    },
  },
} as const

export const ADJUDICATION_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://klar.local/schemas/ranking-adjudication-v1.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion', 'evidenceKind', 'corpusId', 'adjudicatorId',
    'adjudicatorIsHuman', 'completedAt', 'reviewerIds', 'scenarios',
    'reviewerDisagreements', 'aiComparator', 'modelDisagreements', 'notes',
  ],
  properties: {
    schemaVersion: { const: 1 },
    evidenceKind: { enum: ['human_release', 'test_fixture'] },
    corpusId: { type: 'string', minLength: 1 },
    adjudicatorId: { type: 'string', minLength: 1 },
    adjudicatorIsHuman: { type: 'boolean' },
    completedAt: { type: 'string', format: 'date-time' },
    reviewerIds: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      uniqueItems: true,
      items: { type: 'string', minLength: 1 },
    },
    scenarios: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/scenario' },
    },
    reviewerDisagreements: {
      type: 'array',
      items: { $ref: '#/$defs/reviewerDisagreement' },
    },
    aiComparator: { $ref: '#/$defs/aiComparator' },
    modelDisagreements: {
      type: 'array',
      items: { $ref: '#/$defs/modelDisagreement' },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  $defs: {
    constraint: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'status', 'sourceText', 'rationale'],
      properties: {
        key: {
          enum: [
            'work_authorization', 'location', 'language', 'employment_type',
            'working_hours', 'start_date', 'certification', 'dealbreaker',
          ],
        },
        status: { enum: ['match', 'known_mismatch', 'unknown', 'not_applicable'] },
        sourceText: { type: 'string' },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    requirement: {
      type: 'object',
      additionalProperties: false,
      required: [
        'requirementId', 'text', 'priority', 'candidateEvidencePaths',
        'judgment', 'rationale',
      ],
      properties: {
        requirementId: { type: 'string', minLength: 1 },
        text: { type: 'string', minLength: 1 },
        priority: { enum: ['required', 'preferred'] },
        candidateEvidencePaths: {
          type: 'array',
          uniqueItems: true,
          items: { type: 'string', minLength: 1 },
        },
        judgment: { enum: ['met', 'partial', 'missing', 'unknown'] },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    job: {
      type: 'object',
      additionalProperties: false,
      required: [
        'jobId', 'finalRelevanceLabel', 'knownHardMismatch',
        'severeSeniorityMismatch', 'finalConstraints', 'finalRequirements',
        'rationale',
      ],
      properties: {
        jobId: { type: 'string', minLength: 1 },
        finalRelevanceLabel: { type: 'integer', minimum: 0, maximum: 3 },
        knownHardMismatch: { type: 'boolean' },
        severeSeniorityMismatch: { type: 'boolean' },
        finalConstraints: {
          type: 'array',
          minItems: 8,
          maxItems: 8,
          items: { $ref: '#/$defs/constraint' },
        },
        finalRequirements: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/requirement' },
        },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    pair: {
      type: 'object',
      additionalProperties: false,
      required: ['pairId', 'preference', 'rationale'],
      properties: {
        pairId: { type: 'string', minLength: 1 },
        preference: { type: 'string', minLength: 1 },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    scenario: {
      type: 'object',
      additionalProperties: false,
      required: ['scenarioId', 'jobs', 'pairs'],
      properties: {
        scenarioId: { type: 'string', minLength: 1 },
        jobs: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/job' },
        },
        pairs: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/pair' },
        },
      },
    },
    reviewerDisagreement: {
      type: 'object',
      additionalProperties: false,
      required: [
        'scenarioId', 'subjectType', 'subjectId', 'category', 'resolution',
      ],
      properties: {
        scenarioId: { type: 'string', minLength: 1 },
        subjectType: {
          enum: [
            'job_label', 'hard_constraint', 'requirement', 'seniority',
            'pairwise',
          ],
        },
        subjectId: { type: 'string', minLength: 1 },
        category: {
          enum: [
            'label_error', 'extraction_error', 'feature_error',
            'calibration_error', 'genuine_ambiguity',
          ],
        },
        resolution: { type: 'string', minLength: 1 },
      },
    },
    comparatorRanking: {
      type: 'object',
      additionalProperties: false,
      required: ['scenarioId', 'ranks'],
      properties: {
        scenarioId: { type: 'string', minLength: 1 },
        ranks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['jobId', 'rank'],
            properties: {
              jobId: { type: 'string', minLength: 1 },
              rank: { type: 'integer', minimum: 1 },
            },
          },
        },
      },
    },
    aiComparator: {
      type: 'object',
      additionalProperties: false,
      required: ['used', 'largeRankGap', 'rankings'],
      properties: {
        used: { type: 'boolean' },
        modelVersion: { type: 'string', minLength: 1 },
        largeRankGap: { type: 'integer', minimum: 1 },
        rankings: {
          type: 'array',
          items: { $ref: '#/$defs/comparatorRanking' },
        },
      },
    },
    modelDisagreement: {
      type: 'object',
      additionalProperties: false,
      required: [
        'scenarioId', 'jobId', 'deterministicRank', 'comparatorRank',
        'category', 'resolution',
      ],
      properties: {
        scenarioId: { type: 'string', minLength: 1 },
        jobId: { type: 'string', minLength: 1 },
        deterministicRank: { type: 'integer', minimum: 1 },
        comparatorRank: { type: 'integer', minimum: 1 },
        category: {
          enum: [
            'label_error', 'extraction_error', 'feature_error',
            'calibration_error', 'genuine_ambiguity',
          ],
        },
        resolution: { type: 'string', minLength: 1 },
      },
    },
  },
} as const

export const HUMAN_REVIEW_PROTOCOL = [
  'Freeze anonymized candidate profiles and exact job snapshots before review; record SHA-256 for each.',
  'Keep the final held-out corpus and its near-duplicates out of training and calibration.',
  'Use six or more job families, English and German postings, three or more candidate seniority bands, and at least 50 jobs per scenario.',
  'Give two professionally bilingual human reviewers separate copies with model scores and model order removed.',
  'Each reviewer labels every job independently from 0 (irrelevant) to 3 (strong), annotates constraints, requirements, evidence links, and severe seniority mismatches.',
  'Each reviewer judges every selected top-region pair; unknown facts stay unknown and are never converted to mismatch merely because evidence is absent.',
  'Only after both files are locked may a human adjudicator see both; every disagreement must be resolved and categorized.',
  'AI may identify suspicious cases, but AI output never becomes a reviewer, adjudicator, or gold label.',
  'If an AI comparator is used, every absolute rank gap at or above the frozen threshold must receive one of the five documented categories.',
  'Run the release gate on the locked four-file bundle. Synthetic and test fixtures can exercise code but can never produce release evidence.',
] as const

export const RANKING_ELIGIBILITY_KEYS = [
  'work_authorization',
  'location',
  'language',
  'employment_type',
  'working_hours',
  'start_date',
  'certification',
  'dealbreaker',
] as const satisfies readonly RankingEligibilityKey[]

const RANKING_ELIGIBILITY_STATUSES = new Set<RankingEligibilityStatus>([
  'match',
  'known_mismatch',
  'unknown',
  'not_applicable',
])
const REQUIREMENT_PRIORITIES = new Set(['required', 'preferred'])
const REQUIREMENT_JUDGMENTS = new Set(['met', 'partial', 'missing', 'unknown'])
const DISAGREEMENT_CATEGORIES = new Set<DisagreementCategory>([
  'label_error',
  'extraction_error',
  'feature_error',
  'calibration_error',
  'genuine_ambiguity',
])
const DISAGREEMENT_SUBJECT_TYPES = new Set<ReviewerDisagreement['subjectType']>([
  'job_label',
  'hard_constraint',
  'requirement',
  'seniority',
  'pairwise',
])

export function canonicalJson(value: unknown): string {
  if (value === undefined) return '"[undefined]"'
  if (typeof value === 'bigint') return JSON.stringify(`[bigint:${value.toString()}]`)
  if (typeof value === 'symbol' || typeof value === 'function') {
    return JSON.stringify(`[${typeof value}]`)
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

export function sha256Of(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function validateHumanReviewJsonSchemas(bundle: unknown): string[] {
  const issues: string[] = []
  if (!isRecord(bundle)) {
    return ['bundle schema: must be object']
  }
  const allowed = new Set(['corpus', 'reviewers', 'adjudication'])
  for (const key of Object.keys(bundle)) {
    if (!allowed.has(key)) {
      issues.push(`bundle schema/${key}: additional property is not allowed`)
    }
  }
  validateSchemaNode(
    HUMAN_CORPUS_JSON_SCHEMA,
    bundle.corpus,
    HUMAN_CORPUS_JSON_SCHEMA,
    'corpus schema',
    issues,
  )
  if (!Array.isArray(bundle.reviewers) || bundle.reviewers.length !== 2) {
    issues.push('reviewers schema: exactly two reviewer submissions are required')
  } else {
    bundle.reviewers.forEach((reviewer, index) => validateSchemaNode(
      REVIEWER_SUBMISSION_JSON_SCHEMA,
      reviewer,
      REVIEWER_SUBMISSION_JSON_SCHEMA,
      `reviewer ${index + 1} schema`,
      issues,
    ))
  }
  validateSchemaNode(
    ADJUDICATION_JSON_SCHEMA,
    bundle.adjudication,
    ADJUDICATION_JSON_SCHEMA,
    'adjudication schema',
    issues,
  )
  return [...new Set(issues)]
}

export function validateHumanReviewBundle(
  bundle: unknown,
  releaseMode = true,
): string[] {
  const issues = validateHumanReviewJsonSchemas(bundle)
  if (issues.length) return issues
  const { corpus, reviewers, adjudication } = bundle as HumanReviewBundle
  if (corpus.schemaVersion !== 1) issues.push('corpus.schemaVersion must be 1')
  if (!corpus.corpusId.trim()) issues.push('corpus.corpusId is required')
  if (!validIso(corpus.frozenAt)) issues.push('corpus.frozenAt must be ISO 8601')
  if (!validIso(corpus.asOf)) issues.push('corpus.asOf must be ISO 8601')
  if (corpus.split !== 'final_held_out') issues.push('corpus split must be final_held_out')
  if (!corpus.heldOutFromTrainingAndCalibration) {
    issues.push('corpus must be held out from training and calibration')
  }
  if (corpus.containsPersonalData) {
    issues.push('release corpus must be anonymized and contain no personal data')
  }
  if (corpus.baselineCommit !== BASELINE_V255_COMMIT) {
    issues.push(`baselineCommit must be ${BASELINE_V255_COMMIT}`)
  }
  if (corpus.baselineVersion !== BASELINE_V255_VERSION) {
    issues.push(`baselineVersion must be ${BASELINE_V255_VERSION}`)
  }
  if (releaseMode && corpus.evidenceKind !== 'human_release') {
    issues.push(
      `release gate refuses corpus evidenceKind=${corpus.evidenceKind}; human_release is required`,
    )
  }
  if (corpus.scenarios.length < 6) issues.push('release corpus requires at least six scenarios')
  const families = new Set(corpus.scenarios.map((scenario) => scenario.jobFamily))
  if (families.size < 6) issues.push('release corpus requires at least six job families')
  const languages = new Set(corpus.scenarios.map((scenario) => scenario.language))
  if (!languages.has('en') || !languages.has('de')) {
    issues.push('release corpus must cover English and German postings')
  }
  if (new Set(corpus.scenarios.map((scenario) => scenario.candidateSeniority)).size < 3) {
    issues.push('release corpus requires at least three candidate seniority bands')
  }

  const scenarioIds = new Set<string>()
  for (const scenario of corpus.scenarios) {
    const path = `scenario ${scenario.scenarioId || '<missing>'}`
    if (!scenario.scenarioId.trim()) issues.push('every scenario needs an id')
    if (scenarioIds.has(scenario.scenarioId)) issues.push(`duplicate ${path}`)
    scenarioIds.add(scenario.scenarioId)
    if (!scenario.jobFamily.trim()) issues.push(`${path}: jobFamily is required`)
    if (scenario.jobs.length < 50) issues.push(`${path}: at least 50 jobs are required`)
    if (!scenario.pairs.length) issues.push(`${path}: at least one pair is required`)
    if (scenario.candidateProfileSha256 !== sha256Of(scenario.profile)) {
      issues.push(`${path}: candidateProfileSha256 does not match the frozen profile`)
    }
    // Preferences drive both the frozen baseline and ranking v2, so leaving
    // them outside the frozen hashes would let the single largest lever on the
    // improvement gate be edited after the corpus was declared frozen.
    if (scenario.preferencesSha256 !== sha256Of(scenario.preferences)) {
      issues.push(`${path}: preferencesSha256 does not match the frozen preferences`)
    }
    const jobIds = new Set<string>()
    const snapshotIds = new Set<string>()
    for (const frozen of scenario.jobs) {
      const jobId = frozen.job.id
      if (!jobId.trim()) issues.push(`${path}: every job needs an id`)
      if (jobIds.has(jobId)) issues.push(`${path}: duplicate job id ${jobId}`)
      if (snapshotIds.has(frozen.snapshotId)) {
        issues.push(`${path}: duplicate snapshot id ${frozen.snapshotId}`)
      }
      jobIds.add(jobId)
      snapshotIds.add(frozen.snapshotId)
      if (frozen.snapshotSha256 !== sha256Of(frozen.job)) {
        issues.push(`${path}/${jobId}: snapshotSha256 does not match the frozen job`)
      }
      if (frozen.requirementInventorySha256 !== sha256Of(frozen.requirementInventory)) {
        issues.push(`${path}/${jobId}: requirementInventorySha256 does not match`)
      }
      if (!frozen.requirementInventory.length) {
        issues.push(`${path}/${jobId}: at least one frozen posting requirement is required`)
      }
      const requirementIds = new Set<string>()
      for (const requirement of frozen.requirementInventory) {
        if (!requirement.requirementId.trim()) {
          issues.push(`${path}/${jobId}: every frozen requirement needs an id`)
        }
        if (requirementIds.has(requirement.requirementId)) {
          issues.push(`${path}/${jobId}: duplicate frozen requirement ${requirement.requirementId}`)
        }
        requirementIds.add(requirement.requirementId)
        if (!requirement.text.trim() || !requirement.sourceText.trim()) {
          issues.push(`${path}/${jobId}: every frozen requirement needs text and sourceText`)
        }
        const postingText = normalizeKey(`${frozen.job.title} ${frozen.job.description}`)
        if (!postingText.includes(normalizeKey(requirement.sourceText))) {
          issues.push(
            `${path}/${jobId}: requirement ${requirement.requirementId} sourceText is not in the frozen posting`,
          )
        }
      }
    }
    const pairIds = new Set<string>()
    for (const pair of scenario.pairs) {
      if (pairIds.has(pair.pairId)) issues.push(`${path}: duplicate pair id ${pair.pairId}`)
      pairIds.add(pair.pairId)
      if (!jobIds.has(pair.leftJobId) || !jobIds.has(pair.rightJobId)) {
        issues.push(`${path}/${pair.pairId}: pair references an unknown job`)
      }
      if (pair.leftJobId === pair.rightJobId) {
        issues.push(`${path}/${pair.pairId}: pair cannot compare a job with itself`)
      }
      if (!pair.selectionReason.trim()) {
        issues.push(`${path}/${pair.pairId}: selectionReason is required`)
      }
    }
  }

  if (reviewers[0].reviewerId === reviewers[1].reviewerId) {
    issues.push('the two reviewers must be distinct people')
  }
  // Two independent reviewers never produce byte-identical judgments across a
  // whole corpus. An identical submission is a copied file, not a second
  // opinion, and it would make every agreement metric meaningless.
  const comparableSubmission = (reviewer: RankingReviewerSubmission) => JSON.stringify({
    ...reviewer,
    reviewerId: '',
    completedAt: '',
  })
  if (comparableSubmission(reviewers[0]) === comparableSubmission(reviewers[1])) {
    issues.push(
      'the two reviewer files are identical apart from their id; independent review is required',
    )
  }
  for (const reviewer of reviewers) {
    const prefix = `reviewer ${reviewer.reviewerId || '<missing>'}`
    if (reviewer.schemaVersion !== 1) issues.push(`${prefix}: schemaVersion must be 1`)
    if (reviewer.corpusId !== corpus.corpusId) issues.push(`${prefix}: corpusId mismatch`)
    if (releaseMode && reviewer.evidenceKind !== 'human_release') {
      issues.push(`${prefix}: release evidenceKind must be human_release`)
    }
    if (releaseMode && !reviewer.isHuman) issues.push(`${prefix}: a human reviewer is required`)
    if (!validIso(reviewer.completedAt)) issues.push(`${prefix}: completedAt must be ISO 8601`)
    if (
      reviewer.languageCompetence.en !== 'professional' ||
      reviewer.languageCompetence.de !== 'professional'
    ) issues.push(`${prefix}: professional English and German competence is required`)
    if (!Object.values(reviewer.independence).every((value) => value === true)) {
      issues.push(`${prefix}: every blind-review independence confirmation must be true`)
    }
    validateReviewerCompleteness(corpus, reviewer, issues)
  }

  if (adjudication.schemaVersion !== 1) {
    issues.push('adjudication.schemaVersion must be 1')
  }
  if (adjudication.corpusId !== corpus.corpusId) issues.push('adjudication corpusId mismatch')
  if (releaseMode && adjudication.evidenceKind !== 'human_release') {
    issues.push('adjudication release evidenceKind must be human_release')
  }
  if (releaseMode && !adjudication.adjudicatorIsHuman) {
    issues.push('a human adjudicator is required')
  }
  if (!validIso(adjudication.completedAt)) {
    issues.push('adjudication.completedAt must be ISO 8601')
  }
  if (
    new Set(adjudication.reviewerIds).size !== 2 ||
    !reviewers.every((reviewer) => adjudication.reviewerIds.includes(reviewer.reviewerId))
  ) issues.push('adjudication.reviewerIds must name exactly the two submitted reviewers')
  validateAdjudicationCompleteness(corpus, reviewers, adjudication, issues)
  return [...new Set(issues)]
}

function validateReviewerCompleteness(
  corpus: RankingHumanCorpus,
  reviewer: RankingReviewerSubmission,
  issues: string[],
): void {
  const byScenario = uniqueMap(
    reviewer.scenarios,
    (submission) => submission.scenarioId,
    `reviewer ${reviewer.reviewerId} scenario`,
    issues,
  )
  const expectedScenarioIds = new Set(corpus.scenarios.map((scenario) => scenario.scenarioId))
  for (const scenarioId of byScenario.keys()) {
    if (!expectedScenarioIds.has(scenarioId)) {
      issues.push(`reviewer ${reviewer.reviewerId}: unexpected scenario ${scenarioId}`)
    }
  }
  for (const scenario of corpus.scenarios) {
    const submitted = byScenario.get(scenario.scenarioId)
    if (!submitted) {
      issues.push(`reviewer ${reviewer.reviewerId}: missing scenario ${scenario.scenarioId}`)
      continue
    }
    const jobById = uniqueMap(
      submitted.jobs,
      (job) => job.jobId,
      `reviewer ${reviewer.reviewerId}/${scenario.scenarioId} job`,
      issues,
    )
    const expectedJobIds = new Set(scenario.jobs.map((entry) => entry.job.id))
    for (const jobId of jobById.keys()) {
      if (!expectedJobIds.has(jobId)) {
        issues.push(`reviewer ${reviewer.reviewerId}/${scenario.scenarioId}: unexpected job ${jobId}`)
      }
    }
    for (const frozen of scenario.jobs) {
      const judgment = jobById.get(frozen.job.id)
      const prefix = `reviewer ${reviewer.reviewerId}/${scenario.scenarioId}/${frozen.job.id}`
      if (!judgment) {
        issues.push(`${prefix}: judgment is missing`)
        continue
      }
      if (!integerLabel(judgment.relevanceLabel)) {
        issues.push(`${prefix}: relevanceLabel must be an integer from 0 to 3`)
      }
      if (!judgment.rationale.trim()) issues.push(`${prefix}: rationale is required`)
      validateConstraintCoverage(judgment.constraints, frozen.job, prefix, issues)
      if (
        judgment.knownHardMismatch !==
        judgment.constraints.some((constraint) => constraint.status === 'known_mismatch')
      ) issues.push(`${prefix}: knownHardMismatch must agree with constraint annotations`)
      validateRequirementCoverage(
        frozen.requirementInventory,
        judgment.requirements,
        scenario.profile,
        prefix,
        issues,
      )
    }
    const pairById = uniqueMap(
      submitted.pairs,
      (pair) => pair.pairId,
      `reviewer ${reviewer.reviewerId}/${scenario.scenarioId} pair`,
      issues,
    )
    const expectedPairIds = new Set(scenario.pairs.map((pair) => pair.pairId))
    for (const pairId of pairById.keys()) {
      if (!expectedPairIds.has(pairId)) {
        issues.push(`reviewer ${reviewer.reviewerId}/${scenario.scenarioId}: unexpected pair ${pairId}`)
      }
    }
    for (const pair of scenario.pairs) {
      const judgment = pairById.get(pair.pairId)
      const prefix = `reviewer ${reviewer.reviewerId}/${scenario.scenarioId}/${pair.pairId}`
      if (!judgment) {
        issues.push(`${prefix}: pair judgment is missing`)
        continue
      }
      if (
        judgment.preference !== pair.leftJobId &&
        judgment.preference !== pair.rightJobId &&
        judgment.preference !== 'tie' &&
        judgment.preference !== 'cannot_judge'
      ) issues.push(`${prefix}: preference must be one of the pair's jobs, tie, or cannot_judge`)
      if (!judgment.rationale.trim()) issues.push(`${prefix}: rationale is required`)
    }
  }
}

function validateAdjudicationCompleteness(
  corpus: RankingHumanCorpus,
  reviewers: [RankingReviewerSubmission, RankingReviewerSubmission],
  adjudication: RankingAdjudication,
  issues: string[],
): void {
  const adjudicatedByScenario = uniqueMap(
    adjudication.scenarios,
    (scenario) => scenario.scenarioId,
    'adjudication scenario',
    issues,
  )
  const expectedScenarioIds = new Set(corpus.scenarios.map((scenario) => scenario.scenarioId))
  for (const scenarioId of adjudicatedByScenario.keys()) {
    if (!expectedScenarioIds.has(scenarioId)) {
      issues.push(`adjudication: unexpected scenario ${scenarioId}`)
    }
  }
  const reviewerMaps = reviewers.map((reviewer) =>
    new Map(reviewer.scenarios.map((scenario) => [scenario.scenarioId, scenario])))
  const expectedDisagreements = new Set<string>()

  for (const scenario of corpus.scenarios) {
    const final = adjudicatedByScenario.get(scenario.scenarioId)
    if (!final) {
      issues.push(`adjudication: missing scenario ${scenario.scenarioId}`)
      continue
    }
    const finalJobs = uniqueMap(
      final.jobs,
      (job) => job.jobId,
      `adjudication/${scenario.scenarioId} job`,
      issues,
    )
    const expectedJobIds = new Set(scenario.jobs.map((entry) => entry.job.id))
    for (const jobId of finalJobs.keys()) {
      if (!expectedJobIds.has(jobId)) {
        issues.push(`adjudication/${scenario.scenarioId}: unexpected job ${jobId}`)
      }
    }
    const reviewerJobMaps = reviewerMaps.map((map) =>
      new Map((map.get(scenario.scenarioId)?.jobs ?? []).map((job) => [job.jobId, job])))
    for (const frozen of scenario.jobs) {
      const jobId = frozen.job.id
      const judged = finalJobs.get(jobId)
      const prefix = `adjudication/${scenario.scenarioId}/${jobId}`
      if (!judged) {
        issues.push(`${prefix}: final job judgment is missing`)
        continue
      }
      if (!integerLabel(judged.finalRelevanceLabel)) {
        issues.push(`${prefix}: finalRelevanceLabel must be an integer from 0 to 3`)
      }
      if (!judged.rationale.trim()) issues.push(`${prefix}: rationale is required`)
      validateConstraintCoverage(
        judged.finalConstraints,
        frozen.job,
        `${prefix}/final`,
        issues,
      )
      validateRequirementCoverage(
        frozen.requirementInventory,
        judged.finalRequirements,
        scenario.profile,
        `${prefix}/final`,
        issues,
      )
      if (
        judged.knownHardMismatch !==
        judged.finalConstraints.some((constraint) => constraint.status === 'known_mismatch')
      ) issues.push(`${prefix}: knownHardMismatch must agree with finalConstraints`)
      const [left, right] = reviewerJobMaps.map((map) => map.get(jobId))
      if (left && right) {
        if (left.relevanceLabel !== right.relevanceLabel) {
          expectedDisagreements.add(disagreementKey(
            scenario.scenarioId, 'job_label', jobId,
          ))
        } else if (judged.finalRelevanceLabel !== left.relevanceLabel) {
          issues.push(`${prefix}: final relevance label must preserve reviewer consensus`)
        }
        const leftConstraints = new Map(left.constraints.map((entry) => [entry.key, entry]))
        const rightConstraints = new Map(right.constraints.map((entry) => [entry.key, entry]))
        const finalConstraints = new Map(
          judged.finalConstraints.map((entry) => [entry.key, entry]),
        )
        for (const key of RANKING_ELIGIBILITY_KEYS) {
          const leftConstraint = leftConstraints.get(key)
          const rightConstraint = rightConstraints.get(key)
          const finalConstraint = finalConstraints.get(key)
          if (constraintDecisionKey(leftConstraint) !== constraintDecisionKey(rightConstraint)) {
            expectedDisagreements.add(disagreementKey(
              scenario.scenarioId, 'hard_constraint', `${jobId}:${key}`,
            ))
          } else if (
            constraintDecisionKey(finalConstraint) !== constraintDecisionKey(leftConstraint)
          ) {
            issues.push(`${prefix}: final constraint ${key} must preserve reviewer consensus`)
          }
        }
        const leftRequirements = new Map(
          left.requirements.map((entry) => [entry.requirementId, entry]),
        )
        const rightRequirements = new Map(
          right.requirements.map((entry) => [entry.requirementId, entry]),
        )
        const finalRequirements = new Map(
          judged.finalRequirements.map((entry) => [entry.requirementId, entry]),
        )
        for (const requirement of frozen.requirementInventory) {
          const leftRequirement = leftRequirements.get(requirement.requirementId)
          const rightRequirement = rightRequirements.get(requirement.requirementId)
          const finalRequirement = finalRequirements.get(requirement.requirementId)
          if (
            leftRequirement &&
            rightRequirement &&
            requirementDecisionKey(leftRequirement) !== requirementDecisionKey(rightRequirement)
          ) {
            expectedDisagreements.add(disagreementKey(
              scenario.scenarioId,
              'requirement',
              `${jobId}:${requirement.requirementId}`,
            ))
          } else if (
            leftRequirement &&
            finalRequirement &&
            requirementDecisionKey(finalRequirement) !== requirementDecisionKey(leftRequirement)
          ) {
            issues.push(
              `${prefix}: final requirement ${requirement.requirementId} must preserve reviewer consensus`,
            )
          }
        }
        if (left.severeSeniorityMismatch !== right.severeSeniorityMismatch) {
          expectedDisagreements.add(disagreementKey(
            scenario.scenarioId, 'seniority', jobId,
          ))
        } else if (judged.severeSeniorityMismatch !== left.severeSeniorityMismatch) {
          issues.push(`${prefix}: final seniority judgment must preserve reviewer consensus`)
        }
      }
    }
    const finalPairs = uniqueMap(
      final.pairs,
      (pair) => pair.pairId,
      `adjudication/${scenario.scenarioId} pair`,
      issues,
    )
    const expectedPairIds = new Set(scenario.pairs.map((pair) => pair.pairId))
    for (const pairId of finalPairs.keys()) {
      if (!expectedPairIds.has(pairId)) {
        issues.push(`adjudication/${scenario.scenarioId}: unexpected pair ${pairId}`)
      }
    }
    const reviewerPairMaps = reviewerMaps.map((map) =>
      new Map((map.get(scenario.scenarioId)?.pairs ?? []).map((pair) => [pair.pairId, pair])))
    for (const pair of scenario.pairs) {
      const judged = finalPairs.get(pair.pairId)
      const prefix = `adjudication/${scenario.scenarioId}/${pair.pairId}`
      if (!judged) {
        issues.push(`${prefix}: final pair judgment is missing`)
        continue
      }
      if (
        judged.preference !== pair.leftJobId &&
        judged.preference !== pair.rightJobId &&
        judged.preference !== 'tie' &&
        judged.preference !== 'cannot_judge'
      ) issues.push(`${prefix}: invalid final pair preference`)
      if (!judged.rationale.trim()) issues.push(`${prefix}: rationale is required`)
      const [left, right] = reviewerPairMaps.map((map) => map.get(pair.pairId))
      if (left && right && left.preference !== right.preference) {
        expectedDisagreements.add(disagreementKey(
          scenario.scenarioId, 'pairwise', pair.pairId,
        ))
      } else if (left && right && judged.preference !== left.preference) {
        issues.push(`${prefix}: final pair preference must preserve reviewer consensus`)
      }
    }
  }

  const suppliedDisagreements = new Set<string>()
  for (const disagreement of adjudication.reviewerDisagreements) {
    const key = disagreementKey(
      disagreement.scenarioId,
      disagreement.subjectType,
      disagreement.subjectId,
    )
    if (suppliedDisagreements.has(key)) issues.push(`duplicate reviewer disagreement ${key}`)
    suppliedDisagreements.add(key)
    if (!DISAGREEMENT_SUBJECT_TYPES.has(disagreement.subjectType)) {
      issues.push(`reviewer disagreement ${key} has an invalid subjectType`)
    }
    if (!expectedDisagreements.has(key)) {
      issues.push(`reviewer disagreement ${key} has no corresponding reviewer conflict`)
    }
    if (!disagreement.resolution.trim()) {
      issues.push(`reviewer disagreement ${key} needs a resolution`)
    }
    if (!DISAGREEMENT_CATEGORIES.has(disagreement.category)) {
      issues.push(`reviewer disagreement ${key} has an invalid category`)
    }
  }
  for (const key of expectedDisagreements) {
    if (!suppliedDisagreements.has(key)) {
      issues.push(`unresolved reviewer disagreement ${key}`)
    }
  }

  validateAiDisagreements(corpus, adjudication, issues)
}

function validateConstraintCoverage(
  constraints: ReviewerConstraintJudgment[],
  frozenJob: NormalizedJob,
  prefix: string,
  issues: string[],
): void {
  const byKey = uniqueMap(
    constraints,
    (constraint) => constraint.key,
    `${prefix} constraint`,
    issues,
  )
  for (const key of RANKING_ELIGIBILITY_KEYS) {
    const constraint = byKey.get(key)
    if (!constraint) {
      issues.push(`${prefix}: missing constraint ${key}`)
      continue
    }
    if (!RANKING_ELIGIBILITY_STATUSES.has(constraint.status)) {
      issues.push(`${prefix}: constraint ${key} has an invalid status`)
    }
    if (!constraint.rationale.trim()) {
      issues.push(`${prefix}: constraint ${key} needs a rationale`)
    }
    if (constraint.status === 'known_mismatch' && !constraint.sourceText.trim()) {
      issues.push(`${prefix}: known mismatch ${key} needs posting source text`)
    }
    if (
      constraint.sourceText.trim() &&
      !normalizeKey(`${frozenJob.title} ${frozenJob.description}`).includes(
        normalizeKey(constraint.sourceText),
      )
    ) {
      issues.push(`${prefix}: constraint ${key} sourceText is not in the frozen posting`)
    }
  }
  for (const key of byKey.keys()) {
    if (!(RANKING_ELIGIBILITY_KEYS as readonly string[]).includes(key)) {
      issues.push(`${prefix}: unexpected constraint ${key}`)
    }
  }
}

function validateRequirementCoverage(
  inventory: RankingCorpusRequirement[],
  judgments: ReviewerRequirementJudgment[],
  profile: Profile,
  prefix: string,
  issues: string[],
): void {
  const byId = uniqueMap(
    judgments,
    (requirement) => requirement.requirementId,
    `${prefix} requirement`,
    issues,
  )
  const inventoryById = new Map(inventory.map((entry) => [entry.requirementId, entry]))
  for (const frozen of inventory) {
    const requirement = byId.get(frozen.requirementId)
    if (!requirement) {
      issues.push(`${prefix}: missing requirement ${frozen.requirementId}`)
      continue
    }
    if (requirement.text !== frozen.text) {
      issues.push(`${prefix}: requirement ${frozen.requirementId} text differs from the frozen inventory`)
    }
    if (!requirement.rationale.trim()) {
      issues.push(`${prefix}: requirement ${frozen.requirementId} needs a rationale`)
    }
    if (!REQUIREMENT_PRIORITIES.has(requirement.priority)) {
      issues.push(`${prefix}: requirement ${frozen.requirementId} has an invalid priority`)
    }
    if (!REQUIREMENT_JUDGMENTS.has(requirement.judgment)) {
      issues.push(`${prefix}: requirement ${frozen.requirementId} has an invalid judgment`)
    }
    const evidence = requirement.candidateEvidencePaths
    if (new Set(evidence).size !== evidence.length || evidence.some((path) => !path.trim())) {
      issues.push(`${prefix}: requirement ${frozen.requirementId} has invalid evidence paths`)
    }
    if (
      (requirement.judgment === 'met' || requirement.judgment === 'partial') &&
      !evidence.length
    ) {
      issues.push(`${prefix}: met/partial requirement ${frozen.requirementId} needs evidence`)
    }
    if (
      (requirement.judgment === 'missing' || requirement.judgment === 'unknown') &&
      evidence.length
    ) {
      issues.push(`${prefix}: missing/unknown requirement ${frozen.requirementId} cannot claim evidence`)
    }
    for (const path of evidence) {
      if (!resolveProfileEvidencePath(profile, path)) {
        issues.push(`${prefix}: requirement ${frozen.requirementId} has unresolved evidence path ${path}`)
      }
    }
  }
  for (const id of byId.keys()) {
    if (!inventoryById.has(id)) issues.push(`${prefix}: unexpected requirement ${id}`)
  }
}

function constraintDecisionKey(
  constraint: ReviewerConstraintJudgment | undefined,
): string {
  return JSON.stringify([
    constraint?.status ?? null,
    typeof constraint?.sourceText === 'string' ? constraint.sourceText.trim() : null,
  ])
}

function resolveProfileEvidencePath(profile: Profile, path: string): boolean {
  if (!/^(?:summary|titles|skills|domains|totalYears|education|languages|certifications)(?:\.(?:[A-Za-z][A-Za-z0-9_]*|\d+))*$/.test(path)) {
    return false
  }
  let value: unknown = profile
  for (const segment of path.split('.')) {
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(segment)) return false
      value = value[Number(segment)]
    } else if (value && typeof value === 'object' && Object.hasOwn(value, segment)) {
      value = (value as Record<string, unknown>)[segment]
    } else {
      return false
    }
  }
  return (
    (typeof value === 'string' && value.trim().length > 0) ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'boolean'
  )
}

function requirementDecisionKey(requirement: ReviewerRequirementJudgment): string {
  return JSON.stringify([
    requirement.priority,
    requirement.judgment,
    [...requirement.candidateEvidencePaths].sort(),
  ])
}

function validateAiDisagreements(
  corpus: RankingHumanCorpus,
  adjudication: RankingAdjudication,
  issues: string[],
): void {
  const audit = adjudication.aiComparator
  if (!Number.isInteger(audit.largeRankGap) || audit.largeRankGap < 1) {
    issues.push('aiComparator.largeRankGap must be a positive integer')
  }
  if (!audit.used) {
    if (audit.rankings.length || adjudication.modelDisagreements.length) {
      issues.push('AI comparator marked unused but rankings/disagreements were supplied')
    }
    return
  }
  if (!audit.modelVersion?.trim()) issues.push('used AI comparator needs modelVersion')
  const scenarioJobs = new Map(corpus.scenarios.map((scenario) => [
    scenario.scenarioId,
    new Set(scenario.jobs.map((entry) => entry.job.id)),
  ]))
  const seenRanks = new Set<string>()
  const seenScenarios = new Set<string>()
  for (const ranking of audit.rankings) {
    if (seenScenarios.has(ranking.scenarioId)) {
      issues.push(`duplicate AI comparator scenario ${ranking.scenarioId}`)
    }
    seenScenarios.add(ranking.scenarioId)
    const jobs = scenarioJobs.get(ranking.scenarioId)
    if (!jobs) {
      issues.push(`AI comparator references unknown scenario ${ranking.scenarioId}`)
      continue
    }
    if (ranking.ranks.length !== jobs.size) {
      issues.push(`AI comparator ${ranking.scenarioId} must rank every frozen candidate exactly once`)
    }
    const suppliedJobIds = new Set(ranking.ranks.map((entry) => entry.jobId))
    for (const jobId of jobs) {
      if (!suppliedJobIds.has(jobId)) {
        issues.push(`AI comparator ${ranking.scenarioId} is missing job ${jobId}`)
      }
    }
    for (const entry of ranking.ranks) {
      const key = `${ranking.scenarioId}:${entry.jobId}`
      if (seenRanks.has(key)) issues.push(`duplicate AI comparator rank ${key}`)
      seenRanks.add(key)
      if (!jobs.has(entry.jobId)) {
        issues.push(`AI comparator references unknown job ${ranking.scenarioId}/${entry.jobId}`)
      }
      if (!Number.isInteger(entry.rank) || entry.rank < 1) {
        issues.push(`AI comparator rank ${key} must be a positive integer`)
      }
    }
    const ranks = [...new Set(ranking.ranks.map((entry) => entry.rank))]
      .sort((left, right) => left - right)
    if (
      ranks.length !== jobs.size ||
      ranks.some((rank, index) => rank !== index + 1)
    ) {
      issues.push(`AI comparator ${ranking.scenarioId} ranks must be the exact 1..N permutation`)
    }
  }
  for (const scenarioId of scenarioJobs.keys()) {
    if (!seenScenarios.has(scenarioId)) {
      issues.push(`AI comparator is missing scenario ${scenarioId}`)
    }
  }
  const seenDisagreements = new Set<string>()
  for (const disagreement of adjudication.modelDisagreements) {
    const key = `${disagreement.scenarioId}:${disagreement.jobId}`
    if (seenDisagreements.has(key)) issues.push(`duplicate model disagreement ${key}`)
    seenDisagreements.add(key)
    if (!seenRanks.has(key)) issues.push(`model disagreement ${key} has no comparator rank`)
    if (!disagreement.resolution.trim()) {
      issues.push(`model disagreement ${key} needs a human resolution`)
    }
    if (!DISAGREEMENT_CATEGORIES.has(disagreement.category)) {
      issues.push(`model disagreement ${key} has an invalid category`)
    }
  }
}

function disagreementKey(
  scenarioId: string,
  type: ReviewerDisagreement['subjectType'],
  subjectId: string,
): string {
  return `${scenarioId}:${type}:${subjectId}`
}

function validIso(value: string): boolean {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
}

function integerLabel(value: number): value is HumanRelevanceLabel {
  return Number.isInteger(value) && value >= 0 && value <= 3
}

function uniqueMap<T>(
  values: T[],
  keyOf: (value: T) => string,
  label: string,
  issues: string[],
): Map<string, T> {
  const map = new Map<string, T>()
  for (const value of values) {
    const key = keyOf(value)
    if (map.has(key)) issues.push(`duplicate ${label} ${key}`)
    map.set(key, value)
  }
  return map
}

/** Dependency-free validator for the JSON-Schema keywords used above. */
function validateSchemaNode(
  rawSchema: unknown,
  value: unknown,
  rootSchema: unknown,
  path: string,
  issues: string[],
): void {
  if (!isRecord(rawSchema)) return
  let schema = rawSchema
  if (typeof schema.$ref === 'string') {
    const resolved = resolveLocalRef(rootSchema, schema.$ref)
    if (!resolved) {
      issues.push(`${path}: unresolved schema reference ${schema.$ref}`)
      return
    }
    schema = resolved
  }
  if (hasOwn(schema, 'const') && !sameJson(value, schema.const)) {
    issues.push(`${path}: must equal ${JSON.stringify(schema.const)}`)
    return
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((candidate) => sameJson(value, candidate))
  ) {
    issues.push(`${path}: must be one of ${schema.enum.map(String).join(', ')}`)
    return
  }
  if (typeof schema.type === 'string' && !matchesType(value, schema.type)) {
    issues.push(`${path}: must be ${schema.type}`)
    return
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      issues.push(`${path}: must contain at least ${schema.minLength} character(s)`)
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
      issues.push(`${path}: does not match ${schema.pattern}`)
    }
    if (
      schema.format === 'date-time' &&
      (!value.trim() || !Number.isFinite(Date.parse(value)))
    ) issues.push(`${path}: must be an ISO 8601 date-time`)
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      issues.push(`${path}: must be >= ${schema.minimum}`)
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      issues.push(`${path}: must be <= ${schema.maximum}`)
    }
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      issues.push(`${path}: must contain at least ${schema.minItems} item(s)`)
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      issues.push(`${path}: must contain at most ${schema.maxItems} item(s)`)
    }
    if (schema.uniqueItems === true) {
      const serialized = value.map(canonicalJson)
      if (new Set(serialized).size !== serialized.length) {
        issues.push(`${path}: items must be unique`)
      }
    }
    if (schema.items) {
      value.forEach((entry, index) => validateSchemaNode(
        schema.items,
        entry,
        rootSchema,
        `${path}/${index}`,
        issues,
      ))
    }
  }
  if (isRecord(value)) {
    const required = Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === 'string')
      : []
    for (const key of required) {
      if (!hasOwn(value, key)) issues.push(`${path}/${key}: is required`)
    }
    const properties = isRecord(schema.properties) ? schema.properties : {}
    for (const [key, child] of Object.entries(properties)) {
      if (hasOwn(value, key)) {
        validateSchemaNode(child, value[key], rootSchema, `${path}/${key}`, issues)
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!hasOwn(properties, key)) {
          issues.push(`${path}/${key}: additional property is not allowed`)
        }
      }
    }
  }
}

function resolveLocalRef(root: unknown, ref: string): Record<string, unknown> | null {
  if (!ref.startsWith('#/')) return null
  let current: unknown = root
  for (const token of ref.slice(2).split('/')) {
    if (!isRecord(current)) return null
    current = current[token.replace(/~1/g, '/').replace(/~0/g, '~')]
  }
  return isRecord(current) ? current : null
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'object') return isRecord(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right)
}
