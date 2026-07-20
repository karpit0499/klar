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

export type GatherOptions = {
  signal?: AbortSignal
  /** Toggle sources on/off (defaults: BA + Arbeitnow + ATS on; Adzuna only if a Worker is set). */
  sources?: { ba?: boolean; arbeitnow?: boolean; adzuna?: boolean; ats?: boolean }
  /** Optional active region (feature 8.1). When set, only its sources run. */
  region?: Region
}

export type GatherResult = {
  jobs: NormalizedJob[]
  status: SourceStatus[]
}

export async function gatherJobs(q: SearchQuery, opts: GatherOptions = {}): Promise<GatherResult> {
  const sel = opts.sources ?? {}
  // A region, when supplied, restricts which sources are even eligible.
  const allow = (id: 'ba' | 'arbeitnow' | 'adzuna' | 'greenhouse' | 'lever' | 'ashby') =>
    !opts.region || opts.region.sources.includes(id)
  const atsAllowed = allow('greenhouse') || allow('lever') || allow('ashby')
  const enable = {
    ba: (sel.ba ?? true) && allow('ba'),
    arbeitnow: (sel.arbeitnow ?? true) && allow('arbeitnow'),
    // Adzuna needs the Worker (+ key); default on only when a Worker URL exists.
    adzuna: (sel.adzuna ?? Boolean(WORKER_URL)) && allow('adzuna'),
    ats: (sel.ats ?? true) && atsAllowed,
  }

  const status: SourceStatus[] = []
  const buckets: NormalizedJob[][] = []

  const runners: Promise<unknown>[] = []

  if (enable.ba) {
    runners.push(
      fetchBa(q, { signal: opts.signal })
        .then((r) => {
          buckets.push(r.jobs)
          status.push({ source: 'ba', ok: true, count: r.jobs.length, note: r.note })
        })
        .catch((e) => status.push({ source: 'ba', ok: false, count: 0, note: shortErr(e) })),
    )
  }
  if (enable.arbeitnow) {
    runners.push(
      fetchArbeitnow(q, { signal: opts.signal })
        .then((r) => {
          buckets.push(r.jobs)
          status.push({ source: 'arbeitnow', ok: true, count: r.jobs.length })
        })
        .catch((e) => status.push({ source: 'arbeitnow', ok: false, count: 0, note: shortErr(e) })),
    )
  }
  if (enable.adzuna) {
    runners.push(
      fetchAdzuna(q, { signal: opts.signal })
        .then((r) => {
          buckets.push(r.jobs)
          status.push({ source: 'adzuna', ok: true, count: r.jobs.length, note: r.note })
        })
        .catch((e) => status.push({ source: 'adzuna', ok: false, count: 0, note: shortErr(e) })),
    )
  }
  if (enable.ats) {
    runners.push(
      fetchAllAts(opts.signal)
        .then((r) => {
          buckets.push(r.jobs)
          status.push({
            source: 'ats',
            ok: true,
            count: r.jobs.length,
            note: `${r.okCompanies} companies${r.failedCompanies ? `, ${r.failedCompanies} skipped` : ''}`,
          })
        })
        .catch((e) => status.push({ source: 'ats', ok: false, count: 0, note: shortErr(e) })),
    )
  }

  await Promise.all(runners)

  const jobs = dedupeJobs(buckets.flat())
  // Stable order: newest first, then by title.
  jobs.sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? '') || a.title.localeCompare(b.title))
  return { jobs, status }
}

function shortErr(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.length > 120 ? m.slice(0, 117) + '…' : m
}