// ============================================================================
// The Source-Fabric connector registry for Germany (roadmap §5.2 / §5.3).
//
// Every initial-support employer family below is a COMPLETE config, never a
// stub. Each has either a direct integration (feed / sitemap / portal /
// open_entry / federated) or an explicitly labelled official open-entry/search
// route, and ALWAYS a working `fallback` so a family can never be a broken
// placeholder (§5.4 release gate).
//
// Honesty note for shippers: the host + path of each DIRECT integration is a
// documented best-effort target and is marked `verification: 'candidate'`.
// Before enabling a candidate in production, run it through the §5.4 gate
// (verify ownership, retrieval path, fixtures, zero-inventory, removal) and set
// it to 'verified'. Until then its fallback (BA/Adzuna employer-filtered or an
// official route) is what users see — which is always useful.
//
// Baseline API connectors (BA/Adzuna/Arbeitnow) are the always-on floor of the
// fallback ladder (§6.1); direct connectors enhance them, never gate them.
// ============================================================================
import type {
  CachePolicy,
  ConnectorConfig,
  FieldCoverage,
  PaginationStrategy,
  QueryCapability,
} from './types'

const CACHE: CachePolicy = { ttlMinutes: 30, revalidateMinutes: 120 }
// Open-entry routes change rarely and are kept separate from vacancy freshness.
const OPEN_CACHE: CachePolicy = { ttlMinutes: 720, revalidateMinutes: 1440 }

const CT_JSON = ['application/json']
const CT_XML = ['application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml']
const CT_HTML = ['text/html', 'application/xhtml+xml']

const KEYWORD_CITY: QueryCapability[] = ['keyword', 'city', 'radius']
const NO_PAGE: PaginationStrategy = { kind: 'none' }

const NO_COVER: FieldCoverage = {
  title: false, employer: false, city: false, salary: false,
  description: false, postedAt: false, validThrough: false, applyUrl: false,
}
function coverage(partial: Partial<FieldCoverage>): FieldCoverage {
  return { ...NO_COVER, ...partial }
}

/** Shared defaults so each entry only states what is distinctive. */
type Base = Pick<
  ConnectorConfig,
  'parserVersion' | 'attemptTimeoutMs' | 'retryEligible' | 'cache' | 'maxBytes' | 'health' | 'verification'
>
const BASE: Base = {
  parserVersion: 1,
  attemptTimeoutMs: 12_000,
  retryEligible: true,
  cache: CACHE,
  maxBytes: 2_000_000,
  health: { enabled: true },
  verification: 'candidate',
}

function def(config: Omit<ConnectorConfig, keyof Base> & Partial<Base>): ConnectorConfig {
  return { ...BASE, ...config }
}

// ---------------------------------------------------------------------------
// 0 — Always-on API baseline (the floor of the fallback ladder).
// ---------------------------------------------------------------------------
const BASELINE: ConnectorConfig[] = [
  def({
    id: 'baseline-ba', employerFamily: 'Bundesagentur für Arbeit', brands: ['BA'], sector: 'retail',
    type: 'api', allowedHosts: ['rest.arbeitsagentur.de'], pathPrefixes: ['/jobboerse'],
    queryCapabilities: [...KEYWORD_CITY, 'pagination'], pagination: { kind: 'page', param: 'page', startAt: 1, size: 50 },
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, postedAt: true, applyUrl: true }),
    workplaces: [], fallback: { kind: 'official_search', label: 'Search the Bundesagentur job board', url: 'https://www.arbeitsagentur.de/jobsuche/' },
    api: { adapter: 'ba' }, verification: 'verified',
  }),
  def({
    id: 'baseline-adzuna', employerFamily: 'Adzuna', brands: ['Adzuna'], sector: 'retail',
    type: 'api', allowedHosts: ['api.adzuna.com'], pathPrefixes: ['/v1/api'],
    queryCapabilities: [...KEYWORD_CITY, 'pagination'], pagination: { kind: 'page', param: 'page', startAt: 1, size: 50 },
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, salary: true, postedAt: true, applyUrl: true }),
    workplaces: [], fallback: { kind: 'official_search', label: 'Search Adzuna', url: 'https://www.adzuna.de/' },
    api: { adapter: 'adzuna' }, verification: 'verified',
  }),
  def({
    id: 'baseline-arbeitnow', employerFamily: 'Arbeitnow', brands: ['Arbeitnow'], sector: 'retail',
    type: 'api', allowedHosts: ['www.arbeitnow.com'], pathPrefixes: ['/api'],
    // v2.4.2: Arbeitnow has NO server-side query — its endpoint is a plain
    // "most recent jobs" feed, so the adapter ignores what/where entirely.
    // Declaring 'keyword' here was wrong and hid the fact that everything it
    // returns must be narrowed client-side by the relevance gate.
    queryCapabilities: [], pagination: NO_PAGE,
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, applyUrl: true }),
    workplaces: [], fallback: { kind: 'official_search', label: 'Search Arbeitnow', url: 'https://www.arbeitnow.com/' },
    api: { adapter: 'arbeitnow' }, verification: 'verified',
  }),
]

