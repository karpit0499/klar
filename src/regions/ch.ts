// ============================================================================
// Switzerland region (feature 5). Adzuna has a Swiss feed ('ch'). The notable
// difference from DACH neighbours is the currency: Switzerland uses the Swiss
// franc (CHF), not the euro. Distance is still metric (km). Sources are Adzuna
// + the region-agnostic set; BA remains German-only.
// ============================================================================
import type { Region } from '../types'

const CH_CITIES: Record<string, { lat: number; lng: number; canonical: string }> = {
  zürich: { lat: 47.3769, lng: 8.5417, canonical: 'Zürich' },
  zurich: { lat: 47.3769, lng: 8.5417, canonical: 'Zürich' },
  genf: { lat: 46.2044, lng: 6.1432, canonical: 'Genève' },
  geneva: { lat: 46.2044, lng: 6.1432, canonical: 'Genève' },
  genève: { lat: 46.2044, lng: 6.1432, canonical: 'Genève' },
  basel: { lat: 47.5596, lng: 7.5886, canonical: 'Basel' },
  bern: { lat: 46.948, lng: 7.4474, canonical: 'Bern' },
  lausanne: { lat: 46.5197, lng: 6.6323, canonical: 'Lausanne' },
  luzern: { lat: 47.0502, lng: 8.3093, canonical: 'Luzern' },
}

export const regionCH: Region = {
  code: 'ch',
  label: 'Switzerland',
  currency: 'CHF',
  distanceUnit: 'km',
  sources: ['adzuna', 'arbeitnow', 'greenhouse', 'lever', 'ashby'],
  adzunaCountry: 'ch',
  uiLocales: ['de', 'en'],
  resolveLocation(city: string) {
    const key = (city || '').trim().toLowerCase()
    return CH_CITIES[key] ?? { canonical: (city || '').trim() }
  },
}