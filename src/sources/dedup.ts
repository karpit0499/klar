// ============================================================================
// Dedup & merge. The same role shows up on BA + Adzuna + an ATS board. We:
//   1. collapse exact id matches,
//   2. fuzzy-merge (normalized title+company, same city) keeping the RICHEST
//      record and stashing the other links in `also_on`.
// ============================================================================
import type { NormalizedJob } from '../types'
import { normalizeKey } from '../lib/hash'

/** How much useful info a record carries — higher wins when merging. */
function richness(j: NormalizedJob): number {
  let s = j.description.length
  if (j.salary.min != null) s += 500
  if (j.salary.max != null) s += 500
  if (j.posted_at) s += 100
  if (j.location.lat != null) s += 50
  return s
}

function fuzzyKey(j: NormalizedJob): string {
  const city = normalizeKey(j.location.city ?? '')
  return `${normalizeKey(j.title)}|${normalizeKey(j.company)}|${city}`
}

export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  // Pass 1 — exact id.
  const byId = new Map<string, NormalizedJob>()
  for (const j of jobs) {
    const existing = byId.get(j.id)
    if (!existing) byId.set(j.id, j)
    else byId.set(j.id, mergeInto(existing, j))
  }

  // Pass 2 — fuzzy title+company+city.
  const byFuzzy = new Map<string, NormalizedJob>()
  for (const j of byId.values()) {
    const key = fuzzyKey(j)
    const existing = byFuzzy.get(key)
    if (!existing) byFuzzy.set(key, j)
    else byFuzzy.set(key, mergeInto(existing, j))
  }
  return Array.from(byFuzzy.values())
}

/** Merge `b` into `a`, returning the winner (richest) with combined links. */
function mergeInto(a: NormalizedJob, b: NormalizedJob): NormalizedJob {
  const [primary, secondary] = richness(a) >= richness(b) ? [a, b] : [b, a]
  const also = [...(primary.also_on ?? []), ...(secondary.also_on ?? [])]
  // Record the secondary's own source+url unless it's already the primary's.
  if (secondary.url && secondary.url !== primary.url) {
    also.push({ source: secondary.source, source_id: secondary.source_id, url: secondary.url })
  }
  // De-dupe the also_on list by url.
  const seen = new Set<string>()
  const also_on = also.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)))

  return {
    ...primary,
    // Fill a few fields from secondary if the primary lacks them.
    description: primary.description || secondary.description,
    posted_at: primary.posted_at ?? secondary.posted_at,
    salary: {
      min: primary.salary.min ?? secondary.salary.min,
      max: primary.salary.max ?? secondary.salary.max,
      currency: primary.salary.currency ?? secondary.salary.currency,
      period: primary.salary.period ?? secondary.salary.period,
    },
    employment_type: primary.employment_type ?? secondary.employment_type,
    tags: Array.from(new Set([...primary.tags, ...secondary.tags])),
    also_on: also_on.length ? also_on : undefined,
  }
}