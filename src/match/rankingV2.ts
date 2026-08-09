import type {
  MatchResult,
  NormalizedJob,
  Preferences,
  Profile,
  RankingEligibilityFact,
  RankingEvidence,
  RankingFeatureSnapshot,
  RankingRequirement,
  RankingSnapshot,
} from '../types'
import { normalizeKey, stableHash } from '../lib/hash'
import { judgeCareerRelevance } from './relevance'

export const RANKING_MODEL_VERSION = 'ranking-v2.6.0'
export const REQUIREMENT_MODEL_VERSION = 'requirements-v2.6.0'
export const RANKING_EXPLANATION_VERSION = 'ranking-explanation-v2.6.0'

export type RankingEvaluation = {
  job: NormalizedJob
  snapshot: RankingSnapshot
  excludedByKnownMismatch: boolean
}

export type RankingOptions = {
  /**
   * Ranking time is part of the snapshot because freshness changes with time.
   * Candidate-set ranking defaults to the latest fetch time in the frozen set.
   */
  asOf?: string
  /** Diagnostic views may retain known hard mismatches; normal ranking drops them. */
  includeKnownMismatches?: boolean
}

type RequirementSeed = {
  text: string
  normalized: string
  priority: RankingRequirement['priority']
  kind: RankingRequirement['kind']
}

const REQUIRED_MARKER =
  /\b(must|required|mandatory|essential|minimum|at least|need(?:ed)?|erforderlich|voraussetzung|zwingend|mindestens|muss|benotigt)\b/
const PREFERRED_MARKER =
  /\b(preferred|nice to have|ideally|desirable|a plus|bonus|wunschenswert|von vorteil|idealerweise|optional)\b/
const REQUIRED_HEADING =
  /^(requirements?|must haves?|qualifications?|what you need|anforderungen|voraussetzungen|das bringst du mit)\s*:?\s*$/
const PREFERRED_HEADING =
  /^(preferred qualifications?|nice to haves?|bonus|wunschenswert|von vorteil)\s*:?\s*$/

const COMMON_SKILLS = [
  'a b testing', 'airflow', 'aws', 'azure', 'bigquery', 'campaign management',
  'crm', 'data analysis', 'data modeling', 'docker', 'excel', 'figma', 'gcp',
  'git', 'google analytics', 'hubspot', 'java', 'javascript', 'jira', 'kubernetes',
  'mailchimp', 'marketing automation', 'power bi', 'project management', 'python',
  'react', 'salesforce', 'sap', 'sql', 'tableau', 'tensorflow', 'terraform',
  'typescript',
] as const

const ADJACENT_SKILLS: Record<string, string[]> = {
  'a b testing': ['experimentation', 'experiment design'],
  bigquery: ['sql', 'data warehouse'],
  crm: ['customer relationship management', 'lifecycle marketing'],
  excel: ['spreadsheets', 'google sheets'],
  'google analytics': ['web analytics', 'digital analytics'],
  hubspot: ['crm', 'marketing automation'],
  'marketing automation': ['crm', 'email marketing', 'lifecycle marketing'],
  'power bi': ['business intelligence', 'data visualization'],
  python: ['pandas', 'numpy'],
  salesforce: ['crm'],
  sql: ['relational database', 'database querying'],
  tableau: ['business intelligence', 'data visualization'],
  tensorflow: ['machine learning', 'deep learning'],
}

const SENIORITY_LEVELS = ['intern', 'junior', 'mid', 'senior', 'lead', 'exec'] as const
type SeniorityLevel = typeof SENIORITY_LEVELS[number]

const SENIORITY_PATTERNS: { level: SeniorityLevel; pattern: RegExp }[] = [
  { level: 'intern', pattern: /\b(intern|internship|trainee|praktikant|praktikum|werkstudent)\b/ },
  { level: 'junior', pattern: /\b(junior|jr|entry level|graduate|associate)\b/ },
  { level: 'exec', pattern: /\b(chief|ceo|cto|cfo|president|vice president|vp|director|direktor|geschaftsfuhrer|vorstand)\b/ },
  { level: 'lead', pattern: /\b(lead|head|team lead|teamleiter|leitung|leiter)\b/ },
  { level: 'senior', pattern: /\b(senior|sr|staff|principal|expert)\b/ },
  { level: 'mid', pattern: /\b(mid|mid level|professional)\b/ },
]

const CEFR: Record<string, number> = {
  a1: 1,
  a2: 2,
  b1: 3,
  b2: 4,
  c1: 5,
  c2: 6,
  basic: 2,
  intermediate: 3,
  conversational: 3,
  fluent: 5,
  native: 6,
  muttersprache: 6,
  fliessend: 5,
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function rounded(value: number): number {
  return Math.round(clamp(value))
}

function normalized(value: string): string {
  return normalizeKey(value)
}

function includesPhrase(haystack: string, needle: string): boolean {
  const left = ` ${normalized(haystack)} `
  const right = normalized(needle)
  return Boolean(right) && left.includes(` ${right} `)
}

function tokens(value: string): Set<string> {
  return new Set(normalized(value).split(/\s+/).filter((token) => token.length > 2))
}

function overlapRatio(left: string, right: string): number {
  const a = tokens(left)
  const b = tokens(right)
  if (!a.size || !b.size) return 0
  let overlap = 0
  for (const token of a) if (b.has(token)) overlap += 1
  return overlap / Math.max(1, Math.min(a.size, b.size))
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return '"__undefined__"'
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
}

function validIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined
}

function defaultAsOf(jobs: NormalizedJob[]): string {
  const times = jobs
    .map((job) => validIso(job.fetched_at))
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
  return new Date(times.length ? Math.max(...times) : 0).toISOString()
}

