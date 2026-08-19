import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import { useLocale } from '../i18n/LocaleProvider'
import {
  collectSafeDiagnostics,
  copyPreparedReport,
  emptyIssueReport,
  prepareIssueReport,
  validateIssueReport,
  type IssueCategory,
  type IssueReportDraft,
  type IssueSeverity,
} from '../support/issueReport'
import { recordOperationalEvent } from '../observability/events'
import {
  directIssueSubmissionConfigured,
  IssueSubmissionError,
  submitPreparedIssue,
  type IssueReceipt,
} from '../support/submitIssue'
import { TurnstileWidget } from './TurnstileWidget'

export function IssueReportCard() {
  const { locale, t } = useLocale()
  const de = locale === 'de'
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [draft, setDraft] = useState<IssueReportDraft>(() => emptyIssueReport())
  const [screenshot, setScreenshot] = useState<{ name: string; url: string }>()
  const screenshotUrl = useRef<string>()
  const screenshotInput = useRef<HTMLInputElement>(null)
  const reportId = useRef(crypto.randomUUID())
  const [message, setMessage] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [widgetKey, setWidgetKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<IssueReceipt>()
  const [website, setWebsite] = useState('')
  const directConfigured = directIssueSubmissionConfigured()
  const errors = validateIssueReport(draft)
  const prepared = useMemo(
    () => prepareIssueReport(
      draft,
      draft.includeDiagnostics ? collectSafeDiagnostics(locale) : undefined,
    ),
    [draft, locale],
  )

  useEffect(() => {
    const prefillSource = () => {
      const source = sessionStorage.getItem('klar-source-report.v26')
      sessionStorage.removeItem('klar-source-report.v26')
      if (typeof source !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(source)) return
      clearScreenshot()
      reportId.current = crypto.randomUUID()
      setOpen(true)
      setDraft({
        ...emptyIssueReport(),
        category: 'source_problem',
        title: `Source problem: ${source}`,
        happened: `The ${source} source returned an incorrect, stale, or unavailable result.`,
      })
    }
    prefillSource()
    window.addEventListener('klar:report-source', prefillSource)
    return () => window.removeEventListener('klar:report-source', prefillSource)
  }, [])

  useEffect(() => () => {
    if (screenshotUrl.current) URL.revokeObjectURL(screenshotUrl.current)
    screenshotUrl.current = undefined
  }, [])

  function update<K extends keyof IssueReportDraft>(key: K, value: IssueReportDraft[K]) {
    reportId.current = crypto.randomUUID()
    setDraft((current) => ({ ...current, [key]: value }))
    setReviewed(false)
    setPreview(false)
    setMessage('')
    setReceipt(undefined)
  }

  function revokeScreenshotUrl() {
    if (screenshotUrl.current) URL.revokeObjectURL(screenshotUrl.current)
    screenshotUrl.current = undefined
  }

  function clearScreenshot() {
    revokeScreenshotUrl()
    setScreenshot(undefined)
    if (screenshotInput.current) screenshotInput.current.value = ''
  }

  function chooseScreenshot(file?: File) {
    revokeScreenshotUrl()
    setScreenshot(undefined)
    if (!file) {
      if (screenshotInput.current) screenshotInput.current.value = ''
      return
    }
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      if (screenshotInput.current) screenshotInput.current.value = ''
      setMessage(de
        ? 'Wähle ein Bild mit höchstens 5 MB.'
        : 'Choose an image no larger than 5 MB.')
      return
    }
    const url = URL.createObjectURL(file)
    screenshotUrl.current = url
    setScreenshot({ name: file.name, url })
    setMessage('')
  }

  async function copy() {
    try {
      await copyPreparedReport(prepared)
    } catch {
      setMessage(de
        ? 'Kopieren wurde vom Browser abgelehnt. Der geprüfte Bericht bleibt sichtbar und kann manuell markiert werden.'
        : 'The browser denied clipboard access. The reviewed report remains visible for manual selection.')
      return
    }
    void recordOperationalEvent({
      name: 'report_prepared',
      outcome: 'ok',
      documentKind: 'diagnostic',
    }).catch(() => undefined)
    setMessage(de
      ? 'Der geprüfte Bericht wurde kopiert. Nichts wurde automatisch gesendet.'
      : 'The reviewed report was copied. Nothing was submitted automatically.')
    setDraft(emptyIssueReport())
    reportId.current = crypto.randomUUID()
    clearScreenshot()
    setPreview(false)
    setReviewed(false)
  }

  async function openGitHub() {
    const url = prepared.composerTooLong
      ? prepared.destinationUrl
      : prepared.composerUrl
    // Keep this synchronous with the user's click so popup protection has the
    // best chance of allowing it. With `noopener`, Chromium deliberately
    // returns `null` even when it opens the tab, so the return value cannot
    // truthfully distinguish success from a blocked popup.
    window.open(url, '_blank', 'noopener,noreferrer')
    let copied = false
    try {
      await copyPreparedReport(prepared)
      copied = true
    } catch {
      // The exact reviewed body remains visible below for manual selection.
    }
    void recordOperationalEvent({
      name: 'report_prepared',
      outcome: 'ok',
      documentKind: 'diagnostic',
    }).catch(() => undefined)
    setMessage(de
      ? `Klar hat deinen Browser gebeten, GitHub zu öffnen. ${
          copied
            ? 'Der Bericht wurde zusätzlich als Ersatz kopiert.'
            : 'Falls kein Tab erscheint, kopiere den weiterhin sichtbaren Bericht manuell.'
        } Nur du kannst ihn in GitHub absenden.`
      : `Klar asked your browser to open GitHub. ${
          copied
            ? 'The report was also copied as a fallback.'
            : 'If no tab appears, manually copy the report that remains visible.'
        } Only you can submit it in GitHub.`)
  }

  async function submitDirect() {
    if (draft.category === 'privacy_security' || !turnstileToken) return
    setSubmitting(true)
    setMessage('')
    try {
      const next = await submitPreparedIssue(prepared, {
        requestId: reportId.current,
        category: draft.category,
        severity: draft.severity,
        turnstileToken,
        website,
      })
      setReceipt(next)
      setMessage(de
        ? `Issue #${next.issueNumber} wurde erstellt.`
        : `Issue #${next.issueNumber} was created.`)
      void recordOperationalEvent({
        name: 'report_prepared',
        outcome: 'ok',
        documentKind: 'diagnostic',
      }).catch(() => undefined)
    } catch (caught) {
      setMessage(directSubmissionMessage(
        caught instanceof IssueSubmissionError ? caught.code : 'unknown',
        t,
      ))
    } finally {
      setSubmitting(false)
      setTurnstileToken('')
      setWidgetKey((value) => value + 1)
    }
  }

  return (
    <Card className="mt-4 p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-ink">
        {de ? 'Fehler oder Problem melden' : 'Submit a bug or issue'}
      </h2>
      <p className="mt-1 text-base leading-relaxed text-muted">
        {de
          ? 'Klar erstellt zuerst eine geschützte Vorschau. Du entscheidest anschließend selbst, ob du GitHub öffnest.'
          : 'Klar creates a privacy-reviewed preview first. You then decide whether to open GitHub.'}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {de
          ? 'Füge keinen Lebenslauf, Bewerbungstext oder andere persönliche Dokumente ein. Die automatische Prüfung erkennt bekannte Geheimnisse und Kontaktdaten, aber nicht jeden persönlichen Satz.'
          : 'Do not paste a resume, application writing, or another personal document. The automatic scan catches known secrets and contact data, but it cannot recognize every personal sentence.'}
      </p>
      {!open && (
        <div className="mt-4">
          <Button onClick={() => setOpen(true)}>
            {de ? 'Meldung vorbereiten' : 'Prepare report'}
          </Button>
        </div>
      )}
      {open && (
        <div className="mt-5 space-y-4">
          <Field label={de ? 'Kategorie' : 'Category'} htmlFor="issue-category">
            <select
              id="issue-category"
              className="min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
              value={draft.category}
              onChange={(event) => update('category', event.target.value as IssueCategory)}
            >
              <option value="bug">{de ? 'Fehler' : 'Bug'}</option>
              <option value="incorrect_result">{de ? 'Falsches Ergebnis' : 'Incorrect result'}</option>
              <option value="source_problem">{de ? 'Daten- oder Quellenproblem' : 'Data or source problem'}</option>
              <option value="accessibility">{de ? 'Barrierefreiheit' : 'Accessibility'}</option>
              <option value="privacy_security">{de ? 'Datenschutz oder Sicherheit' : 'Privacy or security concern'}</option>
              <option value="feature_request">{de ? 'Funktionswunsch' : 'Feature request'}</option>
            </select>
          </Field>
          {draft.category === 'privacy_security' && (
            <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-ink">
              {de
                ? 'Diese Kategorie öffnet GitHubs private Sicherheitsmeldung, nicht ein öffentliches Issue.'
                : 'This category opens GitHub private vulnerability reporting, not a public issue.'}
            </p>
          )}
          <Field label={de ? 'Kurzer Titel' : 'Concise title'} htmlFor="issue-title">
            <TextInput
              id="issue-title"
              value={draft.title}
              maxLength={300}
              onChange={(event) => update('title', event.target.value)}
            />
          </Field>
          <ReportTextArea
            id="issue-happened"
            label={de ? 'Was ist passiert?' : 'What happened?'}
            value={draft.happened}
            onChange={(value) => update('happened', value)}
          />
          <ReportTextArea
            id="issue-steps"
            label={de ? 'Schritte zum Nachstellen' : 'Steps to reproduce'}
            value={draft.steps}
            onChange={(value) => update('steps', value)}
          />
          <ReportTextArea
            id="issue-expected"
            label={de ? 'Erwartetes Ergebnis' : 'Expected result'}
            value={draft.expected}
            onChange={(value) => update('expected', value)}
          />
          <Field label={de ? 'Schweregrad' : 'Severity'} htmlFor="issue-severity">
            <select
              id="issue-severity"
              className="min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
              value={draft.severity}
              onChange={(event) => update('severity', event.target.value as IssueSeverity)}
            >
              <option value="low">{de ? 'Niedrig' : 'Low'}</option>
              <option value="medium">{de ? 'Mittel' : 'Medium'}</option>
              <option value="high">{de ? 'Hoch' : 'High'}</option>
              <option value="critical">{de ? 'Kritisch' : 'Critical'}</option>
            </select>
          </Field>
          <Field
            label={de ? 'Optionaler Screenshot' : 'Optional screenshot'}
            hint={de
              ? 'Das Bild bleibt in dieser Vorschau. GitHub benötigt eine manuelle Anlage.'
              : 'The image stays in this preview. GitHub requires a manual attachment.'}
            htmlFor="issue-screenshot"
          >
            <input
              id="issue-screenshot"
              ref={screenshotInput}
              type="file"
              accept="image/*"
              className="block min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
              onChange={(event) => chooseScreenshot(event.target.files?.[0])}
            />
          </Field>
          {screenshot && (
            <figure className="rounded-lg border border-border bg-surface-2 p-3">
              <img
                className="max-h-64 rounded border border-border object-contain"
                src={screenshot.url}
                alt={de ? 'Lokale Screenshot-Vorschau' : 'Local screenshot preview'}
              />
              <figcaption className="mt-2 text-xs text-faint">{screenshot.name}</figcaption>
            </figure>
          )}
          <label className="flex min-h-tap items-start gap-3 text-base text-ink">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={draft.includeDiagnostics}
              onChange={(event) => update('includeDiagnostics', event.target.checked)}
            />
            <span>{de
              ? 'Reduzierte technische Diagnose anhängen (ohne Lebenslauf, Bewerbungstext, Schlüssel, Pfade oder vollständige URLs).'
              : 'Include a minimal diagnostic summary (no resume, application writing, keys, paths, or full URLs).'}</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={errors.length > 0}
              onClick={() => { setPreview(true); setReviewed(false) }}
            >
              {de ? 'Datenschutz-Vorschau prüfen' : 'Review privacy preview'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false)
                setPreview(false)
                setReviewed(false)
                clearScreenshot()
              }}
            >
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
          </div>
          {errors.length > 0 && (
            <p className="text-sm text-danger">
              {de
                ? 'Ergänze einen aussagekräftigen Titel und eine kurze Beschreibung.'
                : 'Add a meaningful title and a short description.'}
            </p>
          )}
        </div>
      )}
      {preview && (
        <section className="mt-5 rounded-xl border border-border bg-surface-2 p-4" aria-labelledby="issue-preview-heading">
          <h3 id="issue-preview-heading" className="text-lg font-semibold text-ink">
            {de ? 'Exakte GitHub-Vorschau' : 'Exact GitHub preview'}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {prepared.redactions.length
              ? (de
                  ? `Automatisch entfernt: ${prepared.redactions.join(', ')}.`
                  : `Automatically removed: ${prepared.redactions.join(', ')}.`)
              : (de
                  ? 'Die automatische Prüfung hat keine bekannten sensiblen Muster gefunden.'
                  : 'The automatic check found no known sensitive patterns.')}
          </p>
          <p className="mt-3 font-semibold text-ink">{prepared.title}</p>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface p-3 text-sm text-ink">
            {prepared.body}
          </pre>
          {screenshot && (
            <p className="mt-3 text-sm text-muted">
              {de
                ? 'Der Screenshot wird nicht automatisch hochgeladen. Füge ihn in GitHub nur an, wenn du ihn nochmals geprüft hast.'
                : 'The screenshot is not uploaded automatically. Attach it in GitHub only after reviewing it again.'}
            </p>
          )}
          <label className="mt-4 flex min-h-tap items-start gap-3 text-base text-ink">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            <span>{de
              ? 'Ich habe den gesamten Text geprüft und möchte selbst entscheiden, ob ich ihn in GitHub absende.'
              : 'I reviewed all of the text and will decide for myself whether to submit it in GitHub.'}</span>
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            {prepared.destination === 'public_issue' && directConfigured && !receipt && (
              <div className="w-full rounded-lg border border-border bg-surface p-3">
                <label className="sr-only" aria-hidden="true">
                  Website
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                  />
                </label>
                <TurnstileWidget key={widgetKey} onToken={setTurnstileToken} />
                <Button
                  className="mt-3"
                  disabled={!reviewed || !turnstileToken || submitting}
                  onClick={() => void submitDirect()}
                >
                  {submitting
                    ? (de ? 'Wird übermittelt…' : 'Submitting…')
                    : (de ? 'Direkt als öffentliches Issue senden' : 'Submit public issue directly')}
                </Button>
              </div>
            )}
            {receipt && (
              <a
                className="inline-flex min-h-tap items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
                href={receipt.issueUrl}
                target="_blank"
                rel="noreferrer"
              >
                {de ? `Issue #${receipt.issueNumber} öffnen` : `Open issue #${receipt.issueNumber}`}
              </a>
            )}
            {(!receipt || prepared.destination === 'private_advisory') && (
              <Button disabled={!reviewed} onClick={() => void openGitHub()}>
                {prepared.destination === 'private_advisory'
                  ? (de ? 'Private Meldung in GitHub öffnen' : 'Open private report in GitHub')
                  : (de ? 'Issue in GitHub öffnen' : 'Open issue in GitHub')}
              </Button>
            )}
            <Button variant="ghost" disabled={!reviewed} onClick={() => void copy()}>
              {de ? 'Bericht kopieren' : 'Copy report'}
            </Button>
            <Button variant="ghost" onClick={() => setPreview(false)}>
              {de ? 'Weiter bearbeiten' : 'Continue editing'}
            </Button>
          </div>
        </section>
      )}
      {message && <p className="mt-4 text-sm text-muted" role="status">{message}</p>}
    </Card>
  )
}

function directSubmissionMessage(
  code: string,
  t: ReturnType<typeof useLocale>['t'],
): string {
  if (['turnstile_required', 'turnstile_failed', 'turnstile_hostname'].includes(code)) {
    return t('feedback.error.challenge')
  }
  if (code === 'rate_limited' || code === 'github_rate_limited') {
    return t('feedback.error.rate')
  }
  if (['report_too_large', 'invalid_title', 'invalid_report', 'github_rejected'].includes(code)) {
    return t('feedback.error.report')
  }
  if ([
    'feedback_not_configured',
    'turnstile_unavailable',
    'github_credentials',
    'github_unavailable',
    'feedback_unavailable',
    'invalid_feedback_response',
  ].includes(code)) return t('feedback.error.unavailable')
  return t('feedback.error.unknown')
}

function ReportTextArea({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field label={label} htmlFor={id}>
      <textarea
        id={id}
        className="min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink outline-none focus:border-accent"
        value={value}
        maxLength={8_000}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}