// ---------------------------------------------------------------------------
// 1 — Grocery & discount.
// ---------------------------------------------------------------------------
const GROCERY: ConnectorConfig[] = [
  def({
    id: 'rewe-group', employerFamily: 'REWE Group', brands: ['REWE', 'PENNY', 'toom'], sector: 'grocery',
    type: 'feed', allowedHosts: ['jobs.rewe-group.com'], pathPrefixes: ['/'],
    queryCapabilities: ['keyword', 'city'], pagination: NO_PAGE, contentTypes: CT_XML,
    fieldCoverage: coverage({ title: true, employer: true, description: true, postedAt: true, applyUrl: true }),
    workplaces: ['supermarket', 'retail_store'],
    feed: { url: 'https://jobs.rewe-group.com/rss', format: 'rss' },
    fallback: { kind: 'api_employer', employer: 'REWE', officialSearchUrl: 'https://jobs.rewe-group.com/' },
  }),
  def({
    id: 'kaufland', employerFamily: 'Kaufland', brands: ['Kaufland'], sector: 'grocery',
    type: 'sitemap', allowedHosts: ['jobs.kaufland.com'], pathPrefixes: ['/'],
    queryCapabilities: ['keyword', 'city'], pagination: NO_PAGE, contentTypes: [...CT_XML, ...CT_HTML],
    fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, postedAt: true, validThrough: true, applyUrl: true }),
    workplaces: ['supermarket'],
    sitemap: { sitemapUrl: 'https://jobs.kaufland.com/sitemap.xml', detailPathIncludes: ['/job/', '/stelle/'], maxDetails: 12 },
    fallback: { kind: 'api_employer', employer: 'Kaufland', officialSearchUrl: 'https://jobs.kaufland.com/' },
  }),
  def({
    id: 'lidl', employerFamily: 'Lidl', brands: ['Lidl'], sector: 'grocery',
    type: 'sitemap', allowedHosts: ['jobs.lidl.de'], pathPrefixes: ['/'],
    queryCapabilities: ['keyword', 'city'], pagination: NO_PAGE, contentTypes: [...CT_XML, ...CT_HTML],
    fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, postedAt: true, validThrough: true, applyUrl: true }),
    workplaces: ['supermarket'],
    sitemap: { sitemapUrl: 'https://jobs.lidl.de/sitemap.xml', detailPathIncludes: ['/job/', '/stellenangebot'], maxDetails: 12 },
    fallback: { kind: 'api_employer', employer: 'Lidl', officialSearchUrl: 'https://jobs.lidl.de/' },
  }),
  def({
    id: 'aldi-sued', employerFamily: 'ALDI SÜD', brands: ['ALDI SÜD'], sector: 'grocery',
    type: 'feed', allowedHosts: ['jobs.aldi-sued.de'], pathPrefixes: ['/'],
    queryCapabilities: ['keyword', 'city'], pagination: NO_PAGE, contentTypes: CT_XML,
    fieldCoverage: coverage({ title: true, employer: true, description: true, postedAt: true, applyUrl: true }),
    workplaces: ['supermarket'],
    feed: { url: 'https://jobs.aldi-sued.de/rss', format: 'rss' },
    fallback: { kind: 'api_employer', employer: 'ALDI SÜD', officialSearchUrl: 'https://jobs.aldi-sued.de/' },
  }),
  def({
    id: 'aldi-nord', employerFamily: 'ALDI Nord', brands: ['ALDI Nord'], sector: 'grocery',
    type: 'portal', allowedHosts: ['karriere.aldi-nord.de'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city', 'pagination'], pagination: { kind: 'page', param: 'page', startAt: 0, size: 20, sizeParam: 'size' },
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, postedAt: true, applyUrl: true }),
    workplaces: ['supermarket'],
    portal: { searchPath: '/api/jobs', map: { root: 'jobs', id: 'id', title: 'title', city: 'city', url: 'url', urlBase: 'https://karriere.aldi-nord.de', description: 'description', postedAt: 'datePosted' } },
    fallback: { kind: 'api_employer', employer: 'ALDI Nord', officialSearchUrl: 'https://karriere.aldi-nord.de/' },
  }),
  def({
    id: 'netto-md', employerFamily: 'Netto Marken-Discount', brands: ['Netto Marken-Discount'], sector: 'grocery',
    type: 'portal', allowedHosts: ['jobs.netto-online.de'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city', 'pagination'], pagination: { kind: 'page', param: 'page', startAt: 0, size: 20, sizeParam: 'size' },
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, applyUrl: true }),
    workplaces: ['supermarket'],
    portal: { searchPath: '/api/search', map: { root: 'results', id: 'jobId', title: 'jobTitle', city: 'location', url: 'detailUrl', urlBase: 'https://jobs.netto-online.de' } },
    fallback: { kind: 'api_employer', employer: 'Netto Marken-Discount', officialSearchUrl: 'https://jobs.netto-online.de/' },
  }),
]

