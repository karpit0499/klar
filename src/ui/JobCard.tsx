import { Card, Badge, Button } from './atoms'
import type { MatchResult, NormalizedJob } from '../types'

function scoreTone(score: number): 'green' | 'indigo' | 'amber' | 'gray' {
  if (score >= 80) return 'green'
  if (score >= 60) return 'indigo'
  if (score >= 40) return 'amber'
  return 'gray'
}

export function JobCard({
  job,
  match,
  score,
  onOpen,
  onSave,
  saved,
}: {
  job: NormalizedJob
  match?: MatchResult
  /** The composite (re-weighted) score to display; falls back to the raw fitScore. */
  score?: number
  onOpen: () => void
  onSave: () => void
  saved: boolean
}) {
  const shown = score ?? match?.fitScore
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onOpen} className="text-left">
            <h3 className="truncate font-semibold text-gray-900 hover:text-indigo-700">{job.title}</h3>
          </button>
          <p className="truncate text-sm text-gray-600">
            {job.company} · {job.location.city ?? (job.location.remote ? 'Remote' : '—')}
          </p>
        </div>
        {match && shown != null && (
          <div className="shrink-0 text-right">
            <Badge tone={scoreTone(shown)}>{shown}/100</Badge>
          </div>
        )}
      </div>

      {match?.rationale && <p className="mt-2 line-clamp-2 text-sm text-gray-600">{match.rationale}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="indigo">{job.source}</Badge>
        {job.location.remote && <Badge tone="green">Remote</Badge>}
        {job.salary.min != null && (
          <Badge tone="amber">
            €{Math.round(job.salary.min / 1000)}k{job.salary.max ? `–${Math.round(job.salary.max / 1000)}k` : '+'}
          </Badge>
        )}
        {match?.missingSkills.slice(0, 2).map((s) => (
          <Badge key={s} tone="gray">
            gap: {s}
          </Badge>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="ghost" onClick={onOpen} className="px-3 py-1.5">
          Details
        </Button>
        {/* One-click link straight to the posting (feature 5.1). */}
        <a href={job.url} target="_blank" rel="noreferrer">
          <Button variant="ghost" className="px-3 py-1.5">
            Open ↗
          </Button>
        </a>
        <Button onClick={onSave} disabled={saved} className="px-3 py-1.5">
          {saved ? 'Saved ✓' : 'Save'}
        </Button>
      </div>
    </Card>
  )
}