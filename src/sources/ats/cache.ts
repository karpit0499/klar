import { AppError } from '../../errors/appError'
import { WORKER_URL } from '../../lib/config'
import type { NormalizedJob, SearchQuery } from '../../types'
import type { AtsMarketCode } from './location'

const MAX_CACHE_RESPONSE_BYTES = 2_000_000

export type CachedAtsResult = {
  jobs: NormalizedJob[]
  truncated: boolean
  activeCompanies: number
  emptyCompanies: number
  transientCompanies: number
  hardFailedCompanies: number
  quarantinedCompanies: number
  missingCompanies: number
  staleCompanies: number
}

type CachedAtsBody = {
  schemaVersion: 1
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
    && value.tags.every((tag) => typeof tag === 'string')
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function parseBody(value: unknown): CachedAtsBody | null {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.ready !== 'boolean'
    || !Array.isArray(value.jobs)
    || !value.jobs.every(isCachedJob)
    || typeof value.truncated !== 'boolean'
    || !isRecord(value.tenants)
    || !isNonNegativeInteger(value.tenants.active)
    || !isNonNegativeInteger(value.tenants.empty)
    || !isNonNegativeInteger(value.tenants.transient)
    || !isNonNegativeInteger(value.tenants.hard)
    || !isNonNegativeInteger(value.tenants.quarantined)
    || !isNonNegativeInteger(value.tenants.missing)
    || !isNonNegativeInteger(value.tenants.staleServed)) return null
  return value as CachedAtsBody
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CACHE_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new Error('ats_cache_response_too_large')
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_CACHE_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('ats_cache_response_too_large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function failure(technical: string): AppError {
  return new AppError({
    category: 'source',
    message: 'The scheduled ATS cache is temporarily unavailable.',
    dataSafe: true,
    available: 'Klar can still search its direct job sources.',
    action: { label: 'Try this search again', kind: 'retry' },
    technical,
  })
}

/** Fetch the Worker's single normalized view; never call the 100 boards here. */
export async function fetchCachedAts(
  query: SearchQuery,
  options: {
    signal?: AbortSignal
    market?: AtsMarketCode | 'dach'
    requestFetch?: typeof fetch
    workerUrl?: string
  } = {},
): Promise<CachedAtsResult> {
  const base = (options.workerUrl ?? WORKER_URL).replace(/\/$/, '')
  if (!base) throw failure('VITE_WORKER_URL is not configured')
  const url = new URL(`${base}/ats-cache`)
  const alternatives = [...query.what, ...(query.fields ?? [])]
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8)
  for (const alternative of alternatives) {
    url.searchParams.append('what', alternative.slice(0, 100))
  }
  // The Worker applies the shared region resolver before its safety cap; the
  // client applies the same filter again as a defense-in-depth contract.
  if (query.where?.city) {
    url.searchParams.set('where', query.where.city.slice(0, 100))
    url.searchParams.set('radius_km', String(query.where.radius_km))
  }
  // `remote` means remote-only. False means no remote restriction, not
  // on-site-only, so only send the narrowing flag when it is explicitly true.
  if (query.remote === true) url.searchParams.set('remote', 'true')
  if (options.market && options.market !== 'dach') {
    url.searchParams.set('market', options.market)
  }
  url.searchParams.set('limit', '200')

  let response: Response
  try {
    response = await (options.requestFetch ?? fetch)(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    })
  } catch (caught) {
    if (options.signal?.aborted) throw caught
    throw failure(caught instanceof Error ? caught.message : 'ats_cache_network')
  }
  const text = await readBoundedResponse(response).catch((caught: unknown) => {
    throw failure(caught instanceof Error ? caught.message : 'ats_cache_read')
  })
  if (!response.ok) throw failure(`ats_cache_http_${response.status}`)
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch {
    throw failure('ats_cache_invalid_json')
  }
  const body = parseBody(decoded)
  if (!body?.ready) throw failure('ats_cache_invalid_schema')
  return {
    jobs: body.jobs,
    truncated: body.truncated,
    activeCompanies: body.tenants.active,
    emptyCompanies: body.tenants.empty,
    transientCompanies: body.tenants.transient,
    hardFailedCompanies: body.tenants.hard,
    quarantinedCompanies: body.tenants.quarantined,
    missingCompanies: body.tenants.missing,
    staleCompanies: body.tenants.staleServed,
  }
}
