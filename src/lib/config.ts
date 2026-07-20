// ============================================================================
// App-wide configuration. Values that a self-hoster might change live here.
// ============================================================================

/**
 * Base URL of YOUR deployed Cloudflare Worker (Phase 0), WITHOUT a trailing slash.
 * Only two sources are proxied through it: BA and Adzuna (they lack CORS).
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

/** Groq (LLM) — called DIRECTLY from the browser (verified CORS: allow-origin *). */
export const GROQ = {
  baseUrl: 'https://api.groq.com/openai/v1',
  /**
   * Model ID. Groq rotates its catalogue often — verify the current list at
   * https://console.groq.com/docs/models and change this one constant if needed.
   * 70B gives the best parse/matching quality on the free tier.
   */
  model: 'llama-3.3-70b-versatile',
  /** A smaller/faster fallback you can switch to for speed over quality. */
  fastModel: 'llama-3.1-8b-instant',
} as const

/** Matching tuning knobs (Phase 5). */
export const MATCH = {
  candidateLimit: 40,      // max jobs sent to the LLM after pre-filter
  batchSize: 5,            // jobs per LLM call
  descriptionChars: 1500,  // truncate each description before scoring
} as const