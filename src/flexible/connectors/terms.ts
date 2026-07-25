// ============================================================================
// Taxonomy → search-term maps. The API baseline (BA/Adzuna/Arbeitnow) and the
// employer-filtered fallback both need German keywords a job board understands.
// These are intentionally short, high-recall anchor terms.
// ============================================================================
import type { FlexibleEmployment, FlexibleRoleFamily, WorkplaceType } from '../../types'
import type { FlexibleQuery } from './types'

const EMPLOYMENT_TERMS: Record<FlexibleEmployment, string> = {
  minijob: 'Minijob',
  part_time: 'Teilzeit',
  working_student: 'Werkstudent',
  temporary: 'Aushilfe',
  seasonal: 'Saison',
  weekend: 'Wochenende',
  evening: 'Abend',
  night: 'Nacht',
}

const ROLE_TERMS: Record<FlexibleRoleFamily, string> = {
  shelf_stocking: 'Warenverräumung',
  cashier: 'Kasse',
  sales_assistant: 'Verkauf',
  picking_packing: 'Kommissionierung',
  warehouse: 'Lager',
  parcel_sorting: 'Paketsortierung',
  delivery: 'Zusteller',
  kitchen: 'Küchenhilfe',
  counter_service: 'Theke',
  waiting_service: 'Servicekraft',
  cleaning: 'Reinigung',
  housekeeping: 'Housekeeping',
  reception: 'Rezeption',
  event_staff: 'Eventhelfer',
  customer_service: 'Kundenservice',
  other: '',
}

const WORKPLACE_TERMS: Record<WorkplaceType, string> = {
  supermarket: 'Supermarkt',
  retail_store: 'Einzelhandel',
  drugstore: 'Drogerie',
  warehouse: 'Lager',
  parcel_hub: 'Paketzentrum',
  restaurant: 'Restaurant',
  cafe: 'Café',
  hotel: 'Hotel',
  delivery: 'Lieferdienst',
  event: 'Veranstaltung',
  other: '',
}

/** Build a de-duplicated keyword list from a flexible query (+ optional employer). */
export function queryTerms(query: FlexibleQuery, employer?: string): string[] {
  const terms = [
    ...(employer ? [employer] : []),
    ...query.keywords,
    ...query.roleFamilies.map((r) => ROLE_TERMS[r]),
    ...query.employment.map((e) => EMPLOYMENT_TERMS[e]),
    ...query.workplaces.map((w) => WORKPLACE_TERMS[w]),
  ]
    .map((term) => term.trim())
    .filter(Boolean)
  return [...new Set(terms)]
}

/** A single anchor keyword for boards that accept only one term. */
export function primaryTerm(query: FlexibleQuery, employer?: string): string {
  return queryTerms(query, employer)[0] ?? 'Aushilfe'
}

export { EMPLOYMENT_TERMS, ROLE_TERMS, WORKPLACE_TERMS }