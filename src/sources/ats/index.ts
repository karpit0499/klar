import type { NormalizedJob } from '../../types'
import {
  ATS_REGISTRY_DE,
  type AtsEntry,
  type AtsLifecycleState,
} from '../registry.de'
import { fetchGreenhouse } from './greenhouse'
import { fetchLever } from './lever'
import { fetchAshby } from './ashby'
import type { AtsMarketCode } from './location'

export const ATS_TENANT_TIMEOUT_MS = 12_000
export const ATS_DIRECT_CONCURRENCY = 6

export type AtsTenantStatus = {
  company: string
  ats: AtsEntry['ats']
  slug: string
  /** active = jobs admitted, empty = healthy zero, quarantined = fetch failed. */
  state: Extract<AtsLifecycleState, 'active' | 'empty' | 'quarantined'>
  count: number
  note?: string
}

type TenantFetcher = (
  entry: AtsEntry,
  signal: AbortSignal,
  market: AtsMarketCode | 'dach',
) => Promise<NormalizedJob[]>

async function fetchOne(
  entry: AtsEntry,
  signal: AbortSignal,
  market: AtsMarketCode | 'dach',
): Promise<NormalizedJob[]> {
  if (entry.ats === 'greenhouse') return fetchGreenhouse(entry.company, entry.slug, signal, market)
  if (entry.ats === 'lever') return fetchLever(entry.company, entry.slug, signal, market)
  return fetchAshby(entry.company, entry.slug, signal, market)
}

async function withTenantTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal | undefined,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort()
  if (parent?.aborted) controller.abort()
  else parent?.addEventListener('abort', abortFromParent, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', abortFromParent)
  }
}

/** Run `worker` over `items` with at most `limit` in flight at a time. */
async function pMap<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++
      out[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return out
}

export async function fetchAllAts(
  signal?: AbortSignal,
  registry: AtsEntry[] = ATS_REGISTRY_DE,
  market: AtsMarketCode | 'dach' = 'dach',
  options: {
    fetcher?: TenantFetcher
    timeoutMs?: number
    concurrency?: number
  } = {},
): Promise<{
  jobs: NormalizedJob[]
  okCompanies: number
  emptyCompanies: number
  failedCompanies: number
  skippedCompanies: number
  companies: AtsTenantStatus[]
}> {
  const runnable = registry.filter((entry) => entry.state === 'active' && entry.delivery === 'direct')
  const skippedCompanies = registry.length - runnable.length
  const tenantFetcher = options.fetcher ?? fetchOne
  const timeoutMs = options.timeoutMs ?? ATS_TENANT_TIMEOUT_MS
  const concurrency = options.concurrency ?? ATS_DIRECT_CONCURRENCY

  const results = await pMap(runnable, concurrency, async (entry) => {
    try {
      const jobs = await withTenantTimeout(
        (attemptSignal) => tenantFetcher(entry, attemptSignal, market),
        signal,
        timeoutMs,
      )
      return {
        jobs,
        status: {
          company: entry.company,
          ats: entry.ats,
          slug: entry.slug,
          state: jobs.length ? 'active' : 'empty',
          count: jobs.length,
        } satisfies AtsTenantStatus,
      }
    } catch (error) {
      if (signal?.aborted) throw error
      return {
        jobs: [] as NormalizedJob[],
        status: {
          company: entry.company,
          ats: entry.ats,
          slug: entry.slug,
          state: 'quarantined',
          count: 0,
          note: error instanceof Error ? error.message.slice(0, 160) : 'fetch_failed',
        } satisfies AtsTenantStatus,
      }
    }
  })

  const companies = results.map((result) => result.status)
  return {
    jobs: results.flatMap((result) => result.jobs),
    okCompanies: companies.filter((company) => company.state === 'active').length,
    emptyCompanies: companies.filter((company) => company.state === 'empty').length,
    failedCompanies: companies.filter((company) => company.state === 'quarantined').length,
    skippedCompanies,
    companies,
  }
}
