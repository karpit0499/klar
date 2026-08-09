import { createHash } from 'node:crypto'

export const MIN_SAMPLES_PER_KIND_LANGUAGE = 10

export type WritingEvidenceKind =
  | 'human_release'
  | 'synthetic_fixture'
  | 'test_fixture'
export type WritingKind = 'recruiter_message' | 'cover_letter'
export type WritingLanguage = 'en' | 'de'
export type ClaimSupport = 'supported' | 'unsupported' | 'unclear'
export type Sendability =
  | 'send_as_is'
  | 'light_edit'
  | 'major_edit'
  | 'do_not_send'
export type ReviewAnswer = 'yes' | 'no' | 'not_applicable'
export type WritingConflictCategory =
  | 'claim_boundary'
  | 'evidence_interpretation'
  | 'language_or_tone'
  | 'application_state'
  | 'edit_effort'
  | 'genuine_ambiguity'

export type WritingEvidence = {
  evidenceId: string
  source: 'candidate' | 'job_posting' | 'tracker' | 'user_instruction'
  text: string
  sourceSha256: string
}

export type InventoriedClaim = {
  claimId: string
  text: string
  proposedEvidenceIds: string[]
}

export type WritingEvaluationSample = {
  sampleId: string
  blindVariantId: string
  kind: WritingKind
  language: WritingLanguage
  sourceStatus: 'synthetic' | 'licensed' | 'anonymized_with_consent'
  personalDataRemoved: boolean
  outputText: string
  applicationState: 'not_applied' | 'applied' | 'referred' | 'not_applicable'
  channel: 'linkedin' | 'email' | 'other' | 'not_applicable'
  evidence: WritingEvidence[]
  claimInventory: InventoriedClaim[]
  sampleSha256: string
}

export type DatasetSeparationAudit = {
  evaluationExcludedFromTraining: boolean
  evaluationExcludedFromPromptExamples: boolean
  trainingDataUsedForThisRelease: boolean
  trainingManifestSha256?: string
  trainingContentSha256: string[]
  exactHashOverlapCount: number
  nearDuplicateCheck: {
    completed: boolean
    method: string
    threshold: string
    checkedAt: string
    unresolvedPairs: {
      evaluationSampleId: string
      trainingContentSha256: string
      similarity: number
    }[]
  }
}

export type WritingEvaluationCorpus = {
  schemaVersion: 1
  corpusId: string
  evidenceKind: WritingEvidenceKind
  split: 'final_held_out'
  frozenAt: string
  generatorIdentityWithheldFromReviewers: boolean
  variantMappingStoredSeparately: boolean
  datasetSeparation: DatasetSeparationAudit
  samples: WritingEvaluationSample[]
}

export type ClaimJudgment = {
  claimId: string
  support: ClaimSupport
  evidenceIds: string[]
  rationale: string
}

export type AdditionalClaimJudgment = {
  additionalClaimId: string
  text: string
  support: ClaimSupport
  evidenceIds: string[]
  rationale: string
}

export type WritingSampleReview = {
  sampleId: string
  sendability: Sendability | 'not_applicable'
  soundsHuman: ReviewAnswer
  reasonForWritingClear: ReviewAnswer
  requestFitsChannelAndState: ReviewAnswer
  germanFormalityAppropriate: ReviewAnswer
  inventoryComplete: boolean
  claims: ClaimJudgment[]
  additionalClaims: AdditionalClaimJudgment[]
  notes: string
}

export type WritingReviewerSubmission = {
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
    identityStoredSeparately: true
    blindToGeneratorAndVariantMapping: true
    blindToOtherReviewer: true
    noMachineGeneratedFinalRatings: true
    conflictOfInterestDeclared: true
  }
  reviews: WritingSampleReview[]
}

export type FinalClaimJudgment = {
  finalClaimId: string
  sourceClaimIds: string[]
  text: string
  support: ClaimSupport
  evidenceIds: string[]
  rationale: string
}

export type AdjudicatedWritingSample = {
  sampleId: string
  finalSendability: Sendability | 'not_applicable'
  soundsHuman: ReviewAnswer
  reasonForWritingClear: ReviewAnswer
  requestFitsChannelAndState: ReviewAnswer
  germanFormalityAppropriate: ReviewAnswer
  inventoryComplete: boolean
  finalClaims: FinalClaimJudgment[]
  rationale: string
}

export type WritingReviewConflict = {
  sampleId: string
  subject:
    | 'sendability'
    | 'sounds_human'
    | 'reason_clear'
    | 'request_fit'
    | 'german_formality'
    | 'inventory'
    | 'claim_support'
  subjectId: string
  category: WritingConflictCategory
  resolution: string
}

export type WritingAdjudication = {
  schemaVersion: 1
  evidenceKind: 'human_release' | 'test_fixture'
  corpusId: string
  adjudicatorId: string
  adjudicatorIsHuman: boolean
  completedAt: string
  reviewerIds: string[]
  blindToGeneratorAndVariantMapping: true
  samples: AdjudicatedWritingSample[]
  conflicts: WritingReviewConflict[]
  notes: string[]
}

export type WritingReviewBundle = {
  corpus: WritingEvaluationCorpus
  reviewers: WritingReviewerSubmission[]
  adjudication: WritingAdjudication
}

