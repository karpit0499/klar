// ============================================================================
// A Flexible Work opportunity card. It renders a vacancy or an open-entry route
// distinctly (roadmap §3), shows employer/location, taxonomy chips, published
// hourly pay, an inferred-details note when Klar classified fields, a "New"
// badge for saved-search deltas, and an accessible apply/official-route link.
//
// v2.5: an optional "Prepare message" action opens the résumé-free prepare
// drawer. The apply link is unchanged — it still goes straight to the employer's
// own official route, and Klar still never applies for anyone.
// ============================================================================
import { Card, Badge, Button } from './atoms'
import { useLocale } from '../i18n/LocaleProvider'
import { employmentLabel, roleLabel, workplaceLabel } from '../flexible/labels'
import { isInferredField } from '../flexible/opportunity'
import type { NormalizedJob } from '../types'

export function OpportunityCard({
  job,
  isNew,
  onPrepare,
}: {
  job: NormalizedJob
  isNew?: boolean
  /** v2.5 — omitted when there is nothing to prepare with (no flexible profile). */
  onPrepare?: (job: NormalizedJob) => void
}) {
  const { locale, t } = useLocale()
  const de = locale === 'de'
  const openEntry = job.kind === 'open_entry'
  const inferred =
    isInferredField(job, 'employment') || isInferredField(job, 'roleFamilies') || isInferredField(job, 'workplaces')

  // De-duplicate labels: a role family and a workplace can share a label
  // (e.g. "Warehouse"/"Lager"), and we never want the same chip twice.
  const chips: string[] = [...new Set([
    ...(job.employment ?? []).map((e) => employmentLabel(e, de)),
    ...(job.roleFamilies ?? []).filter((r) => r !== 'other').map((r) => roleLabel(r, de)),
    ...(job.workplaces ?? []).filter((w) => w !== 'other').map((w) => workplaceLabel(w, de)),
  ])].slice(0, 6)

  const hourly = job.salary.period === 'hour' && job.salary.min != null
    ? t('flexible.card.perHour', { amount: formatEuro(job.salary.min) })
    : null

  const applyLabel = openEntry || job.source === 'fabric' && job.programName ? t('flexible.card.official') : t('flexible.card.apply')

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm font-semibold text-ink outline-none hover:text-accent focus-visible:text-accent"
          >
            <h3 className="wrap-anywhere">{openEntry ? job.programName ?? job.title : job.title}</h3>
          </a>
          <p className="mt-0.5 truncate text-sm text-muted">
            {(job.brand && job.brand !== job.employerFamily ? `${job.brand} · ` : '') +
              (job.employerFamily ?? job.company)}
            {job.location.remote
              ? ` · ${t('flexible.card.remote')}`
              : job.location.city
                ? ` · ${job.location.city}`
                : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {openEntry ? (
            <Badge tone="accent">{t('flexible.card.openEntry')}</Badge>
          ) : (
            isNew && <Badge tone="accent">{t('flexible.card.new')}</Badge>
          )}
          {hourly && <Badge tone="neutral">{hourly}</Badge>}
        </div>
      </div>

      {openEntry && job.cityAvailability && job.cityAvailability.length > 0 && (
        <p className="mt-2 text-sm text-muted">
          {t('flexible.card.cities', { cities: job.cityAvailability.slice(0, 5).join(', ') })}
        </p>
      )}

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Badge key={chip} tone="neutral">
              {chip}
            </Badge>
          ))}
          {job.also_on && job.also_on.length > 0 && (
            <Badge tone="outline">{t('flexible.card.alsoOn', { count: job.also_on.length })}</Badge>
          )}
        </div>
      )}

      {inferred && <p className="mt-2 text-xs text-faint">{t('flexible.card.inferred')}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex">
          <Button variant="accent" size="sm" aria-label={`${applyLabel} — ${openEntry ? job.programName ?? job.title : job.title}`}>
            {applyLabel}
          </Button>
        </a>
        {onPrepare && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPrepare(job)}
            aria-label={`${t('flexible.card.prepare')} — ${openEntry ? job.programName ?? job.title : job.title}`}
          >
            {t('flexible.card.prepare')}
          </Button>
        )}
      </div>
    </Card>
  )
}

function formatEuro(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace('.', ',')
}