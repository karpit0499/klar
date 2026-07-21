// The personal, device-local dashboard (feature 4.1). Photo + free-text
// details, persisted in IndexedDB, never uploaded. Serves as the app's home.
import { useEffect, useRef, useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import { useDashboard, saveDashboard, fileToDataUrl, EMPTY_DASHBOARD } from '../dashboard/store'
import type { Dashboard, Profile, Preferences } from '../types'
import { useT } from '../i18n/LocaleProvider'

export function DashboardStep({
  profile,
  prefs,
}: {
  profile?: Profile | null
  prefs?: Preferences | null
}) {
  const t = useT()

  const stored = useDashboard()
  const [form, setForm] = useState<Dashboard>(EMPTY_DASHBOARD)
  const [editing, setEditing] = useState(false)
  const [photoErr, setPhotoErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Sync local form when the stored dashboard loads/changes (and we're not editing).
  useEffect(() => {
    if (stored && !editing) setForm(stored)
  }, [stored, editing])

  async function handlePhoto(file: File) {
    setPhotoErr('')
    try {
      const dataUrl = await fileToDataUrl(file)
      setForm((f) => ({ ...f, photoDataUrl: dataUrl }))
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : t('dashboard.imageFailed'))
    }
  }

  async function save() {
    await saveDashboard(form)
    setEditing(false)
  }

  if (stored === undefined) return null // still loading

  const set = (patch: Partial<Dashboard>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            {form.photoDataUrl ? (
              <img
                src={form.photoDataUrl}
                alt={t('dashboard.photoAlt')}
                className="h-20 w-20 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-tint text-2xl font-semibold text-accent">
                {(form.displayName || 'K').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-3">
                <Field label={t('dashboard.displayName')}>
                  <TextInput value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} placeholder={t('dashboard.namePlaceholder')} />
                </Field>
                <Field label={t('dashboard.headline')}>
                  <TextInput value={form.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="Senior Data Scientist · Berlin" />
                </Field>
                <Field label={t('dashboard.location')}>
                  <TextInput value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="Berlin, Germany" />
                </Field>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-ink">{form.displayName || t('dashboard.title')}</h2>
                {form.headline && <p className="text-sm text-muted">{form.headline}</p>}
                {form.location && <p className="text-sm text-faint">{form.location}</p>}
              </>
            )}
          </div>
          <div className="shrink-0">
            {editing ? (
              <Button onClick={save} size="sm">{t('common.save')}</Button>
            ) : (
              <Button variant="ghost" onClick={() => setEditing(true)} size="sm">{t('common.edit')}</Button>
            )}
          </div>
        </div>

        {editing && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-1 text-sm font-medium text-ink">{t('dashboard.photo')}</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handlePhoto(f)
                }}
              />
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                  {t('dashboard.chooseImage')}
                </Button>
                {form.photoDataUrl && (
                  <Button variant="ghost" size="sm" onClick={() => set({ photoDataUrl: undefined })}>
                    {t('dashboard.removePhoto')}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-faint">{t('dashboard.photoNote')}</p>
              {photoErr && <p className="mt-1 text-sm text-danger">{photoErr}</p>}
            </div>

            <Field label={t('dashboard.about')} hint={t('dashboard.aboutHint')}>
              <textarea
                className="h-28 w-full rounded-lg border border-border p-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
                value={form.about}
                onChange={(e) => set({ about: e.target.value })}
                placeholder={t('dashboard.aboutPlaceholder')}
              />
            </Field>

            <div>
              <p className="mb-1 text-sm font-medium text-ink">{t('dashboard.links')}</p>
              <div className="space-y-2">
                {form.links.map((lnk, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <TextInput
                      value={lnk.label}
                      onChange={(e) =>
                        set({ links: form.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                      }
                      placeholder="GitHub"
                      className="w-32"
                    />
                    <TextInput
                      value={lnk.url}
                      onChange={(e) =>
                        set({ links: form.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })
                      }
                      placeholder="https://github.com/you"
                      className="flex-1"
                    />
                    <button
                      onClick={() => set({ links: form.links.filter((_, j) => j !== i) })}
                      className="text-xs text-faint hover:text-danger"
                    >
                      {t('common.remove')}
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => set({ links: [...form.links, { label: '', url: '' }] })}
              >
                {t('dashboard.addLink')}
              </Button>
            </div>
          </div>
        )}

        {!editing && form.about && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink">{form.about}</p>
        )}
        {!editing && form.links.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {form.links.filter((l) => l.url).map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer" className="text-accent underline">
                {l.label || l.url}
              </a>
            ))}
          </div>
        )}
      </Card>

      {/* A light touch of context pulled from the résumé/preferences, if present. */}
      {!editing && (profile || prefs) && (
        <Card className="mt-4 p-6">
          <h3 className="text-sm font-semibold text-ink">{t('dashboard.atAGlance')}</h3>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm text-muted">
            {profile && <div><span className="font-medium">{t('dashboard.skillsLabel')}</span> {profile.skills.length}</div>}
            {profile?.totalYears != null && (
              <div><span className="font-medium">{t('dashboard.experienceLabel')}</span> {t('common.yearsShort', { years: profile.totalYears })}</div>
            )}
            {prefs && <div><span className="font-medium">{t('dashboard.targetLabel')}</span> {prefs.targetTitles.join(', ') || '—'}</div>}
            {prefs?.locations[0] && <div><span className="font-medium">{t('dashboard.locationLabel')}</span> {prefs.locations[0].city}</div>}
          </div>
        </Card>
      )}
    </div>
  )
}