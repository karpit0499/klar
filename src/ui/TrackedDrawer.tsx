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

const STATUSES: TrackStatus[] = [
  'new', 'interested', 'applied', 'interviewing', 'offer', 'rejected', 'archived',
]

export function TrackedDrawer({ row, onClose }: { row: TrackedJob; onClose: () => void }) {
  const [notes, setNotesLocal] = useState(row.notes)
  const [remDate, setRemDate] = useState('')
  const [remText, setRemText] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  const stale = stalenessInfo(row)

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{row.job.title}</h2>
            <p className="truncate text-sm text-gray-600">{row.job.company}</p>
          </div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {row.match && <Badge tone="indigo">{row.match.fitScore}/100</Badge>}
          {/* Stale-posting flag (feature 5.4). */}
          <Badge tone={stale.likelyStale ? 'red' : 'gray'}>{stale.label}</Badge>
          <a href={row.job.url} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 underline">
            Open posting ↗
          </a>
        </div>
        {stale.likelyStale && (
          <p className="mt-2 text-xs text-gray-500">
            Browsers can't check another site's links, which is why we saved a snapshot — verify it's
            still live before applying.
          </p>
        )}

        <div className="mt-4">
          <Field label="Status">
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={row.status}
              onChange={(e) => void setStatus(row.jobId, e.target.value as TrackStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-gray-700">Notes</p>
          <textarea
            className="h-28 w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            value={notes}
            onChange={(e) => setNotesLocal(e.target.value)}
            onBlur={() => void setNotes(row.jobId, notes)}
            placeholder="Recruiter name, referral, next step…"
          />
        </div>

        {/* Reminders (feature 5.5). */}
        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-gray-700">Follow-up reminders</p>
          {row.reminders.length === 0 && <p className="text-xs text-gray-500">None yet.</p>}
          <div className="space-y-1">
            {row.reminders.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
                <span>
                  <span className="font-medium">{r.date}</span>
                  {r.text ? ` — ${r.text}` : ''}
                </span>
                <button
                  onClick={() => void removeReminder(row.jobId, i)}
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              type="date"
              value={remDate}
              onChange={(e) => setRemDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <TextInput
              value={remText}
              onChange={(e) => setRemText(e.target.value)}
              placeholder="e.g. ping recruiter"
              className="flex-1"
            />
            <Button
              className="px-3 py-2"
              disabled={!remDate}
              onClick={() => {
                void addReminder(row.jobId, remDate, remText)
                setRemDate('')
                setRemText('')
              }}
            >
              Add
            </Button>
          </div>
        </div>

        {/* Contacts (feature 5.5). */}
        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-gray-700">Contacts</p>
          {row.contacts.length === 0 && <p className="text-xs text-gray-500">None yet.</p>}
          <div className="space-y-1">
            {row.contacts.map((c, i) => (
              <div key={i} className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
                {c.name}
                {c.email ? ` · ${c.email}` : ''}
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <TextInput
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Name"
              className="flex-1"
            />
            <TextInput
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="email@company.com"
              className="flex-1"
            />
            <Button
              className="px-3 py-2"
              disabled={!contactName.trim()}
              onClick={() => {
                void addContact(row.jobId, { name: contactName.trim(), email: contactEmail.trim() || undefined })
                setContactName('')
                setContactEmail('')
              }}
            >
              Add
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <Button variant="danger" onClick={() => { void removeTracked(row.jobId); onClose() }}>
            Remove from tracker
          </Button>
        </div>
      </div>
    </div>
  )
}