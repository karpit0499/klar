// Show the parsed profile so the user can sanity-check before continuing.
import { Button, Card, Badge } from './atoms'
import type { Profile } from '../types'
import { useT } from '../i18n/LocaleProvider'

export function ProfileStep({
  profile,
  onConfirm,
  onRedo,
}: {
  profile: Profile
  onConfirm: () => void
  onRedo: () => void
}) {
  const t = useT()

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-ink">{t('profile.title')}</h2>
        <p className="mt-1 text-sm text-muted">{profile.summary || t('profile.noSummary')}</p>

        <div className="mt-4 space-y-4 text-sm">
          <section>
            <h3 className="font-medium text-ink">{t('profile.titles')}</h3>
            <div className="mt-1 flex flex-wrap gap-2">
              {profile.titles.length ? (
                profile.titles.map((item, i) => (
                  <Badge key={i} tone="accent">
                    {item.title}
                    {item.years ? ` · ${t('common.yearsShort', { years: item.years })}` : ''}
                  </Badge>
                ))
              ) : (
                <span className="text-faint">{t('profile.noneFound')}</span>
              )}
            </div>
          </section>

          <section>
            <h3 className="font-medium text-ink">{t('profile.skillsCount', { n: profile.skills.length })}</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {profile.skills.slice(0, 40).map((s, i) => (
                <Badge key={i}>{s.name}</Badge>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-4">
            <section>
              <h3 className="font-medium text-ink">{t('profile.experience')}</h3>
              <p className="text-muted">
                {profile.totalYears != null
                  ? t('profile.yearsTotal', { years: profile.totalYears })
                  : t('profile.notSpecified')}
              </p>
            </section>
            <section>
              <h3 className="font-medium text-ink">{t('profile.languages')}</h3>
              <p className="text-muted">
                {profile.languages.length
                  ? profile.languages.map((l) => `${l.lang}${l.level ? ` (${l.level})` : ''}`).join(', ')
                  : t('profile.notSpecified')}
              </p>
            </section>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={onConfirm}>{t('profile.confirm')}</Button>
          <Button variant="ghost" onClick={onRedo}>
            {t('profile.redo')}
          </Button>
        </div>
      </Card>
    </div>
  )
}