// ============================================================================
// v2.5 · C2 — the coverage panel.
//
// `coverageReport()` has computed covered/missing terms since v2.3, but the
// number was buried in one sentence. This panel makes the loop visible and
// actionable: what the posting asks for, what the résumé already proves, what it
// does not — and a button to re-run tailoring focused on the gaps.
//
// Honesty rules baked into the UI:
//   • "missing" never means "add this". It means the résumé does not currently
//     evidence it. The re-run only works terms in where the source supports them.
//   • the re-run is USER-TRIGGERED. v2.5 deliberately does not fire an automatic
//     second pass (ATS plan Risk R5: never ship the cost-doubler before the
//     rate-limit backoff, which is v2.6 work).
// ============================================================================
import { Badge, Button, Spinner } from './atoms'
import { useT } from '../i18n/LocaleProvider'

export type CoverageView = {
  summary: string
  covered: string[]
  missing: string[]
  ratio: number
}

export function CoveragePanel({
  coverage,
  extraTermCount,
  onImprove,
  improving,
  disabled,
}: {
  coverage: CoverageView
  /** How many terms came from the LLM requirement extractor (WS2). */
  extraTermCount?: number
  onImprove?: () => void
  improving?: boolean
  disabled?: boolean
}) {
  const t = useT()
  const percent = Math.round(coverage.ratio * 100)
  const total = coverage.covered.length + coverage.missing.length

  return (
    <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="coverage-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="coverage-heading" className="text-base font-semibold text-ink">
          {t('bundle.coverage')}
        </h3>
        <p className="font-display text-sm tabular-nums text-muted">
          {t('coverage.score', { covered: coverage.covered.length, total })}
        </p>
      </div>

      {total > 0 && (
        <div
          className="mt-2 h-1.5 w-full rounded-full bg-border"
          role="progressbar"
          aria-label={t('coverage.barAria')}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-1.5 rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
      )}

      <p className="mt-2 wrap-anywhere text-base leading-relaxed text-muted">{coverage.summary}</p>

      {coverage.covered.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold text-ink">{t('coverage.covered')}</h4>
          <ul className="mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
            {coverage.covered.slice(0, 12).map((term) => (
              <li key={term}>
                <Badge tone="accent">{term}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {coverage.missing.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold text-ink">{t('coverage.missing')}</h4>
          <ul className="mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
            {coverage.missing.slice(0, 12).map((term) => (
              <li key={term}>
                <Badge tone="outline">{term}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-faint">{t('coverage.missingHint')}</p>
        </div>
      )}

      {extraTermCount != null && extraTermCount > 0 && (
        <p className="mt-2 text-xs text-faint">{t('coverage.fromExtractor', { count: extraTermCount })}</p>
      )}

      {onImprove && coverage.missing.length > 0 && (
        <div className="mt-4">
          <Button size="sm" variant="ghost" onClick={onImprove} disabled={disabled || improving}>
            {improving ? <Spinner label={t('coverage.improving')} /> : t('coverage.improve')}
          </Button>
          <p className="mt-2 text-sm text-faint">{t('coverage.improveHint')}</p>
        </div>
      )}
    </section>
  )
}