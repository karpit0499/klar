// ============================================================================
// Aggregated skill-gap analysis (feature 1.1).
//
// The matcher already produces `missingSkills` per job. On its own that's just
// chips on a card. Rolling those up across the whole ranked set turns the data
// into the headline insight the app advertises:
//   "Kubernetes is missing in 14 of your top 20 matches — your #1 gap."
// Pure and deterministic, so it's trivially unit-testable.
// ============================================================================
import type { MatchResult } from '../types'

export type SkillGap = {
  skill: string          // canonical (display) spelling
  count: number          // how many of the considered matches list this gap
  share: number          // count / considered, 0–1
}

export type GapSummary = {
  considered: number     // how many matches went into the roll-up
  gaps: SkillGap[]       // most-frequent gaps first
}

/** Fold near-duplicate skill spellings together ("k8s" vs "Kubernetes" stay
 *  separate — we only normalize case/whitespace, not synonyms). */
function canonicalKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Roll `missingSkills` up across the top `topN` matches (by array order, which
 * the caller has already sorted best-first). Returns the most-frequently
 * missing skills with their counts and the share of matches each one blocks.
 */
export function aggregateGaps(matches: MatchResult[], topN = 20): GapSummary {
  const considered = Math.min(topN, matches.length)
  const slice = matches.slice(0, considered)

  const counts = new Map<string, { display: string; count: number }>()
  for (const m of slice) {
    // Count each distinct gap at most once per job.
    const seen = new Set<string>()
    for (const raw of m.missingSkills ?? []) {
      const key = canonicalKey(raw)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const entry = counts.get(key)
      if (entry) entry.count++
      else counts.set(key, { display: raw.trim(), count: 1 })
    }
  }

  const gaps: SkillGap[] = Array.from(counts.values())
    .map((e) => ({ skill: e.display, count: e.count, share: considered ? e.count / considered : 0 }))
    // Most frequent first; ties broken alphabetically for stable output.
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))

  return { considered, gaps }
}