// ============================================================================
// The Opportunity model (roadmap §3).
//
// Every Source-Fabric connector normalizes into this shape. An Opportunity is a
// `NormalizedJob` with the flexible fields populated and per-field provenance
// attached, so the UI can always answer "did the employer publish this, or did
// Klar infer it?". Two kinds exist:
//
//   • vacancy    — a concrete open position with an apply URL.
//   • open_entry — an official "apply any time / join the candidate pool"
//                  programme. It is NEVER shown as a single vacancy; it is
//                  labelled and linked to the official recruitment path.
//
// "Unknown remains unknown. Inferred values remain visibly distinguishable from
// employer-published values." — so we build provenance in, not on.
// ============================================================================
import type {
  FieldProvenance,
  FlexibleEmployment,
  FlexibleRoleFamily,
  NormalizedJob,
  SourceId,
  WorkplaceType,
} from '../types'
import { buildId } from '../sources/normalize'

export type ProvenanceMethod = FieldProvenance['method']
export type SourceConfidence = NonNullable<NormalizedJob['sourceConfidence']>
export type OpportunityKind = NonNullable<NormalizedJob['kind']>

/** A field-value paired with how we know it — the atom of provenance. */
export type Provenanced<T> = { value: T; method: ProvenanceMethod }

/** Published/structured data is trusted; visible-text and inferred are softer. */
export function confidenceForMethod(method: ProvenanceMethod): SourceConfidence {
  switch (method) {
    case 'api':
    case 'feed':
      return 'published'
    case 'structured_data':
      return 'structured'
    case 'visible_text':
      return 'unknown'
    case 'inferred':
      return 'inferred'
  }
}

/** Build a single provenance record. `observedAt` defaults to now. */
export function provenance(
  method: ProvenanceMethod,
  source: string,
  observedAt: string = new Date().toISOString(),
): FieldProvenance {
  return { method, source, observedAt }
}

/** The lowest (most cautious) confidence across a set of fields' methods. */
export function overallConfidence(methods: ProvenanceMethod[]): SourceConfidence {
  const order: SourceConfidence[] = ['published', 'structured', 'unknown', 'inferred']
  let worst: SourceConfidence = 'published'
  for (const method of methods) {
    const tier = confidenceForMethod(method)
    if (order.indexOf(tier) > order.indexOf(worst)) worst = tier
  }
  return methods.length ? worst : 'unknown'
}

export type OpportunityInput = {
  source: SourceId
  /** Unique within the source. For 'fabric' pass `${connectorId}:${postingId}`. */
  source_id: string
  connectorId?: string
  employerFamily?: string
  kind?: OpportunityKind
  title: string
  company: string
  canonicalEmployer?: string
  brand?: string
  location: NormalizedJob['location']
  description?: string
  url: string
  posted_at?: string
  validThrough?: string
  lastVerifiedAt?: string
  salary?: NormalizedJob['salary']
  employment_type?: string
  language?: string
  tags?: string[]
  employment?: FlexibleEmployment[]
  roleFamilies?: FlexibleRoleFamily[]
  workplaces?: WorkplaceType[]
  weeklyHours?: NormalizedJob['weeklyHours']
  scheduleTags?: NormalizedJob['scheduleTags']
  /** Open-entry only. */
  programName?: string
  cityAvailability?: string[]
  /** Per-field provenance, e.g. { title: provenance('feed', 'REWE feed') }. */
  fieldProvenance?: Record<string, FieldProvenance>
}

/**
 * Assemble a fully-formed Opportunity (a NormalizedJob) from a connector.
 * Fills required NormalizedJob defaults, derives the dedup id and the overall
 * sourceConfidence from the field provenance, and defaults kind to 'vacancy'.
 */
export function makeOpportunity(input: OpportunityInput): NormalizedJob {
  const kind: OpportunityKind = input.kind ?? 'vacancy'
  const fieldProvenance = input.fieldProvenance ?? {}
  const methods = Object.values(fieldProvenance).map((p) => p.method)
  const now = new Date().toISOString()
  return {
    id: buildId(input.source, input.source_id),
    source: input.source,
    source_id: input.source_id,
    connectorId: input.connectorId,
    employerFamily: input.employerFamily,
    kind,
    title: input.title,
    company: input.company,
    canonicalEmployer: input.canonicalEmployer ?? input.employerFamily,
    brand: input.brand,
    location: input.location,
    description: input.description ?? '',
    url: input.url,
    posted_at: input.posted_at,
    validThrough: input.validThrough,
    lastVerifiedAt: input.lastVerifiedAt ?? now,
    salary: input.salary ?? {},
    employment_type: input.employment_type,
    language: input.language,
    tags: input.tags ?? [],
    employment: input.employment,
    roleFamilies: input.roleFamilies,
    workplaces: input.workplaces,
    weeklyHours: input.weeklyHours,
    scheduleTags: input.scheduleTags,
    programName: input.programName,
    cityAvailability: input.cityAvailability,
    sourceConfidence: methods.length ? overallConfidence(methods) : (kind === 'open_entry' ? 'published' : 'unknown'),
    fieldProvenance: Object.keys(fieldProvenance).length ? fieldProvenance : undefined,
    fetched_at: now,
  }
}

/**
 * Build an official open-entry programme opportunity. These are labelled
 * "Open application" / "Join the candidate pool" in the UI, never shown as an
 * individual vacancy, and always carry the official recruitment URL.
 */
export function makeOpenEntry(
  input: Omit<OpportunityInput, 'kind' | 'source'> & { source?: SourceId },
): NormalizedJob {
  return makeOpportunity({
    ...input,
    source: input.source ?? 'fabric',
    kind: 'open_entry',
    // Open-entry programmes are official and durable, not "posted" vacancies.
    posted_at: undefined,
  })
}

/** True when a field was inferred by Klar rather than published by the source. */
export function isInferredField(job: NormalizedJob, field: string): boolean {
  return job.fieldProvenance?.[field]?.method === 'inferred'
}

/** Employer-published employment terms that a classifier must never override. */
export function publishedEmployment(job: NormalizedJob): FlexibleEmployment[] {
  const method = job.fieldProvenance?.employment?.method
  if (!method || method === 'inferred') return []
  return job.employment ?? []
}