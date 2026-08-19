import type { NormalizedJob } from '../../types'
import { clean, looksRemote } from '../normalize'

export type AtsMarketCode = 'de' | 'at' | 'ch' | 'lu' | 'li' | 'nl'

type ParsedLocation = {
  location: NormalizedJob['location']
  /** Original source text used only for admission; never presented as a city. */
  evidence: string
}

const COUNTRIES: Record<string, { name: string; aliases: string[] }> = {
  de: { name: 'Germany', aliases: ['germany', 'deutschland'] },
  at: { name: 'Austria', aliases: ['austria', 'österreich', 'oesterreich'] },
  ch: { name: 'Switzerland', aliases: ['switzerland', 'schweiz', 'suisse', 'svizzera'] },
  lu: { name: 'Luxembourg', aliases: ['luxembourg', 'luxemburg'] },
  li: { name: 'Liechtenstein', aliases: ['liechtenstein'] },
  nl: { name: 'Netherlands', aliases: ['netherlands', 'nederland'] },
  gb: { name: 'United Kingdom', aliases: ['united kingdom', 'great britain', 'england', 'scotland', 'wales'] },
  us: { name: 'United States', aliases: ['united states', 'united states of america', 'usa'] },
  ca: { name: 'Canada', aliases: ['canada'] },
  fr: { name: 'France', aliases: ['france', 'frankreich'] },
  es: { name: 'Spain', aliases: ['spain', 'spanien', 'españa'] },
  it: { name: 'Italy', aliases: ['italy', 'italien', 'italia'] },
  pl: { name: 'Poland', aliases: ['poland', 'polen', 'polska'] },
  pt: { name: 'Portugal', aliases: ['portugal'] },
  ie: { name: 'Ireland', aliases: ['ireland', 'irland'] },
  be: { name: 'Belgium', aliases: ['belgium', 'belgien', 'belgië'] },
  dk: { name: 'Denmark', aliases: ['denmark', 'dänemark', 'danmark'] },
  se: { name: 'Sweden', aliases: ['sweden', 'schweden', 'sverige'] },
  no: { name: 'Norway', aliases: ['norway', 'norwegen', 'norge'] },
  fi: { name: 'Finland', aliases: ['finland'] },
  in: { name: 'India', aliases: ['india', 'indien'] },
  sg: { name: 'Singapore', aliases: ['singapore', 'singapur'] },
  au: { name: 'Australia', aliases: ['australia', 'australien'] },
}

const MARKET_CITIES: Record<AtsMarketCode, string[]> = {
  de: ['berlin', 'munich', 'münchen', 'muenchen', 'hamburg', 'cologne', 'köln', 'koeln', 'frankfurt', 'stuttgart', 'düsseldorf', 'duesseldorf', 'leipzig', 'dresden', 'hannover', 'nuremberg', 'nürnberg', 'nuernberg', 'bremen', 'bonn'],
  at: ['vienna', 'wien', 'graz', 'linz', 'salzburg', 'innsbruck', 'klagenfurt'],
  ch: ['zurich', 'zürich', 'geneva', 'genf', 'genève', 'basel', 'bern', 'lausanne', 'lucerne', 'luzern'],
  lu: ['luxembourg city', 'luxemburg', 'esch-sur-alzette', 'differdange'],
  li: ['vaduz', 'schaan', 'triesen', 'balzers'],
  nl: ['amsterdam', 'rotterdam', 'den haag', 'the hague', 'utrecht', 'eindhoven'],
}

const DACH_CODES: AtsMarketCode[] = ['de', 'at', 'ch', 'lu', 'li']

function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function containsPhrase(text: string, phrase: string): boolean {
  const haystack = ` ${fold(text)} `
  const needle = fold(phrase)
  return Boolean(needle) && haystack.includes(` ${needle} `)
}

function countryCode(value: string): string | undefined {
  const folded = fold(value)
  if (!folded) return undefined
  if (/^[a-z]{2}$/.test(folded) && COUNTRIES[folded]) return folded
  for (const [code, country] of Object.entries(COUNTRIES)) {
    if (country.aliases.some((alias) => containsPhrase(value, alias))) return code
  }
  return undefined
}

function inferCountry(text: string): string | undefined {
  const pieces = text.split(/[,;|/]/).map((part) => part.trim()).filter(Boolean)
  const suffix = pieces[pieces.length - 1]
  const suffixCode = suffix ? countryCode(suffix) : undefined
  if (suffixCode) return suffixCode
  for (const code of Object.keys(COUNTRIES)) {
    if (COUNTRIES[code].aliases.some((alias) => containsPhrase(text, alias))) return code
  }
  return undefined
}

function cityFromText(text: string): string | undefined {
  if (!text || /[;|/]/.test(text)) return undefined
  const first = clean(text.split(',')[0])
  if (!first || first.length > 80 || looksRemote(first) || countryCode(first)) return undefined
  if (/multiple locations|worldwide|international/i.test(first)) return undefined
  return first
}

/** Normalize vendor free text without ever treating the whole string as a city. */
export function parseAtsLocation(input: {
  locationText?: string
  city?: string
  region?: string
  country?: string
  remote?: boolean
}): ParsedLocation {
  const locationText = clean(input.locationText) ?? ''
  const explicitCountry = clean(input.country)
  const explicitCity = clean(input.city)
  const rawEvidence = [locationText, explicitCity, clean(input.region)].filter(Boolean).join(' · ')
  const code = explicitCountry ? countryCode(explicitCountry) : inferCountry(rawEvidence)
  const city = cityFromText(explicitCity ?? locationText)
  const region = clean(input.region)
    ?? (locationText && locationText !== city ? locationText : undefined)
  const evidence = [locationText, explicitCity, region, explicitCountry].filter(Boolean).join(' · ')
  return {
    location: {
      city,
      region,
      country: code ? COUNTRIES[code].name : explicitCountry ?? '',
      remote: Boolean(input.remote) || looksRemote(locationText, explicitCity, region),
    },
    evidence,
  }
}

/**
 * Admit an ATS posting only when its structured country or source location text
 * identifies the selected market. Unknown is not silently relabelled Germany.
 */
export function isAtsLocationAdmitted(
  parsed: ParsedLocation,
  market: AtsMarketCode | 'dach' = 'dach',
): boolean {
  const wanted = market === 'dach' ? DACH_CODES : [market]
  const explicitCode = countryCode(parsed.location.country)
  if (explicitCode) return wanted.includes(explicitCode as AtsMarketCode)
  return wanted.some((code) => (
    COUNTRIES[code].aliases.some((alias) => containsPhrase(parsed.evidence, alias))
    || MARKET_CITIES[code].some((city) => containsPhrase(parsed.evidence, city))
  ))
}
