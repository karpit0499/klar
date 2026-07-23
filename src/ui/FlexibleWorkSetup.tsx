import { useMemo, useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import { useLocale } from '../i18n/LocaleProvider'
import type {
  FlexibleEmployment,
  FlexibleRoleFamily,
  FlexibleWorkPreferences,
  WorkplaceType,
} from '../types'
import {
  normalizeFlexibleRadius,
  validateFlexibleWorkSelection,
} from '../flexible/preferences'

const EMPLOYMENT: { id: FlexibleEmployment; en: string; de: string }[] = [
  { id: 'minijob', en: 'Minijob', de: 'Minijob' },
  { id: 'part_time', en: 'Part-time', de: 'Teilzeit' },
  { id: 'working_student', en: 'Working student', de: 'Werkstudent:in' },
  { id: 'temporary', en: 'Temporary', de: 'Befristet' },
  { id: 'seasonal', en: 'Seasonal', de: 'Saisonal' },
  { id: 'weekend', en: 'Weekend', de: 'Wochenende' },
  { id: 'evening', en: 'Evening', de: 'Abends' },
  { id: 'night', en: 'Night', de: 'Nachts' },
]

const WORKPLACES: { id: WorkplaceType; en: string; de: string }[] = [
  { id: 'supermarket', en: 'Supermarket', de: 'Supermarkt' },
  { id: 'retail_store', en: 'Retail store', de: 'Geschäft' },
  { id: 'drugstore', en: 'Drugstore', de: 'Drogerie' },
  { id: 'warehouse', en: 'Warehouse', de: 'Lager' },
  { id: 'parcel_hub', en: 'Parcel hub', de: 'Paketzentrum' },
  { id: 'restaurant', en: 'Restaurant', de: 'Restaurant' },
  { id: 'cafe', en: 'Café', de: 'Café' },
  { id: 'hotel', en: 'Hotel', de: 'Hotel' },
  { id: 'delivery', en: 'Delivery', de: 'Lieferdienst' },
  { id: 'event', en: 'Events', de: 'Veranstaltungen' },
]

const ROLES: { id: FlexibleRoleFamily; en: string; de: string }[] = [
  { id: 'shelf_stocking', en: 'Shelf stocking', de: 'Warenverräumung' },
  { id: 'cashier', en: 'Cashier', de: 'Kasse' },
  { id: 'sales_assistant', en: 'Sales assistant', de: 'Verkauf' },
  { id: 'picking_packing', en: 'Picking and packing', de: 'Kommissionierung' },
  { id: 'warehouse', en: 'Warehouse', de: 'Lager' },
  { id: 'parcel_sorting', en: 'Parcel sorting', de: 'Paketsortierung' },
  { id: 'delivery', en: 'Delivery', de: 'Auslieferung' },
  { id: 'kitchen', en: 'Kitchen', de: 'Küche' },
  { id: 'counter_service', en: 'Counter service', de: 'Thekenservice' },
  { id: 'waiting_service', en: 'Waiting/service', de: 'Service' },
  { id: 'cleaning', en: 'Cleaning', de: 'Reinigung' },
  { id: 'housekeeping', en: 'Housekeeping', de: 'Housekeeping' },
  { id: 'reception', en: 'Reception', de: 'Rezeption' },
  { id: 'event_staff', en: 'Event staff', de: 'Eventpersonal' },
  { id: 'customer_service', en: 'Customer service', de: 'Kundenservice' },
]

const DAYS = [
  { id: 'monday', en: 'Monday', de: 'Montag' },
  { id: 'tuesday', en: 'Tuesday', de: 'Dienstag' },
  { id: 'wednesday', en: 'Wednesday', de: 'Mittwoch' },
  { id: 'thursday', en: 'Thursday', de: 'Donnerstag' },
  { id: 'friday', en: 'Friday', de: 'Freitag' },
  { id: 'saturday', en: 'Saturday', de: 'Samstag' },
  { id: 'sunday', en: 'Sunday', de: 'Sonntag' },
] as const

const PERIODS = [
  { id: 'morning', en: 'Morning', de: 'Morgens' },
  { id: 'day', en: 'Daytime', de: 'Tagsüber' },
  { id: 'evening', en: 'Evening', de: 'Abends' },
  { id: 'night', en: 'Night', de: 'Nachts' },
] as const

type LocationDraft = { city: string; radius: string }

export function FlexibleWorkSetup({
  initial,
  onSave,
}: {
  initial?: FlexibleWorkPreferences
  onSave: (value: FlexibleWorkPreferences) => void | Promise<void>
}) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [employment, setEmployment] = useState<FlexibleEmployment[]>(initial?.employment ?? ['minijob', 'part_time'])
  const [workplaces, setWorkplaces] = useState<WorkplaceType[]>(initial?.workplaces ?? [])
  const [roleFamilies, setRoleFamilies] = useState<FlexibleRoleFamily[]>(initial?.roleFamilies ?? [])
  const [locations, setLocations] = useState<LocationDraft[]>(() =>
    initial?.locations.length
      ? initial.locations.map((location) => ({ city: location.city, radius: String(location.radius_km) }))
      : [{ city: '', radius: '15' }],
  )
  const [days, setDays] = useState<string[]>(initial?.schedule?.days ?? [])
  const [periods, setPeriods] = useState<Array<'morning' | 'day' | 'evening' | 'night'>>(initial?.schedule?.periods ?? [])
  const [maxHours, setMaxHours] = useState(initial?.schedule?.maxHoursPerWeek ? String(initial.schedule.maxHoursPerWeek) : '')
  const [german, setGerman] = useState(initial?.languageComfort?.german ?? '')
  const [english, setEnglish] = useState(initial?.languageComfort?.english ?? '')
  const [physicalWork, setPhysicalWork] = useState<FlexibleWorkPreferences['physicalWork'] | ''>(initial?.physicalWork ?? '')
  const [hasDrivingLicence, setHasDrivingLicence] = useState(initial?.hasDrivingLicence ?? false)
  const [hasBike, setHasBike] = useState(initial?.hasBike ?? false)
  const [earliestStart, setEarliestStart] = useState(initial?.earliestStart ?? '')
  const [error, setError] = useState('')
  const validationError = useMemo(
    () => validateFlexibleWorkSelection(locations.map((location) => location.city), employment, workplaces),
    [employment, locations, workplaces],
  )

  function toggle<T extends string>(value: T, values: T[], update: (next: T[]) => void) {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  }

  function updateLocation(index: number, patch: Partial<LocationDraft>) {
    setLocations((current) => current.map((location, currentIndex) =>
      currentIndex === index ? { ...location, ...patch } : location,
    ))
  }

  async function save() {
    if (validationError === 'location') {
      setError(de ? 'Gib eine Stadt oder einen Ort ein.' : 'Enter a city or place.')
      return
    }
    if (validationError === 'work_type') {
      setError(de ? 'Wähle mindestens eine Beschäftigungsart oder einen Arbeitsort.' : 'Choose at least one employment or workplace option.')
      return
    }
    setError('')
    const savedLocations = locations
      .filter((location) => location.city.trim().length >= 2)
      .map((location) => ({
        city: location.city.trim(),
        radius_km: normalizeFlexibleRadius(location.radius),
      }))
    const normalizedHours = maxHours.trim()
      ? Math.min(168, Math.max(1, Math.round(Number(maxHours) || 1)))
      : undefined
    const schedule = days.length || periods.length || normalizedHours
      ? { days: days.length ? days : undefined, periods: periods.length ? periods : undefined, maxHoursPerWeek: normalizedHours }
      : undefined
    const languageComfort = german.trim() || english.trim()
      ? { german: german.trim() || undefined, english: english.trim() || undefined }
      : undefined
    await onSave({
      employment,
      workplaces,
      roleFamilies,
      locations: savedLocations,
      schedule,
      languageComfort,
      physicalWork: physicalWork || undefined,
      hasDrivingLicence: hasDrivingLicence || undefined,
      hasBike: hasBike || undefined,
      earliestStart: earliestStart || undefined,
    })
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Card className="p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-ink">{de ? 'Flexible Arbeit finden' : 'Find flexible work'}</h1>
        <p className="mt-2 text-base text-muted">
          {de ? 'Du brauchst keinen Lebenslauf. Wähle selbst, wo und wie du arbeiten möchtest.' : 'You do not need a résumé. Choose where and how you want to work.'}
        </p>
        <fieldset className="mt-6">
          <legend className="text-base font-medium text-ink">{de ? 'Arbeitsorte' : 'Work locations'}</legend>
          <div className="mt-3 space-y-3">
            {locations.map((location, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <Field label={`${de ? 'Stadt oder Ort' : 'City or place'} ${index + 1}`}>
                  <TextInput value={location.city} onChange={(event) => updateLocation(index, { city: event.target.value })} placeholder={index === 0 ? 'Berlin' : 'Hamburg'} autoComplete="address-level2" />
                </Field>
                <Field label={de ? 'Umkreis (km)' : 'Radius (km)'}>
                  <TextInput type="number" min={1} max={200} value={location.radius} onChange={(event) => updateLocation(index, { radius: event.target.value })} />
                </Field>
                {locations.length > 1 && <Button type="button" variant="ghost" onClick={() => setLocations((current) => current.filter((_, currentIndex) => currentIndex !== index))}>{de ? 'Entfernen' : 'Remove'}</Button>}
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="ghost" className="mt-3" onClick={() => setLocations((current) => [...current, { city: '', radius: '15' }])}>
            {de ? 'Weitere Stadt hinzufügen' : 'Add another city'}
          </Button>
        </fieldset>
        <OptionGroup title={de ? 'Beschäftigungsart' : 'Employment arrangement'}>
          {EMPLOYMENT.map((item) => <Option key={item.id} checked={employment.includes(item.id)} label={de ? item.de : item.en} onChange={() => toggle(item.id, employment, setEmployment)} />)}
        </OptionGroup>
        <OptionGroup title={de ? 'Wo möchtest du arbeiten?' : 'Where would you like to work?'}>
          {WORKPLACES.map((item) => <Option key={item.id} checked={workplaces.includes(item.id)} label={de ? item.de : item.en} onChange={() => toggle(item.id, workplaces, setWorkplaces)} />)}
        </OptionGroup>
        <OptionGroup title={de ? 'Welche Tätigkeiten interessieren dich? (optional)' : 'Which roles interest you? (optional)'}>
          {ROLES.map((item) => <Option key={item.id} checked={roleFamilies.includes(item.id)} label={de ? item.de : item.en} onChange={() => toggle(item.id, roleFamilies, setRoleFamilies)} />)}
        </OptionGroup>
        <button type="button" className="mt-3 text-sm font-medium text-accent underline-offset-2 hover:underline" onClick={() => setRoleFamilies([])}>
          {de ? 'Zeig mir verschiedene Arten' : 'Show me different kinds'}
        </button>
        <fieldset className="mt-6">
          <legend className="text-base font-medium text-ink">{de ? 'Verfügbarkeit (optional)' : 'Availability (optional)'}</legend>
          <p className="mt-1 text-sm text-muted">{de ? 'Leer lassen bedeutet: keine Präferenz.' : 'Leave this blank to keep your search broad.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DAYS.map((item) => <Option key={item.id} checked={days.includes(item.id)} label={de ? item.de : item.en} onChange={() => toggle(item.id, days, setDays)} />)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PERIODS.map((item) => <Option key={item.id} checked={periods.includes(item.id)} label={de ? item.de : item.en} onChange={() => toggle(item.id, periods, setPeriods)} />)}
          </div>
          <div className="mt-4 max-w-xs">
            <Field label={de ? 'Maximale Stunden pro Woche' : 'Maximum hours per week'}>
              <TextInput type="number" min={1} max={168} value={maxHours} onChange={(event) => setMaxHours(event.target.value)} />
            </Field>
          </div>
        </fieldset>
        <fieldset className="mt-6">
          <legend className="text-base font-medium text-ink">{de ? 'Praktische Angaben (optional)' : 'Practical preferences (optional)'}</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label={de ? 'Deutsch-Komfort' : 'German comfort'}>
              <TextInput value={german} onChange={(event) => setGerman(event.target.value)} placeholder={de ? 'z. B. Grundkenntnisse' : 'e.g. basic'} />
            </Field>
            <Field label={de ? 'Englisch-Komfort' : 'English comfort'}>
              <TextInput value={english} onChange={(event) => setEnglish(event.target.value)} placeholder={de ? 'z. B. fließend' : 'e.g. fluent'} />
            </Field>
            <Field label={de ? 'Körperliche Arbeit' : 'Physical work'}>
              <select className="min-h-tap w-full rounded-md border border-border bg-surface px-3 text-ink" value={physicalWork} onChange={(event) => setPhysicalWork(event.target.value as FlexibleWorkPreferences['physicalWork'] | '')}>
                <option value="">{de ? 'Keine Präferenz' : 'No preference'}</option>
                <option value="yes">{de ? 'Ja' : 'Yes'}</option>
                <option value="limited">{de ? 'Begrenzt' : 'Limited'}</option>
              </select>
            </Field>
            <Field label={de ? 'Frühester Start' : 'Earliest start'}>
              <TextInput type="date" value={earliestStart} onChange={(event) => setEarliestStart(event.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Option checked={hasDrivingLicence} label={de ? 'Führerschein vorhanden' : 'I have a driving licence'} onChange={() => setHasDrivingLicence((value) => !value)} />
            <Option checked={hasBike} label={de ? 'Fahrrad vorhanden' : 'I have a bike'} onChange={() => setHasBike((value) => !value)} />
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        <div className="mt-6"><Button onClick={() => void save()}>{de ? 'Flexible Arbeit entdecken' : 'Explore flexible work'}</Button></div>
      </Card>
    </div>
  )
}

function OptionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="mt-6"><legend className="text-base font-medium text-ink">{title}</legend><div className="mt-3 flex flex-wrap gap-2">{children}</div></fieldset>
}

function Option({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return <label className={`flex min-h-tap cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${checked ? 'border-accent bg-accent-tint text-accent' : 'border-border text-ink'}`}><input type="checkbox" checked={checked} onChange={onChange} />{label}</label>
}