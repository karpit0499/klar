// ============================================================================
// Bilingual (EN/DE) short labels for taxonomy chips. Kept here so the card and
// the setup form stay consistent without duplicating strings.
// ============================================================================
import type { FlexibleEmployment, FlexibleRoleFamily, WorkplaceType } from '../types'

const EMPLOYMENT: Record<FlexibleEmployment, [string, string]> = {
  minijob: ['Minijob', 'Minijob'],
  part_time: ['Part-time', 'Teilzeit'],
  working_student: ['Working student', 'Werkstudent:in'],
  temporary: ['Temporary', 'Aushilfe'],
  seasonal: ['Seasonal', 'Saisonal'],
  weekend: ['Weekend', 'Wochenende'],
  evening: ['Evening', 'Abends'],
  night: ['Night', 'Nachts'],
}

const ROLE: Record<FlexibleRoleFamily, [string, string]> = {
  shelf_stocking: ['Shelf stocking', 'Warenverräumung'],
  cashier: ['Cashier', 'Kasse'],
  sales_assistant: ['Sales assistant', 'Verkauf'],
  picking_packing: ['Picking & packing', 'Kommissionierung'],
  warehouse: ['Warehouse', 'Lager'],
  parcel_sorting: ['Parcel sorting', 'Paketsortierung'],
  delivery: ['Delivery', 'Auslieferung'],
  kitchen: ['Kitchen', 'Küche'],
  counter_service: ['Counter service', 'Thekenservice'],
  waiting_service: ['Service', 'Service'],
  cleaning: ['Cleaning', 'Reinigung'],
  housekeeping: ['Housekeeping', 'Housekeeping'],
  reception: ['Reception', 'Rezeption'],
  event_staff: ['Event staff', 'Eventpersonal'],
  customer_service: ['Customer service', 'Kundenservice'],
  other: ['Other', 'Sonstiges'],
}

const WORKPLACE: Record<WorkplaceType, [string, string]> = {
  supermarket: ['Supermarket', 'Supermarkt'],
  retail_store: ['Retail store', 'Geschäft'],
  drugstore: ['Drugstore', 'Drogerie'],
  warehouse: ['Warehouse', 'Lager'],
  parcel_hub: ['Parcel hub', 'Paketzentrum'],
  restaurant: ['Restaurant', 'Restaurant'],
  cafe: ['Café', 'Café'],
  hotel: ['Hotel', 'Hotel'],
  delivery: ['Delivery', 'Lieferdienst'],
  event: ['Event venue', 'Veranstaltung'],
  other: ['Other', 'Sonstiges'],
}

export function employmentLabel(id: FlexibleEmployment, de: boolean): string {
  return EMPLOYMENT[id][de ? 1 : 0]
}
export function roleLabel(id: FlexibleRoleFamily, de: boolean): string {
  return ROLE[id][de ? 1 : 0]
}
export function workplaceLabel(id: WorkplaceType, de: boolean): string {
  return WORKPLACE[id][de ? 1 : 0]
}