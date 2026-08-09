// ============================================================================
// Reusable ranking-evaluation metrics (feature 18). These were previously local
// to test/eval.test.ts; factoring them out lets the embedder-comparison harness
// (and any future eval) score rankings the same way. All pure + deterministic.
// ============================================================================

/** Fraction of the top-k ranked items whose label meets `threshold`. */
export function precisionAtK(rankedLabels: number[], k: number, threshold: number): number {
  const top = rankedLabels.slice(0, k)
  if (top.length === 0) return 0
  return top.filter((l) => l >= threshold).length / top.length
}

/** Average-tie ranks of an array (1 = smallest). */
export function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x)
  const r = Array.from({ length: xs.length }, () => 0)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1].x === order[i].x) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[order[k].i] = avg
    i = j + 1
  }
  return r
}

export function pearson(a: number[], b: number[]): number {
  const n = a.length
  if (n === 0) return 0
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, dbb = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb
    num += x * y; da += x * x; dbb += y * y
  }
  return da === 0 || dbb === 0 ? 0 : num / Math.sqrt(da * dbb)
}

/** Spearman rank correlation between two score vectors. */
export function spearman(a: number[], b: number[]): number {
  return pearson(ranks(a), ranks(b))
}

/** Discounted cumulative gain using the conventional exponential relevance gain. */
export function dcgAtK(labels: number[], k: number): number {
  if (!Number.isInteger(k) || k <= 0) return 0
  return labels.slice(0, k).reduce((sum, label, index) => {
    const gain = 2 ** Math.max(0, label) - 1
    return sum + gain / Math.log2(index + 2)
  }, 0)
}

/** Normalized DCG. Empty/all-zero judgments return 0 instead of NaN. */
export function ndcgAtK(rankedLabels: number[], k: number): number {
  const actual = dcgAtK(rankedLabels, k)
  const ideal = dcgAtK([...rankedLabels].sort((a, b) => b - a), k)
  return ideal > 0 ? actual / ideal : 0
}

/** Reciprocal rank of the first result at or above the relevance threshold. */
export function reciprocalRank(
  rankedLabels: number[],
  threshold = 2,
): number {
  const index = rankedLabels.findIndex((label) => label >= threshold)
  return index < 0 ? 0 : 1 / (index + 1)
}

export function meanReciprocalRank(
  rankings: number[][],
  threshold = 2,
): number {
  if (!rankings.length) return 0
  return rankings.reduce((sum, labels) => sum + reciprocalRank(labels, threshold), 0) /
    rankings.length
}

export type PairwisePreference = {
  preferredId: string
  otherId: string
}

/**
 * Agreement with adjudicated pairwise preferences. Ties count as disagreement:
 * a ranking model must make the preferred item strictly better.
 */
export function pairwiseAgreement(
  scoreById: ReadonlyMap<string, number>,
  preferences: PairwisePreference[],
): number {
  if (!preferences.length) return 0
  let agreed = 0
  let evaluated = 0
  for (const preference of preferences) {
    const preferred = scoreById.get(preference.preferredId)
    const other = scoreById.get(preference.otherId)
    if (preferred == null || other == null) continue
    evaluated += 1
    if (preferred > other) agreed += 1
  }
  return evaluated ? agreed / evaluated : 0
}

/** Fraction of inspected top-k rows with a confirmed hard-constraint mismatch. */
export function hardConstraintViolationRate(
  ranked: { knownHardMismatch: boolean }[],
  k: number,
): number {
  if (!Number.isInteger(k) || k <= 0) return 0
  const top = ranked.slice(0, k)
  if (!top.length) return 0
  return top.filter((entry) => entry.knownHardMismatch).length / top.length
}
