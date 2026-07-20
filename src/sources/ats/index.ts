// ============================================================================
// ATS aggregator — fans out across the verified employer registry, calling the
// right vendor adapter per company, with BOUNDED CONCURRENCY so we don't open
// 47 sockets at once. One company failing never sinks the batch.
// ============================================================================
import type { NormalizedJob } from '../../types'
import { ATS_REGISTRY_DE, type AtsEntry } from '../registry.de'
import { fetchGreenhouse } from './greenhouse'
import { fetchLever } from './lever'
import { fetchAshby } from './ashby'

function fetchOne(entry: AtsEntry, signal?: AbortSignal): Promise<NormalizedJob[]> {
  if (entry.ats === 'greenhouse') return fetchGreenhouse(entry.company, entry.slug, signal)
  if (entry.ats === 'lever') return fetchLever(entry.company, entry.slug, signal)
  return fetchAshby(entry.company, entry.slug, signal)
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
      const i = next++
      out[i] = await worker(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return out
}

export async function fetchAllAts(
  signal?: AbortSignal,
  registry: AtsEntry[] = ATS_REGISTRY_DE,
): Promise<{ jobs: NormalizedJob[]; okCompanies: number; failedCompanies: number }> {
  let ok = 0
  let failed = 0
  const perCompany = await pMap(registry, 6, async (entry) => {
    try {
      const jobs = await fetchOne(entry, signal)
      ok++
      return jobs
    } catch {
      failed++
      return [] as NormalizedJob[]
    }
  })
  return { jobs: perCompany.flat(), okCompanies: ok, failedCompanies: failed }
}