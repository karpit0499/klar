// ============================================================================
// v2.5 · WS4a — the deterministic evidence guard (principles P8 and P9).
//
// WHY THIS FILE EXISTS
// The ATS plan's highest risk (R1) is that Klar's own illustration of "truthful
// reframing" would be REJECTED by its own validator: rewriting
// "segmented audiences" into "segmented audiences in [CRM] on 30-day activity"
// adds a tool and a specific that are not in the evidence. Principle P8 resolves
// it: reframing may translate VOCABULARY, never import SPECIFICS.
//
//   P8 — Reframing draws only on specifics already attested in the source.
//   P9 — No keyword stuffing, no title inflation.
//
// A prompt cannot enforce that; a pure function can. Everything here is
// deterministic, offline and unit-testable, which is exactly what the
// anti-fabrication eval gate (ATS plan §7.1) needs.
//
// The four factual statuses are the roadmap's v2.5 contract:
//   supported             — the text is the source text (or a subset of it)
//   rephrased             — new wording, no new specifics  → safe to accept
//   confirmation_required — a term appears that the cited source does not attest
//   blocked               — an unsupported NUMBER appeared → never exportable
// ============================================================================
import { SKILL_DICTIONARY, containsTerm } from '../resume/keywords'

export type FactualStatus = 'supported' | 'rephrased' | 'confirmation_required' | 'blocked'

export type EvidenceReason =
  | 'unsupported_number'
  | 'unsupported_term'
  | 'repetition'
  | 'title_inflation'
  | 'identical'
  | 'reworded'

export type EvidenceFinding = {
  status: FactualStatus
  reasons: EvidenceReason[]
  /** Numbers present in the rewrite but in none of the cited sources. */
  addedNumbers: string[]
  /** Tools/technologies/acronyms present in the rewrite but not in the sources. */
  addedTerms: string[]
  /** Terms repeated more than twice in one sentence (parser gaming). */
  repeatedTerms: string[]
}

/**
 * One thing Klar could not improve safely, for the honest-failure surface.
 * `code` is a machine value so the UI can translate it (DE/EN parity).
 */
export type UnresolvedIssue = {
  location: string
  code: EvidenceReason
  detail: string
}

const STATUS_ORDER: Record<FactualStatus, number> = {
  supported: 0,
  rephrased: 1,
  confirmation_required: 2,
  blocked: 3,
}

/** The most serious status in a list (used for "can I bulk-accept?"). */
export function worstStatus(statuses: FactualStatus[]): FactualStatus {
  return statuses.reduce<FactualStatus>(
    (worst, next) => (STATUS_ORDER[next] > STATUS_ORDER[worst] ? next : worst),
    'supported',
  )
}

/** A rewrite may be exported only when nothing is blocked. */
export function isExportable(status: FactualStatus): boolean {
  return status !== 'blocked'
}

/** Accepting every change in one click is only offered when nothing needs a human. */
export function isBulkAcceptable(statuses: FactualStatus[]): boolean {
  const worst = worstStatus(statuses)
  return worst === 'supported' || worst === 'rephrased'
}

// --- Number extraction --------------------------------------------------------

/** Collapse "12 %" → "12%" and "1.234,5" → "1234.5" so comparison is stable. */
function normalizeNumberToken(raw: string): string {
  const percent = raw.trim().endsWith('%')
  let digits = raw.replace(/%/g, '').trim()
  // A rewrite may legitimately localise number punctuation:
  // English 1,234 ↔ German 1.234. Treat a single three-digit group as a
  // thousands separator in either language, while keeping 12,5 / 12.5 as a
  // decimal. This avoids rejecting a translation of the same sourced metric.
  if (/^\d{1,3}([.,]\d{3})+$/.test(digits)) {
    digits = digits.replace(/[.,]/g, '')
  } else if (/^\d{1,3}([.,]\d{3})+[.,]\d+$/.test(digits)) {
    const lastComma = digits.lastIndexOf(',')
    const lastDot = digits.lastIndexOf('.')
    const decimalAt = Math.max(lastComma, lastDot)
    digits =
      digits.slice(0, decimalAt).replace(/[.,]/g, '') +
      '.' +
      digits.slice(decimalAt + 1)
  } else {
    digits = digits.replace(',', '.')
  }
  const value = Number(digits)
  const body = Number.isFinite(value) ? String(value) : digits
  return percent ? `${body}%` : body
}

