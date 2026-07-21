// ============================================================================
// Async embedder seam + optional neural embedder (feature 19).
//
// The v1 `TextEmbedder` seam is SYNCHRONOUS (a hashing vector-space model). A
// neural embedder is inherently ASYNC (model inference), so we add an
// `AsyncTextEmbedder` interface and async ranking helpers, plus `syncToAsync`
// to lift the existing hashing embedder into the same shape. That lets the
// comparison harness (feature 18) score hashing and neural on equal footing.
//
// HONEST EXPECTATION (from the spec): the LLM already does the FINAL ranking, so
// a neural pre-filter only improves RECALL — catching relevant postings the
// hashing model misses on vocabulary/cross-lingual mismatch. The multilingual
// model is a ~100 MB+ browser download with added latency. SHIP ONLY IF feature
// 18 shows a real gain on the gold set.
//
// The transformers.js dependency is loaded via a DYNAMIC import with a
// non-literal specifier, so this module typechecks WITHOUT the package
// installed. To actually use it: `npm i @huggingface/transformers`.
// ============================================================================
import type { NormalizedJob, Preferences, Profile } from '../types'
import { cosineSim, l2normalize, tokenize, type TextEmbedder } from './embeddings'
import { buildQueryText, jobText, type Scored } from './semantic'

/** Anything that turns text into a fixed-length numeric vector, asynchronously. */
export type AsyncTextEmbedder = {
  id: string
  dim: number
  embed: (text: string) => Promise<number[]>
}

/** Lift a synchronous embedder (e.g. the hashing one) into the async shape. */
export function syncToAsync(e: TextEmbedder): AsyncTextEmbedder {
  return { id: e.id, dim: e.dim, embed: async (t: string) => e.embed(t) }
}

/**
 * A character-trigram TF vector-space embedder — a real ALTERNATIVE retrieval
 * method that runs fully offline. Subword overlap makes it more robust to
 * morphology and partial cross-lingual matches than whole-word hashing, so it's
 * a useful stand-in "candidate" for the comparison harness when you don't want a
 * 100 MB neural download in CI. Deterministic → unit-testable.
 */
export function makeCharNgramEmbedder(dim = 512, n = 3): AsyncTextEmbedder {
  const hash = (s: string): number => {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
    }
    return h >>> 0
  }
  return {
    id: `char-ngram-v1-${n}-${dim}`,
    dim,
    async embed(text: string): Promise<number[]> {
      const vec = new Array<number>(dim).fill(0)
      for (const tok of tokenize(text)) {
        const padded = `#${tok}#`
        for (let i = 0; i + n <= padded.length; i++) {
          const gram = padded.slice(i, i + n)
          vec[hash(gram) % dim] += 1
        }
      }
      return l2normalize(vec)
    },
  }
}

/**
 * The real neural embedder (feature 19). Lazy-loads transformers.js and runs a
 * multilingual sentence-embedding model in the browser. Returns an
 * AsyncTextEmbedder so it plugs into the same ranking + comparison paths.
 * Requires `@huggingface/transformers` (loaded on first use).
 */
export function makeNeuralEmbedder(
  model = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  dim = 384,
): AsyncTextEmbedder {
  let extractorPromise: Promise<(text: string, opts: unknown) => Promise<{ data: Float32Array | number[] }>> | null = null

  async function getExtractor() {
    if (!extractorPromise) {
      // Non-literal specifier → typechecks without the package installed.
      const pkg = '@huggingface/transformers'
      extractorPromise = (async () => {
        const mod: { pipeline: (task: string, model: string) => Promise<unknown> } =
          await import(/* @vite-ignore */ pkg)
        return (await mod.pipeline('feature-extraction', model)) as (
          text: string, opts: unknown,
        ) => Promise<{ data: Float32Array | number[] }>
      })()
    }
    return extractorPromise
  }

  return {
    id: `neural-${model}`,
    dim,
    async embed(text: string): Promise<number[]> {
      const extractor = await getExtractor()
      // Mean-pool + normalize gives one fixed-length vector per input.
      const out = await extractor(text.slice(0, 4000), { pooling: 'mean', normalize: true })
      return Array.from(out.data as ArrayLike<number>)
    },
  }
}

// --- Async ranking helpers (mirror the sync ones in semantic.ts) --------------

/** Rank jobs by cosine similarity to the query, using an async embedder. */
export async function scoreBySimilarityAsync(
  jobs: NormalizedJob[],
  profile: Profile,
  prefs: Preferences,
  embedder: AsyncTextEmbedder,
): Promise<Scored[]> {
  const queryVec = await embedder.embed(buildQueryText(profile, prefs))
  const scored: Scored[] = []
  for (const job of jobs) {
    scored.push({ job, score: cosineSim(queryVec, await embedder.embed(jobText(job))) })
  }
  return scored.sort((a, b) => b.score - a.score)
}

/** Async semantic pre-filter: rank by an async embedder, keep the top `limit`. */
export async function semanticPrefilterAsync(
  jobs: NormalizedJob[],
  profile: Profile,
  prefs: Preferences,
  limit: number,
  embedder: AsyncTextEmbedder,
): Promise<NormalizedJob[]> {
  const survivors = jobs.filter((j) => {
    if (prefs.remoteOnly && !j.location.remote) return false
    if (prefs.dealbreakers.length) {
      const hay = `${j.title} ${j.company} ${j.description}`.toLowerCase()
      if (prefs.dealbreakers.some((d) => d.trim() && hay.includes(d.toLowerCase()))) return false
    }
    return true
  })
  const scored = await scoreBySimilarityAsync(survivors, profile, prefs, embedder)
  return scored.slice(0, limit).map((s) => s.job)
}