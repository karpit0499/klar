import { ATS_CACHE_EXPANSION_DE } from '../../src/sources/ats/catalog.v261'
import {
  isAtsLocationAdmitted,
  parseAtsLocation,
  type AtsMarketCode,
} from '../../src/sources/ats/location'
import { buildId, toISO } from '../../src/sources/normalize'
import type { NormalizedJob } from '../../src/types'
import type { Region } from '../../src/types'
import { passesLocalFilters } from '../../src/match/localFilters'
import { regionAT } from '../../src/regions/at'
import { regionCH } from '../../src/regions/ch'
import { regionDE } from '../../src/regions/de'
import { regionLI } from '../../src/regions/li'
import { regionLU } from '../../src/regions/lu'
import { regionNL } from '../../src/regions/nl'
import { readBoundedBody } from './groq'

export const ATS_CACHE_SCHEMA_VERSION = 1
export const ATS_CACHE_CATALOG_VERSION = '2026-08-11.100'
export const ATS_REFRESH_BATCH_SIZE = 6
export const ATS_TENANT_TIMEOUT_MS = 10_000
export const ATS_MAX_UPSTREAM_BYTES = 4_000_000
export const ATS_MAX_TENANT_VALUE_BYTES = 120_000
export const ATS_MAX_JOBS_PER_TENANT = 80
export const ATS_MAX_QUERY_JOBS = 200
export const ATS_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1_000

const CURSOR_KEY = `ats:${ATS_CACHE_SCHEMA_VERSION}:cursor`
const HARD_HTTP_STATUSES = new Set([400, 401, 403, 404, 410, 422])
const MARKETS = new Set<AtsMarketCode>(['de', 'at', 'ch', 'lu', 'li', 'nl'])
const encoder = new TextEncoder()

const MARKET_REGIONS: Record<AtsMarketCode, Region> = {
  de: regionDE,
  at: regionAT,
  ch: regionCH,
  lu: regionLU,
  li: regionLI,
  nl: regionNL,
}
const DACH_REGIONS = [regionDE, regionAT, regionCH, regionLU, regionLI]

type CatalogEntry = (typeof ATS_CACHE_EXPANSION_DE)[number]
type Provider = CatalogEntry['ats']
export type TenantCacheState = 'active' | 'empty' | 'transient' | 'hard' | 'quarantined'

export type AtsCacheStore = {
  getText(key: string): Promise<string | null>
  getManyText(keys: string[]): Promise<Map<string, string | null>>
  putText(key: string, value: string): Promise<void>
}

export type AtsCacheTenantRecord = {
  schemaVersion: typeof ATS_CACHE_SCHEMA_VERSION
  catalogVersion: typeof ATS_CACHE_CATALOG_VERSION
  tenantId: string
  company: string
  provider: Provider
  slug: string
  state: TenantCacheState
  jobs: NormalizedJob[]
  rawJobCount: number
  admittedJobCount: number
  storedJobCount: number
  truncated: boolean
  stale: boolean
  attemptedAt: string
  lastSuccessAt?: string
  lastErrorCode?: string
  consecutiveFailures: number
  consecutiveHardFailures: number
}

