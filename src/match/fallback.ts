import type {
  AiAssessmentProvenance,
  AiMatchAssessment,
  MatchResult,
  NormalizedJob,
  Preferences,
  Profile,
  RankingSnapshot,
} from '../types'
import { coverageReport } from '../resume/keywords'
import { evaluateJobV2 } from './rankingV2'
import { AI_MATCH_PROMPT_VERSION } from './rerank'

// Keep the established outer identifier for persisted tracker/cache consumers.
// The independently versioned `ranking` snapshot identifies ranking-v2.
export const LOCAL_MATCH_MODEL = 'local-v2.3'

export function buildLocalMatch(
  job: NormalizedJob,
  profile: Profile,
  prefs: Preferences,
  scoredAt: string = new Date().toISOString(),
  locale: 'en' | 'de' = 'en',
  ranking?: RankingSnapshot,
): MatchResult {
  const snapshot = ranking ?? evaluateJobV2(job, profile, prefs, { asOf: job.fetched_at }).snapshot
  const scores = snapshot.features.scores
  const coverage = coverageReport(job, profile)
  const skills = coverage.total ? Math.round(coverage.ratio * 100) : scores.requiredCoverage
  const salary = snapshot.features.preferenceSignals.salary
  const location = snapshot.features.preferenceSignals.location
  const seniority = scores.seniority
  const fitScore = scores.final
  const knownMismatches = snapshot.features.eligibility
    .filter((fact) => fact.status === 'known_mismatch')
    .map((fact) => fact.reason)
  const rationale = localRationale(snapshot, coverage.coveredCount, coverage.total, locale)
  return {
    jobId: job.id,
    fitScore,
    verdict:
      fitScore >= 75
        ? 'strong'
        : fitScore >= 55
          ? 'good'
          : fitScore >= 35
            ? 'stretch'
            : 'weak',
    rationale,
    matchedSkills: coverage.covered,
    missingSkills: coverage.missing,
    salaryFit: salaryVerdict(job, prefs),
    locationFit:
      job.location.remote
        ? 'remote'
        : location >= 80
          ? 'exact'
          : location <= 25
            ? 'mismatch'
            : 'commutable',
    seniorityFit: seniority >= 85 ? 'match' : detectedDirection(job, prefs),
    redFlags: knownMismatches,
    factors: { skills, salary, location, seniority },
    scoredAt,
    modelVersion: LOCAL_MATCH_MODEL,
    ranking: snapshot,
  }
}

export function isLocalMatch(match: MatchResult): boolean {
  return match.modelVersion.startsWith('local-')
}

export function hasAiAssessment(match: MatchResult): boolean {
  return Boolean(match.aiAssessment)
}

/**
 * Preserve the provider's genuinely independent result under `aiAssessment`.
 * The outer row remains the reproducible score Klar uses for ordering. Keeping
 * the two values separate prevents the v2.6 bug where the UI labelled a local
 * score as AI after the provider's numeric result had been overwritten.
 */
export function mergeAiExplanationWithLocal(
  local: MatchResult,
  ai: MatchResult,
): MatchResult {
  return {
    ...local,
    // Be idempotent at UI/cache boundaries. Some callers receive a result that
    // is already separated; treating its outer deterministic row as a fresh AI
    // row would recreate the v2.6 identical-score defect.
    aiAssessment: ai.aiAssessment
      ? cloneAiAssessment(ai.aiAssessment)
      : toAiAssessment(ai),
  }
}

function cloneAiAssessment(ai: AiMatchAssessment): AiMatchAssessment {
  return {
    ...ai,
    matchedSkills: [...ai.matchedSkills],
    missingSkills: [...ai.missingSkills],
    redFlags: [...ai.redFlags],
    factors: ai.factors ? { ...ai.factors } : undefined,
    provenance: { ...ai.provenance },
  }
}