// ---------------------------------------------------------------------------
// 2 — Drugstores & retail.
// ---------------------------------------------------------------------------
const DRUG_RETAIL: ConnectorConfig[] = [
  def({
    id: 'dm', employerFamily: 'dm-drogerie markt', brands: ['dm'], sector: 'drugstore',
    type: 'portal', allowedHosts: ['jobs.dm.de'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city', 'pagination'], pagination: { kind: 'page', param: 'page', startAt: 1, size: 20, sizeParam: 'pageSize' },
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, applyUrl: true }),
    workplaces: ['drugstore'],
    portal: { searchPath: '/api/jobs', map: { root: 'data.jobs', id: 'id', title: 'title', city: 'location.city', url: 'links.detail', urlBase: 'https://jobs.dm.de' } },
    fallback: { kind: 'api_employer', employer: 'dm', officialSearchUrl: 'https://jobs.dm.de/' },
  }),
  def({
    id: 'rossmann', employerFamily: 'ROSSMANN', brands: ['ROSSMANN'], sector: 'drugstore',
    type: 'portal', allowedHosts: ['karriere.rossmann.de'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city', 'pagination'], pagination: { kind: 'offset', param: 'offset', size: 20, sizeParam: 'limit' },
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, applyUrl: true }),
    workplaces: ['drugstore'],
    portal: { searchPath: '/api/positions', map: { root: 'positions', id: 'reference', title: 'name', city: 'city', url: 'applyUrl' } },
    fallback: { kind: 'api_employer', employer: 'Rossmann', officialSearchUrl: 'https://karriere.rossmann.de/' },
  }),
  def({
    id: 'ikea', employerFamily: 'IKEA', brands: ['IKEA'], sector: 'retail',
    type: 'portal', allowedHosts: ['jobs.ikea.com'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city', 'pagination'], pagination: { kind: 'page', param: 'page', startAt: 1, size: 20, sizeParam: 'perPage' },
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, applyUrl: true }),
    workplaces: ['retail_store', 'warehouse'],
    portal: { searchPath: '/api/v1/jobs', map: { root: 'jobs', id: 'id', title: 'title', city: 'city', url: 'url', urlBase: 'https://jobs.ikea.com' } },
    fallback: { kind: 'api_employer', employer: 'IKEA', officialSearchUrl: 'https://jobs.ikea.com/de' },
  }),
]