type CursorRecord = {
  schemaVersion: typeof ATS_CACHE_SCHEMA_VERSION
  catalogVersion: typeof ATS_CACHE_CATALOG_VERSION
  nextIndex: number
  lastScheduledTime: number
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type VendorSuccess = {
  rawJobCount: number
  jobs: NormalizedJob[]
}

type VendorFailureKind = 'transient' | 'hard'

class VendorFailure extends Error {
  constructor(
    readonly kind: VendorFailureKind,
    readonly code: string,
  ) {
    super(code)
  }
}

export type AtsRefreshBatchResult = {
  duplicate: boolean
  startIndex: number
  nextIndex: number
  attempted: number
  states: Record<TenantCacheState, number>
}

export type AtsCacheQueryResult = {
  status: 200 | 503
  body: {
    schemaVersion: typeof ATS_CACHE_SCHEMA_VERSION
    catalogVersion: typeof ATS_CACHE_CATALOG_VERSION
    generatedAt: string
    ready: boolean
    jobs: NormalizedJob[]
    truncated: boolean
    tenants: {
      active: number
      empty: number
      transient: number
      hard: number
      quarantined: number
      missing: number
      staleServed: number
    }
  }
}

/** Adapter around the generated KV binding. Tests use an in-memory store. */
export function workerAtsCacheStore(namespace: KVNamespace): AtsCacheStore {
  return {
    getText: (key) => namespace.get(key),
    getManyText: (keys) => namespace.get(keys, { cacheTtl: 30 }),
    putText: (key, value) => namespace.put(key, value),
  }
}

export function tenantId(entry: Pick<CatalogEntry, 'ats' | 'slug'>): string {
  return `${entry.ats}:${entry.slug}`
}

export function tenantKey(entry: Pick<CatalogEntry, 'ats' | 'slug'>): string {
  return `ats:${ATS_CACHE_SCHEMA_VERSION}:tenant:${tenantId(entry)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown, max = 8_000): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function nested(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

function validHttpsUrl(value: unknown): string | undefined {
  const text = stringValue(value, 2_048)
  if (!text) return undefined
  try {
    const parsed = new URL(text)
    return parsed.protocol === 'https:' ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

function cleanDescription(value: unknown): string {
  const text = stringValue(value, 20_000) ?? ''
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const point = Number(decimal)
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_200)
}

function safeTag(value: unknown): string | undefined {
  return stringValue(value, 80)
}

function dateValue(value: unknown): string | undefined {
  return toISO(value)
}

function period(value: unknown): 'year' | 'month' | 'hour' | undefined {
  const interval = stringValue(value, 40)?.toLowerCase() ?? ''
  if (interval.includes('year')) return 'year'
  if (interval.includes('month')) return 'month'
  if (interval.includes('hour')) return 'hour'
  return undefined
}

function normalizedJob(input: {
  provider: Provider
  sourceId: string
  title: string
  company: string
  location: NormalizedJob['location']
  description: string
  url: string
  fetchedAt: string
  postedAt?: string
  employmentType?: string
  language?: string
  tags?: string[]
  salary?: NormalizedJob['salary']
}): NormalizedJob {
  return {
    id: buildId(input.provider, input.sourceId),
    source: input.provider,
    source_id: input.sourceId,
    title: input.title,
    company: input.company,
    location: input.location,
    description: input.description,
    url: input.url,
    posted_at: input.postedAt,
    salary: input.salary ?? {},
    employment_type: input.employmentType,
    language: input.language,
    tags: (input.tags ?? []).filter(Boolean).slice(0, 12),
    fetched_at: input.fetchedAt,
  }
}

function normalizeGreenhouse(
  entry: CatalogEntry,
  payload: unknown,
  fetchedAt: string,
): VendorSuccess {
  if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
    throw new VendorFailure('hard', 'schema_greenhouse_root')
  }
  const rawJobCount = payload.jobs.length
  let structurallyValid = 0
  const jobs: NormalizedJob[] = []
  for (const raw of payload.jobs) {
    if (!isRecord(raw)) continue
    const sourceId = numberValue(raw.id)?.toString() ?? stringValue(raw.id, 120)
    const title = stringValue(raw.title, 300)
    const url = validHttpsUrl(raw.absolute_url)
    if (!sourceId || !title || !url) continue
    structurallyValid += 1
    const location = nested(raw, 'location')
    const offices = Array.isArray(raw.offices) ? raw.offices : []
    const firstOffice = offices.find(isRecord)
    const parsed = parseAtsLocation({
      locationText: stringValue(nested(location, 'name'), 200),
      region: stringValue(nested(firstOffice, 'location'), 200),
    })
    if (!isAtsLocationAdmitted(parsed, 'dach')) continue
    const departments = Array.isArray(raw.departments) ? raw.departments : []
    jobs.push(normalizedJob({
      provider: 'greenhouse',
      sourceId,
      title,
      company: stringValue(raw.company_name, 200) ?? entry.company,
      location: parsed.location,
      description: cleanDescription(raw.content),
      url,
      postedAt: dateValue(raw.first_published ?? raw.updated_at),
      language: stringValue(raw.language, 20),
      tags: departments.flatMap((department) => {
        const name = safeTag(nested(department, 'name'))
        return name ? [name] : []
      }),
      fetchedAt,
    }))
  }
  if (rawJobCount > 0 && structurallyValid === 0) {
    throw new VendorFailure('hard', 'schema_greenhouse_jobs')
  }
  return { rawJobCount, jobs }
}

function normalizeLever(
  entry: CatalogEntry,
  payload: unknown,
  fetchedAt: string,
): VendorSuccess {
  if (!Array.isArray(payload)) throw new VendorFailure('hard', 'schema_lever_root')
  const rawJobCount = payload.length
  let structurallyValid = 0
  const jobs: NormalizedJob[] = []
  for (const raw of payload) {
    if (!isRecord(raw)) continue
    const sourceId = stringValue(raw.id, 120)
    const title = stringValue(raw.text, 300)
    const url = validHttpsUrl(raw.hostedUrl)
    if (!sourceId || !title || !url) continue
    structurallyValid += 1
    const categories = isRecord(raw.categories) ? raw.categories : {}
    const parsed = parseAtsLocation({
      locationText: stringValue(categories.location, 200),
      country: stringValue(raw.country, 100),
      remote: stringValue(raw.workplaceType, 40)?.toLowerCase() === 'remote',
    })
    if (!isAtsLocationAdmitted(parsed, 'dach')) continue
    const salaryRange = isRecord(raw.salaryRange) ? raw.salaryRange : undefined
    jobs.push(normalizedJob({
      provider: 'lever',
      sourceId,
      title,
      company: entry.company,
      location: parsed.location,
      description: cleanDescription([
        stringValue(raw.descriptionPlain, 12_000),
        stringValue(raw.additionalPlain, 8_000),
      ].filter(Boolean).join('\n\n')),
      url,
      postedAt: dateValue(raw.createdAt),
      employmentType: stringValue(categories.commitment, 100),
      tags: [safeTag(categories.department), safeTag(categories.team)].filter(
        (tag): tag is string => Boolean(tag),
      ),
      salary: salaryRange ? {
        min: numberValue(salaryRange.min),
        max: numberValue(salaryRange.max),
        currency: stringValue(salaryRange.currency, 12),
        period: period(salaryRange.interval),
      } : {},
      fetchedAt,
    }))
  }
  if (rawJobCount > 0 && structurallyValid === 0) {
    throw new VendorFailure('hard', 'schema_lever_jobs')
  }
  return { rawJobCount, jobs }
}

function normalizeAshby(
  entry: CatalogEntry,
  payload: unknown,
  fetchedAt: string,
): VendorSuccess {
  if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
    throw new VendorFailure('hard', 'schema_ashby_root')
  }
  const rawJobCount = payload.jobs.length
  let structurallyValid = 0
  const jobs: NormalizedJob[] = []
  for (const raw of payload.jobs) {
    if (!isRecord(raw) || raw.isListed === false) continue
    const sourceId = stringValue(raw.id, 120)
    const title = stringValue(raw.title, 300)
    const url = validHttpsUrl(raw.jobUrl)
    if (!sourceId || !title || !url) continue
    structurallyValid += 1
    const address = nested(raw, 'address')
    const postal = nested(address, 'postalAddress')
    const parsed = parseAtsLocation({
      locationText: stringValue(raw.location, 200),
      city: stringValue(nested(postal, 'addressLocality'), 100),
      region: stringValue(nested(postal, 'addressRegion'), 100),
      country: stringValue(nested(postal, 'addressCountry'), 100),
      remote: booleanValue(raw.isRemote)
        || stringValue(raw.workplaceType, 40)?.toLowerCase() === 'remote',
    })
    if (!isAtsLocationAdmitted(parsed, 'dach')) continue
    jobs.push(normalizedJob({
      provider: 'ashby',
      sourceId,
      title,
      company: entry.company,
      location: parsed.location,
      description: cleanDescription(raw.descriptionPlain),
      url,
      postedAt: dateValue(raw.publishedAt),
      employmentType: stringValue(raw.employmentType, 100),
      tags: [safeTag(raw.department), safeTag(raw.team)].filter(
        (tag): tag is string => Boolean(tag),
      ),
      fetchedAt,
    }))
  }
  if (rawJobCount > 0 && structurallyValid === 0) {
    throw new VendorFailure('hard', 'schema_ashby_jobs')
  }
  return { rawJobCount, jobs }
}

function upstreamUrl(entry: CatalogEntry): string {
  const slug = encodeURIComponent(entry.slug)
  if (entry.ats === 'greenhouse') {
    return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
  }
  if (entry.ats === 'lever') return `https://api.lever.co/v0/postings/${slug}?mode=json`
  return `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`
}

async function fetchVendor(
  entry: CatalogEntry,
  fetchedAt: string,
  requestFetch: FetchLike,
): Promise<VendorSuccess> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ATS_TENANT_TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await requestFetch(upstreamUrl(entry), {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'klar-ats-cache/2.6.1' },
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch (caught) {
      const timedOut = controller.signal.aborted
      throw new VendorFailure('transient', timedOut ? 'upstream_timeout' : 'upstream_network')
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      throw new VendorFailure('hard', 'upstream_redirect')
    }
    if (!response.ok) {
      await response.body?.cancel()
      const kind = HARD_HTTP_STATUSES.has(response.status) ? 'hard' : 'transient'
      throw new VendorFailure(kind, `upstream_http_${response.status}`)
    }
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
      await response.body?.cancel()
      throw new VendorFailure('transient', 'upstream_non_json')
    }
    const declaredLength = Number(response.headers.get('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > ATS_MAX_UPSTREAM_BYTES) {
      await response.body?.cancel()
      throw new VendorFailure('transient', 'upstream_too_large')
    }
    const body = await readBoundedBody(response.body, ATS_MAX_UPSTREAM_BYTES)
    if (!body.ok) throw new VendorFailure('transient', 'upstream_too_large')
    let payload: unknown
    try {
      payload = JSON.parse(body.text)
    } catch {
      throw new VendorFailure('transient', 'upstream_invalid_json')
    }
    if (entry.ats === 'greenhouse') return normalizeGreenhouse(entry, payload, fetchedAt)
    if (entry.ats === 'lever') return normalizeLever(entry, payload, fetchedAt)
    return normalizeAshby(entry, payload, fetchedAt)
  } finally {
    clearTimeout(timeout)
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isCachedJob(value: unknown): value is NormalizedJob {
  if (!isRecord(value) || !isRecord(value.location) || !isRecord(value.salary)) return false
  return typeof value.id === 'string'
    && (value.source === 'greenhouse' || value.source === 'lever' || value.source === 'ashby')
    && typeof value.source_id === 'string'
    && typeof value.title === 'string'
    && typeof value.company === 'string'
    && typeof value.location.country === 'string'
    && typeof value.location.remote === 'boolean'
    && typeof value.description === 'string'
    && typeof value.url === 'string'
    && typeof value.fetched_at === 'string'
    && Array.isArray(value.tags)
}

export function parseTenantRecord(text: string | null): AtsCacheTenantRecord | null {
  if (!text || encoder.encode(text).byteLength > ATS_MAX_TENANT_VALUE_BYTES) return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value)
    || value.schemaVersion !== ATS_CACHE_SCHEMA_VERSION
    || value.catalogVersion !== ATS_CACHE_CATALOG_VERSION
    || typeof value.tenantId !== 'string'
    || typeof value.company !== 'string'
    || (value.provider !== 'greenhouse' && value.provider !== 'lever' && value.provider !== 'ashby')
    || typeof value.slug !== 'string'
    || !['active', 'empty', 'transient', 'hard', 'quarantined'].includes(String(value.state))
    || !Array.isArray(value.jobs)
    || !value.jobs.every(isCachedJob)
    || typeof value.rawJobCount !== 'number'
    || typeof value.admittedJobCount !== 'number'
    || typeof value.storedJobCount !== 'number'
    || typeof value.truncated !== 'boolean'
    || typeof value.stale !== 'boolean'
    || !isIsoDate(value.attemptedAt)
    || (value.lastSuccessAt !== undefined && !isIsoDate(value.lastSuccessAt))
    || (value.lastErrorCode !== undefined && typeof value.lastErrorCode !== 'string')
    || typeof value.consecutiveFailures !== 'number'
    || typeof value.consecutiveHardFailures !== 'number') {
    return null
  }
  return value as AtsCacheTenantRecord
}

