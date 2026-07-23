// ============================================================================
// Core domain types — the contracts every layer of Klar agrees on.
// ============================================================================

/** A job posting after an adapter has normalized it. Every source maps to this. */
export type SourceId =
  | 'ba' | 'arbeitnow' | 'adzuna' | 'greenhouse' | 'lever' | 'ashby'

export type DiscoveryMode = 'career' | 'flexible' | 'both'

export type FlexibleEmployment =
  | 'minijob'
  | 'part_time'
  | 'working_student'
  | 'temporary'
  | 'seasonal'
  | 'weekend'
  | 'evening'
  | 'night'

export type FlexibleRoleFamily =
  | 'shelf_stocking'
  | 'cashier'
  | 'sales_assistant'
  | 'picking_packing'
  | 'warehouse'
  | 'parcel_sorting'
  | 'delivery'
  | 'kitchen'
  | 'counter_service'
  | 'waiting_service'
  | 'cleaning'
  | 'housekeeping'
  | 'reception'
  | 'event_staff'
  | 'customer_service'
  | 'other'

export type WorkplaceType =
  | 'supermarket'
  | 'retail_store'
  | 'drugstore'
  | 'warehouse'
  | 'parcel_hub'
  | 'restaurant'
  | 'cafe'
  | 'hotel'
  | 'delivery'
  | 'event'
  | 'other'

export type FlexibleWorkPreferences = {
  employment: FlexibleEmployment[]
  roleFamilies: FlexibleRoleFamily[]
  workplaces: WorkplaceType[]
  locations: { city: string; radius_km: number }[]
  schedule?: {
    days?: string[]
    periods?: ('morning' | 'day' | 'evening' | 'night')[]
    maxHoursPerWeek?: number
  }
  languageComfort?: { german?: string; english?: string }
  physicalWork?: 'yes' | 'limited' | 'no_preference'
  hasDrivingLicence?: boolean
  hasBike?: boolean
  earliestStart?: string
}

export type FieldProvenance = {
  method: 'api' | 'feed' | 'structured_data' | 'visible_text' | 'inferred'
  source: string
  observedAt: string
}

export type NormalizedJob = {
  id: string                 // stable hash of `${source}:${source_id}` — the dedup key
  source: SourceId
  source_id: string
  title: string
  company: string
  location: {
    city?: string
    region?: string
    country: string
    remote: boolean
    lat?: number
    lng?: number
  }
  description: string        // plaintext (HTML stripped/decoded)
  url: string                // detail / apply link
  posted_at?: string         // ISO 8601
  salary: {
    min?: number
    max?: number
    currency?: string
    period?: 'year' | 'month' | 'hour'
  }
  employment_type?: string   // full-time, part-time, contract…
  seniority?: string         // inferred if absent
  language?: string          // posting language ('de' | 'en' …)
  tags: string[]
  fetched_at: string
  raw?: unknown              // original payload, for debugging
  /** When merged during dedup, all the sources this job was seen on. */
  also_on?: { source: SourceId; source_id?: string; url: string }[]
  /** Forward-compatible Flexible Work fields. All are optional in v2.3. */
  kind?: 'vacancy' | 'open_entry'
  canonicalEmployer?: string
  brand?: string
  roleFamilies?: FlexibleRoleFamily[]
  workplaces?: WorkplaceType[]
  employment?: FlexibleEmployment[]
  weeklyHours?: { min?: number; max?: number }
  scheduleTags?: ('morning' | 'day' | 'evening' | 'night' | 'weekend')[]
  validThrough?: string
  lastVerifiedAt?: string
  sourceConfidence?: 'published' | 'structured' | 'inferred' | 'unknown'
  fieldProvenance?: Record<string, FieldProvenance>
}

/** Parsed résumé profile (produced by the LLM parse step). */
export type Profile = {
  summary: string
  titles: { title: string; seniority?: string; years?: number }[]
  skills: { name: string; level?: string }[]
  domains: string[]
  totalYears?: number
  education: { degree?: string; field?: string; institution?: string }[]
  languages: { lang: string; level?: string }[]  // e.g. German B2, English C1
  certifications: string[]
  /** Temporary during extraction/review; removed before confirmed persistence. */
  rawText?: string
}

