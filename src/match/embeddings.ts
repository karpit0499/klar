// ============================================================================
// Text embeddings + cosine similarity for the semantic pre-filter (feature 1.4).
//
// The DEFAULT embedder here is a dependency-free, fully client-side term-
// frequency vector-space model: it hashes word tokens into a fixed-size vector
// (feature hashing) and L2-normalizes it. Ranking by cosine similarity of those
// vectors is the classic vector-space retrieval model — no API call, no model
// download, and completely deterministic (so it's unit-testable).
//
// It is NOT neural "semantic" embedding — it matches on shared vocabulary, not
// meaning. The `TextEmbedder` interface is the seam: to get true semantic
// matching, drop in a neural embedder (e.g. transformers.js `all-MiniLM-L6-v2`
// in the browser, or an embeddings API) that satisfies the same interface. The
// rest of the pipeline (ranking, caching) doesn't change.
// ============================================================================

/** Anything that turns text into a fixed-length numeric vector. */
export type TextEmbedder = {
  /** Stable id + dimension so cached vectors from a different embedder are ignored. */
  id: string
  dim: number
  embed: (text: string) => number[]
}

/** Lowercase, split on non-letters/digits, drop very short tokens. */
export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length > 2)
}

/** FNV-1a 32-bit hash → used to map a token to a vector bucket. */
function hashToken(token: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

/** Build the default hashing embedder with `dim` buckets (power of two is fine). */
export function makeHashingEmbedder(dim = 512): TextEmbedder {
  return {
    id: `hashing-tf-v1-${dim}`,
    dim,
    embed(text: string): number[] {
      const vec = new Array<number>(dim).fill(0)
      for (const tok of tokenize(text)) {
        const h = hashToken(tok)
        const bucket = h % dim
        // A second hash bit decides sign, which reduces bucket-collision bias.
        const sign = (h & 0x80000000) !== 0 ? -1 : 1
        vec[bucket] += sign
      }
      return l2normalize(vec)
    },
  }
}

/** The app's default embedder instance. */
export const defaultEmbedder: TextEmbedder = makeHashingEmbedder(512)

/** Scale a vector to unit length so dot product == cosine similarity. */
export function l2normalize(vec: number[]): number[] {
  let sum = 0
  for (const v of vec) sum += v * v
  const norm = Math.sqrt(sum)
  if (norm === 0) return vec
  return vec.map((v) => v / norm)
}

/** Cosine similarity of two vectors. Returns 0 for a length mismatch. */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}