function rankingInputHash(
  job: NormalizedJob,
  profile: Profile,
  prefs: Preferences,
  asOf: string,
): string {
  return stableHash(stableSerialize({
    version: RANKING_MODEL_VERSION,
    requirementVersion: REQUIREMENT_MODEL_VERSION,
    asOf,
    job: {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      url: job.url,
      postedAt: job.posted_at,
      validThrough: job.validThrough,
      salary: job.salary,
      employmentType: job.employment_type,
      seniority: job.seniority,
      language: job.language,
      tags: job.tags,
      fetchedAt: job.fetched_at,
      sourceConfidence: job.sourceConfidence,
      alsoOn: job.also_on,
    },
    profile: {
      summary: profile.summary,
      titles: profile.titles,
      skills: profile.skills,
      domains: profile.domains,
      totalYears: profile.totalYears,
      education: profile.education,
      languages: profile.languages,
      certifications: profile.certifications,
    },
    preferences: {
      targetTitles: prefs.targetTitles,
      fields: prefs.fields,
      seniority: prefs.seniority,
      salary: prefs.salary,
      locations: prefs.locations,
      remoteOnly: prefs.remoteOnly,
      hybridOk: prefs.hybridOk,
      workAuth: prefs.workAuth,
      languages: prefs.languages,
      mustHaves: prefs.mustHaves,
      dealbreakers: prefs.dealbreakers,
      contractType: prefs.contractType,
      weights: prefs.weights,
    },
  }))
}