/** User preferences captured by the intake wizard. */
export type Preferences = {
  targetTitles: string[]
  fields: string[]
  seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'exec'
  salary: { min?: number; currency: 'EUR'; period: 'year' | 'month' }
  locations: { city: string; radius_km: number }[]
  remoteOnly?: boolean
  hybridOk?: boolean
  workAuth: { needsVisaSponsorship?: boolean; euWorkPermit?: boolean }
  languages: { lang: string; min_level: string }[]
  mustHaves: string[]
  dealbreakers: string[]
  contractType?: string[]
  /** How much each factor counts toward the composite score (feature 1.3). */
  weights?: ScoreWeights
  /** Hard filter: hide roles requiring German above the user's level (feature 2.1). */
  hideGermanAboveLevel?: boolean
  /** Hard filter: hide roles that state they don't sponsor visas (feature 2.2). */
  hideNoVisaSponsorship?: boolean
  /** v2.3 foundation for the résumé-optional Flexible Work experience. */
  discoveryMode?: DiscoveryMode
  flexibleWork?: FlexibleWorkPreferences
}

/** Per-factor weighting used to build an explainable composite score (0–1 each). */
export type ScoreWeights = {
  skills: number
  salary: number
  location: number
  seniority: number
}

/** LLM scoring result for one job against the profile+prefs. */
export type MatchResult = {
  jobId: string
  fitScore: number                 // 0–100
  verdict: 'strong' | 'good' | 'stretch' | 'weak'
  rationale: string
  matchedSkills: string[]
  missingSkills: string[]          // gap analysis
  salaryFit?: 'above' | 'in-range' | 'below' | 'unknown'
  locationFit?: 'exact' | 'commutable' | 'remote' | 'mismatch'
  seniorityFit?: 'under' | 'match' | 'over'
  redFlags: string[]
  /** Per-factor 0–100 sub-scores that drive the explainable composite (feature 1.3). */
  factors?: ScoreWeights
  /** Model's self-reported confidence in this score, 0–1 (feature 1.3). */
  confidence?: number
  scoredAt: string
  modelVersion: string
}

/** A job the user has saved into the tracker. */
export type TrackStatus =
  | 'new' | 'interested' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'archived'

export type TrackedJob = {
  jobId: string
  job: NormalizedJob             // snapshot (postings expire — keep our copy)
  match?: MatchResult
  status: TrackStatus
  notes: string
  appliedAt?: string
  reminders: { date: string; text: string }[]
  contacts: { name: string; role?: string; email?: string }[]
  history: { status: string; at: string }[]
  createdAt: string
  updatedAt: string
}

/** What the UI hands to the gather layer. */
export type SearchQuery = {
  what: string[]                 // target titles / keywords
  where?: { city: string; radius_km: number }
  remote?: boolean
  employmentType?: string[]
  page?: number
}

/** A geographic scope. Adding a country = add adapters + one Region object. */
export type Region = {
  code: string
  label: string
  currency: string
  distanceUnit: 'km' | 'mi'
  sources: SourceId[]
  uiLocales: string[]
  /**
   * Adzuna's 2-letter country slug for this market (e.g. 'de', 'at', 'ch', 'nl').
   * Only meaningful when 'adzuna' is in `sources`. Adzuna does not cover every
   * country (Luxembourg/Liechtenstein have no feed), so those regions omit both
   * this field and 'adzuna' from `sources`.
   */
  adzunaCountry?: string
  resolveLocation: (city: string) => { lat?: number; lng?: number; canonical: string }
}

/**
 * The user's personal, device-local dashboard (feature 4.1). Everything here —
 * including the photo, stored as a data URL — lives only in this browser.
 */
export type Dashboard = {
  displayName: string
  headline: string
  about: string
  location: string
  links: { label: string; url: string }[]
  /** Profile photo encoded as a data URL (base64). Never uploaded. */
  photoDataUrl?: string
}