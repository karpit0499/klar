// ============================================================================
// Embedder comparison harness (feature 18): score the current hashing pre-filter
// AGAINST a candidate embedder (neural, or the char-ngram stand-in) on the SAME
// hand-labelled gold set, reporting precision@k + Spearman for each. This is the
// GATE for feature 19 — it proves whether a heavier embedder actually retrieves
// better BEFORE you pay the 100 MB download. "I measured the retrieval upgrade"
// beats "I added embeddings."
//
// Works with AsyncTextEmbedder so hashing (lifted via syncToAsync), char-ngram,
// and the real neural model all compare on equal footing. Pure logic around the
// embedders → the machinery is unit-testable offline; only the neural embedder
// needs a download, which is exactly the point of the gate.
// ============================================================================
import type { NormalizedJob, Preferences, Profile } from '../types'
import { cosineSim } from './embeddings'
import { buildQueryText, jobText } from './semantic'
import { precisionAtK, spearman } from './evalMetrics'
import type { AsyncTextEmbedder } from './neuralEmbedder'

export type GoldItem = { job: NormalizedJob; label: number } // label 0–3
export type EmbedderMetrics = {
  id: string
  precisionAt3: number
  precisionAt5: number
  spearman: number
}

/** Score one embedder against the gold set. */
export async function evaluateEmbedder(
  embedder: AsyncTextEmbedder,
  gold: GoldItem[],
  profile: Profile,
  prefs: Preferences,
  relevantThreshold = 2,
): Promise<EmbedderMetrics> {
  const queryVec = await embedder.embed(buildQueryText(profile, prefs))
  const scored = []
  for (const g of gold) {
    scored.push({ label: g.label, score: cosineSim(queryVec, await embedder.embed(jobText(g.job))) })
  }
  const ranked = [...scored].sort((a, b) => b.score - a.score).map((s) => s.label)
  return {
    id: embedder.id,
    precisionAt3: precisionAtK(ranked, 3, relevantThreshold),
    precisionAt5: precisionAtK(ranked, 5, relevantThreshold),
    spearman: spearman(scored.map((s) => s.score), scored.map((s) => s.label)),
  }
}

export type ComparisonResult = {
  baseline: EmbedderMetrics       // the incumbent (hashing)
  candidate: EmbedderMetrics      // the challenger (neural / char-ngram)
  /** Composite delta the gate is decided on (mean of the metric gains). */
  improvement: number
  /** The ship recommendation: true → the candidate is worth its cost. */
  recommendCandidate: boolean
  reason: string
}

/**
 * Compare a baseline vs. a candidate embedder and produce a ship recommendation.
 * `minImprovement` is the bar the candidate must clear (default: a small but
 * real average gain) — the neural download is only justified above it.
 */
export async function compareEmbedders(
  baseline: AsyncTextEmbedder,
  candidate: AsyncTextEmbedder,
  gold: GoldItem[],
  profile: Profile,
  prefs: Preferences,
  minImprovement = 0.05,
): Promise<ComparisonResult> {
  const b = await evaluateEmbedder(baseline, gold, profile, prefs)
  const c = await evaluateEmbedder(candidate, gold, profile, prefs)
  const improvement =
    ((c.precisionAt3 - b.precisionAt3) + (c.precisionAt5 - b.precisionAt5) + (c.spearman - b.spearman)) / 3
  const recommendCandidate = improvement >= minImprovement
  return {
    baseline: b,
    candidate: c,
    improvement,
    recommendCandidate,
    reason: recommendCandidate
      ? `Candidate improves retrieval by ${(improvement * 100).toFixed(1)}% on average — the download is justified.`
      : `Candidate gains only ${(improvement * 100).toFixed(1)}% on average — below the ${(minImprovement * 100).toFixed(0)}% bar; keep the free hashing pre-filter.`,
  }
}