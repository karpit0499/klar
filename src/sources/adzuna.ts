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
import type { AdapterResult } from './types'
import { getJson, workerUrl } from '../lib/http'
import { makeJob, toISO } from './normalize'
import { stripHtml } from '../lib/html'
import type { AdzunaKey } from '../settings/adzunaKey'
import { AppError } from '../errors/appError'

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

/** Adzuna's 2-letter country slugs → the human label we store on each job. */
const ADZUNA_COUNTRY_LABELS: Record<string, string> = {
  de: 'Deutschland',
  at: 'Österreich',
  ch: 'Schweiz',
  nl: 'Niederlande',
  gb: 'United Kingdom',
}

/**
 * Adzuna quotes salaries in the country's OWN currency, so the label has to
 * follow the country — not a hard-coded EUR. Switzerland (and Liechtenstein, in
 * a currency union with it) use the Swiss franc; the UK uses sterling. Exported
 * so the salary-benchmark helper (feature 14) labels its histogram the same way.
 */
export const ADZUNA_COUNTRY_CURRENCY: Record<string, string> = {
  de: 'EUR',
  at: 'EUR',
  nl: 'EUR',
  ch: 'CHF',
  gb: 'GBP',
}

export const fetchAdzuna = async (
  q: SearchQuery,
  opts: { signal?: AbortSignal; page?: number; key?: AdzunaKey; country?: string } = {},
): Promise<AdapterResult> => {
  const what = q.what.join(' ')
  const where = q.where?.city ?? ''
  const distance = q.where?.radius_km ?? 25
  const page = opts.page ?? 1
  const country = (opts.country || 'de').toLowerCase()
  const countryLabel = ADZUNA_COUNTRY_LABELS[country] ?? country.toUpperCase()
  const qs =
    `/v1/api/jobs/${country}/search/${page}?results_per_page=50` +
    `&what=${encodeURIComponent(what)}` +
    (where ? `&where=${encodeURIComponent(where)}&distance=${distance}` : '')

  const data = await getJson<AdzunaResponse>(workerUrl('adzuna', qs), {
    signal: opts.signal,
    headers: adzunaKeyHeaders(opts.key),
  })
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
          country: countryLabel,
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
          currency: ADZUNA_COUNTRY_CURRENCY[country] ?? 'EUR',
          period: 'year',
        },
        raw: r,
      })
    })

  return { jobs }
}

/** Build the per-request headers that relay a user's Adzuna key to the Worker. */
export function adzunaKeyHeaders(key?: AdzunaKey): Record<string, string> | undefined {
  if (!key) return undefined
  const appId = key.appId.trim()
  const appKey = key.appKey.trim()
  if (!appId && !appKey) return undefined
  if (!appId || !appKey) {
    throw new AppError({
      category: 'credentials',
      message: 'Adzuna needs both the App ID and App key from the same account.',
      dataSafe: true,
      available: 'Other job sources remain available.',
      action: { label: 'Enter both Adzuna values', kind: 'open_settings' },
      technical: 'partial_adzuna_credentials',
    })
  }
  return { 'X-Adzuna-App-Id': appId, 'X-Adzuna-App-Key': appKey }
}