// ============================================================================
// Netherlands region (feature 8.1) — proof the architecture extends cleanly.
// The Dutch market has no BA/Adzuna-DE equivalent wired here, so this region
// reuses only the region-agnostic sources: Arbeitnow (which lists NL roles) and
// the ATS trio (Greenhouse/Lever/Ashby boards aren't Germany-specific). Adding a
// dedicated Dutch source later means one adapter + adding it to `sources` — no
// change to UI, storage, matching, or the tracker.
// ============================================================================
import type { Region } from '../types'

const NL_CITIES: Record<string, { lat: number; lng: number; canonical: string }> = {
  amsterdam: { lat: 52.3676, lng: 4.9041, canonical: 'Amsterdam' },
  rotterdam: { lat: 51.9244, lng: 4.4777, canonical: 'Rotterdam' },
  'den haag': { lat: 52.0705, lng: 4.3007, canonical: 'Den Haag' },
  'the hague': { lat: 52.0705, lng: 4.3007, canonical: 'Den Haag' },
  utrecht: { lat: 52.0907, lng: 5.1214, canonical: 'Utrecht' },
  eindhoven: { lat: 51.4416, lng: 5.4697, canonical: 'Eindhoven' },
}

export const regionNL: Region = {
  code: 'nl',
  label: 'Netherlands',
  currency: 'EUR',
  distanceUnit: 'km',
  sources: ['arbeitnow', 'greenhouse', 'lever', 'ashby'],
  uiLocales: ['nl', 'en'],
  resolveLocation(city: string) {
    const key = (city || '').trim().toLowerCase()
    return NL_CITIES[key] ?? { canonical: (city || '').trim() }
  },
}