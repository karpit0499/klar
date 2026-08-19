import { useMemo, useState } from 'react'
import { useLocale } from '../i18n/LocaleProvider'
import {
  OFFICIAL_ROUTE_SECTORS,
  officialRouteDirectoryPage,
} from '../flexible/officialRouteDirectory'
import type { OfficialRouteSector } from '../flexible/connectors/officialRoutes.de'
import { Badge, Button, TextInput } from './atoms'
import { OpportunityCard } from './OpportunityCard'

const SECTOR_LABELS: Record<OfficialRouteSector, { en: string; de: string }> = {
  grocery: { en: 'Grocery', de: 'Lebensmittel' },
  retail: { en: 'Retail', de: 'Einzelhandel' },
  drugstore: { en: 'Drugstore', de: 'Drogerie' },
  logistics: { en: 'Logistics', de: 'Logistik' },
  food: { en: 'Food service', de: 'Gastronomie' },
  hotel: { en: 'Hotels', de: 'Hotels' },
  healthcare: { en: 'Healthcare', de: 'Gesundheit' },
  facilities: { en: 'Facilities', de: 'Gebäudedienste' },
  staffing: { en: 'Staffing', de: 'Personaldienstleister' },
}

/** Lazy-loaded content for the opt-in official employer directory. */
export function OfficialRouteDirectory({ preferredCities }: { preferredCities: string[] }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const cities = [...new Set(preferredCities.map((city) => city.trim()).filter(Boolean))]
  const [text, setText] = useState('')
  const [sector, setSector] = useState<OfficialRouteSector | 'all'>('all')
  const [city, setCity] = useState(cities[0] ?? '')
  const [pageIndex, setPageIndex] = useState(0)
  const result = useMemo(() => officialRouteDirectoryPage({
    text,
    sector,
    city,
    page: pageIndex,
  }), [city, pageIndex, sector, text])

  return (
    <div className="border-t border-border px-4 pb-4 pt-3 sm:px-5">
      <p className="text-sm text-muted">
        {de
          ? 'Diese Einträge sind verifizierte Links zu offiziellen Arbeitgeberseiten, keine bestätigten offenen Stellen.'
          : 'These are verified links to official employer sites, not confirmed open vacancies.'}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">
            {de ? 'Arbeitgeber oder Stichwort' : 'Employer or keyword'}
          </span>
          <TextInput
            value={text}
            maxLength={100}
            placeholder={de ? 'z. B. Logistik oder BVG' : 'e.g. logistics or BVG'}
            onChange={(event) => {
              setText(event.target.value)
              setPageIndex(0)
            }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">
            {de ? 'Bereich' : 'Sector'}
          </span>
          <select
            className="min-h-tap w-full rounded-md border border-border bg-surface px-3 text-ink outline-none focus:border-accent"
            value={sector}
            onChange={(event) => {
              setSector(event.target.value as OfficialRouteSector | 'all')
              setPageIndex(0)
            }}
          >
            <option value="all">{de ? 'Alle Bereiche' : 'All sectors'}</option>
            {OFFICIAL_ROUTE_SECTORS.map((value) => (
              <option key={value} value={value}>{SECTOR_LABELS[value][de ? 'de' : 'en']}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">
            {de ? 'Ort auf der Arbeitgeberseite prüfen' : 'City to check on employer site'}
          </span>
          <TextInput
            value={city}
            maxLength={80}
            list="klar-official-route-cities"
            placeholder={de ? 'z. B. Berlin' : 'e.g. Berlin'}
            onChange={(event) => {
              setCity(event.target.value)
              setPageIndex(0)
            }}
          />
          {cities.length > 0 && (
            <datalist id="klar-official-route-cities">
              {cities.map((value) => <option key={value} value={value} />)}
            </datalist>
          )}
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted" aria-live="polite">
          {de ? `${result.total} offizielle Wege` : `${result.total} official routes`}
          {result.cityContext
            ? de
              ? ` · Verfügbarkeit in ${result.cityContext} bitte auf jeder Seite prüfen.`
              : ` · Check each site for availability in ${result.cityContext}.`
            : ''}
        </p>
        <Badge tone="outline">{de ? 'Keine Live-Stellen' : 'Not live vacancies'}</Badge>
      </div>

      {result.items.length > 0 ? (
        <ul className="mt-3 grid gap-3" aria-label={de ? 'Offizielle Arbeitgeberwege' : 'Official employer routes'}>
          {result.items.map(({ route, opportunity }) => (
            <li key={route.id} className="min-w-0">
              <OpportunityCard job={opportunity} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          {de ? 'Keine offiziellen Wege passen zu diesen Filtern.' : 'No official routes match these filters.'}
        </p>
      )}

      {result.totalPages > 1 && (
        <nav
          className="mt-4 flex items-center justify-between gap-3"
          aria-label={de ? 'Seiten der Arbeitgeberwege' : 'Employer route pages'}
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={result.page === 0}
            onClick={() => setPageIndex(Math.max(0, result.page - 1))}
          >
            {de ? 'Zurück' : 'Previous'}
          </Button>
          <span className="text-sm tabular-nums text-muted">
            {de
              ? `Seite ${result.page + 1} von ${result.totalPages}`
              : `Page ${result.page + 1} of ${result.totalPages}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={result.page >= result.totalPages - 1}
            onClick={() => setPageIndex(Math.min(result.totalPages - 1, result.page + 1))}
          >
            {de ? 'Weiter' : 'Next'}
          </Button>
        </nav>
      )}
    </div>
  )
}
