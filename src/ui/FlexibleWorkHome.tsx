// ============================================================================
// The Flexible Work home (v2.4). Replaces the v2.3 "coming in v2.4" placeholder
// with the real résumé-free entry surface: a search launcher for the saved
// preferences, the list of saved Flexible Work searches, and paths to edit the
// search or add a résumé for career roles.
// ============================================================================
import { Button, Card } from './atoms'
import { useLocale } from '../i18n/LocaleProvider'
import type { FlexibleWorkPreferences, Preferences } from '../types'
import { useFlexibleSearches, deleteFlexibleSearch } from '../flexible/savedFlexibleSearches'

export type FlexibleLaunch = { preferences: FlexibleWorkPreferences; savedSearchId?: string }

export function FlexibleWorkHome({
  preferences,
  onSearch,
  onEdit,
  onAddResume,
}: {
  preferences: Preferences
  onSearch: (launch: FlexibleLaunch) => void
  onEdit: () => void
  onAddResume: () => void
}) {
  const { locale, t } = useLocale()
  const de = locale === 'de'
  const flexible = preferences.flexibleWork
  const saved = useFlexibleSearches()

  if (!flexible) {
    return (
      <div className="page-container">
        <Card className="p-5 sm:p-6">
          <p className="text-sm font-medium uppercase tracking-wide text-accent">{t('flexible.home.eyebrow')}</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">{t('flexible.home.title')}</h1>
          <p className="mt-2 text-base text-muted">{t('flexible.home.noLocation')}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={onEdit}>{t('flexible.home.edit')}</Button>
            <Button variant="ghost" onClick={onAddResume}>{t('flexible.home.addResume')}</Button>
          </div>
        </Card>
      </div>
    )
  }

  const locations = flexible.locations

  return (
    <div className="page-container">
      <Card className="p-5 sm:p-6">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">{t('flexible.home.eyebrow')}</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{t('flexible.home.title')}</h1>
        <p className="mt-2 text-base text-muted">
          {locations.length
            ? locations.map((location) => `${location.city} · ${location.radius_km} km`).join(' / ')
            : t('flexible.home.noLocation')}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => onSearch({ preferences: flexible })}>{t('flexible.home.start')}</Button>
          <Button variant="ghost" onClick={onEdit}>{t('flexible.home.edit')}</Button>
          <Button variant="ghost" onClick={onAddResume}>{t('flexible.home.addResume')}</Button>
        </div>
      </Card>

      <Card className="mt-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">{t('flexible.home.savedTitle')}</h2>
        {saved.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t('flexible.home.savedEmpty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {saved.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{row.name}</p>
                  <p className="truncate text-sm text-muted">
                    {row.preferences.locations.map((l) => l.city).join(', ') || (de ? 'Alle Orte' : 'All places')}
                    {row.lastRunAt ? ` · ${new Date(row.lastRunAt).toLocaleDateString(de ? 'de-DE' : 'en-GB')}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" onClick={() => onSearch({ preferences: row.preferences, savedSearchId: row.id })}>
                    {t('flexible.home.run')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${t('flexible.home.delete')} — ${row.name}`}
                    onClick={() => void deleteFlexibleSearch(row.id)}
                  >
                    {t('flexible.home.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}