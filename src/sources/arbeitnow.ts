// ============================================================================
// Arbeitnow — free, keyless jobs API. Direct browser call (CORS: *).
// It's a paginated FEED, not a searchable endpoint: there is no server-side
// what/where filter, so we pull the first few pages of recent jobs and let the
// client-side pre-filter (Phase 5) narrow by title/location.
// ============================================================================
import type { SearchQuery } from '../types'
import type { Adapter } from './types'
import { getJson } from '../lib/http'
import { looksRemote, makeJob, toISO } from './normalize'
import { stripHtml } from '../lib/html'

type ArbeitnowResponse = {
  data?: ArbeitnowJob[]
  links?: { next?: string | null }
}
type ArbeitnowJob = {
  slug: string
  title: string
  company_name: string
  description: string
  remote: boolean
  url: string
  tags?: string[]
  job_types?: string[]
  location: string
  created_at: number // Unix seconds
}

const BASE = 'https://www.arbeitnow.com/api/job-board-api'
const MAX_PAGES = 2 // ~200 most-recent jobs is plenty at portfolio scale

export const fetchArbeitnow: Adapter = async (_q: SearchQuery, opts = {}) => {
  const all: ArbeitnowJob[] = []
  let url: string | null = `${BASE}?page=1`
  for (let i = 0; i < MAX_PAGES && url; i++) {
    const data: ArbeitnowResponse = await getJson<ArbeitnowResponse>(url, { signal: opts.signal })
    all.push(...(data.data ?? []))
    url = data.links?.next ?? null
  }

  const jobs = all
    .filter((j) => j.slug)
    .map((j) =>
      makeJob({
        source: 'arbeitnow',
        source_id: j.slug,
        title: j.title,
        company: j.company_name || 'Unknown company',
        location: {
          city: j.location || undefined,
          country: 'Deutschland',
          remote: Boolean(j.remote) || looksRemote(j.title, j.location),
        },
        description: stripHtml(j.description || ''),
        url: j.url,
        posted_at: toISO(j.created_at),
        employment_type: (j.job_types && j.job_types[0]) || undefined,
        tags: j.tags ?? [],
        raw: j,
      }),
    )

  return { jobs }
}