/**
 * Every number a sentence asserts, normalised. Purely numeric — this is what
 * "unsupported numeric metrics are blocked, not suggested" is measured against.
 */
export function extractNumbers(text: string): string[] {
  const cleaned = (text ?? '').replace(/\s+%/g, '%')
  const matches = cleaned.match(/\d+(?:[.,]\d+)*\s?%?/g) ?? []
  return [...new Set(matches.map(normalizeNumberToken))].filter((token) => token.length > 0)
}

// --- Term extraction ----------------------------------------------------------

/** Acronyms that are ordinary English/German prose, not tools. */
const ACRONYM_STOPLIST = new Set([
  'AND', 'THE', 'FOR', 'WITH', 'OKR', 'KPI', 'EU', 'DE', 'EN', 'GMBH', 'AG', 'SE', 'KG',
  'CV', 'HR', 'IT', 'ID', 'OK', 'UND', 'ODER', 'DER', 'DIE', 'DAS', 'MIT', 'VON', 'IM',
])

/**
 * Tools/technologies a sentence claims: dictionary terms plus bare acronyms.
 * Deliberately conservative — a false positive only downgrades a change to
 * "needs your confirmation", never to "blocked".
 */
export function extractTechTerms(text: string): string[] {
  const found = new Set<string>()
  for (const [canon, aliases] of Object.entries(SKILL_DICTIONARY)) {
    const searchable = canon === 'Go' ? aliases : [canon, ...aliases]
    if (searchable.some((term) => containsTerm(text, term))) found.add(canon)
  }
  for (const acronym of (text ?? '').match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? []) {
    if (!ACRONYM_STOPLIST.has(acronym)) found.add(acronym)
  }
  return [...found]
}

/** How often `term` occurs in `text` (whole-word, case-insensitive). */
export function countTerm(text: string, term: string): number {
  const needle = term.toLowerCase().trim()
  if (!needle) return 0
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = (text ?? '').toLowerCase().match(new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'g'))
  return matches?.length ?? 0
}