function boundedRecord(record: AtsCacheTenantRecord): AtsCacheTenantRecord {
  const jobs = record.jobs.slice(0, ATS_MAX_JOBS_PER_TENANT)
  let bounded = {
    ...record,
    jobs,
    storedJobCount: jobs.length,
    truncated: record.admittedJobCount > jobs.length,
  }
  while (jobs.length && encoder.encode(JSON.stringify(bounded)).byteLength > ATS_MAX_TENANT_VALUE_BYTES) {
    jobs.pop()
    bounded = {
      ...bounded,
      jobs,
      storedJobCount: jobs.length,
      truncated: true,
    }
  }
  if (encoder.encode(JSON.stringify(bounded)).byteLength > ATS_MAX_TENANT_VALUE_BYTES) {
    throw new Error('tenant_metadata_exceeds_cache_limit')
  }
  return bounded
}

async function refreshTenant(
  store: AtsCacheStore,
  entry: CatalogEntry,
  attemptedAt: string,
  requestFetch: FetchLike,
): Promise<TenantCacheState> {
  const key = tenantKey(entry)
  const previous = parseTenantRecord(await store.getText(key))
  let record: AtsCacheTenantRecord
  try {
    const result = await fetchVendor(entry, attemptedAt, requestFetch)
    const state: TenantCacheState = result.jobs.length ? 'active' : 'empty'
    record = {
      schemaVersion: ATS_CACHE_SCHEMA_VERSION,
      catalogVersion: ATS_CACHE_CATALOG_VERSION,
      tenantId: tenantId(entry),
      company: entry.company,
      provider: entry.ats,
      slug: entry.slug,
      state,
      jobs: result.jobs,
      rawJobCount: result.rawJobCount,
      admittedJobCount: result.jobs.length,
      storedJobCount: result.jobs.length,
      truncated: false,
      stale: false,
      attemptedAt,
      lastSuccessAt: attemptedAt,
      consecutiveFailures: 0,
      consecutiveHardFailures: 0,
    }
  } catch (caught) {
    const failure = caught instanceof VendorFailure
      ? caught
      : new VendorFailure('transient', 'refresh_internal')
    const wasQuarantined = previous?.state === 'quarantined'
    let consecutiveHardFailures = 0
    if (wasQuarantined) consecutiveHardFailures = previous.consecutiveHardFailures
    else if (failure.kind === 'hard') {
      consecutiveHardFailures = previous?.state === 'hard'
        ? previous.consecutiveHardFailures + 1
        : 1
    }
    record = {
      schemaVersion: ATS_CACHE_SCHEMA_VERSION,
      catalogVersion: ATS_CACHE_CATALOG_VERSION,
      tenantId: tenantId(entry),
      company: entry.company,
      provider: entry.ats,
      slug: entry.slug,
      state: wasQuarantined
        ? 'quarantined'
        : failure.kind === 'hard' && consecutiveHardFailures >= 3
          ? 'quarantined'
          : failure.kind,
      jobs: previous?.jobs ?? [],
      rawJobCount: previous?.rawJobCount ?? 0,
      admittedJobCount: previous?.admittedJobCount ?? 0,
      storedJobCount: previous?.jobs.length ?? 0,
      truncated: previous?.truncated ?? false,
      stale: Boolean(previous?.jobs.length),
      attemptedAt,
      lastSuccessAt: previous?.lastSuccessAt,
      lastErrorCode: failure.code,
      consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
      consecutiveHardFailures,
    }
  }
  const bounded = boundedRecord(record)
  await store.putText(key, JSON.stringify(bounded))
  return bounded.state
}

