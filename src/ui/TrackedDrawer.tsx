// Detail editor for one tracked application. Surfaces reminders & contacts
// (feature 5.5) and the stale-posting flag (feature 5.4), and lets the user
// edit status and notes. State lives in IndexedDB via the tracker store.
import { useState } from 'react'
import { Button, Badge, Field, TextInput } from './atoms'
import type { TrackStatus, TrackedJob } from '../types'
import {
  setStatus, setNotes, addReminder, removeReminder, addContact, removeTracked,
} from '../tracker/store'
import { stalenessInfo } from '../tracker/staleness'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'
import { useScrollLock } from './useScrollLock'

const STATUSES: TrackStatus[] = [
  'new', 'interested', 'applied', 'interviewing', 'offer', 'rejected', 'archived',
]

// Status value → translation key (shared with the board).
const STATUS_KEY: Record<TrackStatus, TranslationKey> = {
  new: 'status.new',
  interested: 'status.interested',
  applied: 'status.applied',
  interviewing: 'status.interviewing',
  offer: 'status.offer',
  rejected: 'status.rejected',
  archived: 'status.archived',
}

export function TrackedDrawer({
  row,
  score,
  onClose,
}: {
  row: TrackedJob
  score?: number
  onClose: () => void
}) {
  const t = useT()
  useScrollLock()

  const [notes, setNotesLocal] = useState(row.notes)
  const [remDate, setRemDate] = useState('')
  const [remText, setRemText] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  const stale = stalenessInfo(row)

  return (
    <div className="fixed inset-0 z-50 flex justify-end overscroll-contain bg-black/40" onClick={onClose}>
      <div
        className="app-drawer w-full max-w-lg overflow-y-auto bg-surface p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="wrap-anywhere text-lg font-semibold text-ink">{row.job.title}</h2>
            <p className="wrap-anywhere text-base text-muted">{row.job.company}</p>
          </div>
          <Button variant="ghost" className="shrink-0" onClick={onClose}>{t('common.close')}</Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {score != null && <Badge tone="accent">{score}{t('drawer.scoreOutOf')}</Badge>}
          {/* Stale-posting flag (feature 5.4). */}
          <Badge tone={stale.likelyStale ? 'danger' : 'neutral'}>{stale.label}</Badge>
          <a href={row.job.url} target="_blank" rel="noreferrer" className="text-sm text-accent underline">
            {t('tracked.openPosting')}
          </a>
        </div>
        {stale.likelyStale && (
          <p className="mt-2 text-xs text-faint">{t('tracked.staleNote')}</p>
        )}

        <div className="mt-4">
          <Field label={t('tracked.status')}>
            <select
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
              value={row.status}
              onChange={(e) => void setStatus(row.jobId, e.target.value as TrackStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{t(STATUS_KEY[s])}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-ink">{t('tracked.notes')}</p>
          <textarea
            className="h-28 w-full rounded-lg border border-border p-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
            value={notes}
            onChange={(e) => setNotesLocal(e.target.value)}
            onBlur={() => void setNotes(row.jobId, notes)}
            placeholder={t('tracked.notesPlaceholder')}
          />
        </div>

        {/* Reminders (feature 5.5). */}
        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-ink">{t('tracked.reminders')}</p>
          {row.reminders.length === 0 && <p className="text-xs text-faint">{t('tracked.noneYet')}</p>}
          <div className="space-y-1">
            {row.reminders.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
                <span>
                  <span className="font-medium">{r.date}</span>
                  {r.text ? ` — ${r.text}` : ''}
                </span>
                <button
                  onClick={() => void removeReminder(row.jobId, i)}
                  className="min-h-tap rounded-md px-3 text-sm text-faint hover:bg-surface hover:text-danger"
                >
                  {t('common.remove')}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              type="date"
              value={remDate}
              onChange={(e) => setRemDate(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
            />
            <TextInput
              value={remText}
              onChange={(e) => setRemText(e.target.value)}
              placeholder={t('tracked.reminderPlaceholder')}
              className="flex-1"
            />
            <Button
              disabled={!remDate}
              onClick={() => {
                void addReminder(row.jobId, remDate, remText)
                setRemDate('')
                setRemText('')
              }}
            >
              {t('common.add')}
            </Button>
          </div>
        </div>

        {/* Contacts (feature 5.5). */}
        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-ink">{t('tracked.contacts')}</p>
          {row.contacts.length === 0 && <p className="text-xs text-faint">{t('tracked.noneYet')}</p>}
          <div className="space-y-1">
            {row.contacts.map((c, i) => (
              <div key={i} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
                {c.name}
                {c.email ? ` · ${c.email}` : ''}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <TextInput
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder={t('tracked.namePlaceholder')}
              className="flex-1"
            />
            <TextInput
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="email@company.com"
              className="flex-1"
            />
            <Button
              disabled={!contactName.trim()}
              onClick={() => {
                void addContact(row.jobId, { name: contactName.trim(), email: contactEmail.trim() || undefined })
                setContactName('')
                setContactEmail('')
              }}
            >
              {t('common.add')}
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <Button variant="danger" onClick={() => { void removeTracked(row.jobId); onClose() }}>
            {t('tracked.remove')}
          </Button>
        </div>
      </div>
    </div>
  )
}