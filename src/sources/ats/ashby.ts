// ============================================================================
// Ashby public job board. Direct browser call (CORS: *). No auth.
//   GET https://api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true
// Nice: Ashby gives `descriptionPlain`. No company field — pass from registry.
// `publishedAt` is ISO 8601. Compensation is often null even with the flag.
// ============================================================================
import type { NormalizedJob } from '../../types'
import { getJson } from '../../lib/http'
import { clean, makeJob, toISO } from '../normalize'
import { isAtsLocationAdmitted, parseAtsLocation, type AtsMarketCode } from './location'

type AshbyResponse = { jobs?: AshbyJob[] }
type AshbyJob = {
  id: string
  title: string
  department?: string
  team?: string
  employmentType?: string
  location?: string
  publishedAt?: string
  isListed?: boolean
  isRemote?: boolean
  workplaceType?: string
  jobUrl: string
  applyUrl?: string
  descriptionPlain?: string
  address?: {
    postalAddress?: { addressRegion?: string; addressCountry?: string; addressLocality?: string }
  }
  compensation?: {
    compensationTierSummary?: string | null
  }
}

export async function fetchAshby(
  company: string,
  slug: string,
  signal?: AbortSignal,
  market: AtsMarketCode | 'dach' = 'dach',
): Promise<NormalizedJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`
  const data = await getJson<AshbyResponse>(url, { signal })
  return (data.jobs ?? []).flatMap((j) => {
      if (!j.id || j.isListed === false) return []
      const addr = j.address?.postalAddress
      const parsed = parseAtsLocation({
        locationText: clean(j.location),
        city: clean(addr?.addressLocality),
        region: clean(addr?.addressRegion),
        country: clean(addr?.addressCountry),
        remote: Boolean(j.isRemote) || (j.workplaceType || '').toLowerCase() === 'remote',
      })
      if (!isAtsLocationAdmitted(parsed, market)) return []
      return [makeJob({
        source: 'ashby',
        source_id: j.id,
        title: j.title,
        company,
        location: parsed.location,
        description: j.descriptionPlain ?? '',
        url: j.jobUrl,
        posted_at: toISO(j.publishedAt),
        employment_type: j.employmentType,
        tags: [j.department, j.team].filter((x): x is string => !!x),
        raw: j,
      })]
    })
}