function sourceFragment(description: string, pattern: RegExp): string | undefined {
  const segments = description
    .split(/\n|(?<=[.!?;])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
  return segments.find((segment) => pattern.test(normalized(segment)))?.slice(0, 240)
}

function explicitNonRemoteEvidence(job: NormalizedJob): string | undefined {
  return sourceFragment(
    job.description,
    /\b(?:role|position|job|work|working|attendance)\s+(?:(?:is|will be|must be|requires?)\s+)?(?:performed\s+)?(?:fully\s+|entirely\s+|100%\s+)?(?:on[- ]?site|in[- ]?office|office[- ]?based)\b|\b(?:must|required to|expected to)\s+(?:work|be)\s+(?:fully\s+|entirely\s+)?(?:on[- ]?site|in[- ]?office)\b|\bno remote work\b|\bremote work (?:is )?not (?:available|offered|possible)\b|\b(?:stelle|tatigkeit|arbeit)\s+(?:ist\s+)?(?:vollstandig\s+|ausschliesslich\s+)?(?:vor ort|in prasenz)\b|\bkein(?:e|en)? (?:remote[- ]?arbeit|homeoffice)\b|\bhomeoffice (?:ist )?nicht moglich\b/,
  )
}

function dealbreakerEvidence(
  job: NormalizedJob,
  term: string,
): { mentioned: boolean; positive?: string } {
  const needle = normalized(term)
  if (!needle) return { mentioned: false }
  const segments = [job.title, job.company, ...job.description.split(/\n|(?<=[.!?;])\s+/)]
  let mentioned = false
  for (const rawSegment of segments) {
    const segment = normalized(rawSegment)
    let from = 0
    while (from < segment.length) {
      const padded = ` ${segment} `
      const index = padded.indexOf(` ${needle} `, from)
      if (index < 0) break
      mentioned = true
      const before = padded.slice(Math.max(0, index - 80), index)
      const after = padded.slice(index + needle.length + 2, index + needle.length + 82)
      const negatedBefore =
        /\b(?:no|not|without|never|kein|keine|keinen|keiner|keines|nicht|ohne)(?:\s+[a-z0-9]+){0,3}\s*$/.test(before)
      const negatedAfter =
        /^\s*(?:(?:work|working|requirement|role|position)\s+)?(?:(?:is|are|ist|sind)\s+)?(?:not|nicht|optional|unnecessary|unrequired)\b/.test(after)
      if (!negatedBefore && !negatedAfter) {
        return { mentioned: true, positive: rawSegment.trim().slice(0, 240) }
      }
      from = index + needle.length + 2
    }
  }
  return { mentioned }
}

function eligibilityFacts(
  job: NormalizedJob,
  prefs: Preferences,
  requirements: RankingRequirement[],
): RankingEligibilityFact[] {
  const facts: RankingEligibilityFact[] = []
  const description = normalized(job.description)

  const noSponsorship =
    /\b(no|not|cannot|unable to) (visa )?sponsor\b|\bno (visa )?sponsorship\b|\bkeine visumsunterstutzung\b/
  const rightToWork =
    /\b(right|authori[sz]ation) to work\b|\bvalid (eu )?work permit\b|\barbeitserlaubnis\b|\barbeitsberechtigung\b/
  const sponsorshipText = sourceFragment(job.description, noSponsorship)
  const permitText = sourceFragment(job.description, rightToWork)
  if (prefs.workAuth.needsVisaSponsorship && noSponsorship.test(description)) {
    facts.push({
      key: 'work_authorization',
      status: 'known_mismatch',
      reason: 'The posting explicitly rules out sponsorship, which the candidate needs.',
      sourceText: sponsorshipText,
    })
  } else if (rightToWork.test(description)) {
    facts.push({
      key: 'work_authorization',
      status:
        prefs.workAuth.euWorkPermit === true
          ? 'match'
          : prefs.workAuth.euWorkPermit === false
            ? 'known_mismatch'
            : 'unknown',
      reason:
        prefs.workAuth.euWorkPermit === true
          ? 'The confirmed work-permit preference satisfies the explicit requirement.'
          : prefs.workAuth.euWorkPermit === false
            ? 'The posting explicitly requires a work permit the candidate marked as unavailable.'
            : 'The posting requires work authorization, but the candidate fact is not confirmed.',
      sourceText: permitText,
    })
  } else {
    facts.push({
      key: 'work_authorization',
      status: 'unknown',
      reason: 'The posting does not state a verifiable sponsorship or authorization rule.',
    })
  }

  const nonRemoteEvidence = explicitNonRemoteEvidence(job)
  if (prefs.remoteOnly && nonRemoteEvidence) {
    facts.push({
      key: 'location',
      status: 'known_mismatch',
      reason: 'The candidate requested remote-only work and the posting text explicitly requires on-site work.',
      sourceText: nonRemoteEvidence,
    })
  } else if (job.location.remote || locationPreferenceScore(job, prefs) >= 80) {
    facts.push({
      key: 'location',
      status: 'match',
      reason: job.location.remote
        ? 'The posting explicitly supports remote work.'
        : 'The posting city matches a requested location.',
    })
  } else {
    facts.push({
      key: 'location',
      status: 'unknown',
      reason: prefs.remoteOnly
        ? 'The posting does not explicitly confirm either remote or required on-site work.'
        : 'Distance cannot be proven from the normalized location facts.',
    })
  }

  const languageRequirements = requirements.filter((requirement) =>
    requirement.priority === 'required' && requirement.kind === 'language')
  if (!languageRequirements.length) {
    facts.push({
      key: 'language',
      status: 'not_applicable',
      reason: 'No explicit required language level was extracted.',
    })
  } else {
    const statuses = languageRequirements.map((requirement) => requirement.status)
    facts.push({
      key: 'language',
      status: statuses.includes('missing')
        ? 'known_mismatch'
        : statuses.includes('unknown')
          ? 'unknown'
          : statuses.includes('partial')
            ? 'known_mismatch'
            : 'match',
      reason: languageRequirements.map((requirement) =>
        `${requirement.text}: ${requirement.status}`).join('; '),
      sourceText: languageRequirements.map((requirement) => requirement.text).join('; '),
    })
  }

  const allowedContracts = (prefs.contractType ?? []).map(normalized).filter(Boolean)
  const actualContract = normalized(job.employment_type ?? '')
  if (!allowedContracts.length || !actualContract) {
    facts.push({
      key: 'employment_type',
      status: 'unknown',
      reason: 'The candidate preference or posting employment type is not explicit.',
    })
  } else {
    const matches = allowedContracts.some((contract) =>
      actualContract.includes(contract) || contract.includes(actualContract))
    facts.push({
      key: 'employment_type',
      status: matches ? 'match' : 'known_mismatch',
      reason: matches
        ? 'The posting employment type matches an allowed contract.'
        : 'The explicit posting employment type is outside the allowed contracts.',
      sourceText: job.employment_type,
    })
  }

  const hoursText = sourceFragment(
    job.description,
    /\b\d{1,2}\s*(hours?|hrs?|stunden)\s*(per week|weekly|pro woche|wochentlich)\b/,
  )
  facts.push({
    key: 'working_hours',
    status: hoursText ? 'unknown' : 'not_applicable',
    reason: hoursText
      ? 'Working hours are explicit, but the career profile has no confirmed hours constraint.'
      : 'No explicit working-hours constraint was extracted.',
    sourceText: hoursText,
  })

  const startText = sourceFragment(
    job.description,
    /\b(start(?:ing)?|available from|earliest start|beginn|eintritt)\b/,
  )
  facts.push({
    key: 'start_date',
    status: startText ? 'unknown' : 'not_applicable',
    reason: startText
      ? 'A start constraint exists, but candidate availability is not stored in the career profile.'
      : 'No explicit start-date constraint was extracted.',
    sourceText: startText,
  })

  const certificationRequirements = requirements.filter((requirement) =>
    requirement.priority === 'required' && requirement.kind === 'certification')
  if (!certificationRequirements.length) {
    facts.push({
      key: 'certification',
      status: 'not_applicable',
      reason: 'No explicit required certification was extracted.',
    })
  } else {
    const statuses = certificationRequirements.map((requirement) => requirement.status)
    // The posting proves the requirement; it never proves the candidate lacks
    // the credential. Anything short of positive evidence stays an unknown
    // fact, so a certification cannot drop the job out of the result set.
    facts.push({
      key: 'certification',
      status: statuses.every((status) => status === 'met') ? 'match' : 'unknown',
      reason: certificationRequirements.map((requirement) =>
        `${requirement.text}: ${requirement.status}`).join('; '),
      sourceText: certificationRequirements.map((requirement) => requirement.text).join('; '),
    })
  }

  const dealbreakers = prefs.dealbreakers
    .map((term) => ({ term, ...dealbreakerEvidence(job, term) }))
  const dealbreaker = dealbreakers.find((entry) => entry.positive)
  const ambiguousDealbreaker = dealbreakers.find((entry) => entry.mentioned)
  facts.push({
    key: 'dealbreaker',
    status: dealbreaker
      ? 'known_mismatch'
      : ambiguousDealbreaker
        ? 'unknown'
        : 'not_applicable',
    reason: dealbreaker
      ? `The posting affirmatively contains the candidate dealbreaker “${dealbreaker.term}”.`
      : ambiguousDealbreaker
        ? `The posting mentions “${ambiguousDealbreaker.term}”, but only in a negated or ambiguous context.`
        : 'No explicit candidate dealbreaker was found.',
    sourceText: dealbreaker?.positive,
  })

  return facts
}

function classifyRequirementKind(value: string): RankingRequirement['kind'] {
  if (/\b(german|english|deutsch|englisch|cefr|c[12]|b[12])\b/.test(value)) return 'language'
  if (/\b(certif|license|licence|zertifikat|zulassung|approbation)\b/.test(value)) return 'certification'
  if (/\b(years?|jahre?|experience|erfahrung)\b/.test(value)) return 'experience'
  if (/\b(degree|bachelor|master|phd|university|studium|abschluss|ausbildung)\b/.test(value)) return 'education'
  return 'other'
}

function jobRequirementTerms(job: NormalizedJob): string[] {
  // Extraction must be a function of the posting alone. Candidate skills and
  // preferences are deliberately excluded so they cannot make requirements
  // appear or disappear and inflate their own coverage score.
  const terms = [
    ...COMMON_SKILLS,
    ...job.tags,
  ]
  const unique = new Map<string, string>()
  for (const term of terms) {
    const key = normalized(term)
    if (key.length > 1 && !unique.has(key)) unique.set(key, term.trim())
  }
  return [...unique.values()].sort((left, right) => right.length - left.length)
}

function requirementSeeds(job: NormalizedJob): RequirementSeed[] {
  const terms = jobRequirementTerms(job)
  const lines = job.description
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?;])\s+/)
    .map((line) => line.replace(/^[\s*•–—-]+/, '').trim())
    .filter(Boolean)
  let section: RankingRequirement['priority'] | undefined
  const seeds: RequirementSeed[] = []

  for (const original of lines) {
    const line = normalized(original)
    if (!line) continue
    if (REQUIRED_HEADING.test(line)) {
      section = 'required'
      continue
    }
    if (PREFERRED_HEADING.test(line)) {
      section = 'preferred'
      continue
    }
    if (/:\s*$/.test(original) && original.split(/\s+/).length <= 8) {
      section = undefined
      continue
    }
    const priority =
      PREFERRED_MARKER.test(line)
        ? 'preferred'
        : REQUIRED_MARKER.test(line)
          ? 'required'
          : section
    if (!priority) continue

    const matchedTerms = terms.filter((term) => includesPhrase(line, term))
    const years = line.match(/\b(\d{1,2})\s*\+?\s*(?:years?|jahre?)\b/)
    const language = line.match(
      /\b(german|english|deutsch|englisch)\b(?:\s*(?:at|auf|level|niveau)?\s*(a1|a2|b1|b2|c1|c2|fluent|native|fliessend|muttersprache))?/,
    )
    // Articles and qualifiers are consumed, never captured. Leaving them inside
    // the captured requirement lowers its later overlap ratio and turns an
    // ordinary wording difference into an apparent evidence failure.
    const certification = line.match(
      /\b(?:(?:a|an|the|ein|eine|einen)\s+)?(?:(?:valid|current|active|required|mandatory|erforderlich|zwingend|gueltige|gueltiger|gueltiges|aktuelle|aktueller|aktuelles)\s+)*([a-z0-9][a-z0-9 +./-]{1,40}\s(?:certification|certificate|license|licence|zertifikat|zulassung))\b/,
    )

    if (years) {
      const text = `${years[1]} years experience`
      seeds.push({ text, normalized: normalized(text), priority, kind: 'experience' })
    }
    if (language) {
      const text = `${language[1]}${language[2] ? ` ${language[2]}` : ''}`
      seeds.push({ text, normalized: normalized(text), priority, kind: 'language' })
    }
    if (certification) {
      const text = certification[1].trim()
      seeds.push({ text, normalized: normalized(text), priority, kind: 'certification' })
    }
    for (const term of matchedTerms) {
      const kind = classifyRequirementKind(normalized(term))
      seeds.push({
        text: term,
        normalized: normalized(term),
        priority,
        kind: kind === 'other' ? 'skill' : kind,
      })
    }

    // A known term in a mixed requirement must not hide an unknown one. Keep
    // each unmatched conjunct as posting evidence (for example, COBOL in
    // “SQL and COBOL required”). This is intentionally conservative: an
    // unfamiliar requirement remains visible and cannot receive silent credit.
    const unmatchedClauses = original
      .split(/\s+(?:and|or|und|oder)\s+|,\s*/i)
      .map((clause) => clause.replace(/^[\s*•–—-]+/, '').trim())
      .filter(Boolean)
      .filter((clause) => {
        const value = normalized(clause)
        return !terms.some((term) => includesPhrase(value, term)) &&
          !/\b\d{1,2}\s*\+?\s*(?:years?|jahre?)\b/.test(value) &&
          !/\b(german|english|deutsch|englisch)\b/.test(value) &&
          !/\b(certification|certificate|license|licence|zertifikat|zulassung)\b/.test(value)
      })
    for (const clause of unmatchedClauses) {
      const value = normalized(clause)
      const withoutMarker = value
        .replace(REQUIRED_MARKER, '')
        .replace(PREFERRED_MARKER, '')
        .replace(/\b(?:is|are|ist|sind)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!withoutMarker) continue
      seeds.push({
        text: clause.slice(0, 180),
        normalized: value,
        priority,
        kind: classifyRequirementKind(value),
      })
    }

    if (!years && !language && !certification && !matchedTerms.length && !unmatchedClauses.length) {
      const text = original.slice(0, 180)
      seeds.push({
        text,
        normalized: normalized(text),
        priority,
        kind: classifyRequirementKind(line),
      })
    }
  }

  const unique = new Map<string, RequirementSeed>()
  for (const seed of seeds) {
    const key = `${seed.priority}:${seed.kind}:${seed.normalized}`
    if (!unique.has(key)) unique.set(key, seed)
  }
  return [...unique.values()]
}

