// ============================================================================
// Strict structured-output contracts for Klar's JSON-producing AI actions.
//
// Groq's JSON Object mode guarantees only that the output is JSON-shaped; the
// provider can still reject a generation when the model drifts from the prompt.
// Klar's default GPT-OSS models support constrained JSON Schema decoding, so
// every structured action supplies an explicit, closed schema. The existing
// application validators remain authoritative for evidence and business rules.
// ============================================================================

export type JsonSchema = Record<string, unknown>

export type StructuredOutputSchema = {
  name: string
  schema: JsonSchema
}

const string = { type: 'string' } as const
const integer = { type: 'integer' } as const
const nullableString = { type: ['string', 'null'] } as const
const nullableNumber = { type: ['number', 'null'] } as const
const nullableBoolean = { type: ['boolean', 'null'] } as const

function array(items: JsonSchema): JsonSchema {
  return { type: 'array', items }
}

function nullable(schema: JsonSchema): JsonSchema {
  return { anyOf: [schema, { type: 'null' }] }
}

function object(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

function enumString(values: string[]): JsonSchema {
  return { type: 'string', enum: values }
}

function nullableEnum(values: string[]): JsonSchema {
  return { anyOf: [enumString(values), { type: 'null' }] }
}

export const TAILORING_OUTPUT: StructuredOutputSchema = {
  name: 'klar_tailored_resume',
  schema: object({
    summary: string,
    experience: array(object({
      sourceIndex: integer,
      title: string,
      bullets: array(object({
        text: string,
        sourceBulletIndexes: array(integer),
      })),
    })),
    projects: array(object({
      sourceIndex: integer,
      summary: string,
    })),
    changeSummary: array(string),
  }),
}

export const JD_REQUIREMENTS_OUTPUT: StructuredOutputSchema = {
  name: 'klar_job_requirements',
  schema: object({
    requirements: array(string),
  }),
}

export const RERANK_OUTPUT: StructuredOutputSchema = {
  name: 'klar_match_scores',
  schema: object({
    results: array(object({
      jobId: string,
      fitScore: integer,
      verdict: enumString(['strong', 'good', 'stretch', 'weak']),
      rationale: string,
      matchedSkills: array(string),
      missingSkills: array(string),
      salaryFit: enumString(['above', 'in-range', 'below', 'unknown']),
      locationFit: nullableEnum(['exact', 'commutable', 'remote', 'mismatch']),
      seniorityFit: nullableEnum(['under', 'match', 'over']),
      redFlags: array(string),
      factors: object({
        skills: integer,
        salary: integer,
        location: integer,
        seniority: integer,
      }),
      confidence: nullableNumber,
    })),
  }),
}

export const PROFILE_OUTPUT: StructuredOutputSchema = {
  name: 'klar_candidate_profile',
  schema: object({
    summary: string,
    titles: array(object({
      title: string,
      seniority: nullableString,
      years: nullableNumber,
    })),
    skills: array(object({
      name: string,
      level: nullableString,
    })),
    domains: array(string),
    totalYears: nullableNumber,
    education: array(object({
      degree: nullableString,
      field: nullableString,
      institution: nullableString,
    })),
    languages: array(object({
      lang: string,
      level: nullableString,
    })),
    certifications: array(string),
  }),
}

export const RESUME_EXTRACTION_OUTPUT: StructuredOutputSchema = {
  name: 'klar_resume_extraction',
  schema: object({
    contact: object({
      name: string,
      email: nullableString,
      phone: nullableString,
      location: nullableString,
      links: array(object({
        label: string,
        url: string,
      })),
    }),
    summary: nullableString,
    experience: array(object({
      title: string,
      company: string,
      city: nullableString,
      start: nullableString,
      end: nullableString,
      current: nullableBoolean,
      bullets: array(string),
    })),
    education: array(object({
      degree: nullableString,
      field: nullableString,
      institution: nullableString,
      city: nullableString,
      start: nullableString,
      end: nullableString,
    })),
    skills: array(object({
      group: nullableString,
      items: array(string),
    })),
    languages: array(object({
      lang: string,
      level: nullableString,
    })),
    projects: array(object({
      name: string,
      summary: nullableString,
      tech: nullable(array(string)),
      link: nullableString,
    })),
    certifications: array(object({
      name: string,
      issuer: nullableString,
      issued: nullableString,
    })),
  }),
}

export const INTERVIEW_OUTPUT: StructuredOutputSchema = {
  name: 'klar_interview_prep',
  schema: object({
    likelyQuestions: array(object({
      question: string,
      evidenceIds: array(string),
      answerOutline: array(string),
    })),
    questionsToAsk: array(string),
    gapsToPrepare: array(string),
  }),
}
