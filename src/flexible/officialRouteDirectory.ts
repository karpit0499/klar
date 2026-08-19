import type { NormalizedJob } from '../types'
import {
  FLEXIBLE_OFFICIAL_ROUTES_DE,
  officialRouteOpportunity,
  type OfficialRoute,
  type OfficialRouteSector,
} from './connectors/officialRoutes.de'

export const OFFICIAL_ROUTE_PAGE_SIZE = 8

export const OFFICIAL_ROUTE_SECTORS: OfficialRouteSector[] = [
  'grocery',
  'retail',
  'drugstore',
  'logistics',
  'food',
  'hotel',
  'healthcare',
  'facilities',
  'staffing',
]

export type OfficialRouteDirectoryFilters = {
  text?: string
  sector?: OfficialRouteSector | 'all'
  /** Context to check on the destination site; not a claim of local inventory. */
  city?: string
  page?: number
}

export type OfficialRouteDirectoryItem = {
  route: OfficialRoute
  opportunity: NormalizedJob
  locationStatus: 'check_on_official_site'
}

export type OfficialRouteDirectoryPage = {
  items: OfficialRouteDirectoryItem[]
  total: number
  page: number
  totalPages: number
  cityContext: string
}

function fold(value: string, digraph = false): string {
  const lower = value.toLowerCase()
  return (digraph
    ? lower.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    : lower)
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function foldVariants(value: string): string[] {
  return [...new Set([fold(value), fold(value, true)].filter(Boolean))]
}

/**
 * Return at most eight route cards. City is deliberately context only because
 * the evidence manifest verifies official destinations, not live city stock.
 */
export function officialRouteDirectoryPage(
  filters: OfficialRouteDirectoryFilters = {},
  routes: readonly OfficialRoute[] = FLEXIBLE_OFFICIAL_ROUTES_DE,
): OfficialRouteDirectoryPage {
  const queryVariants = foldVariants((filters.text ?? '').slice(0, 100))
    .map((value) => value.split(' ').filter(Boolean).slice(0, 8))
  const termGroups = Array.from(
    { length: Math.max(0, ...queryVariants.map((terms) => terms.length)) },
    (_, index) => [...new Set(queryVariants.map((terms) => terms[index]).filter(Boolean))],
  )
  const sector = filters.sector ?? 'all'
  const filtered = routes.filter((route) => {
    if (sector !== 'all' && route.sector !== sector) return false
    if (!termGroups.length) return true
    const haystacks = foldVariants(`${route.organization} ${route.id} ${route.sector}`)
    return termGroups.every((terms) => (
      terms.some((term) => haystacks.some((haystack) => haystack.includes(term)))
    ))
  })
  const totalPages = Math.ceil(filtered.length / OFFICIAL_ROUTE_PAGE_SIZE)
  const requestedPage = Number.isInteger(filters.page) ? Number(filters.page) : 0
  const page = totalPages === 0
    ? 0
    : Math.max(0, Math.min(requestedPage, totalPages - 1))
  const start = page * OFFICIAL_ROUTE_PAGE_SIZE
  return {
    items: filtered.slice(start, start + OFFICIAL_ROUTE_PAGE_SIZE).map((route) => ({
      route,
      // Do not stamp the user's city onto the record: it would look like
      // employer-confirmed availability. The panel explains how to check it.
      opportunity: officialRouteOpportunity(route),
      locationStatus: 'check_on_official_site',
    })),
    total: filtered.length,
    page,
    totalPages,
    cityContext: (filters.city ?? '').trim().slice(0, 80),
  }
}