function languageEvidence(
  requirement: RequirementSeed,
  profile: Profile,
): { evidence: RankingEvidence[]; status: RankingRequirement['status'] } {
  const language = requirement.normalized.match(/\b(german|english|deutsch|englisch)\b/)?.[1]
  if (!language) return { evidence: [], status: 'unknown' }
  const canonical = language === 'deutsch' ? 'german' : language === 'englisch' ? 'english' : language
  const candidate = profile.languages.find((entry) => {
    const value = normalized(entry.lang)
    return value === canonical ||
      (canonical === 'german' && value === 'deutsch') ||
      (canonical === 'english' && value === 'englisch')
  })
  if (!candidate) return { evidence: [], status: 'unknown' }
  const evidence: RankingEvidence[] = [{
    source: 'profile.language',
    value: `${candidate.lang}${candidate.level ? ` ${candidate.level}` : ''}`,
    strength: 'exact',
  }]
  const requiredLevel = requirement.normalized.match(/\b(a1|a2|b1|b2|c1|c2|fluent|native|fliessend|muttersprache)\b/)?.[1]
  if (!requiredLevel) return { evidence, status: 'met' }
  const candidateLevel = normalized(candidate.level ?? '').match(
    /\b(a1|a2|b1|b2|c1|c2|basic|intermediate|conversational|fluent|native|fliessend|muttersprache)\b/,
  )?.[1]
  if (!candidateLevel) return { evidence, status: 'unknown' }
  return {
    evidence,
    status: (CEFR[candidateLevel] ?? 0) >= (CEFR[requiredLevel] ?? 0) ? 'met' : 'missing',
  }
}