// ---------------------------------------------------------------------------
// 3 — EDEKA (federated: central board + regional/independent identity).
// ---------------------------------------------------------------------------
const EDEKA: ConnectorConfig[] = [
  def({
    id: 'edeka-zentrale', employerFamily: 'EDEKA', brands: ['EDEKA'], sector: 'grocery', memberOnly: true,
    type: 'portal', allowedHosts: ['karriere.edeka.de'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city', 'pagination'], pagination: { kind: 'page', param: 'page', startAt: 0, size: 20, sizeParam: 'size' },
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, applyUrl: true }),
    workplaces: ['supermarket'],
    portal: { searchPath: '/api/jobs', map: { root: 'jobs', id: 'id', title: 'title', city: 'city', url: 'url', urlBase: 'https://karriere.edeka.de' } },
    fallback: { kind: 'api_employer', employer: 'EDEKA', officialSearchUrl: 'https://karriere.edeka.de/karriere/' },
  }),
  def({
    id: 'edeka-regional', employerFamily: 'EDEKA', brands: ['EDEKA regional'], sector: 'grocery', memberOnly: true,
    type: 'api', allowedHosts: ['rest.arbeitsagentur.de'], pathPrefixes: ['/jobboerse'],
    queryCapabilities: KEYWORD_CITY, pagination: NO_PAGE, contentTypes: CT_JSON,
    fieldCoverage: coverage({ title: true, employer: true, city: true, postedAt: true, applyUrl: true }),
    workplaces: ['supermarket'], api: { adapter: 'ba', employerFilter: 'EDEKA' },
    fallback: { kind: 'api_employer', employer: 'EDEKA', officialSearchUrl: 'https://www.edeka.de/karriere/' },
  }),
  def({
    id: 'edeka', employerFamily: 'EDEKA', brands: ['EDEKA'], sector: 'grocery',
    type: 'federated', allowedHosts: [], pathPrefixes: [], queryCapabilities: KEYWORD_CITY, pagination: NO_PAGE,
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true }),
    workplaces: ['supermarket'], members: ['edeka-zentrale', 'edeka-regional'],
    fallback: { kind: 'api_employer', employer: 'EDEKA', officialSearchUrl: 'https://www.edeka.de/karriere/' },
  }),
]