export const WRITING_CORPUS_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://klar.local/schemas/writing-corpus-v1.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion', 'corpusId', 'evidenceKind', 'split', 'frozenAt',
    'generatorIdentityWithheldFromReviewers', 'variantMappingStoredSeparately',
    'datasetSeparation', 'samples',
  ],
  properties: {
    schemaVersion: { const: 1 },
    corpusId: { type: 'string', minLength: 1 },
    evidenceKind: {
      enum: ['human_release', 'synthetic_fixture', 'test_fixture'],
    },
    split: { const: 'final_held_out' },
    frozenAt: { type: 'string', format: 'date-time' },
    generatorIdentityWithheldFromReviewers: { const: true },
    variantMappingStoredSeparately: { const: true },
    datasetSeparation: {
      type: 'object',
      additionalProperties: false,
      required: [
        'evaluationExcludedFromTraining', 'evaluationExcludedFromPromptExamples',
        'trainingDataUsedForThisRelease', 'trainingContentSha256',
        'exactHashOverlapCount', 'nearDuplicateCheck',
      ],
      properties: {
        evaluationExcludedFromTraining: { type: 'boolean' },
        evaluationExcludedFromPromptExamples: { type: 'boolean' },
        trainingDataUsedForThisRelease: { type: 'boolean' },
        trainingManifestSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        trainingContentSha256: {
          type: 'array',
          uniqueItems: true,
          items: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        },
        exactHashOverlapCount: { type: 'integer', minimum: 0 },
        nearDuplicateCheck: {
          type: 'object',
          additionalProperties: false,
          required: [
            'completed', 'method', 'threshold', 'checkedAt', 'unresolvedPairs',
          ],
          properties: {
            completed: { type: 'boolean' },
            method: { type: 'string' },
            threshold: { type: 'string' },
            checkedAt: { type: 'string', format: 'date-time' },
            unresolvedPairs: { type: 'array' },
          },
        },
      },
    },
    samples: {
      type: 'array',
      minItems: 40,
      items: { $ref: '#/$defs/sample' },
    },
  },
  $defs: {
    sample: {
      type: 'object',
      additionalProperties: false,
      required: [
        'sampleId', 'blindVariantId', 'kind', 'language', 'sourceStatus',
        'personalDataRemoved', 'outputText', 'applicationState', 'channel',
        'evidence', 'claimInventory', 'sampleSha256',
      ],
      properties: {
        sampleId: { type: 'string', pattern: '^sample_[0-9a-f]{12}$' },
        blindVariantId: { type: 'string', pattern: '^variant_[0-9a-f]{12}$' },
        kind: { enum: ['recruiter_message', 'cover_letter'] },
        language: { enum: ['en', 'de'] },
        sourceStatus: {
          enum: ['synthetic', 'licensed', 'anonymized_with_consent'],
        },
        personalDataRemoved: { const: true },
        outputText: { type: 'string', minLength: 1 },
        applicationState: {
          enum: ['not_applied', 'applied', 'referred', 'not_applicable'],
        },
        channel: { enum: ['linkedin', 'email', 'other', 'not_applicable'] },
        evidence: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['evidenceId', 'source', 'text', 'sourceSha256'],
            properties: {
              evidenceId: { type: 'string', minLength: 1 },
              source: {
                enum: ['candidate', 'job_posting', 'tracker', 'user_instruction'],
              },
              text: { type: 'string', minLength: 1 },
              sourceSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
            },
          },
        },
        claimInventory: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['claimId', 'text', 'proposedEvidenceIds'],
            properties: {
              claimId: { type: 'string', minLength: 1 },
              text: { type: 'string', minLength: 1 },
              proposedEvidenceIds: {
                type: 'array',
                items: { type: 'string', minLength: 1 },
              },
            },
          },
        },
        sampleSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      },
    },
  },
} as const

export const WRITING_REVIEWER_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://klar.local/schemas/writing-reviewer-v1.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion', 'evidenceKind', 'corpusId', 'reviewerId', 'isHuman',
    'completedAt', 'languageCompetence', 'independence', 'reviews',
  ],
  properties: {
    schemaVersion: { const: 1 },
    evidenceKind: { enum: ['human_release', 'test_fixture'] },
    corpusId: { type: 'string', minLength: 1 },
    reviewerId: { type: 'string', pattern: '^reviewer_[0-9a-f]{12}$' },
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
        'identityStoredSeparately', 'blindToGeneratorAndVariantMapping',
        'blindToOtherReviewer', 'noMachineGeneratedFinalRatings',
        'conflictOfInterestDeclared',
      ],
      properties: {
        identityStoredSeparately: { const: true },
        blindToGeneratorAndVariantMapping: { const: true },
        blindToOtherReviewer: { const: true },
        noMachineGeneratedFinalRatings: { const: true },
        conflictOfInterestDeclared: { const: true },
      },
    },
    reviews: {
      type: 'array',
      minItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'sampleId', 'sendability', 'soundsHuman', 'reasonForWritingClear',
          'requestFitsChannelAndState', 'germanFormalityAppropriate',
          'inventoryComplete', 'claims', 'additionalClaims', 'notes',
        ],
        properties: {
          sampleId: { type: 'string', pattern: '^sample_[0-9a-f]{12}$' },
          sendability: {
            enum: [
              'send_as_is', 'light_edit', 'major_edit', 'do_not_send',
              'not_applicable',
            ],
          },
          soundsHuman: { enum: ['yes', 'no', 'not_applicable'] },
          reasonForWritingClear: { enum: ['yes', 'no', 'not_applicable'] },
          requestFitsChannelAndState: { enum: ['yes', 'no', 'not_applicable'] },
          germanFormalityAppropriate: { enum: ['yes', 'no', 'not_applicable'] },
          inventoryComplete: { type: 'boolean' },
          claims: { type: 'array', items: { $ref: '#/$defs/claimJudgment' } },
          additionalClaims: {
            type: 'array',
            items: { $ref: '#/$defs/additionalClaim' },
          },
          notes: { type: 'string' },
        },
      },
    },
  },
  $defs: {
    claimJudgment: {
      type: 'object',
      additionalProperties: false,
      required: ['claimId', 'support', 'evidenceIds', 'rationale'],
      properties: {
        claimId: { type: 'string', minLength: 1 },
        support: { enum: ['supported', 'unsupported', 'unclear'] },
        evidenceIds: { type: 'array', items: { type: 'string', minLength: 1 } },
        rationale: { type: 'string', minLength: 1 },
      },
    },
    additionalClaim: {
      type: 'object',
      additionalProperties: false,
      required: [
        'additionalClaimId', 'text', 'support', 'evidenceIds', 'rationale',
      ],
      properties: {
        additionalClaimId: { type: 'string', minLength: 1 },
        text: { type: 'string', minLength: 1 },
        support: { enum: ['supported', 'unsupported', 'unclear'] },
        evidenceIds: { type: 'array', items: { type: 'string', minLength: 1 } },
        rationale: { type: 'string', minLength: 1 },
      },
    },
  },
} as const