function requirementEvidence(
  seed: RequirementSeed,
  profile: Profile,
): { evidence: RankingEvidence[]; status: RankingRequirement['status'] } {
  if (seed.kind === 'language') return languageEvidence(seed, profile)
  if (seed.kind === 'experience') {
    const needed = Number(seed.normalized.match(/\b(\d{1,2})\b/)?.[1])
    if (!Number.isFinite(profile.totalYears)) return { evidence: [], status: 'unknown' }
    const evidence: RankingEvidence[] = [{
      source: 'profile.experience',
      value: `${profile.totalYears} years`,
      strength: 'exact',
    }]
    return {
      evidence,
      status: (profile.totalYears ?? 0) >= needed
        ? 'met'
        : (profile.totalYears ?? 0) >= Math.max(1, needed - 1)
          ? 'partial'
          : 'missing',
    }
  }

  const sources: { source: RankingEvidence['source']; value: string }[] = [
    ...profile.skills.map((entry) => ({ source: 'profile.skill' as const, value: entry.name })),
    ...profile.titles.map((entry) => ({ source: 'profile.title' as const, value: entry.title })),
    ...profile.domains.map((value) => ({ source: 'profile.domain' as const, value })),
    ...profile.certifications.map((value) => ({ source: 'profile.certification' as const, value })),
    ...profile.education.flatMap((entry) =>
      [entry.degree, entry.field].filter((value): value is string => Boolean(value))
        .map((value) => ({ source: 'profile.domain' as const, value }))),
    ...(profile.summary
      ? [{ source: 'profile.summary' as const, value: profile.summary }]
      : []),
  ]
  const exact = sources.filter(({ value }) =>
    includesPhrase(value, seed.normalized) || includesPhrase(seed.normalized, value))
  if (exact.length) {
    return {
      evidence: exact.slice(0, 3).map(({ source, value }) => ({ source, value, strength: 'exact' })),
      status: 'met',
    }
  }

  const adjacentTerms = ADJACENT_SKILLS[seed.normalized] ?? []
  const adjacent = sources.filter(({ value }) =>
    adjacentTerms.some((term) => includesPhrase(value, term)) ||
    overlapRatio(value, seed.normalized) >= 0.6)
  if (adjacent.length) {
    return {
      evidence: adjacent.slice(0, 3).map(({ source, value }) => ({ source, value, strength: 'adjacent' })),
      status: 'partial',
    }
  }
  // A resume that does not list one specific certification or degree is not
  // proof that the candidate lacks it, and holding other credentials is not
  // evidence about this one. Absence of evidence stays unknown.
  if (seed.kind === 'certification' || seed.kind === 'education') {
    return { evidence: [], status: 'unknown' }
  }
  if (seed.kind === 'other') return { evidence: [], status: 'unknown' }
  return { evidence: [], status: 'missing' }
}

export function extractRankingRequirements(
  job: NormalizedJob,
  profile: Profile,
  _prefs: Preferences,
): RankingRequirement[] {
  return requirementSeeds(job).map((seed) => {
    const result = requirementEvidence(seed, profile)
    return {
      id: stableHash(`${seed.priority}:${seed.kind}:${seed.normalized}`),
      text: seed.text,
      normalized: seed.normalized,
      priority: seed.priority,
      kind: seed.kind,
      status: result.status,
      evidence: result.evidence,
    }
  })
}

function coverageScore(requirements: RankingRequirement[], priority: RankingRequirement['priority']): number {
  const relevant = requirements.filter((requirement) => requirement.priority === priority)
  if (!relevant.length) return 70
  const total = relevant.reduce((sum, requirement) => sum + (
    requirement.status === 'met'
      ? 1
      : requirement.status === 'partial'
        ? 0.55
        : requirement.status === 'unknown'
          ? 0.35
          : 0
  ), 0)
  return rounded(total / relevant.length * 100)
}

function detectSeniority(job: NormalizedJob): SeniorityLevel | undefined {
  const value = normalized(`${job.seniority ?? ''} ${job.title}`)
  return SENIORITY_PATTERNS.find(({ pattern }) => pattern.test(value))?.level
}

function seniorityScore(job: NormalizedJob, prefs: Preferences): { score: number; severe: boolean } {
  const actual = detectSeniority(job)
  if (!actual) return { score: 60, severe: false }
  const wantedIndex = SENIORITY_LEVELS.indexOf(prefs.seniority)
  const actualIndex = SENIORITY_LEVELS.indexOf(actual)
  const distance = Math.abs(actualIndex - wantedIndex)
  return {
    score: rounded(100 - distance * 25),
    // Under-levelling by two bands is as severe as over-levelling by two.
    severe: distance >= 2,
  }
}

