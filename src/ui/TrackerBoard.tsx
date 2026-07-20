// The tracker: a Kanban board (drag between statuses) OR a flat saved list
// (feature 5.3), with stale-posting badges (5.4), a follow-up nudge + due-
// reminder panel (5.5), and CSV/XLSX/PDF export of the funnel (feature 3.2).
import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Badge, Card, Button } from './atoms'
import { TrackedDrawer } from './TrackedDrawer'
import { useTracked, setStatus } from '../tracker/store'
import { stalenessInfo } from '../tracker/staleness'
import { applicationsNeedingNudge, dueReminders } from '../tracker/nudges'
import { trackedToRows, downloadCsv, downloadXlsx, printRowsAsPdf } from '../export/exporters'
import type { TrackStatus, TrackedJob } from '../types'

const COLUMNS: { id: TrackStatus; label: string }[] = [
  { id: 'interested', label: 'Interested' },
  { id: 'applied', label: 'Applied' },
  { id: 'interviewing', label: 'Interviewing' },
  { id: 'offer', label: 'Offer' },
  { id: 'rejected', label: 'Rejected' },
]

function DraggableCard({ row, onOpen }: { row: TrackedJob; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.jobId })
  const stale = stalenessInfo(row)
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={`cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-sm ${isDragging ? 'opacity-40' : ''}`}
    >
      <p className="truncate text-sm font-medium text-gray-900">{row.job.title}</p>
      <p className="truncate text-xs text-gray-500">{row.job.company}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {row.match ? <Badge tone="indigo">{row.match.fitScore}</Badge> : null}
        {stale.likelyStale && <Badge tone="red">may be expired</Badge>}
        {row.reminders.length > 0 && <Badge tone="amber">⏰ {row.reminders.length}</Badge>}
      </div>
    </div>
  )
}

function Column({
  id,
  label,
  rows,
  onOpen,
}: {
  id: TrackStatus
  label: string
  rows: TrackedJob[]
  onOpen: (row: TrackedJob) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-xl border p-2 ${isOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50'}`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <Badge>{rows.length}</Badge>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <DraggableCard key={r.jobId} row={r} onOpen={() => onOpen(r)} />
        ))}
      </div>
    </div>
  )
}

function SavedList({ rows, onOpen }: { rows: TrackedJob[]; onOpen: (row: TrackedJob) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Fit</th>
            <th className="px-3 py-2">Posting</th>
            <th className="px-3 py-2">Link</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const stale = stalenessInfo(r)
            return (
              <tr
                key={r.jobId}
                className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                onClick={() => onOpen(r)}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{r.job.title}</div>
                  <div className="text-xs text-gray-500">{r.job.company}</div>
                </td>
                <td className="px-3 py-2 capitalize">{r.status}</td>
                <td className="px-3 py-2">{r.match ? r.match.fitScore : '—'}</td>
                <td className="px-3 py-2">
                  {stale.likelyStale ? <span className="text-red-600">may be expired</span> : stale.label}
                </td>
                <td className="px-3 py-2">
                  <a
                    href={r.job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open ↗
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function TrackerBoard() {
  const tracked = useTracked()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [dragging, setDragging] = useState<TrackedJob | null>(null)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [openId, setOpenId] = useState<string | null>(null)

  function onStart(e: DragStartEvent) {
    setDragging(tracked.find((t) => t.jobId === e.active.id) ?? null)
  }
  function onEnd(e: DragEndEvent) {
    setDragging(null)
    const overId = e.over?.id as TrackStatus | undefined
    const jobId = e.active.id as string
    if (overId && COLUMNS.some((c) => c.id === overId)) {
      void setStatus(jobId, overId)
    }
  }

  function exportTracker(kind: 'csv' | 'xlsx' | 'pdf') {
    const rows = trackedToRows(tracked)
    const stamp = new Date().toISOString().slice(0, 10)
    if (kind === 'csv') downloadCsv(`klar-tracker-${stamp}.csv`, rows)
    else if (kind === 'xlsx') void downloadXlsx(`klar-tracker-${stamp}.xlsx`, 'Applications', rows)
    else printRowsAsPdf('Klar — application tracker', rows)
  }

  if (tracked.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Card className="p-8 text-center text-sm text-gray-500">
          Nothing tracked yet. Save jobs from the search screen and they'll appear here.
        </Card>
      </div>
    )
  }

  const nudges = applicationsNeedingNudge(tracked)
  const due = dueReminders(tracked)
  const openRow = tracked.find((t) => t.jobId === openId) ?? null

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Your applications</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 p-0.5">
            {(['board', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${
                  view === v ? 'bg-indigo-100 text-indigo-800' : 'text-gray-600'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-500">Export:</span>
          <Button variant="ghost" className="px-3 py-1.5" onClick={() => exportTracker('csv')}>CSV</Button>
          <Button variant="ghost" className="px-3 py-1.5" onClick={() => exportTracker('xlsx')}>XLSX</Button>
          <Button variant="ghost" className="px-3 py-1.5" onClick={() => exportTracker('pdf')}>PDF</Button>
        </div>
      </div>

      {/* Follow-up nudges + due reminders (feature 5.5). */}
      {(nudges.length > 0 || due.length > 0) && (
        <Card className="mb-4 p-4">
          {due.length > 0 && (
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-gray-800">Reminders due</h3>
              <ul className="mt-1 space-y-1 text-sm text-gray-700">
                {due.map((d) => (
                  <li key={`${d.row.jobId}-${d.index}`} className="flex items-center gap-2">
                    <Badge tone="amber">{d.date}</Badge>
                    <button className="text-left hover:underline" onClick={() => setOpenId(d.row.jobId)}>
                      {d.row.job.title} — {d.text || 'follow up'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {nudges.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Applications needing a nudge</h3>
              <ul className="mt-1 space-y-1 text-sm text-gray-700">
                {nudges.map((n) => (
                  <li key={n.row.jobId} className="flex items-center gap-2">
                    <Badge tone="red">{n.quietDays}d quiet</Badge>
                    <button className="text-left hover:underline" onClick={() => setOpenId(n.row.jobId)}>
                      {n.row.job.title} · {n.row.job.company}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {view === 'board' ? (
        <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <Column
                key={col.id}
                id={col.id}
                label={col.label}
                rows={tracked.filter((t) => t.status === col.id)}
                onOpen={(r) => setOpenId(r.jobId)}
              />
            ))}
          </div>
          <DragOverlay>
            {dragging ? (
              <div className="rounded-lg border border-indigo-300 bg-white p-3 shadow-lg">
                <p className="text-sm font-medium">{dragging.job.title}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <SavedList rows={tracked} onOpen={(r) => setOpenId(r.jobId)} />
      )}

      {openRow && <TrackedDrawer row={openRow} onClose={() => setOpenId(null)} />}
    </div>
  )
}