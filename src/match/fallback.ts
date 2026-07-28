import type { MatchResult, NormalizedJob, Preferences, Profile } from '../types'
import { scoreJob } from './prefilter'

export const LOCAL_MATCH_MODEL = 'local-v2.3'

export function buildLocalMatch(
  job: NormalizedJob,
  profile: Profile,
  prefs: Preferences,
  scoredAt: string = new Date().toISOString(),
): MatchResult {
  const fitScore = Math.max(0, Math.min(100, Math.round(scoreJob(job, profile, prefs))))
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
    rationale: 'Private local relevance score. AI details may replace it when available.',
    matchedSkills: profile.skills
      .map((skill) => skill.name)
      .filter((skill) => job.description.toLowerCase().includes(skill.toLowerCase())),
    missingSkills: [],
    redFlags: [],
    scoredAt,
    modelVersion: LOCAL_MATCH_MODEL,
  }
}

export function isLocalMatch(match: MatchResult): boolean {
  return match.modelVersion === LOCAL_MATCH_MODEL
}