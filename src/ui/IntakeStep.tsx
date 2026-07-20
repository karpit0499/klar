// Intake form → Preferences. Comma-separated inputs keep the code small while
// still capturing everything the matcher needs.
import { useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import type { Preferences, Profile } from '../types'

const csv = (s: string): string[] =>
  s.split(',').map((x) => x.trim()).filter(Boolean)

export function IntakeStep({
  profile,
  initial,
  onSave,
}: {
  profile: Profile
  initial?: Preferences
  onSave: (p: Preferences) => void
}) {
  const [titles, setTitles] = useState(
    (initial?.targetTitles ?? profile.titles.map((t) => t.title)).join(', '),
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
    <div className="mx-auto max-w-2xl p-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">What are you looking for?</h2>
        <div className="mt-4 space-y-4">
          <Field label="Target titles" hint="Comma-separated. We search each one.">
            <TextInput value={titles} onChange={(e) => setTitles(e.target.value)} placeholder="Data Scientist, ML Engineer" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Seniority">
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={seniority}
                onChange={(e) => setSeniority(e.target.value as Preferences['seniority'])}
              >
                {(['intern', 'junior', 'mid', 'senior', 'lead', 'exec'] as const).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Min salary (€/year)" hint="Optional">
              <TextInput
                type="number"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                placeholder="65000"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City">
              <TextInput value={city} onChange={(e) => setCity(e.target.value)} placeholder="Berlin" />
            </Field>
            <Field label="Radius (km)">
              <TextInput type="number" value={radius} onChange={(e) => setRadius(e.target.value)} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
            Remote only
          </label>

          <Field label="Must-haves" hint="Comma-separated keywords the role should mention">
            <TextInput value={mustHaves} onChange={(e) => setMustHaves(e.target.value)} placeholder="Python, GCP" />
          </Field>
          <Field label="Dealbreakers" hint="Roles mentioning these are hidden">
            <TextInput value={dealbreakers} onChange={(e) => setDealbreakers(e.target.value)} placeholder="unpaid, on-site only" />
          </Field>

          {/* German-market gating (features 2.1 & 2.2). */}
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-700">German market</p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Field label="Your German level">
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={germanLevel}
                  onChange={(e) => setGermanLevel(e.target.value)}
                >
                  <option value="">Not specified</option>
                  {['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
                <input type="checkbox" checked={needsVisa} onChange={(e) => setNeedsVisa(e.target.checked)} />
                I need visa sponsorship
              </label>
            </div>
            <div className="mt-2 space-y-2 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hideGerman} onChange={(e) => setHideGerman(e.target.checked)} />
                Hide roles requiring German above my level
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hideNoVisa} onChange={(e) => setHideNoVisa(e.target.checked)} />
                Hide roles without visa sponsorship
              </label>
            </div>
          </div>

          <Button onClick={save}>Save & find jobs</Button>
        </div>
      </Card>
    </div>
  )
}