// ---------------------------------------------------------------------------
// 4 — Logistics & delivery.
// ---------------------------------------------------------------------------
const LOGISTICS: ConnectorConfig[] = [
  def({
    id: 'dhl', employerFamily: 'Deutsche Post DHL', brands: ['Deutsche Post', 'DHL'], sector: 'logistics',
    type: 'portal', allowedHosts: ['careers.dhl.com'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city', 'pagination'], pagination: { kind: 'page', param: 'page', startAt: 1, size: 20, sizeParam: 'size' },
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, applyUrl: true }),
    workplaces: ['parcel_hub', 'warehouse', 'delivery'],
    portal: { searchPath: '/api/jobs', map: { root: 'data', id: 'id', title: 'title', city: 'city', url: 'applyUrl', urlBase: 'https://careers.dhl.com' } },
    fallback: { kind: 'api_employer', employer: 'DHL', officialSearchUrl: 'https://careers.dhl.com/global/en' },
  }),
  def({
    id: 'amazon-ops', employerFamily: 'Amazon Operations', brands: ['Amazon'], sector: 'logistics',
    type: 'open_entry', allowedHosts: ['hiring.amazon.de'], pathPrefixes: ['/app'],
    queryCapabilities: ['city'], pagination: NO_PAGE, cache: OPEN_CACHE, contentTypes: CT_HTML,
    fieldCoverage: coverage({ title: true, employer: true, city: true, applyUrl: true }),
    workplaces: ['warehouse', 'parcel_hub', 'delivery'],
    openEntry: { programName: 'Amazon hourly jobs — apply any time', officialUrl: 'https://hiring.amazon.de/', cities: ['Berlin', 'Hamburg', 'München', 'Leipzig', 'Dortmund', 'Frankfurt'], note: 'Official Amazon hourly-hiring pool; availability is checked at apply time.' },
    fallback: { kind: 'api_employer', employer: 'Amazon', officialSearchUrl: 'https://hiring.amazon.de/' },
  }),
  def({
    id: 'hermes-board', employerFamily: 'Hermes', brands: ['Hermes'], sector: 'logistics', memberOnly: true,
    type: 'portal', allowedHosts: ['careers.hermesworld.com'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city'], pagination: NO_PAGE, contentTypes: CT_JSON,
    fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, applyUrl: true }),
    workplaces: ['parcel_hub', 'delivery'],
    portal: { searchPath: '/api/jobs', map: { root: 'jobs', id: 'id', title: 'title', city: 'location', url: 'url', urlBase: 'https://careers.hermesworld.com' } },
    fallback: { kind: 'api_employer', employer: 'Hermes', officialSearchUrl: 'https://careers.hermesworld.com/' },
  }),
  def({
    id: 'hermes-open', employerFamily: 'Hermes', brands: ['Hermes'], sector: 'logistics', memberOnly: true,
    type: 'open_entry', allowedHosts: ['careers.hermesworld.com'], pathPrefixes: ['/'], cache: OPEN_CACHE,
    queryCapabilities: ['city'], pagination: NO_PAGE, contentTypes: CT_HTML,
    fieldCoverage: coverage({ title: true, employer: true, applyUrl: true }),
    workplaces: ['parcel_hub', 'delivery'],
    openEntry: { programName: 'Hermes Initiativbewerbung — candidate pool', officialUrl: 'https://careers.hermesworld.com/initiativbewerbung', cities: [], note: 'Open application for parcel and delivery roles.' },
    fallback: { kind: 'api_employer', employer: 'Hermes', officialSearchUrl: 'https://careers.hermesworld.com/' },
  }),
  def({
    id: 'hermes', employerFamily: 'Hermes', brands: ['Hermes'], sector: 'logistics',
    type: 'federated', allowedHosts: [], pathPrefixes: [], queryCapabilities: KEYWORD_CITY, pagination: NO_PAGE,
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true }),
    workplaces: ['parcel_hub', 'delivery'], members: ['hermes-board', 'hermes-open'],
    fallback: { kind: 'api_employer', employer: 'Hermes', officialSearchUrl: 'https://careers.hermesworld.com/' },
  }),
  def({
    id: 'flink-ats', employerFamily: 'Flink', brands: ['Flink'], sector: 'grocery', memberOnly: true,
    type: 'api', allowedHosts: ['api.ashbyhq.com'], pathPrefixes: ['/posting-api'],
    queryCapabilities: ['keyword'], pagination: NO_PAGE, contentTypes: CT_JSON,
    fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, applyUrl: true }),
    workplaces: ['delivery', 'warehouse'], api: { adapter: 'ats', employerFilter: 'Flink' },
    fallback: { kind: 'api_employer', employer: 'Flink', officialSearchUrl: 'https://careers.goflink.com/' },
  }),
  def({
    id: 'flink-riders', employerFamily: 'Flink', brands: ['Flink'], sector: 'grocery', memberOnly: true,
    type: 'open_entry', allowedHosts: ['careers.goflink.com'], pathPrefixes: ['/'], cache: OPEN_CACHE,
    queryCapabilities: ['city'], pagination: NO_PAGE, contentTypes: CT_HTML,
    fieldCoverage: coverage({ title: true, employer: true, applyUrl: true }),
    workplaces: ['delivery'],
    openEntry: { programName: 'Flink rider — apply any time', officialUrl: 'https://careers.goflink.com/riders', cities: ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt'], note: 'Official rider application; schedule set after onboarding.' },
    fallback: { kind: 'api_employer', employer: 'Flink', officialSearchUrl: 'https://careers.goflink.com/' },
  }),
  def({
    id: 'flink', employerFamily: 'Flink', brands: ['Flink'], sector: 'grocery',
    type: 'federated', allowedHosts: [], pathPrefixes: [], queryCapabilities: KEYWORD_CITY, pagination: NO_PAGE,
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true }),
    workplaces: ['delivery', 'warehouse'], members: ['flink-ats', 'flink-riders'],
    fallback: { kind: 'api_employer', employer: 'Flink', officialSearchUrl: 'https://careers.goflink.com/' },
  }),
  def({
    id: 'lieferando', employerFamily: 'Lieferando', brands: ['Lieferando'], sector: 'food',
    type: 'open_entry', allowedHosts: ['karriere.lieferando.de'], pathPrefixes: ['/'], cache: OPEN_CACHE,
    queryCapabilities: ['city'], pagination: NO_PAGE, contentTypes: CT_HTML,
    fieldCoverage: coverage({ title: true, employer: true, applyUrl: true }),
    workplaces: ['delivery'],
    openEntry: { programName: 'Lieferando courier — apply in your city', officialUrl: 'https://karriere.lieferando.de/rider', cities: ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt', 'Düsseldorf'], note: 'City-aware official courier application.' },
    fallback: { kind: 'api_employer', employer: 'Lieferando', officialSearchUrl: 'https://karriere.lieferando.de/' },
  }),
  def({
    id: 'wolt', employerFamily: 'Wolt', brands: ['Wolt'], sector: 'food',
    type: 'open_entry', allowedHosts: ['wolt.com'], pathPrefixes: ['/'], cache: OPEN_CACHE,
    queryCapabilities: ['city'], pagination: NO_PAGE, contentTypes: CT_HTML,
    fieldCoverage: coverage({ title: true, employer: true, applyUrl: true }),
    workplaces: ['delivery'],
    openEntry: { programName: 'Wolt courier partner — apply in your city', officialUrl: 'https://wolt.com/en/deu/careers/couriers', cities: ['Berlin', 'Hamburg', 'München', 'Frankfurt'], note: 'Official Wolt courier-partner application.' },
    fallback: { kind: 'api_employer', employer: 'Wolt', officialSearchUrl: 'https://careers.wolt.com/' },
  }),
]

