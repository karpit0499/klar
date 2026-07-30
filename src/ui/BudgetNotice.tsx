import { useEffect, useState } from 'react'
import {
  DEFAULT_BUDGET,
  loadBudget,
  remainingRequestsThisMinute,
  remainingThisMinute,
  requestsInLastMinute,
  spentInLastMinute,
  subscribeBudget,
  type RequestCost,
  type TokenBudget,
} from '../llm/budget'
import { useT } from '../i18n/LocaleProvider'

export function BudgetNotice({
  pending,
  waitingMs = 0,
  compact = false,
}: {
  pending?: RequestCost
  waitingMs?: number
  compact?: boolean
}) {
  const t = useT()
  const [budget, setBudget] = useState<TokenBudget>(DEFAULT_BUDGET)
  const [, redraw] = useState(0)

  useEffect(() => {
    let alive = true
    void loadBudget().then((next) => {
      if (alive) setBudget(next)
    })
    const update = () => redraw((value) => value + 1)
    const unsubscribe = subscribeBudget(update)
    const timer = window.setInterval(update, 1_000)
    return () => {
      alive = false
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [])

  const spent = spentInLastMinute()
  const remaining = remainingThisMinute(budget)
  const requests = requestsInLastMinute()
  const remainingRequests = remainingRequestsThisMinute(budget)

  return (
    <section
      className={`rounded-lg border border-border bg-surface-2 ${compact ? 'p-3' : 'p-4'}`}
      aria-labelledby="ai-budget-heading"
      aria-live="polite"
    >
      <h3 id="ai-budget-heading" className="text-sm font-semibold text-ink">{t('budget.title')}</h3>
      <div className="mt-1 grid gap-1 text-sm text-muted">
        <p>{t('budget.spent', { tokens: spent.toLocaleString() })}</p>
        <p>{t('budget.remaining', { tokens: remaining.toLocaleString() })}</p>
        {remainingRequests != null && (
          <p>
            {t('budget.requests', {
              used: requests,
              remaining: remainingRequests,
            })}
          </p>
        )}
        {pending && <p>{t('budget.pending', { tokens: pending.billedTokens.toLocaleString() })}</p>}
        <p className="text-xs text-faint">
          {budget.source === 'observed' ? t('budget.observedSource') : t('budget.defaultSource')}
        </p>
        <p className={waitingMs > 0 ? 'font-medium text-ink' : 'text-faint'}>
          {waitingMs > 0
            ? t('budget.waiting', { seconds: Math.max(1, Math.ceil(waitingMs / 1_000)) })
            : t('budget.ready')}
        </p>
      </div>
    </section>
  )
}