function domainTransferScore(job: NormalizedJob, profile: Profile, prefs: Preferences): number {
  const intent = [...prefs.fields, ...profile.domains].filter(Boolean)
  if (!intent.length) return 65
  const jobText = `${job.title} ${job.tags.join(' ')} ${job.description.slice(0, 1800)}`
  const exact = intent.filter((value) => includesPhrase(jobText, value)).length
  if (exact) return rounded(70 + Math.min(30, exact * 15))
  const overlap = Math.max(...intent.map((value) => overlapRatio(value, jobText)), 0)
  return rounded(35 + overlap * 40)
}

function evidenceDepthScore(requirements: RankingRequirement[], profile: Profile): number {
  const exact = requirements.flatMap((requirement) => requirement.evidence)
    .filter((evidence) => evidence.strength === 'exact').length
  const adjacent = requirements.flatMap((requirement) => requirement.evidence)
    .filter((evidence) => evidence.strength === 'adjacent').length
  const profileDepth =
    Math.min(20, profile.skills.length * 2) +
    Math.min(12, profile.titles.length * 4) +
    (profile.totalYears != null ? 8 : 0)
  return rounded(35 + Math.min(45, exact * 10 + adjacent * 5) + profileDepth / 2)
}

function finitePositive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

function salaryPreferenceScore(job: NormalizedJob, prefs: Preferences): number {
  const preferred = finitePositive(prefs.salary.min)
  const min = finitePositive(job.salary.min)
  const max = finitePositive(job.salary.max)
  if (
    preferred == null ||
    (min == null && max == null) ||
    (job.salary.currency && job.salary.currency.toUpperCase() !== prefs.salary.currency)
  ) return 50
  const annualPreference = prefs.salary.period === 'month' ? preferred * 12 : preferred
  const multiplier = job.salary.period === 'month' ? 12 : job.salary.period === 'hour' ? 2080 : 1
  const annualMin = min == null ? undefined : min * multiplier
  const annualMax = max == null ? undefined : max * multiplier
  const upper = annualMax ?? annualMin
  const lower = annualMin ?? annualMax
  if (upper == null || lower == null || !Number.isFinite(upper) || !Number.isFinite(lower)) return 50
  if (lower >= annualPreference) return 100
  if (upper >= annualPreference) {
    const representative = annualMin == null ? upper : (lower + upper) / 2
    return rounded(representative / annualPreference * 100)
  }
  return rounded(upper / annualPreference * 100)
}

function locationPreferenceScore(job: NormalizedJob, prefs: Preferences): number {
  if (job.location.remote) return prefs.remoteOnly || prefs.hybridOk ? 100 : 80
  if (prefs.remoteOnly) return explicitNonRemoteEvidence(job) ? 0 : 50
  if (!prefs.locations.length) return 50
  const city = normalized(job.location.city ?? '')
  if (!city) return 50
  return prefs.locations.some((location) => {
    const wanted = normalized(location.city)
    return wanted && (city === wanted || city.includes(wanted) || wanted.includes(city))
  }) ? 100 : 45
}

function workModePreferenceScore(job: NormalizedJob, prefs: Preferences): number {
  if (prefs.remoteOnly) {
    if (job.location.remote) return 100
    return explicitNonRemoteEvidence(job) ? 0 : 50
  }
  if (prefs.hybridOk && job.location.remote) return 95
  return job.location.remote ? 75 : 60
}

function contractPreferenceScore(job: NormalizedJob, prefs: Preferences): number {
  const wanted = (prefs.contractType ?? []).map(normalized).filter(Boolean)
  if (!wanted.length || !job.employment_type) return 50
  const actual = normalized(job.employment_type)
  return wanted.some((value) => actual.includes(value) || value.includes(actual)) ? 100 : 0
}

function postingScores(
  job: NormalizedJob,
  asOf: string,
): {
  confidence: number
  penalty: number
  signals: RankingFeatureSnapshot['postingSignals']
  effects: string[]
} {
  const source = job.sourceConfidence === 'published'
    ? 95
    : job.sourceConfidence === 'structured'
      ? 85
      : job.sourceConfidence === 'inferred'
        ? 65
        : 55
  let completeness = 30
  if (job.title.trim()) completeness += 15
  if (job.company.trim()) completeness += 10
  if (job.description.trim().length >= 300) completeness += 25
  else if (job.description.trim().length >= 80) completeness += 15
  if (job.location.city || job.location.remote) completeness += 10
  if (job.url.trim()) completeness += 10
  completeness = rounded(completeness)

  const referenceTime = Date.parse(asOf)
  const postedTime = Date.parse(job.posted_at ?? '')
  const validThrough = Date.parse(job.validThrough ?? '')
  const ageDays = Number.isFinite(postedTime)
    ? Math.max(0, (referenceTime - postedTime) / 86_400_000)
    : undefined
  let freshness = ageDays == null ? 55 : rounded(100 - Math.max(0, ageDays - 14) * 1.5)
  if (Number.isFinite(validThrough) && validThrough < referenceTime) freshness = 0

  // Repeated aggregator copies do not make a role a better candidate match.
  // Apply a small, bounded duplicate discount while retaining the richer
  // merged record and its alternate source links for transparency.
  const duplicateConfidence = job.also_on?.length
    ? 35
    : job.sourceConfidence === 'unknown'
      ? 55
      : 75
  const confidence = rounded(source * 0.3 + completeness * 0.3 + freshness * 0.3 + duplicateConfidence * 0.1)
  const penalty = rounded((100 - confidence) * 0.2)
  const effects: string[] = []
  if (freshness < 50) effects.push('The posting is stale or expired, so posting confidence reduced its rank.')
  if (completeness < 60) effects.push('The posting is incomplete, so posting confidence reduced its rank.')
  if (source < 70) effects.push('The source or extraction is not independently verified.')
  if (job.also_on?.length) {
    effects.push('Duplicate copies were merged and received a bounded posting-confidence discount.')
  }
  if (!effects.length) effects.push('The posting has no material freshness, completeness, or source-confidence penalty.')
  return {
    confidence,
    penalty,
    signals: { source, completeness, freshness, duplicateConfidence },
    effects,
  }
}

