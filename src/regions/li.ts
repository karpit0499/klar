// ============================================================================
// Liechtenstein region (feature 5). A micro-market: Adzuna has no feed, so like
// Luxembourg this region runs only Arbeitnow + the ATS trio. Liechtenstein is
// in a customs and currency union with Switzerland, so the currency is the Swiss
// franc (CHF). The city table is short by necessity — the whole country is
// ~160 km². Adding a dedicated source later is one adapter + one `sources` entry.
// ============================================================================
import type { Region } from '../types'

const LI_CITIES: Record<string, { lat: number; lng: number; canonical: string }> = {
  vaduz: { lat: 47.1416, lng: 9.5215, canonical: 'Vaduz' },
  schaan: { lat: 47.1655, lng: 9.5089, canonical: 'Schaan' },
  triesen: { lat: 47.1058, lng: 9.5281, canonical: 'Triesen' },
  balzers: { lat: 47.0664, lng: 9.5017, canonical: 'Balzers' },
}

export const regionLI: Region = {
  code: 'li',
  label: 'Liechtenstein',
  currency: 'CHF',
  distanceUnit: 'km',
  sources: ['arbeitnow', 'greenhouse', 'lever', 'ashby'],
  uiLocales: ['de', 'en'],
  resolveLocation(city: string) {
    const key = (city || '').trim().toLowerCase()
    return LI_CITIES[key] ?? { canonical: (city || '').trim() }
  },
}