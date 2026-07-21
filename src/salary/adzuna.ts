// ============================================================================
// Salary insights from Adzuna's salary-histogram endpoint (feature 14).
//
// German postings rarely list salary, so you can't aggregate from listings. The
// clean free benchmark is Adzuna's histogram (distribution of advertised salary
// by title + location). It's Adzuna, so it needs the Worker + a key — hence the
// dependency on feature 4. Degrade gracefully: show the benchmark where data
// exists, hide the panel where it doesn't.
//
// `summarizeHistogram` (percentiles from the bucket counts) is pure + testable;
// `fetchSalaryBenchmark` adds the Worker call and the user's key headers.
// ============================================================================
import type { SearchQuery } from '../types'
import { getJson, workerUrl } from '../lib/http'
import { adzunaKeyHeaders, ADZUNA_COUNTRY_CURRENCY } from '../sources/adzuna'
import type { AdzunaKey } from '../settings/adzunaKey'

type HistogramResponse = { histogram?: Record<string, number> }

export type SalaryBucket = { floor: number; count: number }
export type SalarySummary = {
  count: number          // total postings in the histogram
  min: number
  max: number
  p25: number
  median: number
  p75: number
  mean: number
  currency: string       // follows the Adzuna country (EUR / CHF / GBP …)
  buckets: SalaryBucket[] // ascending by floor, for a simple bar chart
}

/**
 * Turn Adzuna's { "40000": 12, "50000": 30, … } into ordered buckets + summary
 * statistics. Percentiles are estimated by treating each bucket floor as its
 * representative value weighted by its count (the standard histogram approach).
 * Returns null when there isn't enough data to be meaningful.
 */
export function summarizeHistogram(histogram: Record<string, number>, currency = 'EUR'): SalarySummary | null {
  const buckets: SalaryBucket[] = Object.entries(histogram)
    .map(([k, v]) => ({ floor: Number(k), count: Number(v) || 0 }))
    .filter((b) => isFinite(b.floor) && b.count > 0)
    .sort((a, b) => a.floor - b.floor)

  const count = buckets.reduce((s, b) => s + b.count, 0)
  if (buckets.length < 2 || count < 5) return null // too thin to report honestly

  const percentile = (p: number): number => {
    const rank = p * count
    let cum = 0
    for (const b of buckets) {
      cum += b.count
      if (cum >= rank) return b.floor
    }
    return buckets[buckets.length - 1].floor
  }
  const mean = Math.round(buckets.reduce((s, b) => s + b.floor * b.count, 0) / count)

  return {
    count,
    min: buckets[0].floor,
    max: buckets[buckets.length - 1].floor,
    p25: percentile(0.25),
    median: percentile(0.5),
    p75: percentile(0.75),
    mean,
    currency,
    buckets,
  }
}

/** A ready-to-paste salary-expectation line for the application bundle (feature 15). */
export function salaryExpectationLine(summary: SalarySummary, city: string, title: string): string {
  const symbol = summary.currency === 'EUR' ? '€' : summary.currency === 'GBP' ? '£' : `${summary.currency} `
  const fmt = (n: number) => `${symbol}${Math.round(n / 1000)}k`
  return `Based on market data for ${title} in ${city}, ${fmt(summary.p25)}–${fmt(summary.p75)} (median ${fmt(summary.median)}).`
}

/**
 * Fetch a salary benchmark for a title + location via the Worker (+ the user's
 * Adzuna key). Returns null on any degradation (no key, quota, no data) so the
 * caller can simply hide the panel.
 */
export async function fetchSalaryBenchmark(
  q: { title: string; city?: string; country?: string },
  key: AdzunaKey | undefined,
  signal?: AbortSignal,
): Promise<SalarySummary | null> {
  const params = new URLSearchParams({ what: q.title })
  if (q.city) params.set('where', q.city)
  const country = (q.country || 'de').toLowerCase()
  const qs = `/v1/api/jobs/${country}/histogram?${params.toString()}`
  try {
    const data = await getJson<HistogramResponse>(workerUrl('adzuna', qs), {
      signal,
      headers: adzunaKeyHeaders(key),
    })
    if (!data.histogram) return null
    return summarizeHistogram(data.histogram, ADZUNA_COUNTRY_CURRENCY[country] ?? 'EUR')
  } catch {
    return null
  }
}

/** Convenience overload taking a SearchQuery (uses the first target title + city). */
export function benchmarkQueryFrom(q: SearchQuery): { title: string; city?: string } {
  return { title: q.what[0] ?? '', city: q.where?.city }
}