function normalizeForCompare(text: string): string {
  return (text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// --- Morphology: P8 allows TRANSLATING vocabulary -----------------------------
//
// P8's whole point is that "Segmented audiences" may become "audience
// segmentation". A plain substring test would call that a fabricated term, which
// would make truthful reframing impossible — the exact dead-end the ATS plan's
// Risk R1 warns about. So attestation compares crude STEMS: same root, different
// ending, counts as attested. Different root does not.
//
// Deliberately conservative: "tableau" never matches "table", "kubernetes" never
// matches "kube", "database" never matches "data".

const SUFFIXES = ['ations', 'ation', 'ings', 'ing', 'ungen', 'ung', 'ers', 'er', 'ies', 'ed', 'es', 'en', 's']

/** Strip one common English/German inflection, keeping at least four letters. */
export function stemWord(word: string): string {
  const lower = word.toLowerCase()
  for (const suffix of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 4) {
      return lower.slice(0, lower.length - suffix.length)
    }
  }
  return lower
}

function wordsOf(text: string): string[] {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9+#./]+/g) ?? []
}

/**
 * Does the evidence attest `term`, allowing only inflection differences? Every
 * word of a multi-word term must be attested.
 */
export function attestedIn(evidence: string, term: string): boolean {
  if (containsTerm(evidence, term)) return true
  const evidenceStems = new Set(wordsOf(evidence).map(stemWord))
  const words = wordsOf(term)
  if (!words.length) return false
  return words.every((word) => evidenceStems.has(stemWord(word)))
}

// --- The bullet audit (P8 + R9) ----------------------------------------------

export type BulletAuditInput = {
  /** The rewritten sentence. */
  after: string
  /** The exact source bullets the model cited as evidence. */
  sources: string[]
  /** Job-description vocabulary, so a JD term claimed without evidence is caught. */
  jdTerms?: string[]
}

/**
 * P8 in code. A rewrite may re-describe a real task in the posting's words; it
 * may not introduce a number or a tool the cited evidence does not attest.
 */
export function auditBullet({ after, sources, jdTerms = [] }: BulletAuditInput): EvidenceFinding {
  const evidence = sources.join('\n')
  const reasons: EvidenceReason[] = []

  const sourceNumbers = new Set(extractNumbers(evidence))
  const addedNumbers = extractNumbers(after).filter((n) => !sourceNumbers.has(n))

  const sourceTerms = new Set(extractTechTerms(evidence).map((t) => t.toLowerCase()))
  const claimed = new Set(extractTechTerms(after).map((t) => t.toLowerCase()))
  for (const term of jdTerms) {
    if (containsTerm(after, term)) claimed.add(term.toLowerCase())
  }
  const addedTerms = [...claimed]
    .filter((term) => !sourceTerms.has(term))
    // A term the evidence states in another inflection still counts as attested
    // — that is P8's "translate vocabulary, do not import specifics".
    .filter((term) => !attestedIn(evidence, term))

  const repeatedTerms = [...new Set([...claimed, ...jdTerms.map((t) => t.toLowerCase())])]
    .filter((term) => countTerm(after, term) > 2)

  if (addedNumbers.length) reasons.push('unsupported_number')
  if (addedTerms.length) reasons.push('unsupported_term')
  if (repeatedTerms.length) reasons.push('repetition')

  const identical = sources.some((source) => normalizeForCompare(source) === normalizeForCompare(after))
  if (identical) reasons.push('identical')
  else if (!reasons.length) reasons.push('reworded')

  const status: FactualStatus = addedNumbers.length
    ? 'blocked'
    : addedTerms.length || repeatedTerms.length
      ? 'confirmation_required'
      : identical
        ? 'supported'
        : 'rephrased'

  return { status, reasons, addedNumbers, addedTerms, repeatedTerms }
}

// --- The title audits (P9) ----------------------------------------------------

const SENIORITY_WORDS = [
  'senior', 'lead', 'head', 'principal', 'chief', 'director', 'staff', 'vp',
  'vice president', 'executive', 'owner', 'partner', 'manager',
  'leitung', 'leiter', 'leiterin', 'direktor', 'direktorin',
  'geschäftsführer', 'geschäftsführerin', 'vorstand', 'führungskraft',
  'teamleitung', 'bereichsleitung', 'abteilungsleitung',
]

function seniorityWordsIn(text: string): string[] {
  return SENIORITY_WORDS.filter((word) => containsTerm(text, word))
}

/**
 * A PAST role's title may be cleaned up, never promoted. Seniority may only come
 * from the source title — echoing the posting's seniority into someone's history
 * is exactly the inflation P9 forbids.
 */
export function auditRoleTitle(sourceTitle: string, newTitle: string): EvidenceFinding {
  const allowed = new Set(seniorityWordsIn(sourceTitle))
  const added = seniorityWordsIn(newTitle).filter((word) => !allowed.has(word))
  if (added.length) {
    return {
      status: 'blocked',
      reasons: ['title_inflation'],
      addedNumbers: [],
      addedTerms: added,
      repeatedTerms: [],
    }
  }
  const identical = normalizeForCompare(sourceTitle) === normalizeForCompare(newTitle)
  return {
    status: identical ? 'supported' : 'rephrased',
    reasons: [identical ? 'identical' : 'reworded'],
    addedNumbers: [],
    addedTerms: [],
    repeatedTerms: [],
  }
}

/**
 * WS4.5 exact-title echo, bounded. The summary MAY name the posting's title
 * verbatim (that is the role being applied for). It may not invent a seniority
 * that appears neither in the posting nor in the person's own history.
 */
export function auditSummary(
  summary: string,
  options: { jobTitle: string; sourceTitles: string[]; sources: string[]; jdTerms?: string[] },
): EvidenceFinding {
  const allowed = new Set([
    ...seniorityWordsIn(options.jobTitle),
    ...options.sourceTitles.flatMap(seniorityWordsIn),
  ])
  const inflated = seniorityWordsIn(summary).filter((word) => !allowed.has(word))
  if (inflated.length) {
    return {
      status: 'blocked',
      reasons: ['title_inflation'],
      addedNumbers: [],
      addedTerms: inflated,
      repeatedTerms: [],
    }
  }
  // The posting's own title and the person's own titles are attested context for
  // the summary, so include them in the evidence corpus.
  return auditBullet({
    after: summary,
    sources: [...options.sources, options.jobTitle, ...options.sourceTitles],
    jdTerms: options.jdTerms,
  })
}

/**
 * Honest impact coaching (brainstorm §2.1.3, roadmap "blocked, not suggested"):
 * flag bullets that carry no measurable outcome so the PERSON can add a real
 * number. Klar never proposes one.
 */
export function lacksMeasurableOutcome(text: string): boolean {
  return extractNumbers(text).length === 0
}
