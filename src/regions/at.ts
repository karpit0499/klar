// ============================================================================
// Austria region (feature 5). Adzuna has an Austrian feed ('at'), so this
// region wires Adzuna + the region-agnostic sources (Arbeitnow + the ATS trio).
// BA is a German federal agency and stays DE-only. Currency and distance unit
// match Germany (EUR, km); only the sources list and Adzuna slug differ.
// ============================================================================
import type { Region } from '../types'

const AT_CITIES: Record<string, { lat: number; lng: number; canonical: string }> = {
  wien: { lat: 48.2082, lng: 16.3738, canonical: 'Wien' },
  vienna: { lat: 48.2082, lng: 16.3738, canonical: 'Wien' },
  graz: { lat: 47.0707, lng: 15.4395, canonical: 'Graz' },
  linz: { lat: 48.3069, lng: 14.2858, canonical: 'Linz' },
  salzburg: { lat: 47.8095, lng: 13.055, canonical: 'Salzburg' },
  innsbruck: { lat: 47.2692, lng: 11.4041, canonical: 'Innsbruck' },
  klagenfurt: { lat: 46.6247, lng: 14.3055, canonical: 'Klagenfurt' },
}

export const regionAT: Region = {
  code: 'at',
  label: 'Austria',
  currency: 'EUR',
  distanceUnit: 'km',
  sources: ['adzuna', 'arbeitnow', 'greenhouse', 'lever', 'ashby'],
  adzunaCountry: 'at',
  uiLocales: ['de', 'en'],
  resolveLocation(city: string) {
    const key = (city || '').trim().toLowerCase()
    return AT_CITIES[key] ?? { canonical: (city || '').trim() }
  },
}