function buildExplanation(
  features: RankingFeatureSnapshot,
): RankingSnapshot['explanation'] {
  const required = features.requirements.filter((requirement) => requirement.priority === 'required')
  const strongSignals: string[] = []
  if (features.scores.roleFunction >= 75) strongSignals.push('The role/function closely matches the requested work.')
  if (features.scores.seniority >= 80) strongSignals.push('The detected seniority is aligned with the target level.')
  const evidenced = required.filter((requirement) => requirement.status === 'met').map((requirement) => requirement.text)
  if (evidenced.length) strongSignals.push(`Confirmed evidence covers: ${evidenced.slice(0, 4).join(', ')}.`)
  if (features.scores.domainTransferability >= 75) strongSignals.push('The domain is directly aligned or strongly transferable.')
  if (!strongSignals.length) strongSignals.push('No single strong signal dominates this result.')

  const missingMustHaves = required
    .filter((requirement) => requirement.status === 'missing')
    .map((requirement) => requirement.text)
  const uncertainFacts = [
    ...features.eligibility
      .filter((fact) => fact.status === 'unknown')
      .map((fact) => `${fact.key}: ${fact.reason}`),
    ...required
      .filter((requirement) => requirement.status === 'unknown')
      .map((requirement) => `requirement: ${requirement.text}`),
  ]
  const preferenceEffects = features.scores.preferenceAdjustment === 0
    ? ['Soft preferences did not change the core-fit score.']
    : [features.scores.preferenceAdjustment > 0
      ? `Soft preferences added ${features.scores.preferenceAdjustment} points after core fit.`
      : `Soft preferences removed ${Math.abs(features.scores.preferenceAdjustment)} points after core fit.`]
  const postingConfidenceEffects = features.scores.postingPenalty > 0
    ? [`Posting confidence removed ${features.scores.postingPenalty} points separately from candidate fit.`]
    : ['Posting confidence did not reduce the score.']
  return {
    schemaVersion: 1,
    strongSignals,
    missingMustHaves,
    uncertainFacts,
    preferenceEffects,
    postingConfidenceEffects,
    disclaimer: 'This deterministic score explains job fit, not the probability of being hired.',
  }
}

export function evaluateJobV2(
  job: NormalizedJob,
  profile: Profile,
  prefs: Preferences,
  options: RankingOptions = {},
): RankingEvaluation {
  const asOf = validIso(options.asOf) ?? validIso(job.fetched_at) ?? new Date(0).toISOString()
  const requirements = extractRankingRequirements(job, profile, prefs)
  const eligibility = eligibilityFacts(job, prefs, requirements)
  const knownMismatch = eligibility.some((fact) => fact.status === 'known_mismatch')
  const relevance = judgeCareerRelevance(job, profile, prefs)
  const roleFunction = relevance.keep ? relevance.score : 0
  const seniority = seniorityScore(job, prefs)
  const requiredCoverage = coverageScore(requirements, 'required')
  const preferredCoverage = coverageScore(requirements, 'preferred')
  const domainTransferability = domainTransferScore(job, profile, prefs)
  const evidenceDepth = evidenceDepthScore(requirements, profile)
  let coreFit = rounded(
    roleFunction * 0.3 +
    seniority.score * 0.15 +
    requiredCoverage * 0.25 +
    preferredCoverage * 0.05 +
    domainTransferability * 0.15 +
    evidenceDepth * 0.1,
  )
  const missingRequired = requirements.filter((requirement) =>
    requirement.priority === 'required' && requirement.status === 'missing').length
  const exactTargetTitle = prefs.targetTitles.some((target) =>
    includesPhrase(job.title, target) || includesPhrase(target, job.title))
  if (!relevance.keep) coreFit = Math.min(coreFit, 30)
  if (prefs.fields.length && !exactTargetTitle && domainTransferability < 45) {
    coreFit = Math.min(coreFit, 49)
  }
  if (seniority.severe) coreFit = Math.min(coreFit, 45)
  if (missingRequired === 1) coreFit = Math.min(coreFit, 55)
  if (missingRequired >= 2) coreFit = Math.min(coreFit, 45)
  if (knownMismatch) coreFit = Math.min(coreFit, 10)

  const preferenceSignals = {
    salary: salaryPreferenceScore(job, prefs),
    location: locationPreferenceScore(job, prefs),
    workMode: workModePreferenceScore(job, prefs),
    contract: contractPreferenceScore(job, prefs),
  }
  const preferenceFit = rounded(
    preferenceSignals.salary * 0.2 +
    preferenceSignals.location * 0.35 +
    preferenceSignals.workMode * 0.25 +
    preferenceSignals.contract * 0.2,
  )
  // Soft preferences may refine close core-fit results, but the adjustment is
  // intentionally smaller than one full relevance band.
  let preferenceAdjustment = clamp(Math.round((preferenceFit - 50) / 10), -8, 8)
  if (coreFit < 35) preferenceAdjustment = Math.min(0, preferenceAdjustment)
  else if (coreFit < 50) preferenceAdjustment = Math.min(2, preferenceAdjustment)
  const afterPreferences = rounded(coreFit + preferenceAdjustment)
  const posting = postingScores(job, asOf)
  const final = rounded(afterPreferences - posting.penalty)

  const features: RankingFeatureSnapshot = {
    schemaVersion: 1,
    eligibility,
    requirements,
    scores: {
      roleFunction,
      seniority: seniority.score,
      requiredCoverage,
      preferredCoverage,
      domainTransferability,
      evidenceDepth,
      coreFit,
      preferenceFit,
      preferenceAdjustment,
      postingConfidence: posting.confidence,
      postingPenalty: posting.penalty,
      final,
    },
    preferenceSignals,
    postingSignals: posting.signals,
  }
  const explanation = buildExplanation(features)
  explanation.postingConfidenceEffects = posting.effects
  const snapshot: RankingSnapshot = {
    schemaVersion: 1,
    rankingVersion: RANKING_MODEL_VERSION,
    requirementVersion: REQUIREMENT_MODEL_VERSION,
    explanationVersion: RANKING_EXPLANATION_VERSION,
    inputHash: rankingInputHash(job, profile, prefs, asOf),
    evaluatedAt: asOf,
    historical: false,
    features,
    explanation,
  }
  return { job, snapshot, excludedByKnownMismatch: knownMismatch }
}

