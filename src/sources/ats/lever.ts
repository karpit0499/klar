// ============================================================================
// Lever public postings. Direct browser call (CORS: *). No auth.
//   GET https://api.lever.co/v0/postings/<slug>?mode=json
// Nice: Lever gives `descriptionPlain` (no HTML stripping) AND structured
// `salaryRange`. There is NO company field — we pass it in from the registry.
// `createdAt` is Unix MILLISECONDS.
// ============================================================================
import type { NormalizedJob } from '../../types'
import { getJson } from '../../lib/http'
import { makeJob, toISO } from '../normalize'

type LeverJob = {
  id: string
  text: string
  hostedUrl: string
  applyUrl?: string
  createdAt?: number
  country?: string
  workplaceType?: string // 'remote' | 'on-site' | 'hybrid'
  descriptionPlain?: string
  additionalPlain?: string
  categories?: { commitment?: string; department?: string; team?: string; location?: string }
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string }
}

function periodFromInterval(interval?: string): 'year' | 'month' | 'hour' | undefined {
  if (!interval) return undefined
  if (interval.includes('year')) return 'year'
  if (interval.includes('month')) return 'month'
  if (interval.includes('hour')) return 'hour'
  return undefined
}

export async function fetchLever(
  company: string,
  slug: string,
  signal?: AbortSignal,
): Promise<NormalizedJob[]> {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`
  const data = await getJson<LeverJob[]>(url, { signal })
  return (Array.isArray(data) ? data : [])
    .filter((j) => j.id)
    .map((j) => {
      const cat = j.categories ?? {}
      const desc = [j.descriptionPlain, j.additionalPlain].filter(Boolean).join('\n\n')
      return makeJob({
        source: 'lever',
        source_id: j.id,
        title: j.text,
        company,
        location: {
          city: cat.location,
          country: j.country || 'Deutschland',
          remote: (j.workplaceType || '').toLowerCase() === 'remote',
        },
        description: desc,
        url: j.hostedUrl,
        posted_at: toISO(j.createdAt),
        employment_type: cat.commitment,
        salary: j.salaryRange
          ? {
              min: j.salaryRange.min,
              max: j.salaryRange.max,
              currency: j.salaryRange.currency,
              period: periodFromInterval(j.salaryRange.interval),
            }
          : {},
        tags: [cat.department, cat.team].filter((x): x is string => !!x),
        raw: j,
      })
    })
}