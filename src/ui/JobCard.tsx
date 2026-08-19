import { Card, Badge, Button } from './atoms'
import { useLocale } from '../i18n/LocaleProvider'
import type { MatchResult, NormalizedJob } from '../types'
import { formatCurrency, formatDate, formatNumber } from '../i18n/format'

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
  const { locale, t } = useLocale()
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button onClick={onOpen} className="max-w-full text-left">
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
            <div className="mt-1 text-xs text-faint">
              {t('match.klarScore')}
            </div>
            {match.aiAssessment && (
              <div className="mt-1 text-xs tabular-nums text-muted">
                {t('match.aiScore')}: {formatNumber(match.aiAssessment.fitScore, locale)}/100
              </div>
            )}
          </div>
        )}
      </div>

      {match?.rationale && <p className="mt-2 line-clamp-2 wrap-anywhere text-base text-muted">{match.rationale}</p>}

      <p className="mt-2 text-xs text-faint">
        {t('card.sourceConfidence')}: {job.sourceConfidence ?? t('card.unknown')}
        {' · '}
        {t('card.fetched')}: {formatDate(job.fetched_at, locale)}
        {job.also_on?.length && job.duplicateFamily
          ? ` · ${t('card.duplicateFamily')}: ${job.duplicateFamily.slice(0, 8)}`
          : ''}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{job.source}</Badge>
        {job.location.remote && <Badge tone="neutral">{t('card.remote')}</Badge>}
        {job.salary.min != null && (
          <Badge tone="neutral">
            <span className="font-display tabular-nums">
              {formatCurrency(job.salary.min, job.salary.currency ?? 'EUR', locale, { notation: 'compact' })}
              {job.salary.max
                ? `–${formatCurrency(job.salary.max, job.salary.currency ?? 'EUR', locale, { notation: 'compact' })}`
                : '+'}
            </span>
          </Badge>
        )}
        {match?.missingSkills.slice(0, 2).map((s) => (
          <Badge key={s} tone="outline">
            {t('card.gap', { skill: s })}
          </Badge>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onOpen}>
          {t('card.details')}
        </Button>
        {/* One-click link straight to the posting (feature 5.1). */}
        <a
          href={job.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-tap items-center justify-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          {t('card.open')}
        </a>
        <Button size="sm" onClick={onSave} disabled={saved} aria-label={saved ? t('card.saved') : t('card.save')}>
          {saved ? t('card.saved') : t('card.save')}
        </Button>
      </div>
    </Card>
  )
}