function toAiAssessment(ai: MatchResult): AiMatchAssessment {
  return {
    schemaVersion: 1,
    promptVersion: AI_MATCH_PROMPT_VERSION,
    fitScore: ai.fitScore,
    verdict: ai.verdict,
    rationale: ai.rationale,
    matchedSkills: [...ai.matchedSkills],
    missingSkills: [...ai.missingSkills],
    salaryFit: ai.salaryFit,
    locationFit: ai.locationFit,
    seniorityFit: ai.seniorityFit,
    redFlags: [...ai.redFlags],
    factors: ai.factors ? { ...ai.factors } : undefined,
    confidence: ai.confidence,
    scoredAt: ai.scoredAt,
    modelVersion: ai.modelVersion,
    provenance: ai.aiProvenance ?? defaultAiProvenance(),
  }
}

function defaultAiProvenance(): AiAssessmentProvenance {
  return {
    scorerVersion: 'unknown',
    promptVersion: AI_MATCH_PROMPT_VERSION,
    responseSchemaVersion: 'unknown',
    engineHost: 'unknown',
    cacheStatus: 'fresh',
    locale: 'en',
  }
}

function localRationale(
  snapshot: RankingSnapshot,
  covered: number,
  total: number,
  locale: 'en' | 'de',
): string {
  const missing = snapshot.explanation.missingMustHaves.length
  const unknown = snapshot.explanation.uncertainFacts.length
  if (locale === 'de') {
    const evidence = total
      ? `${covered} von ${total} erkannten Fachbegriffen sind im bestätigten Profil belegt`
      : 'Rollenbezug und bestätigte Profilevidenz wurden lokal bewertet'
    return `Private lokale, reproduzierbare Bewertung: ${evidence}. ` +
      `${missing} fehlende Muss-Anforderung(en), ${unknown} unbekannte Angabe(n); ` +
      `Anzeigenvertrauen wird getrennt ausgewiesen.`
  }
  const evidence = total
    ? `${covered} of ${total} detected skill terms are evidenced in the confirmed profile`
    : 'role alignment and confirmed profile evidence were evaluated locally'
  return `Private local reproducible score: ${evidence}. ` +
    `${missing} missing must-have(s), ${unknown} unknown fact(s); ` +
    `posting confidence is accounted for separately.`
}

function salaryVerdict(
  job: NormalizedJob,
  prefs: Preferences,
): NonNullable<MatchResult['salaryFit']> {
  const preferred = finitePositive(prefs.salary.min)
  const min = finitePositive(job.salary.min)
  const max = finitePositive(job.salary.max)
  if (
    preferred == null ||
    (min == null && max == null) ||
    (job.salary.currency && job.salary.currency.toUpperCase() !== prefs.salary.currency)
  ) return 'unknown'
  const annualPreference = prefs.salary.period === 'month' ? preferred * 12 : preferred
  const multiplier = job.salary.period === 'month' ? 12 : job.salary.period === 'hour' ? 2080 : 1
  const annualMin = min == null ? undefined : min * multiplier
  const annualMax = max == null ? undefined : max * multiplier
  const lower = annualMin ?? annualMax
  const upper = annualMax ?? annualMin
  if (lower == null || upper == null || !Number.isFinite(lower) || !Number.isFinite(upper)) {
    return 'unknown'
  }
  if (annualMin != null && lower >= annualPreference * 1.1) return 'above'
  if (upper >= annualPreference) return 'in-range'
  return 'below'
}

function finitePositive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

function detectedDirection(
  job: NormalizedJob,
  prefs: Preferences,
): MatchResult['seniorityFit'] {
  const order: Preferences['seniority'][] = ['intern', 'junior', 'mid', 'senior', 'lead', 'exec']
  const value = `${job.seniority ?? ''} ${job.title}`.toLowerCase()
  const detected: Preferences['seniority'] | undefined =
    /\b(chief|ceo|cto|cfo|president|vice president|vp|director)\b/.test(value)
      ? 'exec'
      : /\b(lead|head|team lead)\b/.test(value)
        ? 'lead'
        : /\b(senior|sr|staff|principal|expert)\b/.test(value)
          ? 'senior'
          : /\b(junior|jr|entry level|graduate|associate)\b/.test(value)
            ? 'junior'
            : /\b(intern|internship|trainee|praktikant|praktikum|werkstudent)\b/.test(value)
              ? 'intern'
              : job.seniority
                ? 'mid'
                : undefined
  if (!detected) return undefined
  const found = order.indexOf(detected)
  const wanted = order.indexOf(prefs.seniority)
  return found === wanted ? 'match' : found > wanted ? 'over' : 'under'
}