export const WRITING_ADJUDICATION_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://klar.local/schemas/writing-adjudication-v1.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion', 'evidenceKind', 'corpusId', 'adjudicatorId',
    'adjudicatorIsHuman', 'completedAt', 'reviewerIds',
    'blindToGeneratorAndVariantMapping', 'samples', 'conflicts', 'notes',
  ],
  properties: {
    schemaVersion: { const: 1 },
    evidenceKind: { enum: ['human_release', 'test_fixture'] },
    corpusId: { type: 'string', minLength: 1 },
    adjudicatorId: { type: 'string', pattern: '^adjudicator_[0-9a-f]{12}$' },
    adjudicatorIsHuman: { type: 'boolean' },
    completedAt: { type: 'string', format: 'date-time' },
    reviewerIds: {
      type: 'array',
      minItems: 2,
      uniqueItems: true,
      items: { type: 'string', pattern: '^reviewer_[0-9a-f]{12}$' },
    },
    blindToGeneratorAndVariantMapping: { const: true },
    samples: {
      type: 'array',
      minItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'sampleId', 'finalSendability', 'soundsHuman',
          'reasonForWritingClear', 'requestFitsChannelAndState',
          'germanFormalityAppropriate', 'inventoryComplete', 'finalClaims',
          'rationale',
        ],
        properties: {
          sampleId: { type: 'string', pattern: '^sample_[0-9a-f]{12}$' },
          finalSendability: {
            enum: [
              'send_as_is', 'light_edit', 'major_edit', 'do_not_send',
              'not_applicable',
            ],
          },
          soundsHuman: { enum: ['yes', 'no', 'not_applicable'] },
          reasonForWritingClear: { enum: ['yes', 'no', 'not_applicable'] },
          requestFitsChannelAndState: { enum: ['yes', 'no', 'not_applicable'] },
          germanFormalityAppropriate: { enum: ['yes', 'no', 'not_applicable'] },
          inventoryComplete: { type: 'boolean' },
          finalClaims: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'finalClaimId', 'sourceClaimIds', 'text', 'support',
                'evidenceIds', 'rationale',
              ],
              properties: {
                finalClaimId: { type: 'string', minLength: 1 },
                sourceClaimIds: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'string', minLength: 1 },
                },
                text: { type: 'string', minLength: 1 },
                support: { enum: ['supported', 'unsupported', 'unclear'] },
                evidenceIds: {
                  type: 'array',
                  items: { type: 'string', minLength: 1 },
                },
                rationale: { type: 'string', minLength: 1 },
              },
            },
          },
          rationale: { type: 'string', minLength: 1 },
        },
      },
    },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'sampleId', 'subject', 'subjectId', 'category', 'resolution',
        ],
        properties: {
          sampleId: { type: 'string', pattern: '^sample_[0-9a-f]{12}$' },
          subject: {
            enum: [
              'sendability', 'sounds_human', 'reason_clear', 'request_fit',
              'german_formality', 'inventory', 'claim_support',
            ],
          },
          subjectId: { type: 'string', minLength: 1 },
          category: {
            enum: [
              'claim_boundary', 'evidence_interpretation', 'language_or_tone',
              'application_state', 'edit_effort', 'genuine_ambiguity',
            ],
          },
          resolution: { type: 'string', minLength: 1 },
        },
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
} as const

export const WRITING_HUMAN_REVIEW_PROTOCOL = [
  'Freeze at least ten English and ten German recruiter messages plus ten English and ten German cover letters.',
  'Use only synthetic, licensed, or consented-and-anonymized inputs; production user packets are not evaluation material by default.',
  'Store generator/provider mapping separately. Review sheets contain only opaque sample and variant IDs.',
  'Use two distinct professionally bilingual human reviewers identified only by opaque reviewer tokens.',
  'Reviewers work independently, blind to generator identity, variant mapping, scores, and the other reviewer.',
  'Inventory every factual claim before review. Reviewers audit the inventory, cite frozen evidence, and add any missed claim.',
  'A missing fact is not support. Unsupported and unclear are distinct during review but both block release.',
  'Recruiter-message sendability means send as-is or after light editing; major edit and do-not-send are failures.',
  'Each required source claim must appear exactly once across the final claims; duplicate or missing source mappings block release.',
  'After both submissions are locked, a human adjudicator resolves and categorizes every difference, including evidence-only changes when support is unchanged.',
  'Keep evaluation examples and near-duplicates out of training and prompt examples; lock the training manifest before the gate.',
  'Machine, synthetic, test, incomplete, non-bilingual, non-blind, or unresolved evidence always produces HOLD.',
] as const

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

