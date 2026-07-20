// ============================================================================
// Explainable & correctable scoring (feature 1.3).
//
// The LLM returns a holistic `fitScore` AND four per-factor sub-scores
// (skills / salary / location / seniority). The number the UI ranks by is a
// COMPOSITE: a weighted average of those four factors using weights the user
// controls. Because the factors are cached with each MatchResult, changing the
// weights re-ranks instantly — no new LLM call. That is what makes the score
// both explainable ("here's what drove it") and correctable ("I don't care
// about salary → drag it to zero").
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
 * The composite 0–100 score used for ranking. If a result has no per-factor
 * breakdown (an older cached score, or a failed batch), we fall back to the
 * model's holistic fitScore so ranking still works.
 */
export function compositeScore(match: MatchResult, weights: ScoreWeights): number {
  if (!match.factors) return match.fitScore
  const w = normalizeWeights(weights)
  const f = match.factors
  const raw =
    f.skills * w.skills + f.salary * w.salary + f.location * w.location + f.seniority * w.seniority
  return Math.max(0, Math.min(100, Math.round(raw)))
}

/** Are these weights different from the defaults (i.e. has the user customized them)? */
export function weightsAreCustom(w: ScoreWeights | undefined): boolean {
  if (!w) return false
  return FACTOR_KEYS.some((k) => Math.abs((w[k] || 0) - DEFAULT_WEIGHTS[k]) > 0.001)
}