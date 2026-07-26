// ============================================================================
// Explainable & correctable scoring (feature 1.3).
//
// The LLM returns a holistic `fitScore` AND four per-factor sub-scores
// (skills / salary / location / seniority). The number the UI ranks by is a
// COMPOSITE: the holistic role/market fit plus a weighted average of the four
// user-correctable factors. Keeping the holistic signal prevents a secondary
// résumé skill from making an unrelated role outrank the requested career.
// ============================================================================
import type { MatchResult, ScoreWeights } from '../types'

/** Sensible defaults: skills dominate, then location, then salary/seniority. */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  skills: 0.5,
  salary: 0.15,
  location: 0.2,
  seniority: 0.15,
}

/** The four factor keys, in display order. */
export const FACTOR_KEYS: (keyof ScoreWeights)[] = ['skills', 'salary', 'location', 'seniority']

/** Normalize weights to sum to 1 (so a composite stays on a 0–100 scale). */
export function normalizeWeights(w: ScoreWeights): ScoreWeights {
  const total = FACTOR_KEYS.reduce((s, k) => s + Math.max(0, w[k] || 0), 0)
  if (total <= 0) return { ...DEFAULT_WEIGHTS }
  return {
    skills: Math.max(0, w.skills) / total,
    salary: Math.max(0, w.salary) / total,
    location: Math.max(0, w.location) / total,
    seniority: Math.max(0, w.seniority) / total,
  }
}

/**
 * The composite 0–100 score used for ranking. Holistic role/market fit is 60%;
 * the four adjustable factors share the remaining 40%. If a result has no
 * factor breakdown, use its holistic score unchanged.
 */
export function compositeScore(match: MatchResult, weights: ScoreWeights): number {
  if (!match.factors) return match.fitScore
  const w = normalizeWeights(weights)
  const f = match.factors
  const raw =
    f.skills * w.skills + f.salary * w.salary + f.location * w.location + f.seniority * w.seniority
  return Math.max(0, Math.min(100, Math.round(match.fitScore * 0.6 + raw * 0.4)))
}

/** Are these weights different from the defaults (i.e. has the user customized them)? */
export function weightsAreCustom(w: ScoreWeights | undefined): boolean {
  if (!w) return false
  return FACTOR_KEYS.some((k) => Math.abs((w[k] || 0) - DEFAULT_WEIGHTS[k]) > 0.001)
}
