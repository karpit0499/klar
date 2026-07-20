import { useEffect, useState } from 'react'
import { Button, Badge, Spinner } from './atoms'
import type { MatchResult, NormalizedJob, Profile } from '../types'
import { fetchBaDetail } from '../sources/ba'
import { addToTracker } from '../tracker/store'
import { FACTOR_KEYS } from '../match/weights'
import { draftCoverLetter } from '../llm/coverLetter'

const FACTOR_LABELS: Record<string, string> = {
  skills: 'Skills',
  salary: 'Salary',
  location: 'Location',
  seniority: 'Seniority',
}

/** A labelled 0–100 bar for one score factor (feature 1.3). */
function FactorBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 70 ? 'bg-green-500' : value >= 45 ? 'bg-indigo-500' : 'bg-amber-500'
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-gray-600">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-gray-200">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-gray-500">{value}</span>
    </div>
  )
}

export function JobDrawer({
  job,
  match,
  score,
  profile,
  apiKey,
  onClose,
}: {
  job: NormalizedJob
  match?: MatchResult
  /** Composite (re-weighted) headline score; falls back to fitScore. */
  score?: number
  profile: Profile
  apiKey: string
  onClose: () => void
}) {
  const [description, setDescription] = useState(job.description)
  const [loadingDesc, setLoadingDesc] = useState(false)
  const [added, setAdded] = useState(false)

  // Cover-letter state (feature 7.1).
  const [letter, setLetter] = useState('')
  const [letterBusy, setLetterBusy] = useState(false)
  const [letterErr, setLetterErr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // BA list results have no description — fetch it lazily when the drawer opens.
    if (!job.description && job.source === 'ba') {
      setLoadingDesc(true)
      fetchBaDetail(job.source_id)
        .then((d) => setDescription(d.description))
        .catch(() => setDescription('(Could not load description.)'))
        .finally(() => setLoadingDesc(false))
    }
  }, [job])

  async function makeLetter() {
    setLetterErr('')
    setLetterBusy(true)
    try {
      const text = await draftCoverLetter(profile, { ...job, description }, apiKey, match)
      setLetter(text)
    } catch (e) {
      setLetterErr(e instanceof Error ? e.message : 'Could not draft a letter.')
    } finally {
      setLetterBusy(false)
    }
  }

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(letter)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — the user can still select the text */
    }
  }

  const headline = score ?? match?.fitScore

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{job.title}</h2>
            <p className="text-sm text-gray-600">
              {job.company} · {job.location.city ?? (job.location.remote ? 'Remote' : '—')}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="indigo">{job.source}</Badge>
          {job.location.remote && <Badge tone="green">Remote</Badge>}
          {job.salary.min != null && (
            <Badge tone="amber">
              €{job.salary.min.toLocaleString()}
              {job.salary.max ? `–${job.salary.max.toLocaleString()}` : '+'}
            </Badge>
          )}
          {job.employment_type && <Badge>{job.employment_type}</Badge>}
        </div>

        {match && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-indigo-700">{headline}</span>
              <span className="text-gray-500">/100 · {match.verdict}</span>
              {match.confidence != null && (
                <span className="ml-auto text-xs text-gray-500">
                  confidence {Math.round(match.confidence * 100)}%
                </span>
              )}
            </div>
            <p className="mt-1 text-gray-700">{match.rationale}</p>

            {/* Per-factor breakdown — what drove the score (feature 1.3). */}
            {match.factors && (
              <div className="mt-3 space-y-1.5">
                {FACTOR_KEYS.map((k) => (
                  <FactorBar key={k} label={FACTOR_LABELS[k]} value={match.factors![k]} />
                ))}
              </div>
            )}

            {match.missingSkills.length > 0 && (
              <p className="mt-2 text-gray-600">
                <span className="font-medium">Gaps:</span> {match.missingSkills.join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-800">Description</h3>
          {loadingDesc ? (
            <div className="mt-2">
              <Spinner label="Loading description…" />
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {description || '(No description provided.)'}
            </p>
          )}
        </div>

        {/* Cover-letter draft builder (feature 7.1). */}
        <div className="mt-5 rounded-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Cover letter</h3>
            <Button onClick={makeLetter} disabled={letterBusy} className="px-3 py-1.5">
              {letterBusy ? <Spinner label="Drafting…" /> : letter ? 'Regenerate' : 'Draft cover letter'}
            </Button>
          </div>
          {letterErr && <p className="mt-2 text-sm text-red-600">{letterErr}</p>}
          {letter && (
            <div className="mt-2">
              <textarea
                className="h-56 w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
              />
              <div className="mt-2">
                <Button variant="ghost" onClick={copyLetter} className="px-3 py-1.5">
                  {copied ? 'Copied ✓' : 'Copy'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <a href={job.url} target="_blank" rel="noreferrer">
            <Button>Open original ↗</Button>
          </a>
          <Button
            variant="ghost"
            onClick={async () => {
              await addToTracker({ ...job, description }, match)
              setAdded(true)
            }}
            disabled={added}
          >
            {added ? 'Added ✓' : 'Save to tracker'}
          </Button>
        </div>

        {job.also_on && job.also_on.length > 0 && (
          <p className="mt-4 text-xs text-gray-500">
            Also posted on:{' '}
            {job.also_on.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
                {a.source}
                {i < job.also_on!.length - 1 ? ', ' : ''}
              </a>
            ))}
          </p>
        )}
      </div>
    </div>
  )
}