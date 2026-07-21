// ============================================================================
// Luxembourg region (feature 5). Adzuna has NO Luxembourg feed, so this region
// deliberately omits 'adzuna' (and `adzunaCountry`). It runs the two sources
// that are not tied to a single national aggregator: Arbeitnow and the ATS trio
// (Greenhouse/Lever/Ashby). This is the honest configuration — better to list
// fewer sources than to point Adzuna at a country it cannot serve. Currency EUR.
// ============================================================================
import type { Region } from '../types'

const LU_CITIES: Record<string, { lat: number; lng: number; canonical: string }> = {
  luxembourg: { lat: 49.6117, lng: 6.1319, canonical: 'Luxembourg' },
  'luxembourg city': { lat: 49.6117, lng: 6.1319, canonical: 'Luxembourg' },
  'luxemburg': { lat: 49.6117, lng: 6.1319, canonical: 'Luxembourg' },
  esch: { lat: 49.4958, lng: 5.9806, canonical: 'Esch-sur-Alzette' },
  'esch-sur-alzette': { lat: 49.4958, lng: 5.9806, canonical: 'Esch-sur-Alzette' },
  differdange: { lat: 49.5241, lng: 5.8914, canonical: 'Differdange' },
}

export const regionLU: Region = {
  code: 'lu',
  label: 'Luxembourg',
  currency: 'EUR',
  distanceUnit: 'km',
  sources: ['arbeitnow', 'greenhouse', 'lever', 'ashby'],
  uiLocales: ['de', 'en'],
  resolveLocation(city: string) {
    const key = (city || '').trim().toLowerCase()
    return LU_CITIES[key] ?? { canonical: (city || '').trim() }
  },
}