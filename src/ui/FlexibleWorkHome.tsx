import { Button, Card } from './atoms'
import { useLocale } from '../i18n/LocaleProvider'
import type { Preferences } from '../types'

export function FlexibleWorkHome({
  preferences,
  onEdit,
  onAddResume,
}: {
  preferences: Preferences
  onEdit: () => void
  onAddResume: () => void
}) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const flexible = preferences.flexibleWork
  const locations = flexible?.locations ?? []
  return (
    <div className="page-container">
      <Card className="p-5 sm:p-6">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">{de ? 'Flexible Arbeit' : 'Flexible Work'}</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{de ? 'Deine flexible Suche ist vorbereitet' : 'Your flexible search is ready'}</h1>
        <p className="mt-2 text-base text-muted">
          {locations.length
            ? locations.map((location) => `${location.city} · ${location.radius_km} km`).join(' / ')
            : (de ? 'Ort noch nicht gewählt' : 'No location selected yet')}
        </p>
        <p className="mt-4 rounded-md border border-border bg-surface-2 p-3 text-sm text-muted">
          {de ? 'Die neuen Flexible-Work-Quellen und die progressive Suche werden in v2.4 aktiviert.' : 'The new Flexible Work sources and progressive search are enabled in v2.4.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={onEdit}>{de ? 'Flexible Suche bearbeiten' : 'Edit flexible search'}</Button>
          <Button variant="ghost" onClick={onAddResume}>{de ? 'Lebenslauf für Karrierejobs hinzufügen' : 'Add résumé for career roles'}</Button>
        </div>
      </Card>
    </div>
  )
}