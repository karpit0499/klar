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
  const r = new Array<number>(xs.length)
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