// ---------------------------------------------------------------------------
// 5 — Food service.
// ---------------------------------------------------------------------------
const FOOD: ConnectorConfig[] = [
  def({
    id: 'mcdonalds', employerFamily: "McDonald's", brands: ["McDonald's"], sector: 'food',
    type: 'portal', allowedHosts: ['mcdonalds.jobs'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city', 'pagination'], pagination: { kind: 'page', param: 'page', startAt: 1, size: 20, sizeParam: 'size' },
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true, description: true, applyUrl: true }),
    workplaces: ['restaurant'],
    portal: { searchPath: '/api/jobs', map: { root: 'jobs', id: 'id', title: 'title', city: 'city', url: 'url', urlBase: 'https://mcdonalds.jobs' } },
    fallback: { kind: 'open_entry', programName: "McDonald's restaurant — apply at your local restaurant", officialUrl: 'https://www.mcdonalds.com/de/de-de/karriere.html', cities: [], note: 'Restaurant-level official application (franchise).' },
  }),
  def({
    id: 'burger-king', employerFamily: 'Burger King', brands: ['Burger King'], sector: 'food',
    type: 'portal', allowedHosts: ['bkkarriere.de'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city'], pagination: NO_PAGE, contentTypes: CT_JSON,
    fieldCoverage: coverage({ title: true, employer: true, city: true, applyUrl: true }),
    workplaces: ['restaurant'],
    portal: { searchPath: '/api/jobs', map: { root: 'results', id: 'id', title: 'title', city: 'city', url: 'url', urlBase: 'https://bkkarriere.de' } },
    fallback: { kind: 'api_employer', employer: 'Burger King', officialSearchUrl: 'https://bkkarriere.de/' },
  }),
  def({
    id: 'starbucks', employerFamily: 'Starbucks', brands: ['Starbucks', 'AmRest'], sector: 'food',
    type: 'portal', allowedHosts: ['careers.amrest.eu'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city'], pagination: NO_PAGE, contentTypes: CT_JSON,
    fieldCoverage: coverage({ title: true, employer: true, city: true, applyUrl: true }),
    workplaces: ['cafe'],
    portal: { searchPath: '/api/offers', map: { root: 'offers', id: 'id', title: 'position', city: 'city', url: 'applyUrl' } },
    fallback: { kind: 'api_employer', employer: 'Starbucks', officialSearchUrl: 'https://careers.amrest.eu/' },
  }),
  def({
    id: 'nordsee', employerFamily: 'NORDSEE', brands: ['NORDSEE'], sector: 'food',
    type: 'portal', allowedHosts: ['karriere.nordsee.com'], pathPrefixes: ['/api'],
    queryCapabilities: ['keyword', 'city'], pagination: NO_PAGE, contentTypes: CT_JSON,
    fieldCoverage: coverage({ title: true, employer: true, city: true, applyUrl: true }),
    workplaces: ['restaurant'],
    portal: { searchPath: '/api/jobs', map: { root: 'jobs', id: 'id', title: 'title', city: 'city', url: 'url', urlBase: 'https://karriere.nordsee.com' } },
    fallback: { kind: 'open_entry', programName: 'NORDSEE restaurant — open application', officialUrl: 'https://karriere.nordsee.com/', cities: [], note: 'General restaurant open application.' },
  }),
]

// ---------------------------------------------------------------------------
// 6 — Hotels (federated launch pack: a defined minimum, not every brand).
// ---------------------------------------------------------------------------
const HOTEL_BRANDS: { id: string; name: string; url: string }[] = [
  { id: 'accor', name: 'Accor', url: 'https://careers.accor.com/' },
  { id: 'marriott', name: 'Marriott', url: 'https://careers.marriott.com/' },
  { id: 'hilton', name: 'Hilton', url: 'https://jobs.hilton.com/' },
  { id: 'ihg', name: 'IHG', url: 'https://careers.ihg.com/' },
  { id: 'motel-one', name: 'Motel One', url: 'https://www.motel-one.com/de/jobs/' },
  { id: 'hworld', name: 'H World International / Steigenberger', url: 'https://www.hworld-international.com/karriere/' },
]
const HOTELS: ConnectorConfig[] = [
  ...HOTEL_BRANDS.map((brand) =>
    def({
      id: `hotel-${brand.id}`, employerFamily: 'Major hotel groups', brands: [brand.name], sector: 'hotel', memberOnly: true,
      type: 'api', allowedHosts: ['rest.arbeitsagentur.de'], pathPrefixes: ['/jobboerse'],
      queryCapabilities: KEYWORD_CITY, pagination: NO_PAGE, contentTypes: CT_JSON,
      fieldCoverage: coverage({ title: true, employer: true, city: true, postedAt: true, applyUrl: true }),
      workplaces: ['hotel'], api: { adapter: 'ba', employerFilter: brand.name },
      fallback: { kind: 'api_employer', employer: brand.name, officialSearchUrl: brand.url },
    }),
  ),
  def({
    id: 'hotels', employerFamily: 'Major hotel groups', brands: HOTEL_BRANDS.map((b) => b.name), sector: 'hotel',
    type: 'federated', allowedHosts: [], pathPrefixes: [], queryCapabilities: KEYWORD_CITY, pagination: NO_PAGE,
    contentTypes: CT_JSON, fieldCoverage: coverage({ title: true, employer: true, city: true }),
    workplaces: ['hotel'], members: HOTEL_BRANDS.map((b) => `hotel-${b.id}`),
    fallback: { kind: 'api_employer', employer: 'Hotel', officialSearchUrl: 'https://www.arbeitsagentur.de/jobsuche/suche?was=Hotel' },
  }),
]

/** The complete DE flexible-work registry. */
export const FLEXIBLE_REGISTRY_DE: ConnectorConfig[] = [
  ...BASELINE,
  ...GROCERY,
  ...DRUG_RETAIL,
  ...EDEKA,
  ...LOGISTICS,
  ...FOOD,
  ...HOTELS,
]

/** Every host any connector may reach — the source of truth for the Worker allowlist. */
export const FABRIC_ALLOWED_HOSTS: string[] = [
  ...new Set(FLEXIBLE_REGISTRY_DE.flatMap((c) => c.allowedHosts)),
].sort()

/** Top-level connectors the fabric runs (federated members are excluded). */
export function topLevelConfigs(): ConnectorConfig[] {
  return FLEXIBLE_REGISTRY_DE.filter((c) => !c.memberOnly)
}

/** The 21 initial employer families (deduped by employerFamily, excluding baselines). */
export function employerFamilies(): string[] {
  const baseline = new Set(BASELINE.map((b) => b.employerFamily))
  return [...new Set(FLEXIBLE_REGISTRY_DE.map((c) => c.employerFamily))].filter((f) => !baseline.has(f))
}