function parseCursor(text: string | null): CursorRecord | null {
  if (!text) return null
  try {
    const value: unknown = JSON.parse(text)
    if (!isRecord(value)
      || value.schemaVersion !== ATS_CACHE_SCHEMA_VERSION
      || value.catalogVersion !== ATS_CACHE_CATALOG_VERSION
      || !Number.isInteger(value.nextIndex)
      || typeof value.nextIndex !== 'number'
      || value.nextIndex < 0
      || value.nextIndex >= ATS_CACHE_EXPANSION_DE.length
      || typeof value.lastScheduledTime !== 'number') return null
    return value as CursorRecord
  } catch {
    return null
  }
}

/**
 * Refresh a small, cursor-selected batch. Writes are sequential: this bounds
 * sockets and memory and remains under the Free-plan 50-subrequest ceiling.
 * A failed KV write prevents cursor advancement, making a retry idempotent.
 */
export async function refreshAtsCacheBatch(
  store: AtsCacheStore,
  options: {
    scheduledTime: number
    requestFetch?: FetchLike
    batchSize?: number
  },
): Promise<AtsRefreshBatchResult> {
  const batchSize = Math.max(1, Math.min(
    Math.floor(options.batchSize ?? ATS_REFRESH_BATCH_SIZE),
    ATS_REFRESH_BATCH_SIZE,
  ))
  const previous = parseCursor(await store.getText(CURSOR_KEY))
  const startIndex = previous?.nextIndex ?? 0
  if (previous?.lastScheduledTime === options.scheduledTime) {
    return {
      duplicate: true,
      startIndex,
      nextIndex: startIndex,
      attempted: 0,
      states: { active: 0, empty: 0, transient: 0, hard: 0, quarantined: 0 },
    }
  }
  const attemptedAt = new Date(options.scheduledTime).toISOString()
  const states: Record<TenantCacheState, number> = {
    active: 0,
    empty: 0,
    transient: 0,
    hard: 0,
    quarantined: 0,
  }
  for (let offset = 0; offset < batchSize; offset += 1) {
    const index = (startIndex + offset) % ATS_CACHE_EXPANSION_DE.length
    const state = await refreshTenant(
      store,
      ATS_CACHE_EXPANSION_DE[index],
      attemptedAt,
      options.requestFetch ?? fetch,
    )
    states[state] += 1
  }
  const nextIndex = (startIndex + batchSize) % ATS_CACHE_EXPANSION_DE.length
  await store.putText(CURSOR_KEY, JSON.stringify({
    schemaVersion: ATS_CACHE_SCHEMA_VERSION,
    catalogVersion: ATS_CACHE_CATALOG_VERSION,
    nextIndex,
    lastScheduledTime: options.scheduledTime,
  } satisfies CursorRecord))
  return { duplicate: false, startIndex, nextIndex, attempted: batchSize, states }
}