export function sha256Of(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function writingSampleHash(
  sample: Omit<WritingEvaluationSample, 'sampleSha256'>,
): string {
  return sha256Of(sample)
}

export function validateWritingReviewBundle(
  bundle: WritingReviewBundle,
  releaseMode = true,
): string[] {
  const issues = validateWritingJsonSchemas(bundle)
  if (issues.length) return issues
  const { corpus, reviewers, adjudication } = bundle
  if (corpus.schemaVersion !== 1) issues.push('corpus.schemaVersion must be 1')
  if (!corpus.corpusId.trim()) issues.push('corpusId is required')
  if (corpus.split !== 'final_held_out') issues.push('corpus split must be final_held_out')
  if (!validIso(corpus.frozenAt)) issues.push('corpus.frozenAt must be ISO 8601')
  if (!corpus.generatorIdentityWithheldFromReviewers) {
    issues.push('generator identity must be withheld from reviewers')
  }
  if (!corpus.variantMappingStoredSeparately) {
    issues.push('variant mapping must be stored separately')
  }
  if (releaseMode && corpus.evidenceKind !== 'human_release') {
    issues.push(
      `release gate refuses corpus evidenceKind=${corpus.evidenceKind}; human_release is required`,
    )
  }
  validateDatasetSeparation(corpus, issues)
  validateCorpusSamples(corpus, issues)

  if (reviewers.length < 2) issues.push('at least two reviewers are required')
  if (new Set(reviewers.map((reviewer) => reviewer.reviewerId)).size !== reviewers.length) {
    issues.push('every reviewer must be a distinct person')
  }
  for (const reviewer of reviewers) validateReviewer(
    corpus,
    reviewer,
    releaseMode,
    issues,
  )
  validateAdjudication(corpus, reviewers, adjudication, releaseMode, issues)
  return [...new Set(issues)]
}

export function validateWritingJsonSchemas(bundle: WritingReviewBundle): string[] {
  const checks = [
    ['corpus', WRITING_CORPUS_JSON_SCHEMA, bundle.corpus],
    ['adjudication', WRITING_ADJUDICATION_JSON_SCHEMA, bundle.adjudication],
  ] as const
  const issues: string[] = []
  for (const [label, schema, value] of checks) {
    validateSchemaNode(schema, value, schema, `${label} schema`, issues)
  }
  if (!Array.isArray(bundle.reviewers) || bundle.reviewers.length < 2) {
    issues.push('reviewers schema: at least two reviewer submissions are required')
  } else {
    bundle.reviewers.forEach((reviewer, index) =>
      validateSchemaNode(
        WRITING_REVIEWER_JSON_SCHEMA,
        reviewer,
        WRITING_REVIEWER_JSON_SCHEMA,
        `reviewer ${index + 1} schema`,
        issues,
      ))
  }
  return issues
}

/**
 * Small dependency-free validator for the JSON-Schema keywords used above.
 * Cross-file constraints remain in validateWritingReviewBundle.
 */
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
  if (typeof value === 'number' && typeof schema.minimum === 'number') {
    if (value < schema.minimum) issues.push(`${path}: must be >= ${schema.minimum}`)
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
      value.forEach((entry, index) =>
        validateSchemaNode(schema.items, entry, rootSchema, `${path}/${index}`, issues))
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
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~')
    current = current[key]
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

function validateDatasetSeparation(
  corpus: WritingEvaluationCorpus,
  issues: string[],
): void {
  const audit = corpus.datasetSeparation
  if (!audit.evaluationExcludedFromTraining) {
    issues.push('evaluation data must be excluded from training')
  }
  if (!audit.evaluationExcludedFromPromptExamples) {
    issues.push('evaluation data must be excluded from prompt examples')
  }
  if (
    audit.trainingDataUsedForThisRelease &&
    (!audit.trainingManifestSha256 || !/^[0-9a-f]{64}$/.test(audit.trainingManifestSha256))
  ) issues.push('a real training run requires a frozen training manifest SHA-256')
  if (audit.trainingDataUsedForThisRelease && !audit.trainingContentSha256.length) {
    issues.push('a real training run requires content hashes from the frozen training manifest')
  }
  if (audit.trainingContentSha256.some((hash) => !/^[0-9a-f]{64}$/.test(hash))) {
    issues.push('every training content hash must be SHA-256')
  }
  if (!audit.trainingDataUsedForThisRelease && audit.trainingContentSha256.length) {
    issues.push('training hashes supplied while trainingDataUsedForThisRelease is false')
  }
  const evaluationHashes = new Set(corpus.samples.map((sample) => sample.sampleSha256))
  const exact = audit.trainingContentSha256.filter((hash) => evaluationHashes.has(hash))
  if (audit.exactHashOverlapCount !== exact.length) {
    issues.push('exactHashOverlapCount does not match the locked manifests')
  }
  if (exact.length) issues.push('evaluation content hash appears in training data')
  if (!audit.nearDuplicateCheck.completed) {
    issues.push('evaluation-versus-training near-duplicate check is incomplete')
  }
  if (!audit.nearDuplicateCheck.method.trim() || !audit.nearDuplicateCheck.threshold.trim()) {
    issues.push('near-duplicate method and threshold are required')
  }
  if (!validIso(audit.nearDuplicateCheck.checkedAt)) {
    issues.push('near-duplicate checkedAt must be ISO 8601')
  }
  if (audit.nearDuplicateCheck.unresolvedPairs.length) {
    issues.push('evaluation/training near-duplicate audit has unresolved pairs')
  }
}

function validateCorpusSamples(
  corpus: WritingEvaluationCorpus,
  issues: string[],
): void {
  const sampleIds = new Set<string>()
  const variantIds = new Set<string>()
  const sliceCounts = new Map<string, number>()
  for (const sample of corpus.samples) {
    const prefix = `sample ${sample.sampleId || '<missing>'}`
    if (!/^sample_[0-9a-f]{12}$/.test(sample.sampleId)) {
      issues.push(`${prefix}: sampleId must be opaque`)
    }
    if (!/^variant_[0-9a-f]{12}$/.test(sample.blindVariantId)) {
      issues.push(`${prefix}: blindVariantId must be opaque`)
    }
    if (sampleIds.has(sample.sampleId)) issues.push(`duplicate sampleId ${sample.sampleId}`)
    if (variantIds.has(sample.blindVariantId)) {
      issues.push(`duplicate blindVariantId ${sample.blindVariantId}`)
    }
    sampleIds.add(sample.sampleId)
    variantIds.add(sample.blindVariantId)
    if (!sample.personalDataRemoved) issues.push(`${prefix}: personal data must be removed`)
    if (!sample.outputText.trim()) issues.push(`${prefix}: outputText is required`)
    if (!sample.evidence.length) issues.push(`${prefix}: frozen evidence is required`)
    if (!sample.claimInventory.length) issues.push(`${prefix}: claim inventory is required`)
    const unhashed = { ...sample } as WritingEvaluationSample
    delete (unhashed as Partial<WritingEvaluationSample>).sampleSha256
    if (sample.sampleSha256 !== writingSampleHash(
      unhashed as Omit<WritingEvaluationSample, 'sampleSha256'>,
    )) issues.push(`${prefix}: sampleSha256 does not match frozen content`)
    const evidenceIds = uniqueIds(
      sample.evidence.map((entry) => entry.evidenceId),
      `${prefix} evidence`,
      issues,
    )
    for (const evidence of sample.evidence) {
      if (evidence.sourceSha256 !== sha256Of(evidence.text)) {
        issues.push(`${prefix}/${evidence.evidenceId}: sourceSha256 mismatch`)
      }
    }
    uniqueIds(
      sample.claimInventory.map((claim) => claim.claimId),
      `${prefix} claim`,
      issues,
    )
    for (const claim of sample.claimInventory) {
      if (!claim.text.trim()) issues.push(`${prefix}/${claim.claimId}: claim text is required`)
      if (claim.proposedEvidenceIds.some((id) => !evidenceIds.has(id))) {
        issues.push(`${prefix}/${claim.claimId}: proposed evidence is unknown`)
      }
    }
    if (
      sample.kind === 'recruiter_message' &&
      (sample.applicationState === 'not_applicable' || sample.channel === 'not_applicable')
    ) issues.push(`${prefix}: recruiter message needs application state and channel`)
    const slice = `${sample.kind}:${sample.language}`
    sliceCounts.set(slice, (sliceCounts.get(slice) ?? 0) + 1)
  }
  for (const kind of ['recruiter_message', 'cover_letter'] as const) {
    for (const language of ['en', 'de'] as const) {
      const count = sliceCounts.get(`${kind}:${language}`) ?? 0
      if (count < MIN_SAMPLES_PER_KIND_LANGUAGE) {
        issues.push(
          `${kind}/${language} requires at least ${MIN_SAMPLES_PER_KIND_LANGUAGE} samples; found ${count}`,
        )
      }
    }
  }
}

function validateReviewer(
  corpus: WritingEvaluationCorpus,
  reviewer: WritingReviewerSubmission,
  releaseMode: boolean,
  issues: string[],
): void {
  const prefix = `reviewer ${reviewer.reviewerId || '<missing>'}`
  if (reviewer.schemaVersion !== 1) issues.push(`${prefix}: schemaVersion must be 1`)
  if (reviewer.corpusId !== corpus.corpusId) issues.push(`${prefix}: corpusId mismatch`)
  if (!/^reviewer_[0-9a-f]{12}$/.test(reviewer.reviewerId)) {
    issues.push(`${prefix}: reviewerId must be an opaque token`)
  }
  if (releaseMode && reviewer.evidenceKind !== 'human_release') {
    issues.push(`${prefix}: evidenceKind must be human_release`)
  }
  if (releaseMode && !reviewer.isHuman) issues.push(`${prefix}: human reviewer required`)
  if (!validIso(reviewer.completedAt)) issues.push(`${prefix}: completedAt must be ISO 8601`)
  if (
    reviewer.languageCompetence.en !== 'professional' ||
    reviewer.languageCompetence.de !== 'professional'
  ) issues.push(`${prefix}: professional English and German competence is required`)
  if (!Object.values(reviewer.independence).every((value) => value === true)) {
    issues.push(`${prefix}: every blind-review confirmation must be true`)
  }
  const reviews = uniqueMap(
    reviewer.reviews,
    (review) => review.sampleId,
    `${prefix} sample`,
    issues,
  )
  for (const sample of corpus.samples) {
    const review = reviews.get(sample.sampleId)
    if (!review) {
      issues.push(`${prefix}: missing row ${sample.sampleId}`)
      continue
    }
    validateSampleReview(sample, reviewer.reviewerId, review, issues)
  }
  for (const sampleId of reviews.keys()) {
    if (!corpus.samples.some((sample) => sample.sampleId === sampleId)) {
      issues.push(`${prefix}: review references unknown sample ${sampleId}`)
    }
  }
}

function validateSampleReview(
  sample: WritingEvaluationSample,
  reviewerId: string,
  review: WritingSampleReview,
  issues: string[],
): void {
  const prefix = `reviewer ${reviewerId}/${sample.sampleId}`
  if (
    sample.kind === 'recruiter_message' &&
    review.sendability === 'not_applicable'
  ) issues.push(`${prefix}: recruiter-message sendability is required`)
  if (
    sample.kind === 'cover_letter' &&
    review.sendability !== 'not_applicable'
  ) issues.push(`${prefix}: cover-letter sendability must be not_applicable`)
  if (
    review.soundsHuman === 'not_applicable' ||
    review.reasonForWritingClear === 'not_applicable' ||
    review.requestFitsChannelAndState === 'not_applicable'
  ) issues.push(`${prefix}: human voice, reason, and request judgments are required`)
  if (
    sample.language === 'de' &&
    review.germanFormalityAppropriate === 'not_applicable'
  ) issues.push(`${prefix}: German formality judgment is required`)
  if (
    sample.language === 'en' &&
    review.germanFormalityAppropriate !== 'not_applicable'
  ) issues.push(`${prefix}: English sample German formality must be not_applicable`)
  const expectedClaims = new Set(sample.claimInventory.map((claim) => claim.claimId))
  const evidenceIds = new Set(sample.evidence.map((entry) => entry.evidenceId))
  const claims = uniqueMap(
    review.claims,
    (claim) => claim.claimId,
    `${prefix} claim`,
    issues,
  )
  for (const claimId of expectedClaims) {
    const claim = claims.get(claimId)
    if (!claim) {
      issues.push(`${prefix}: missing claim judgment ${claimId}`)
      continue
    }
    validateClaimJudgment(prefix, claim, evidenceIds, issues)
  }
  for (const claimId of claims.keys()) {
    if (!expectedClaims.has(claimId)) issues.push(`${prefix}: unknown claim ${claimId}`)
  }
  const additionalIds = uniqueIds(
    review.additionalClaims.map((claim) => claim.additionalClaimId),
    `${prefix} additional claim`,
    issues,
  )
  for (const claim of review.additionalClaims) {
    if (!claim.additionalClaimId.startsWith(`${reviewerId}_claim_`)) {
      issues.push(`${prefix}: additional claim IDs must be reviewer-scoped`)
    }
    if (!claim.text.trim()) issues.push(`${prefix}: additional claim text is required`)
    validateClaimJudgment(prefix, {
      claimId: claim.additionalClaimId,
      support: claim.support,
      evidenceIds: claim.evidenceIds,
      rationale: claim.rationale,
    }, evidenceIds, issues)
  }
  if (review.inventoryComplete !== (additionalIds.size === 0)) {
    issues.push(`${prefix}: inventoryComplete must be false exactly when missed claims were added`)
  }
}

function validateClaimJudgment(
  prefix: string,
  claim: ClaimJudgment,
  evidenceIds: Set<string>,
  issues: string[],
): void {
  if (!claim.rationale.trim()) issues.push(`${prefix}/${claim.claimId}: rationale is required`)
  if (claim.evidenceIds.some((id) => !evidenceIds.has(id))) {
    issues.push(`${prefix}/${claim.claimId}: evidence reference is unknown`)
  }
  if (claim.support === 'supported' && !claim.evidenceIds.length) {
    issues.push(`${prefix}/${claim.claimId}: supported claim needs cited evidence`)
  }
}

function validateAdjudication(
  corpus: WritingEvaluationCorpus,
  reviewers: WritingReviewerSubmission[],
  adjudication: WritingAdjudication,
  releaseMode: boolean,
  issues: string[],
): void {
  if (adjudication.schemaVersion !== 1) {
    issues.push('adjudication.schemaVersion must be 1')
  }
  if (adjudication.corpusId !== corpus.corpusId) issues.push('adjudication corpusId mismatch')
  if (!/^adjudicator_[0-9a-f]{12}$/.test(adjudication.adjudicatorId)) {
    issues.push('adjudicatorId must be an opaque token')
  }
  if (releaseMode && adjudication.evidenceKind !== 'human_release') {
    issues.push('adjudication evidenceKind must be human_release')
  }
  if (releaseMode && !adjudication.adjudicatorIsHuman) {
    issues.push('human adjudicator required')
  }
  if (!validIso(adjudication.completedAt)) {
    issues.push('adjudication.completedAt must be ISO 8601')
  }
  if (!adjudication.blindToGeneratorAndVariantMapping) {
    issues.push('adjudicator must remain blind to generator and variant mapping')
  }
  if (
    new Set(adjudication.reviewerIds).size !== reviewers.length ||
    !reviewers.every((reviewer) => adjudication.reviewerIds.includes(reviewer.reviewerId))
  ) issues.push('adjudication must name every submitted reviewer exactly once')

  const finalById = uniqueMap(
    adjudication.samples,
    (sample) => sample.sampleId,
    'adjudication sample',
    issues,
  )
  const reviewerMaps = reviewers.map((reviewer) =>
    new Map(reviewer.reviews.map((review) => [review.sampleId, review])))
  const expectedConflicts = new Set<string>()
  for (const sample of corpus.samples) {
    const final = finalById.get(sample.sampleId)
    if (!final) {
      issues.push(`adjudication: missing row ${sample.sampleId}`)
      continue
    }
    validateFinalSample(sample, reviewers, final, issues)
    const submitted = reviewerMaps
      .map((map) => map.get(sample.sampleId))
      .filter((review): review is WritingSampleReview => Boolean(review))
    for (let left = 0; left < submitted.length; left += 1) {
      for (let right = left + 1; right < submitted.length; right += 1) {
        collectExpectedConflicts(
          sample,
          submitted[left],
          submitted[right],
          expectedConflicts,
        )
      }
    }
    collectAdjudicationOverrides(sample, final, submitted, expectedConflicts)
  }
  const suppliedConflicts = new Set<string>()
  for (const conflict of adjudication.conflicts) {
    const key = conflictKey(conflict.sampleId, conflict.subject, conflict.subjectId)
    if (suppliedConflicts.has(key)) issues.push(`duplicate conflict ${key}`)
    suppliedConflicts.add(key)
    if (!expectedConflicts.has(key)) issues.push(`conflict ${key} has no reviewer difference`)
    if (!conflict.resolution.trim()) issues.push(`conflict ${key} has no resolution`)
  }
  for (const key of expectedConflicts) {
    if (!suppliedConflicts.has(key)) issues.push(`unresolved reviewer conflict ${key}`)
  }
}

function validateFinalSample(
  sample: WritingEvaluationSample,
  reviewers: WritingReviewerSubmission[],
  final: AdjudicatedWritingSample,
  issues: string[],
): void {
  const prefix = `adjudication/${sample.sampleId}`
  if (!final.rationale.trim()) issues.push(`${prefix}: rationale is required`)
  if (
    sample.kind === 'recruiter_message' &&
    final.finalSendability === 'not_applicable'
  ) issues.push(`${prefix}: recruiter-message sendability is required`)
  if (
    sample.kind === 'cover_letter' &&
    final.finalSendability !== 'not_applicable'
  ) issues.push(`${prefix}: cover-letter sendability must be not_applicable`)
  const requiredSourceIds = new Set(sample.claimInventory.map((claim) => claim.claimId))
  for (const reviewer of reviewers) {
    const review = reviewer.reviews.find((entry) => entry.sampleId === sample.sampleId)
    for (const claim of review?.additionalClaims ?? []) {
      requiredSourceIds.add(claim.additionalClaimId)
    }
  }
  const evidenceIds = new Set(sample.evidence.map((entry) => entry.evidenceId))
  const sourceClaimCounts = new Map<string, number>()
  uniqueIds(
    final.finalClaims.map((claim) => claim.finalClaimId),
    `${prefix} final claim`,
    issues,
  )
  for (const claim of final.finalClaims) {
    if (!claim.text.trim()) issues.push(`${prefix}/${claim.finalClaimId}: text is required`)
    if (!claim.sourceClaimIds.length) {
      issues.push(`${prefix}/${claim.finalClaimId}: sourceClaimIds are required`)
    }
    for (const sourceId of claim.sourceClaimIds) {
      sourceClaimCounts.set(sourceId, (sourceClaimCounts.get(sourceId) ?? 0) + 1)
      if (!requiredSourceIds.has(sourceId)) {
        issues.push(`${prefix}/${claim.finalClaimId}: unknown sourceClaimId ${sourceId}`)
      }
    }
    validateClaimJudgment(prefix, {
      claimId: claim.finalClaimId,
      support: claim.support,
      evidenceIds: claim.evidenceIds,
      rationale: claim.rationale,
    }, evidenceIds, issues)
  }
  for (const [sourceId, count] of sourceClaimCounts) {
    if (count > 1) {
      issues.push(
        `${prefix}: sourceClaimId ${sourceId} appears ${count} times across finalClaims; exactly once is required`,
      )
    }
  }
  for (const sourceId of requiredSourceIds) {
    if (!sourceClaimCounts.has(sourceId)) {
      issues.push(`${prefix}: unadjudicated claim source ${sourceId}`)
    }
  }
  if (!final.inventoryComplete) issues.push(`${prefix}: final claim inventory is incomplete`)
  if (
    final.soundsHuman === 'not_applicable' ||
    final.reasonForWritingClear === 'not_applicable' ||
    final.requestFitsChannelAndState === 'not_applicable'
  ) issues.push(`${prefix}: final human voice, reason, and request judgments are required`)
  if (
    sample.language === 'de' &&
    final.germanFormalityAppropriate === 'not_applicable'
  ) issues.push(`${prefix}: final German formality judgment is required`)
  if (
    sample.language === 'en' &&
    final.germanFormalityAppropriate !== 'not_applicable'
  ) issues.push(`${prefix}: English final German formality must be not_applicable`)
}

function canonicalSupportAndEvidence(
  support: ClaimSupport,
  evidenceIds: readonly string[],
): string {
  return canonicalJson({
    support,
    evidenceIds: [...evidenceIds].sort(),
  })
}

function collectExpectedConflicts(
  sample: WritingEvaluationSample,
  left: WritingSampleReview,
  right: WritingSampleReview,
  expected: Set<string>,
): void {
  const compare = (
    subject: WritingReviewConflict['subject'],
    subjectId: string,
    a: unknown,
    b: unknown,
  ) => {
    if (a !== b) expected.add(conflictKey(sample.sampleId, subject, subjectId))
  }
  compare('sendability', 'sendability', left.sendability, right.sendability)
  compare('sounds_human', 'sounds_human', left.soundsHuman, right.soundsHuman)
  compare(
    'reason_clear',
    'reason_clear',
    left.reasonForWritingClear,
    right.reasonForWritingClear,
  )
  compare(
    'request_fit',
    'request_fit',
    left.requestFitsChannelAndState,
    right.requestFitsChannelAndState,
  )
  compare(
    'german_formality',
    'german_formality',
    left.germanFormalityAppropriate,
    right.germanFormalityAppropriate,
  )
  compare('inventory', 'inventory', left.inventoryComplete, right.inventoryComplete)
  const leftClaims = new Map(left.claims.map((claim) => [claim.claimId, claim]))
  const rightClaims = new Map(right.claims.map((claim) => [claim.claimId, claim]))
  for (const claim of sample.claimInventory) {
    const leftClaim = leftClaims.get(claim.claimId)
    const rightClaim = rightClaims.get(claim.claimId)
    compare(
      'claim_support',
      claim.claimId,
      leftClaim
        ? canonicalSupportAndEvidence(leftClaim.support, leftClaim.evidenceIds)
        : undefined,
      rightClaim
        ? canonicalSupportAndEvidence(rightClaim.support, rightClaim.evidenceIds)
        : undefined,
    )
  }
  const leftAdditional = new Map(left.additionalClaims.map((claim) => [
    claim.additionalClaimId,
    claim,
  ]))
  const rightAdditional = new Map(right.additionalClaims.map((claim) => [
    claim.additionalClaimId,
    claim,
  ]))
  for (const id of new Set([...leftAdditional.keys(), ...rightAdditional.keys()])) {
    const leftClaim = leftAdditional.get(id)
    const rightClaim = rightAdditional.get(id)
    compare(
      'claim_support',
      id,
      leftClaim
        ? canonicalSupportAndEvidence(leftClaim.support, leftClaim.evidenceIds)
        : undefined,
      rightClaim
        ? canonicalSupportAndEvidence(rightClaim.support, rightClaim.evidenceIds)
        : undefined,
    )
  }
}

function collectAdjudicationOverrides(
  sample: WritingEvaluationSample,
  final: AdjudicatedWritingSample,
  reviews: WritingSampleReview[],
  expected: Set<string>,
): void {
  const mark = (
    subject: WritingReviewConflict['subject'],
    subjectId: string,
    finalValue: unknown,
    reviewerValue: (review: WritingSampleReview) => unknown,
  ) => {
    if (reviews.some((review) => reviewerValue(review) !== finalValue)) {
      expected.add(conflictKey(sample.sampleId, subject, subjectId))
    }
  }
  mark('sendability', 'sendability', final.finalSendability, (review) =>
    review.sendability)
  mark('sounds_human', 'sounds_human', final.soundsHuman, (review) =>
    review.soundsHuman)
  mark('reason_clear', 'reason_clear', final.reasonForWritingClear, (review) =>
    review.reasonForWritingClear)
  mark(
    'request_fit',
    'request_fit',
    final.requestFitsChannelAndState,
    (review) => review.requestFitsChannelAndState,
  )
  mark(
    'german_formality',
    'german_formality',
    final.germanFormalityAppropriate,
    (review) => review.germanFormalityAppropriate,
  )
  mark('inventory', 'inventory', final.inventoryComplete, (review) =>
    review.inventoryComplete)

  const finalJudgmentBySourceId = new Map<string, string>()
  for (const claim of final.finalClaims) {
    const canonical = canonicalSupportAndEvidence(
      claim.support,
      claim.evidenceIds,
    )
    for (const sourceId of claim.sourceClaimIds) {
      finalJudgmentBySourceId.set(sourceId, canonical)
    }
  }
  for (const claim of sample.claimInventory) {
    const finalJudgment = finalJudgmentBySourceId.get(claim.claimId)
    if (reviews.some((review) => {
      const reviewerClaim = review.claims.find(
        (entry) => entry.claimId === claim.claimId,
      )
      const reviewerJudgment = reviewerClaim
        ? canonicalSupportAndEvidence(
            reviewerClaim.support,
            reviewerClaim.evidenceIds,
          )
        : undefined
      return reviewerJudgment !== finalJudgment
    })) expected.add(conflictKey(sample.sampleId, 'claim_support', claim.claimId))
  }
  for (const review of reviews) {
    for (const claim of review.additionalClaims) {
      if (
        finalJudgmentBySourceId.get(claim.additionalClaimId) !==
        canonicalSupportAndEvidence(claim.support, claim.evidenceIds)
      ) {
        expected.add(
          conflictKey(sample.sampleId, 'claim_support', claim.additionalClaimId),
        )
      }
    }
  }
}

function conflictKey(
  sampleId: string,
  subject: WritingReviewConflict['subject'],
  subjectId: string,
): string {
  return `${sampleId}:${subject}:${subjectId}`
}

function uniqueIds(
  values: string[],
  label: string,
  issues: string[],
): Set<string> {
  const ids = new Set<string>()
  for (const value of values) {
    if (!value.trim()) issues.push(`${label}: empty id`)
    if (ids.has(value)) issues.push(`duplicate ${label} ${value}`)
    ids.add(value)
  }
  return ids
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

function validIso(value: string): boolean {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
}
