// Intake form → Preferences. Comma-separated inputs keep the code small while
// still capturing everything the matcher needs.
import { useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import type { Preferences, Profile } from '../types'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'

const csv = (s: string): string[] =>
  s.split(',').map((x) => x.trim()).filter(Boolean)

// Seniority value → translation key (type-safe: every value maps to a key).
const SEN_KEY: Record<Preferences['seniority'], TranslationKey> = {
  intern: 'intake.sen.intern',
  junior: 'intake.sen.junior',
  mid: 'intake.sen.mid',
  senior: 'intake.sen.senior',
  lead: 'intake.sen.lead',
  exec: 'intake.sen.exec',
}

export function IntakeStep({
  profile,
  initial,
  onSave,
}: {
  profile: Profile
  initial?: Preferences
  onSave: (p: Preferences) => void
}) {
  const t = useT()

  const [titles, setTitles] = useState(
    (initial?.targetTitles ?? profile.titles.map((x) => x.title)).join(', '),
  )
  const [seniority, setSeniority] = useState<Preferences['seniority']>(initial?.seniority ?? 'mid')
  const [salaryMin, setSalaryMin] = useState(initial?.salary.min?.toString() ?? '')
  const [city, setCity] = useState(initial?.locations[0]?.city ?? 'Berlin')
  const [radius, setRadius] = useState((initial?.locations[0]?.radius_km ?? 30).toString())
  const [remoteOnly, setRemoteOnly] = useState(initial?.remoteOnly ?? false)
  const [mustHaves, setMustHaves] = useState((initial?.mustHaves ?? []).join(', '))
  const [dealbreakers, setDealbreakers] = useState((initial?.dealbreakers ?? []).join(', '))

  // German-market gating (features 2.1 & 2.2).
  const initialGerman =
    initial?.languages.find((l) => /deutsch|german/i.test(l.lang))?.min_level ??
    profile.languages.find((l) => /deutsch|german/i.test(l.lang))?.level ??
    ''
  const [germanLevel, setGermanLevel] = useState(initialGerman)
  const [needsVisa, setNeedsVisa] = useState(initial?.workAuth.needsVisaSponsorship ?? false)
  const [hideGerman, setHideGerman] = useState(initial?.hideGermanAboveLevel ?? false)
  const [hideNoVisa, setHideNoVisa] = useState(initial?.hideNoVisaSponsorship ?? false)

  function save() {
    // Keep the résumé's languages, but make sure German reflects the chosen level.
    const langs = profile.languages
      .filter((l) => !/deutsch|german/i.test(l.lang))
      .map((l) => ({ lang: l.lang, min_level: l.level ?? '' }))
    if (germanLevel) langs.push({ lang: 'German', min_level: germanLevel })

    const prefs: Preferences = {
      targetTitles: csv(titles),
      fields: profile.domains,
      seniority,
      salary: {
        min: salaryMin ? Number(salaryMin) : undefined,
        currency: 'EUR',
        period: 'year',
      },
      locations: city ? [{ city: city.trim(), radius_km: Number(radius) || 30 }] : [],
      remoteOnly,
      hybridOk: true,
      workAuth: { needsVisaSponsorship: needsVisa },
      languages: langs,
      mustHaves: csv(mustHaves),
      dealbreakers: csv(dealbreakers),
      hideGermanAboveLevel: hideGerman,
      hideNoVisaSponsorship: hideNoVisa,
    }
    onSave(prefs)
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">{t('intake.title')}</h2>
        <div className="mt-4 space-y-4">
          <Field label={t('intake.targetTitles')} hint={t('intake.targetTitlesHint')}>
            <TextInput value={titles} onChange={(e) => setTitles(e.target.value)} placeholder="Data Scientist, ML Engineer" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('intake.seniority')}>
              <select
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                value={seniority}
                onChange={(e) => setSeniority(e.target.value as Preferences['seniority'])}
              >
                {(['intern', 'junior', 'mid', 'senior', 'lead', 'exec'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(SEN_KEY[s])}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('intake.minSalary')} hint={t('common.optional')}>
              <TextInput
                type="number"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                placeholder="65000"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('intake.city')}>
              <TextInput value={city} onChange={(e) => setCity(e.target.value)} placeholder="Berlin" />
            </Field>
            <Field label={t('intake.radius')}>
              <TextInput type="number" value={radius} onChange={(e) => setRadius(e.target.value)} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
            {t('intake.remoteOnly')}
          </label>

          <Field label={t('intake.mustHaves')} hint={t('intake.mustHavesHint')}>
            <TextInput value={mustHaves} onChange={(e) => setMustHaves(e.target.value)} placeholder="Python, GCP" />
          </Field>
          <Field label={t('intake.dealbreakers')} hint={t('intake.dealbreakersHint')}>
            <TextInput value={dealbreakers} onChange={(e) => setDealbreakers(e.target.value)} placeholder="unpaid, on-site only" />
          </Field>

          {/* German-market gating (features 2.1 & 2.2). */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-ink">{t('intake.germanMarket')}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label={t('intake.germanLevel')}>
                <select
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                  value={germanLevel}
                  onChange={(e) => setGermanLevel(e.target.value)}
                >
                  <option value="">{t('profile.notSpecified')}</option>
                  {['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'].map((l) => (
                    <option key={l} value={l}>{l === 'Native' ? t('intake.levelNative') : l}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm text-ink">
                <input type="checkbox" checked={needsVisa} onChange={(e) => setNeedsVisa(e.target.checked)} />
                {t('intake.needVisa')}
              </label>
            </div>
            <div className="mt-2 space-y-2 text-sm text-ink">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hideGerman} onChange={(e) => setHideGerman(e.target.checked)} />
                {t('search.hideGerman')}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hideNoVisa} onChange={(e) => setHideNoVisa(e.target.checked)} />
                {t('search.hideNoVisa')}
              </label>
            </div>
          </div>

          <Button onClick={save}>{t('intake.save')}</Button>
        </div>
      </Card>
    </div>
  )
}