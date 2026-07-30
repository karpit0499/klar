import type { MatchResult, NormalizedJob, Preferences, Profile } from '../types'
import { normalizeKey } from '../lib/hash'
import { coverageReport } from '../resume/keywords'
import { scoreJob } from './prefilter'

// Keep the established identifier: trackers and regression fixtures persist it.
export const LOCAL_MATCH_MODEL = 'local-v2.3'

export function buildLocalMatch(
  job: NormalizedJob,
  profile: Profile,
  prefs: Preferences,
  scoredAt: string = new Date().toISOString(),
  locale: 'en' | 'de' = 'en',
): MatchResult {
  const fitScore = Math.max(0, Math.min(100, Math.round(scoreJob(job, profile, prefs))))
  const coverage = coverageReport(job, profile)
  const skills = coverage.total ? Math.round(coverage.ratio * 100) : fitScore
  const salary = salaryAssessment(job, prefs)
  const location = locationFactor(job, prefs)
  const seniority = seniorityAssessment(job, prefs)
  const rationale = locale === 'de'
    ? coverage.total
      ? `Private lokale Bewertung: ${coverage.coveredCount} von ${coverage.total} erkannten Fachbegriffen sind im bestätigten Profil belegt.`
      : 'Private lokale Bewertung anhand von Rollenbezug, Arbeitsort, Aktualität und bestätigtem Profil.'
    : coverage.total
      ? `Private local score: ${coverage.coveredCount} of ${coverage.total} detected skill terms are evidenced in the confirmed profile.`
      : 'Private local score based on role relevance, location, recency, and the confirmed profile.'
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
    salaryFit: salary.fit,
    locationFit:
      job.location.remote
        ? 'remote'
        : location >= 75
          ? 'exact'
          : location <= 25
            ? 'mismatch'
            : 'commutable',
    seniorityFit: seniority.fit,
    redFlags: [],
    factors: { skills, salary: salary.score, location, seniority: seniority.score },
    scoredAt,
    modelVersion: LOCAL_MATCH_MODEL,
  }
}

export function isLocalMatch(match: MatchResult): boolean {
  return match.modelVersion.startsWith('local-')
}

function salaryAssessment(
  job: NormalizedJob,
  prefs: Preferences,
): { score: number; fit: NonNullable<MatchResult['salaryFit']> } {
  const preferred = prefs.salary.min
  const min = finitePositive(job.salary.min)
  const max = finitePositive(job.salary.max)
  if (
    !Number.isFinite(preferred) ||
    preferred == null ||
    preferred <= 0 ||
    (min == null && max == null) ||
    (
      job.salary.currency != null &&
      job.salary.currency.toUpperCase() !== prefs.salary.currency.toUpperCase()
    )
  ) {
    return { score: 50, fit: 'unknown' }
  }
  const annualPreference =
    prefs.salary.period === 'month'
      ? preferred * 12
      : preferred
  const multiplier =
    job.salary.period === 'month'
      ? 12
      : job.salary.period === 'hour'
        ? 40 * 52
        : 1
  const annualMin = min == null ? undefined : min * multiplier
  const annualMax = max == null ? undefined : max * multiplier
  if (
    !Number.isFinite(annualPreference) ||
    annualPreference <= 0 ||
    (annualMin != null && !Number.isFinite(annualMin)) ||
    (annualMax != null && !Number.isFinite(annualMax))
  ) {
    return { score: 50, fit: 'unknown' }
  }
  const lower = annualMin ?? annualMax!
  const upper = annualMax ?? annualMin!
  if (annualMin != null && lower >= annualPreference * 1.1) {
    return { score: 100, fit: 'above' }
  }
  if (annualMin != null && lower >= annualPreference) {
    return { score: 100, fit: 'in-range' }
  }
  if (upper >= annualPreference) {
    const representative = annualMin == null ? upper : (lower + upper) / 2
    return {
      score: Math.max(0, Math.min(100, Math.round((representative / annualPreference) * 100))),
      fit: 'in-range',
    }
  }
  return {
    score: Math.max(0, Math.min(100, Math.round((upper / annualPreference) * 100))),
    fit: 'below',
  }
}

function finitePositive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

function locationFactor(job: NormalizedJob, prefs: Preferences): number {
  if (job.location.remote) return prefs.remoteOnly || prefs.hybridOk ? 100 : 80
  if (prefs.remoteOnly) return 0
  const city = normalizeKey(job.location.city ?? '')
  const wanted = prefs.locations.map((location) => normalizeKey(location.city)).filter(Boolean)
  return city && wanted.some((target) => city === target || city.includes(target) || target.includes(city))
    ? 100
    : 55
}

const SENIORITY_PATTERNS: {
  level: Preferences['seniority']
  pattern: RegExp
}[] = [
  { level: 'intern', pattern: /\b(intern|internship|trainee|praktikant|praktikum|werkstudent)\b/ },
  { level: 'junior', pattern: /\b(junior|jr|entry level|graduate|associate)\b/ },
  { level: 'exec', pattern: /\b(chief|ceo|cto|cfo|president|vice president|vp|director|direktor|geschaftsfuhrer|vorstand)\b/ },
  { level: 'lead', pattern: /\b(lead|head|team lead|teamleiter|leitung|leiter)\b/ },
  { level: 'senior', pattern: /\b(senior|sr|staff|principal|expert)\b/ },
  { level: 'mid', pattern: /\b(mid|mid level|professional)\b/ },
]

function seniorityAssessment(
  job: NormalizedJob,
  prefs: Preferences,
): { score: number; fit?: MatchResult['seniorityFit'] } {
  const order: Preferences['seniority'][] = ['intern', 'junior', 'mid', 'senior', 'lead', 'exec']
  const wanted = order.indexOf(prefs.seniority)
  const haystack = normalizeKey(`${job.seniority ?? ''} ${job.title}`)
  const detected = SENIORITY_PATTERNS.find(({ pattern }) => pattern.test(haystack))?.level
  const found = detected ? order.indexOf(detected) : -1
  if (found < 0 || wanted < 0) return { score: 60 }
  return {
    score: Math.max(0, 100 - Math.abs(found - wanted) * 30),
    fit: found === wanted ? 'match' : found > wanted ? 'over' : 'under',
  }
}