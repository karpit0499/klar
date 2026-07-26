// ============================================================================
// App-wide configuration. Values that a self-hoster might change live here.
// ============================================================================

/**
 * Base URL of YOUR deployed Cloudflare Worker (Phase 0), WITHOUT a trailing slash.
 * BA and Adzuna job-source calls are proxied through it because they lack CORS.
 * Default Groq requests also use its fixed relay for reliable browser support.
 * In local dev with `wrangler dev` this is typically http://127.0.0.1:8787.
 *
 * We read it from a Vite env var so you never hard-code it:
 *   - create `.env.local` with  VITE_WORKER_URL=https://klar-proxy.<you>.workers.dev
 */
// Read the Vite env var, falling back to a global (used by the test runner /
// any non-Vite context where import.meta.env is absent).
const viteEnv = (import.meta as { env?: ImportMetaEnv }).env
const workerFromEnv =
  viteEnv?.VITE_WORKER_URL ??
  (globalThis as { VITE_WORKER_URL?: string }).VITE_WORKER_URL
export const WORKER_URL: string = (workerFromEnv || '').replace(/\/$/, '')

/**
 * Groq (LLM) — the DEFAULT engine. When VITE_WORKER_URL is configured, its
 * requests use Klar's fixed browser-safe relay; otherwise self-hosted builds
 * retain the direct-browser fallback.
 *
 * v2.5 note: these are now DEFAULTS, not the only option. `src/llm/provider.ts`
 * stores a user-configurable `EngineSettings` (base URL + models) that seeds
 * itself from this object, so any OpenAI-compatible endpoint can be used without
 * editing code. Change these constants only if you want a different default for
 * every fresh install.
 */
export const GROQ = {
  baseUrl: 'https://api.groq.com/openai/v1',
  /**
   * Model ID. Groq rotates its catalogue often — verify the current list at
   * https://console.groq.com/docs/models and change this one constant if needed.
   * (Settings › AI engine can also list the ids the endpoint really serves.)
   * The 120B model gives the best parse/matching quality on the free tier.
   */
  model: 'openai/gpt-oss-120b',
  /** A smaller/faster fallback you can switch to for speed over quality. */
  fastModel: 'openai/gpt-oss-20b',
} as const

/** Matching tuning knobs (Phase 5). */
export const MATCH = {
  candidateLimit: 40,      // max jobs sent to the LLM after pre-filter
  batchSize: 5,            // jobs per LLM call
  descriptionChars: 1500,  // truncate each description before scoring
  /**
   * v2.4.3: stop the batch loop after this many consecutive failures. A rate
   * limit does not clear inside one search, so firing the remaining batches only
   * burns request quota. Klar already shows an honest partial-results notice.
   */
  maxConsecutiveBatchFailures: 2,
} as const

/**
 * v2.4.3 · Prompt size limits.
 *
 * The job description is the single largest variable part of a request. German
 * postings routinely run 3,000–9,000 characters, and most of the tail is
 * benefits and legal boilerplate. The role and duties are at the START, so a
 * bounded excerpt from the beginning keeps the signal and drops the padding.
 */
export const PROMPT = {
  /** Characters of the description sent with a résumé rewrite. */
  jobExcerptChars: 1200,
  /** Characters of the description sent with a cover letter (needs a little more tone). */
  letterExcerptChars: 1600,
} as const

/**
 * v2.4.3 · Token budget.
 *
 * `billed = input tokens + reserved max_tokens`, and the reservation counts
 * whether the model uses it or not. `assumedTpm` is a deliberately conservative
 * default matching the smallest common free-tier tokens-per-minute allowance;
 * Klar replaces it with the provider's real number the first time a provider
 * reports one in an error body (see src/llm/budget.ts).
 */
export const BUDGET = {
  assumedTpm: 8000,
  minReservedTokens: 512,
  maxReservedTokens: 4096,
} as const

/** v2.5 · WS2 — the cached LLM job-requirement extractor. */
export const JD_TERMS = {
  /** How many extracted requirement sets to keep (LRU, oldest evicted). */
  cacheLimit: 40,
  /** Hard cap on requirements kept from one posting, after sanitising. */
  maxTerms: 12,
  /** Characters of the description sent to the extractor. */
  descriptionChars: 4000,
} as const

/** v2.5 · WS4a/WS5 — generation limits. */
export const GENERATION = {
  /** Exactly ONE targeted automatic retry, then Klar explains the failure. */
  maxTailoringAttempts: 2,
  /** Bounded per-packet version history. */
  packetVersionLimit: 5,
} as const
