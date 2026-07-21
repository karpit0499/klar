import { Card, Badge, Button } from './atoms'
import { useT } from '../i18n/LocaleProvider'
import type { MatchResult, NormalizedJob } from '../types'

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
  const t = useT()
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onOpen} className="text-left">
            <h3 className="truncate font-semibold text-ink hover:text-accent">{job.title}</h3>
          </button>
          <p className="truncate text-sm text-muted">
            {job.company} · {job.location.city ?? (job.location.remote ? t('card.remote') : '—')}
          </p>
        </div>
        {match && shown != null && (
          <div className="shrink-0 text-right">
            <Badge tone="accent">
              <span className="font-display tabular-nums font-semibold">{shown}</span>
              <span className="opacity-70">/100</span>
            </Badge>
          </div>
        )}
      </div>

      {match?.rationale && <p className="mt-2 line-clamp-2 text-sm text-muted">{match.rationale}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{job.source}</Badge>
        {job.location.remote && <Badge tone="neutral">{t('card.remote')}</Badge>}
        {job.salary.min != null && (
          <Badge tone="neutral">
            <span className="font-display tabular-nums">
              €{Math.round(job.salary.min / 1000)}k{job.salary.max ? `–${Math.round(job.salary.max / 1000)}k` : '+'}
            </span>
          </Badge>
        )}
        {match?.missingSkills.slice(0, 2).map((s) => (
          <Badge key={s} tone="outline">
            {t('card.gap', { skill: s })}
          </Badge>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onOpen}>
          {t('card.details')}
        </Button>
        {/* One-click link straight to the posting (feature 5.1). */}
        <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex">
          <Button variant="ghost" size="sm">
            {t('card.open')}
          </Button>
        </a>
        <Button size="sm" onClick={onSave} disabled={saved} aria-label={saved ? t('card.saved') : t('card.save')}>
          {saved ? t('card.saved') : t('card.save')}
        </Button>
      </div>
    </Card>
  )
}