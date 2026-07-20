// ============================================================================
// Adzuna — aggregator with salary data. No CORS + needs a secret key, so it
// goes through the Worker, which injects app_id/app_key (Worker secrets).
//
// NOTE: This adapter is written to Adzuna's documented JSON contract. It is the
// one source you cannot exercise without your own free dev key (app_id +
// app_key from https://developer.adzuna.com). Add the optional key in Settings
// (or as Worker secrets for Mode A) to light it up; the app works fully without
// it. On the free tier Adzuna enforces a DAILY CALL CAP — when exceeded the
// Worker returns a friendly note and the app shows "Adzuna: quota reached".
// ============================================================================
import type { SearchQuery } from '../types'
import type { Adapter } from './types'
import { getJson, workerUrl } from '../lib/http'
import { makeJob, toISO } from './normalize'
import { stripHtml } from '../lib/html'

type AdzunaResponse = {
  results?: AdzunaJob[]
  count?: number
}
type AdzunaJob = {
  id: string
  title: string
  description: string
  company?: { display_name?: string }
  location?: { display_name?: string; area?: string[] }
  redirect_url: string
  created?: string
  salary_min?: number
  salary_max?: number
  contract_time?: string // 'full_time' | 'part_time'
  latitude?: number
  longitude?: number
}

export const fetchAdzuna: Adapter = async (q: SearchQuery, opts = {}) => {
  const what = q.what.join(' ')
  const where = q.where?.city ?? ''
  const distance = q.where?.radius_km ?? 25
  const page = opts.page ?? 1
  const qs =
    `/v1/api/jobs/de/search/${page}?results_per_page=50` +
    `&what=${encodeURIComponent(what)}` +
    (where ? `&where=${encodeURIComponent(where)}&distance=${distance}` : '')

  const data = await getJson<AdzunaResponse>(workerUrl('adzuna', qs), { signal: opts.signal })
  const results = data.results ?? []

  const jobs = results
    .filter((r) => r.id)
    .map((r) => {
      const area = r.location?.area ?? []
      const city = area.length ? area[area.length - 1] : r.location?.display_name
      return makeJob({
        source: 'adzuna',
        source_id: String(r.id),
        title: r.title,
        company: r.company?.display_name || 'Unknown company',
        location: {
          city: city || undefined,
          region: area.length > 1 ? area[1] : undefined,
          country: 'Deutschland',
          remote: /remote/i.test(`${r.title} ${r.location?.display_name ?? ''}`),
          lat: r.latitude,
          lng: r.longitude,
        },
        description: stripHtml(r.description || ''),
        url: r.redirect_url,
        posted_at: toISO(r.created),
        employment_type: r.contract_time?.replace('_', '-'),
        salary: {
          min: r.salary_min,
          max: r.salary_max,
          currency: 'EUR',
          period: 'year',
        },
        raw: r,
      })
    })

  return { jobs }
}