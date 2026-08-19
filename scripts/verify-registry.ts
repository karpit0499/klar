// ============================================================================
// scripts/verify-registry.ts  (feature 6)
//
// Probes ATS registry entries against their vendor's PUBLIC endpoint and reports
// which slugs are live. Use it to turn the candidate list (ATS_CANDIDATES_DACH)
// into verified lines: run it, delete the dead entries, and move the green ones
// up into ATS_VERIFIED_DE.
//
//   npx tsx scripts/verify-registry.ts              # probe quarantined candidates
//   npx tsx scripts/verify-registry.ts --all        # probe the direct runtime
//   npx tsx scripts/verify-registry.ts --emit       # print reviewable promotion lines
//   npx tsx scripts/verify-registry.ts --json       # JSON only; safe to redirect
//
// No key required — all three vendors expose an open, CORS-friendly board API.
// Be polite: this runs with bounded concurrency and a per-request timeout.
// ============================================================================
import {
  ATS_CANDIDATES_DACH,
  ATS_REGISTRY_DE,
  type AtsEntry,
} from '../src/sources/registry.de.ts'

type Probe = {
  entry: AtsEntry
  state: 'active' | 'empty' | 'quarantined'
  count: number
  note: string
  checkedAt: string
}

const TIMEOUT_MS = 12_000
const CONCURRENCY = 6

/** Build the public board URL for a given entry. */
function endpoint(entry: AtsEntry): string {
  if (entry.ats === 'greenhouse') {
    return `https://boards-api.greenhouse.io/v1/boards/${entry.slug}/jobs?content=true`
  }
  if (entry.ats === 'lever') {
    return `https://api.lever.co/v0/postings/${entry.slug}?mode=json`
  }
  return `https://api.ashbyhq.com/posting-api/job-board/${entry.slug}?includeCompensation=true`
}

/** Count postings in a vendor payload (shapes differ per vendor). */
function countJobs(entry: AtsEntry, data: unknown): number {
  if (entry.ats === 'lever') {
    return Array.isArray(data) ? data.length : 0
  }
  // greenhouse + ashby both wrap postings in a `jobs` array.
  const jobs = (data as { jobs?: unknown[] })?.jobs
  return Array.isArray(jobs) ? jobs.length : 0
}

async function probe(entry: AtsEntry): Promise<Probe> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(endpoint(entry), {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    })
    if (!res.ok) {
      return { entry, state: 'quarantined', count: 0, note: `HTTP ${res.status}`, checkedAt: new Date().toISOString() }
    }
    const data = await res.json()
    const count = countJobs(entry, data)
    return {
      entry,
      state: count > 0 ? 'active' : 'empty',
      count,
      note: count > 0 ? `${count} jobs` : 'reachable but 0 jobs',
      checkedAt: new Date().toISOString(),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { entry, state: 'quarantined', count: 0, note: msg.slice(0, 60), checkedAt: new Date().toISOString() }
  } finally {
    clearTimeout(timer)
  }
}

/** Run `worker` over `items` with at most `limit` in flight. */
async function pMap<T, R>(items: T[], limit: number, worker: (t: T) => Promise<R>): Promise<R[]> {
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

function verifiedLine(p: Probe): string {
  const { company, ats, slug } = p.entry
  return `  { company: ${JSON.stringify(company)}, ats: '${ats}', slug: '${slug}', state: 'active', delivery: 'worker_cache', verifiedAt: '${p.checkedAt.slice(0, 10)}' }, // ${p.count} live jobs`
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))
  const target = args.has('--all') ? ATS_REGISTRY_DE : ATS_CANDIDATES_DACH
  const label = args.has('--all') ? 'direct runtime' : 'quarantined candidates'
  const json = args.has('--json')

  if (!json) console.log(`Probing ${target.length} entries (${label}) …\n`)
  const results = await pMap(target, CONCURRENCY, probe)

  const live = results.filter((r) => r.state === 'active')
  const empty = results.filter((r) => r.state === 'empty')
  const quarantined = results.filter((r) => r.state === 'quarantined')

  if (json) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  for (const r of results) {
    const mark = r.state === 'active' ? '✓' : r.state === 'empty' ? '○' : '✗'
    console.log(`  ${mark} ${r.entry.company.padEnd(28)} ${r.entry.ats.padEnd(11)} ${r.entry.slug.padEnd(24)} ${r.state.padEnd(11)} ${r.note}`)
  }

  console.log(`\n${live.length} active, ${empty.length} healthy-empty, ${quarantined.length} quarantined.`)

  if (args.has('--emit')) {
    console.log('\n// ---- paste-ready verified lines (live only) ----')
    for (const p of live.sort((a, b) => a.entry.company.localeCompare(b.entry.company))) {
      console.log(verifiedLine(p))
    }
  } else {
    console.log('Re-run with --emit to print paste-ready verified lines for the live entries.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
