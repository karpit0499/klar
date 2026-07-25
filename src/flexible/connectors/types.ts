// ============================================================================
// The connector framework contract (roadmap §5).
//
// A connector is a small, uniform unit that turns ONE employer/source into
// normalized Opportunities. There are six TYPES (§5.1); HTML layout parsing is
// deliberately NOT one of them — it is an isolated, dated exception.
//
// The registry entry (§5.2) is pure configuration. Most employers are a config
// object on a shared engine, never bespoke code — that is what makes "all
// initial employer families" tractable and auditable.
// ============================================================================
import type {
  FlexibleEmployment,
  FlexibleRoleFamily,
  NormalizedJob,
  WorkplaceType,
} from '../../types'
import type { AppErrorData } from '../../errors/appError'

export type ConnectorType =
  | 'api' // BA, Adzuna, Arbeitnow, supported ATS vendors
  | 'feed' // employer RSS / Atom
  | 'sitemap' // sitemap discovery + JobPosting JSON-LD
  | 'portal' // queryable public job manifest / paginated search
  | 'open_entry' // official "apply any time / candidate pool" route
  | 'federated' // parent + regional/franchise + aggregator fallback

export type QueryCapability = 'keyword' | 'city' | 'radius' | 'category' | 'pagination'

/** How a source paginates, if at all. */
export type PaginationStrategy =
  | { kind: 'none' }
  | { kind: 'page'; param: string; startAt: number; size: number; sizeParam?: string }
  | { kind: 'offset'; param: string; size: number; sizeParam?: string }

export type CachePolicy = { ttlMinutes: number; revalidateMinutes: number }

export type FieldCoverage = {
  title: boolean
  employer: boolean
  city: boolean
  salary: boolean
  description: boolean
  postedAt: boolean
  validThrough: boolean
  applyUrl: boolean
}

/**
 * The required fallback (§5.3). Every family must degrade to a usable result or
 * an official route — never a broken placeholder. Direct connectors ENHANCE the
 * baseline; they never gate it.
 */
export type FallbackSpec =
  | { kind: 'api_employer'; employer: string; officialSearchUrl?: string }
  | { kind: 'open_entry'; programName: string; officialUrl: string; cities: string[]; note?: string }
  | { kind: 'official_search'; label: string; url: string }

/** Type-specific settings, discriminated by `type`. */
export type FeedSpec = { url: string; format: 'rss' | 'atom' }
export type SitemapSpec = { sitemapUrl: string; detailPathIncludes: string[]; maxDetails: number }
export type PortalFieldMap = {
  root: string // dotted path to the array of postings in the JSON response
  id: string
  title: string
  city?: string
  url: string
  urlBase?: string // prefix relative apply URLs
  description?: string
  postedAt?: string
  validThrough?: string
}
export type PortalSpec = { searchPath: string; map: PortalFieldMap }
export type OpenEntrySpec = {
  programName: string
  officialUrl: string
  cities: string[]
  verifiedAt?: string
  note?: string
}
export type ApiSpec = { adapter: 'ba' | 'adzuna' | 'arbeitnow' | 'ats'; employerFilter?: string }

/** One registry entry — every field the plan's §5.2 registry requires. */
export type ConnectorConfig = {
  id: string
  employerFamily: string
  brands: string[]
  sector: 'grocery' | 'retail' | 'drugstore' | 'logistics' | 'food' | 'hotel'
  type: ConnectorType
  parserVersion: number
  /** Security: fixed approved hosts + path prefixes (§7). */
  allowedHosts: string[]
  pathPrefixes: string[]
  queryCapabilities: QueryCapability[]
  pagination: PaginationStrategy
  /** 10–15s per attempt (§2.1). */
  attemptTimeoutMs: number
  retryEligible: boolean
  cache: CachePolicy
  /** Response-size and content-type limits (§7). */
  maxBytes: number
  contentTypes: string[]
  fieldCoverage: FieldCoverage
  /** Employer-context workplaces used to seed classification (e.g. supermarket). */
  workplaces: WorkplaceType[]
  fallback: FallbackSpec
  /** Health + kill switch. `enabled: false` skips the connector without a redeploy. */
  health: { enabled: boolean }
  /** Verification state for the §5.4 release gate. */
  verification: 'verified' | 'candidate'
  api?: ApiSpec
  feed?: FeedSpec
  sitemap?: SitemapSpec
  portal?: PortalSpec
  openEntry?: OpenEntrySpec
  /** Federated child connector ids (resolved from the same registry). */
  members?: string[]
  /** True for configs that only run as a federated member, never standalone. */
  memberOnly?: boolean
}

/** The normalized flexible query the UI hands to the fabric. */
export type FlexibleQuery = {
  cities: { city: string; radius_km: number }[]
  employment: FlexibleEmployment[]
  roleFamilies: FlexibleRoleFamily[]
  workplaces: WorkplaceType[]
  keywords: string[]
  page?: number
  language?: 'de' | 'en'
}

/** The allowlisted retrieval primitive engines call — never `fetch` directly. */
export type FabricFetchInput = {
  connectorId: string
  host: string
  /** Path + query string, e.g. "/api/jobs?city=Berlin&page=1". */
  path: string
  accept: 'json' | 'xml' | 'text'
  maxBytes: number
  signal?: AbortSignal
}
export type FabricResponse = { status: number; contentType: string; body: string }
export type FabricFetch = (input: FabricFetchInput) => Promise<FabricResponse>

export type ConnectorContext = {
  proxy: FabricFetch
  signal?: AbortSignal
  now: () => number
}

export type ConnectorResult = {
  opportunities: NormalizedJob[]
  note?: string
  /** True when the primary path failed and the fallback route was used instead. */
  usedFallback: boolean
  error?: AppErrorData
}

export type Connector = {
  config: ConnectorConfig
  run: (query: FlexibleQuery, ctx: ConnectorContext) => Promise<ConnectorResult>
}

/** Build the `${connectorId}:${postingId}` source_id used by the dedup key. */
export function fabricSourceId(connectorId: string, postingId: string): string {
  return `${connectorId}:${postingId}`
}