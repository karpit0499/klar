// ============================================================================
// gatherJobs — the one call the UI makes. Runs every active source in parallel,
// isolates each failure (a dead source yields [] + a status line, never a crash),
// dedupes the union, and returns jobs + a per-source status for the banner.
// ============================================================================
import type { NormalizedJob, SearchQuery, Region } from '../types'
import type { SourceStatus } from './types'
import { fetchBa } from './ba'
import { fetchArbeitnow } from './arbeitnow'
import { fetchAdzuna } from './adzuna'
import { fetchAllAts } from './ats'
import { dedupeJobs } from './dedup'
import { WORKER_URL } from '../lib/config'
import type { AdzunaKey } from '../settings/adzunaKey'
import { AppError, serializeAppError, toAppError } from '../errors/appError'

export type GatherOptions = {
  signal?: AbortSignal
  /** Toggle sources on/off (defaults: BA + Arbeitnow + ATS on; Adzuna only if a Worker is set). */
  sources?: { ba?: boolean; arbeitnow?: boolean; adzuna?: boolean; ats?: boolean }
  /** Optional active region (feature 8.1). When set, only its sources run. */
  region?: Region
  /** User-supplied Adzuna credentials, relayed to the Worker per request (feature 4). */
  adzunaKey?: AdzunaKey
}

export type GatherResult = {
  jobs: NormalizedJob[]
  status: SourceStatus[]
  sourcesRequested: (SourceStatus['source'])[]
  rawCount: number
  duplicatesRemoved: number
}

export type SourcePlan = { ba: boolean; arbeitnow: boolean; adzuna: boolean; ats: boolean }

/** Pure source-selection plan used by the gatherer and the repeatable smoke suite. */
export function resolveSourcePlan(opts: Pick<GatherOptions, 'sources' | 'region'> = {}): SourcePlan {
  const sel = opts.sources ?? {}
  const allow = (id: 'ba' | 'arbeitnow' | 'adzuna' | 'greenhouse' | 'lever' | 'ashby') =>
    !opts.region || opts.region.sources.includes(id)
  const atsAllowed = allow('greenhouse') || allow('lever') || allow('ashby')
  return {
    ba: (sel.ba ?? true) && allow('ba'),
    arbeitnow: (sel.arbeitnow ?? true) && allow('arbeitnow'),
    adzuna: (sel.adzuna ?? Boolean(WORKER_URL)) && allow('adzuna'),
    ats: (sel.ats ?? true) && atsAllowed,
  }
}

export async function gatherJobs(q: SearchQuery, opts: GatherOptions = {}): Promise<GatherResult> {
  const enable = resolveSourcePlan(opts)

  const status: SourceStatus[] = []
  const buckets: NormalizedJob[][] = []

  const runners: Promise<unknown>[] = []

  if (enable.ba) {
    runners.push(
      fetchBa(q, { signal: opts.signal })
        .then((r) => {
          buckets.push(r.jobs)
          status.push({ source: 'ba', requested: true, ok: true, count: r.jobs.length, note: r.note })
        })
        .catch((e) => status.push(failedStatus('ba', e))),
    )
  }
  if (enable.arbeitnow) {
    runners.push(
      fetchArbeitnow(q, { signal: opts.signal })
        .then((r) => {
          buckets.push(r.jobs)
          status.push({ source: 'arbeitnow', requested: true, ok: true, count: r.jobs.length })
        })
        .catch((e) => status.push(failedStatus('arbeitnow', e))),
    )
  }
  if (enable.adzuna) {
    runners.push(
      fetchAdzuna(q, { signal: opts.signal, key: opts.adzunaKey, country: opts.region?.adzunaCountry })
        .then((r) => {
          buckets.push(r.jobs)
          status.push({ source: 'adzuna', requested: true, ok: true, count: r.jobs.length, note: r.note })
        })
        .catch((e) => status.push(failedStatus('adzuna', e))),
    )
  }
  if (enable.ats) {
    runners.push(
      fetchAllAts(opts.signal)
        .then((r) => {
          buckets.push(r.jobs)
          status.push({
            source: 'ats',
            requested: true,
            ok: true,
            count: r.jobs.length,
            note: `${r.okCompanies} companies${r.failedCompanies ? `, ${r.failedCompanies} skipped` : ''}`,
          })
        })
        .catch((e) => status.push(failedStatus('ats', e))),
    )
  }

  await Promise.all(runners)

  const rawJobs = buckets.flat()
  const jobs = dedupeJobs(rawJobs)
  // Stable order: newest first, then by title.
  jobs.sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? '') || a.title.localeCompare(b.title))
  const order: SourceStatus['source'][] = ['ba', 'arbeitnow', 'adzuna', 'ats']
  status.sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))
  return {
    jobs,
    status,
    sourcesRequested: status.map((item) => item.source),
    rawCount: rawJobs.length,
    duplicatesRemoved: rawJobs.length - jobs.length,
  }
}

function failedStatus(source: SourceStatus['source'], error: unknown): SourceStatus {
  const appError = error instanceof AppError
    ? error
    : toAppError(error, {
        category: 'source',
        message: `${source} could not complete this search.`,
        dataSafe: true,
        available: 'Other requested sources can still return results.',
        action: { label: 'Retry this search', kind: 'retry' },
      })
  return {
    source,
    requested: true,
    ok: false,
    count: 0,
    note: appError.message,
    error: serializeAppError(appError),
  }
}