function folded(value: string, digraph = false): string {
  const lower = value.toLowerCase()
  return (digraph
    ? lower.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    : lower)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function foldedVariants(value: string): string[] {
  return [...new Set([folded(value), folded(value, true)].filter(Boolean))]
}

function queryValue(params: URLSearchParams, name: string, max: number): string {
  return (params.get(name) ?? '').trim().slice(0, max)
}

function queryLimit(params: URLSearchParams): number {
  const requested = Number(params.get('limit') ?? ATS_MAX_QUERY_JOBS)
  if (!Number.isInteger(requested)) return ATS_MAX_QUERY_JOBS
  return Math.max(1, Math.min(requested, ATS_MAX_QUERY_JOBS))
}

function queryRadius(params: URLSearchParams): number | undefined {
  const radius = Number(params.get('radius_km') ?? '')
  if (!Number.isFinite(radius) || radius <= 0) return undefined
  return Math.min(radius, 500)
}

function combinedDachResolver(city: string): ReturnType<Region['resolveLocation']> {
  for (const region of DACH_REGIONS) {
    const resolved = region.resolveLocation(city)
    if (resolved.lat != null && resolved.lng != null) return resolved
  }
  return { canonical: city.trim() }
}

function matchesGeography(
  job: NormalizedJob,
  params: URLSearchParams,
  market: AtsMarketCode | undefined,
): boolean {
  const where = queryValue(params, 'where', 100)
  const radius = queryRadius(params)
  if (!where || radius == null) return true
  const resolver = market ? MARKET_REGIONS[market].resolveLocation : combinedDachResolver
  const origin = resolver(where)
  // Match the client contract: an unresolved origin does not pretend the
  // radius was enforced. Search diagnostics will surface that state.
  if (origin.lat == null || origin.lng == null) return true
  return passesLocalFilters(job, {
    maxDistanceKm: radius,
    origin: { lat: origin.lat, lng: origin.lng },
    targetCity: where,
    resolveLocation: resolver,
    keepRemoteRegardlessOfDistance: queryValue(params, 'remote', 8).toLowerCase() === 'true',
    keepUnlocatable: false,
  })
}

function matchesQuery(job: NormalizedJob, params: URLSearchParams): boolean {
  const marketValue = queryValue(params, 'market', 10).toLowerCase()
  const market = MARKETS.has(marketValue as AtsMarketCode)
    ? marketValue as AtsMarketCode
    : undefined
  if (market) {
    const parsed = parseAtsLocation({
      city: job.location.city,
      region: job.location.region,
      country: job.location.country,
      remote: job.location.remote,
    })
    if (!isAtsLocationAdmitted(parsed, market)) return false
  }
  const remote = queryValue(params, 'remote', 8).toLowerCase()
  if (remote === 'true' && !job.location.remote) return false
  const alternatives = params.getAll('what')
    .slice(0, 8)
    .map((value) => foldedVariants(value.slice(0, 100))
      .map((variant) => variant.split(' ').filter(Boolean).slice(0, 8)))
    .filter((variants) => variants.some((terms) => terms.length > 0))
  if (alternatives.length) {
    const haystacks = foldedVariants(`${job.title} ${job.company} ${job.description} ${job.tags.join(' ')}`)
    if (!alternatives.some((variants) => variants.some((terms) => (
      terms.length > 0 && terms.every((term) => haystacks.some((haystack) => haystack.includes(term)))
    )))) return false
  }
  return matchesGeography(job, params, market)
}

/** One bounded, normalized endpoint read; no caller-controlled upstream URL. */
export async function queryAtsCache(
  store: AtsCacheStore,
  params: URLSearchParams,
  now = Date.now(),
): Promise<AtsCacheQueryResult> {
  const entriesByKey = new Map(
    ATS_CACHE_EXPANSION_DE.map((entry) => [tenantKey(entry), entry] as const),
  )
  const values = await store.getManyText([...entriesByKey.keys()])
  const counts = {
    active: 0,
    empty: 0,
    transient: 0,
    hard: 0,
    quarantined: 0,
    missing: 0,
    staleServed: 0,
  }
  const candidates: NormalizedJob[] = []
  for (const [key, entry] of entriesByKey) {
    const record = parseTenantRecord(values.get(key) ?? null)
    if (!record || record.tenantId !== tenantId(entry)) {
      counts.missing += 1
      continue
    }
    counts[record.state] += 1
    const servesCurrent = record.state === 'active'
    const lastSuccess = record.lastSuccessAt ? Date.parse(record.lastSuccessAt) : Number.NaN
    // Hard failures get two grace checks before quarantine. This avoids hiding
    // verified inventory after one bad 404/403 while still retiring persistent
    // hard failures on the third consecutive check.
    const servesStale = (record.state === 'transient' || record.state === 'hard')
      && Number.isFinite(lastSuccess)
      && now - lastSuccess <= ATS_MAX_STALE_MS
      && record.jobs.length > 0
    if (servesStale) counts.staleServed += 1
    if (!servesCurrent && !servesStale) continue
    for (const job of record.jobs) {
      if (matchesQuery(job, params)) candidates.push(job)
    }
  }
  candidates.sort((left, right) =>
    (right.posted_at ?? '').localeCompare(left.posted_at ?? '')
    || left.title.localeCompare(right.title)
    || left.company.localeCompare(right.company)
    || left.id.localeCompare(right.id))
  const deduplicated = [...new Map(candidates.map((job) => [job.id, job])).values()]
  const limit = queryLimit(params)
  const jobs = deduplicated.slice(0, limit)
  const ready = counts.missing < ATS_CACHE_EXPANSION_DE.length
  return {
    status: ready ? 200 : 503,
    body: {
      schemaVersion: ATS_CACHE_SCHEMA_VERSION,
      catalogVersion: ATS_CACHE_CATALOG_VERSION,
      generatedAt: new Date(now).toISOString(),
      ready,
      jobs,
      truncated: deduplicated.length > jobs.length,
      tenants: counts,
    },
  }
}
