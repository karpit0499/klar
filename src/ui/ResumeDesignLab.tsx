import { useEffect, useState } from 'react'
import { Badge, Button, Card, Field } from './atoms'
import { useLocale } from '../i18n/LocaleProvider'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import {
  RESUME_LAB_PRESETS,
  downloadResumeLabDocument,
  loadResumeLabDecision,
  parseResumeLabDocument,
  saveResumeLabDecision,
  selectedPresetForDecision,
  type ResumeLabDecision,
  type ResumeLabDecisionRow,
  type ResumeLabParsePreview,
  type ResumeLabPreset,
} from '../resume/designLab'

export function ResumeDesignLab({ resume, enabled }: { resume: ResumeData; enabled: boolean }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const [preset, setPreset] = useState<ResumeLabPreset>('data')
  const [language, setLanguage] = useState<ResumeLanguage>(locale)
  const [preview, setPreview] = useState<ResumeLabParsePreview>()
  const [working, setWorking] = useState(false)
  const [decision, setDecision] = useState<ResumeLabDecision>('pending')
  const [allowedVariants, setAllowedVariants] = useState<ResumeLabPreset[]>([])
  const [defaultStatus, setDefaultStatus] =
    useState<ResumeLabDecisionRow['defaultStatus']>('hold')
  const [prerequisites, setPrerequisites] =
    useState<ResumeLabDecisionRow['prerequisites']>({
      recruiterReviewComplete: false,
      candidateReviewComplete: false,
      parseAndRenderPass: false,
      evidenceFidelityPass: false,
      provenanceRecorded: false,
    })
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadResumeLabDecision().then((row) => {
      setDecision(row.decision)
      setAllowedVariants(row.allowedVariants)
      setDefaultStatus(row.defaultStatus)
      setPrerequisites(row.prerequisites)
      setNote(row.note)
    })
  }, [])

  if (!enabled) return null

  async function inspect() {
    setWorking(true)
    setMessage('')
    try {
      setPreview(await parseResumeLabDocument(resume, language, preset))
    } finally {
      setWorking(false)
    }
  }

  async function saveDecision() {
    setMessage('')
    try {
      await saveResumeLabDecision({
        decision,
        allowedVariants,
        defaultStatus,
        prerequisites,
        note,
      })
      setMessage(de ? 'Entscheidung lokal gespeichert.' : 'Decision saved locally.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const allPrerequisitesPass = Object.values(prerequisites).every(Boolean)
  const selectedBase = selectedPresetForDecision(decision)
  const coherentEligibleDecision = Boolean(
    selectedBase && allowedVariants.includes(selectedBase),
  )

  return (
    <Card className="mt-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">
            {de ? 'Internes Lebenslauf-Designlabor' : 'Internal résumé design lab'}
          </h2>
          <p className="mt-1 max-w-2xl text-base leading-relaxed text-muted">
            {de
              ? 'Vergleicht anonymisierte, codegenerierte Rekonstruktionen der drei Forschungsvorlagen. Der normale Export bleibt unverändert.'
              : 'Compare anonymized, code-generated reconstructions of the three research prototypes. The production exporter remains unchanged.'}
          </p>
        </div>
        <Badge tone="outline">{de ? 'Nur Evaluation' : 'Evaluation only'}</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={de ? 'Design' : 'Design'} htmlFor="resume-lab-preset">
          <select
            id="resume-lab-preset"
            className="min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
            value={preset}
            onChange={(event) => { setPreset(event.target.value as ResumeLabPreset); setPreview(undefined) }}
          >
            {RESUME_LAB_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label={de ? 'Ausgabesprache' : 'Output language'} htmlFor="resume-lab-language">
          <select
            id="resume-lab-language"
            className="min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
            value={language}
            onChange={(event) => { setLanguage(event.target.value as ResumeLanguage); setPreview(undefined) }}
          >
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </select>
        </Field>
      </div>
      <p className="mt-3 text-sm text-muted">
        {RESUME_LAB_PRESETS.find((item) => item.id === preset)?.intent}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={() => void inspect()} disabled={working}>
          {working
            ? (de ? 'Wird geprüft…' : 'Inspecting…')
            : (de ? 'ATS-Lesevorschau erstellen' : 'Create ATS parse preview')}
        </Button>
        <Button variant="ghost" onClick={() => void downloadResumeLabDocument(resume, language, preset)}>
          {de ? 'Labor-DOCX herunterladen' : 'Download lab DOCX'}
        </Button>
      </div>

      {preview && (
        <section className="mt-5 rounded-lg border border-border bg-surface-2 p-4" aria-labelledby="resume-lab-preview-heading">
          <h3 id="resume-lab-preview-heading" className="font-semibold text-ink">
            {de ? 'Wahrscheinliche Parser-Reihenfolge' : 'Likely parser reading order'}
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {preview.checks.map((check) => (
              <Badge key={check.id} tone={check.ok ? 'success' : 'danger'}>
                {check.ok ? '✓' : '×'} {check.detail}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            {de ? 'Abschnitte' : 'Sections'}: {preview.sections.join(' → ') || '—'}
          </p>
          <p className="mt-2 text-sm text-muted">
            {de ? 'Rollen-/Datumszuordnungen' : 'Role/date associations'}:{' '}
            {preview.roleAssociations.length > 0
              ? preview.roleAssociations
                  .map((association) => `${association.employerCandidate || association.roleLine} (${association.dateLine})`)
                  .join(' · ')
              : '—'}
          </p>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface p-3 text-sm text-ink">
            {preview.text}
          </pre>
        </section>
      )}

      <section className="mt-5 border-t border-border pt-4" aria-labelledby="resume-lab-decision-heading">
        <h3 id="resume-lab-decision-heading" className="font-semibold text-ink">
          {de ? 'Entscheidung nach der Studie' : 'Post-study owner decision'}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {de
            ? 'Bis Recruiter- und Kandidatenvergleiche abgeschlossen sind, bleibt „Ausstehend“ die ehrliche Wahl.'
            : 'Until recruiter and candidate comparisons are complete, Pending is the honest choice.'}
        </p>
        <div className="mt-3 grid gap-3">
          <Field label={de ? 'Entscheidung' : 'Decision'} htmlFor="resume-lab-decision">
            <select
              id="resume-lab-decision"
              className="min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
              value={decision}
              onChange={(event) => setDecision(event.target.value as ResumeLabDecision)}
            >
              <option value="pending">{de ? 'Ausstehend' : 'Pending'}</option>
              <option value="sample_a_base">{de ? 'Data & Analytics als Basis' : 'Data & analytics as base'}</option>
              <option value="classic_base">{de ? 'Classic German als Basis' : 'Classic German as base'}</option>
              <option value="editorial_base">{de ? 'Editorial als Basis' : 'Editorial as base'}</option>
              <option value="retain_current">{de ? 'Aktuelles Design behalten' : 'Retain current design'}</option>
            </select>
          </Field>
          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-base font-medium text-ink">
              {de ? 'Erlaubte Varianten' : 'Allowed variants'}
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {RESUME_LAB_PRESETS.map((item) => (
                <label key={item.id} className="flex min-h-tap items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={allowedVariants.includes(item.id)}
                    onChange={(event) => setAllowedVariants((current) =>
                      event.target.checked
                        ? [...new Set([...current, item.id])]
                        : current.filter((value) => value !== item.id))}
                  />
                  {item.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-base font-medium text-ink">
              {de ? 'Studienvoraussetzungen' : 'Study prerequisites'}
            </legend>
            <div className="mt-2 grid gap-2">
              {([
                ['recruiterReviewComplete', de ? 'Verblindeter Recruiter-Vergleich abgeschlossen' : 'Blinded recruiter comparison complete'],
                ['candidateReviewComplete', de ? 'Verblindeter Kandidatenvergleich abgeschlossen' : 'Blinded candidate comparison complete'],
                ['parseAndRenderPass', de ? 'Parser- und Rendering-Matrix bestanden' : 'Parser and rendering matrix passed'],
                ['evidenceFidelityPass', de ? 'Null unbelegte Aussagen im geprüften Satz' : 'Zero unsupported claims in the audited set'],
                ['provenanceRecorded', de ? 'Herkunft und Nutzungsrechte dokumentiert' : 'Provenance and usage rights recorded'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex min-h-tap items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={prerequisites[key]}
                    onChange={(event) => setPrerequisites((current) => ({
                      ...current,
                      [key]: event.target.checked,
                    }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {de
                ? 'Diese Häkchen sind Bestätigungen des Eigentümers; die zugrunde liegenden Prüfprotokolle bleiben die eigentlichen Nachweise.'
                : 'These checkboxes are owner attestations; the underlying review records remain the actual evidence.'}
            </p>
          </fieldset>
          <Field label={de ? 'Status für ein mögliches v2.8-Standarddesign' : 'Possible v2.8 default status'} htmlFor="resume-lab-default-status">
            <select
              id="resume-lab-default-status"
              className="min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
              value={defaultStatus}
              onChange={(event) =>
                setDefaultStatus(event.target.value as ResumeLabDecisionRow['defaultStatus'])}
            >
              <option value="hold">{de ? 'Gesperrt / HOLD' : 'Blocked / HOLD'}</option>
              <option
                value="eligible_for_v28"
                disabled={!allPrerequisitesPass || !coherentEligibleDecision}
              >
                {de ? 'Für v2.8 prüfbar' : 'Eligible for v2.8 consideration'}
              </option>
            </select>
          </Field>
          <Field label={de ? 'Begründung' : 'Rationale'} htmlFor="resume-lab-note">
            <textarea
              id="resume-lab-note"
              className="min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-ink"
              value={note}
              maxLength={1_000}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Button variant="ghost" onClick={() => void saveDecision()}>
            {de ? 'Entscheidung lokal speichern' : 'Save decision locally'}
          </Button>
        </div>
      </section>
      {message && (
        <p
          className={`mt-3 text-sm ${message.includes('cannot') ? 'text-danger' : 'text-success'}`}
          role="status"
        >
          {message}
        </p>
      )}
    </Card>
  )
}