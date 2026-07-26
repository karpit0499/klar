// ============================================================================
// v2.5 · C1 — the before/after review. This is the trust centrepiece.
//
// Every change shows WHAT changed, WHY, WHICH evidence it rests on, WHICH
// posting terms it gained, and its FACTUAL STATUS — and can be accepted,
// rejected, edited or restored one at a time.
//
// Accessibility is a first-class requirement here, not a pass at the end:
//   • each change is a list item with its own heading, and its accept/reject
//     control is a labelled radiogroup pointing at that heading;
//   • status is carried by TEXT, never by colour alone;
//   • a blocked change cannot be accepted at all — the Accept radio is disabled
//     and explained, which is how "unsupported claims cannot reach export"
//     becomes structurally true rather than a promise;
//   • the edit field is a real <label>+<textarea>, focused when opened;
//   • bulk accept is disabled, with a reason, whenever anything needs a human.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { Badge, Button } from './atoms'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'
import type { ChangeRecord, ChangeReasonCode } from '../resume/changeSet'
import { summarizeChanges } from '../resume/changeSet'
import type { FactualStatus } from '../llm/evidenceStatus'

const STATUS_LABEL: Record<FactualStatus, TranslationKey> = {
  supported: 'review.status.supported',
  rephrased: 'review.status.rephrased',
  confirmation_required: 'review.status.confirmation',
  blocked: 'review.status.blocked',
}

const STATUS_TONE: Record<FactualStatus, 'neutral' | 'accent' | 'outline' | 'success' | 'danger'> = {
  supported: 'success',
  rephrased: 'accent',
  confirmation_required: 'outline',
  blocked: 'danger',
}

const REASON_LABEL: Record<ChangeReasonCode, TranslationKey> = {
  keywords: 'review.reason.keywords',
  condensed: 'review.reason.condensed',
  reworded: 'review.reason.reworded',
  removed: 'review.reason.removed',
  unchanged: 'review.reason.unchanged',
}

export function TailoringReview({
  changes,
  onDecision,
  onEdit,
  onRestore,
  onAcceptAll,
}: {
  changes: ChangeRecord[]
  onDecision: (id: string, decision: 'accepted' | 'rejected') => void
  onEdit: (id: string, text: string) => void
  onRestore: (id: string) => void
  onAcceptAll: () => void
}) {
  const t = useT()
  const stats = summarizeChanges(changes)

  if (!changes.length) {
    return (
      <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="review-heading">
        <h3 id="review-heading" className="text-base font-semibold text-ink">{t('review.title')}</h3>
        <p className="mt-1 text-base text-muted">{t('review.none')}</p>
      </section>
    )
  }

  return (
    <section className="mt-5 rounded-lg border border-border p-4" aria-labelledby="review-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="review-heading" className="text-base font-semibold text-ink">{t('review.title')}</h3>
        <p className="font-display text-sm tabular-nums text-muted">
          {t('review.count', { accepted: stats.accepted, total: stats.total })}
        </p>
      </div>
      <p className="mt-1 text-sm text-faint">{t('review.intro')}</p>

      <div className="mt-3">
        <Button size="sm" variant="ghost" onClick={onAcceptAll} disabled={!stats.canBulkAccept}>
          {t('review.acceptAll')}
        </Button>
        {!stats.canBulkAccept && (
          <p className="mt-2 text-sm text-faint">{t('review.acceptAllBlocked')}</p>
        )}
      </div>

      <ul className="mt-4 list-none space-y-3 p-0">
        {changes.map((change) => (
          <ChangeItem
            key={change.id}
            change={change}
            onDecision={onDecision}
            onEdit={onEdit}
            onRestore={onRestore}
          />
        ))}
      </ul>
    </section>
  )
}

function ChangeItem({
  change,
  onDecision,
  onEdit,
  onRestore,
}: {
  change: ChangeRecord
  onDecision: (id: string, decision: 'accepted' | 'rejected') => void
  onEdit: (id: string, text: string) => void
  onRestore: (id: string) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(change.edited ?? change.after)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const headingId = `change-${change.id}-heading`
  const blocked = change.finding.status === 'blocked'
  const accepted = change.decision === 'accepted'

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  function save() {
    onEdit(change.id, draft.trim())
    setEditing(false)
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 id={headingId} className="wrap-anywhere text-sm font-semibold text-ink">
          {change.location}
        </h4>
        <Badge tone={STATUS_TONE[change.finding.status]}>{t(STATUS_LABEL[change.finding.status])}</Badge>
      </div>

      <dl className="mt-2 space-y-2 text-base">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-faint">{t('review.before')}</dt>
          <dd className="mt-0.5 wrap-anywhere leading-relaxed text-muted">
            {change.before || t('review.emptyBefore')}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-faint">{t('review.after')}</dt>
          <dd className="mt-0.5 wrap-anywhere leading-relaxed text-ink">
            {(change.edited ?? change.after) || t('review.emptyAfter')}
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-sm text-muted">{t(REASON_LABEL[change.reason])}</p>

      {change.keywordEffect.length > 0 && (
        <p className="mt-1 wrap-anywhere text-sm text-muted">
          {t('review.keywordEffect', { terms: change.keywordEffect.join(', ') })}
        </p>
      )}

      {blocked && (
        <p className="mt-2 wrap-anywhere text-sm text-danger">
          {t('review.blockedHint', {
            detail: [...change.finding.addedNumbers, ...change.finding.addedTerms].join(', '),
          })}
        </p>
      )}

      {change.finding.status === 'confirmation_required' && (
        <p className="mt-2 wrap-anywhere text-sm text-muted">
          {t('review.confirmHint', {
            detail: [...change.finding.addedTerms, ...change.finding.repeatedTerms].join(', '),
          })}
        </p>
      )}

      {change.evidence.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-tap cursor-pointer py-2 text-sm font-medium text-accent">
            {t('review.evidence')}
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
            {change.evidence.map((item, index) => (
              <li key={`${change.id}-evidence-${index}`} className="wrap-anywhere">{item}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-labelledby={headingId} className="flex flex-wrap gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={accepted}
            disabled={blocked}
            onClick={() => onDecision(change.id, 'accepted')}
            className={`min-h-tap rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              accepted ? 'border-accent bg-accent-tint text-accent' : 'border-border bg-surface text-ink hover:bg-surface-2'
            }`}
          >
            {t('review.accept')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!accepted}
            onClick={() => onDecision(change.id, 'rejected')}
            className={`min-h-tap rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              !accepted ? 'border-accent bg-accent-tint text-accent' : 'border-border bg-surface text-ink hover:bg-surface-2'
            }`}
          >
            {t('review.reject')}
          </button>
        </div>

        {!editing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(change.edited ?? change.after)
              setEditing(true)
            }}
          >
            {t('review.edit')}
          </Button>
        )}
        {change.edited != null && (
          <Button size="sm" variant="ghost" onClick={() => onRestore(change.id)}>
            {t('review.restore')}
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-3">
          <label className="block" htmlFor={`edit-${change.id}`}>
            <span className="mb-1 block text-sm font-medium text-ink">{t('review.editLabel')}</span>
            <textarea
              id={`edit-${change.id}`}
              ref={textareaRef}
              className="h-24 w-full rounded-md border border-border bg-surface p-3 text-base text-ink outline-none focus:border-accent"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={save}>{t('common.save')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('review.cancel')}</Button>
          </div>
          <p className="mt-2 text-sm text-faint">{t('review.editHint')}</p>
        </div>
      )}
    </li>
  )
}