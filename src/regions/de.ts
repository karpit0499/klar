// ============================================================================
// Germany region (feature 8.1). Everything region-specific is captured in one
// Region object: which sources are in play, the currency, the distance unit,
// and how to resolve a city to coordinates. The rest of the app reads these
// fields instead of hard-coding "Germany", which is what lets a second country
// slot in without touching UI, storage, matching, or the tracker.
// ============================================================================
import type { Region } from '../types'

/** A tiny lookup so common German cities get coordinates without a geocoder. */
const DE_CITIES: Record<string, { lat: number; lng: number; canonical: string }> = {
  berlin: { lat: 52.52, lng: 13.405, canonical: 'Berlin' },
  münchen: { lat: 48.1372, lng: 11.5756, canonical: 'München' },
  munich: { lat: 48.1372, lng: 11.5756, canonical: 'München' },
  hamburg: { lat: 53.5511, lng: 9.9937, canonical: 'Hamburg' },
  köln: { lat: 50.9375, lng: 6.9603, canonical: 'Köln' },
  cologne: { lat: 50.9375, lng: 6.9603, canonical: 'Köln' },
  frankfurt: { lat: 50.1109, lng: 8.6821, canonical: 'Frankfurt am Main' },
  stuttgart: { lat: 48.7758, lng: 9.1829, canonical: 'Stuttgart' },
  düsseldorf: { lat: 51.2277, lng: 6.7735, canonical: 'Düsseldorf' },
}

export const regionDE: Region = {
  code: 'de',
  label: 'Germany',
  currency: 'EUR',
  distanceUnit: 'km',
  // BA + Adzuna are German aggregators; Arbeitnow + the ATS trio are global but
  // the verified registry we ship is DACH-focused.
  sources: ['ba', 'adzuna', 'arbeitnow', 'greenhouse', 'lever', 'ashby'],
  uiLocales: ['de', 'en'],
  resolveLocation(city: string) {
    const key = (city || '').trim().toLowerCase()
    return DE_CITIES[key] ?? { canonical: (city || '').trim() }
  },
}