export function compareRankingEvaluations(
  left: RankingEvaluation,
  right: RankingEvaluation,
): number {
  const leftScores = left.snapshot.features.scores
  const rightScores = right.snapshot.features.scores
  return (
    rightScores.final - leftScores.final ||
    rightScores.coreFit - leftScores.coreFit ||
    rightScores.postingConfidence - leftScores.postingConfidence ||
    compareNormalizedText(left.job.company, right.job.company) ||
    compareNormalizedText(left.job.title, right.job.title) ||
    compareNormalizedText(left.job.id, right.job.id)
  )
}

function compareNormalizedText(left: string, right: string): number {
  const a = normalized(left)
  const b = normalized(right)
  return a < b ? -1 : a > b ? 1 : 0
}

export function rankCandidateSetV2(
  jobs: NormalizedJob[],
  profile: Profile,
  prefs: Preferences,
  options: RankingOptions = {},
): RankingEvaluation[] {
  const asOf = validIso(options.asOf) ?? defaultAsOf(jobs)
  const allEvaluated = jobs.map((job) =>
    evaluateJobV2(job, profile, prefs, { ...options, asOf }))
  const includeKnownMismatches = options.includeKnownMismatches === true
  const evaluated = allEvaluated
    .filter((entry) => includeKnownMismatches || !entry.excludedByKnownMismatch)
    .sort(compareRankingEvaluations)
  // The hash identifies the set that is actually returned. Hashing every
  // evaluated job instead would give an ordinary run and a diagnostic run the
  // same identity while their ranks differ.
  const candidateSetHash = stableHash(stableSerialize({
    version: RANKING_MODEL_VERSION,
    asOf,
    includeKnownMismatches,
    jobs: evaluated
      .map((entry) => ({ id: entry.job.id, inputHash: entry.snapshot.inputHash }))
      .sort((left, right) => compareNormalizedText(left.id, right.id)),
  }))
  return evaluated.map((entry, index) => ({
    ...entry,
    snapshot: {
      ...entry.snapshot,
      candidateSetHash,
      rank: index + 1,
    },
  }))
}

function neutralHistoricalFeatures(score: number): RankingFeatureSnapshot {
  return {
    schemaVersion: 1,
    eligibility: [],
    requirements: [],
    scores: {
      roleFunction: score,
      seniority: 50,
      requiredCoverage: 50,
      preferredCoverage: 50,
      domainTransferability: 50,
      evidenceDepth: 50,
      coreFit: score,
      preferenceFit: 50,
      preferenceAdjustment: 0,
      postingConfidence: 50,
      postingPenalty: 0,
      final: score,
    },
    preferenceSignals: { salary: 50, location: 50, workMode: 50, contract: 50 },
    postingSignals: { source: 50, completeness: 50, freshness: 50, duplicateConfidence: 50 },
  }
}

function validRankingSnapshot(value: unknown): value is RankingSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<RankingSnapshot>
  return snapshot.schemaVersion === 1 &&
    typeof snapshot.rankingVersion === 'string' &&
    typeof snapshot.inputHash === 'string' &&
    Boolean(snapshot.features && snapshot.explanation)
}

/**
 * Normalize persisted matches for mixed-version history. A legacy score remains
 * exactly the score its original model produced; missing v2 features stay
 * explicitly unavailable rather than being recomputed under new semantics.
 */
export function normalizeHistoricalRanking(match: MatchResult): RankingSnapshot {
  if (validRankingSnapshot(match.ranking)) return structuredClone(match.ranking)
  const score = rounded(Number.isFinite(match.fitScore) ? match.fitScore : 0)
  return {
    schemaVersion: 1,
    rankingVersion: `historical:${match.modelVersion || 'unknown'}`,
    requirementVersion: 'historical:unavailable',
    explanationVersion: 'historical:unavailable',
    inputHash: stableHash(stableSerialize({
      jobId: match.jobId,
      fitScore: score,
      modelVersion: match.modelVersion,
      scoredAt: match.scoredAt,
    })),
    evaluatedAt: validIso(match.scoredAt) ?? new Date(0).toISOString(),
    historical: true,
    features: neutralHistoricalFeatures(score),
    explanation: {
      schemaVersion: 1,
      strongSignals: [],
      missingMustHaves: [],
      uncertainFacts: ['Feature-level inputs were not stored by this historical ranking model.'],
      preferenceEffects: ['Historical preference effects are unavailable.'],
      postingConfidenceEffects: ['Historical posting-confidence effects are unavailable.'],
      disclaimer: 'This historical score is preserved as originally produced and has not been reinterpreted.',
    },
  }
}