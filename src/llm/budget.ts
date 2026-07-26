// ============================================================================
// v2.4.3 · Token budgeting — the smallest honest model of "what will this cost,
// and can it possibly succeed?"
//
// WHY THIS FILE EXISTS
// Groq (and every OpenAI-compatible provider) charges a request against the
// per-minute token allowance as:
//
//     billed = input tokens + the max_tokens you RESERVED for the answer
//
// The reservation counts whether the model uses it or not. Klar was reserving
// 4096 tokens for a résumé rewrite that needs about 1,200 — and 4096 is more
// than half of the free tier's entire 8,000-token minute. Combined with a
// bloated prompt, a single tailoring request measured 8,203–10,297 billed
// tokens, which means it could NEVER succeed on the free tier. Waiting did not
// help; that is what users reported.
//
// THE ONE DISTINCTION THAT MATTERS
// There are two completely different "you can't do that" answers:
//
//   'exceeds_budget'  — this request is bigger than the WHOLE per-minute
//                       allowance. It will never succeed. Offering "try again"
//                       here is a lie, and it is exactly the bug we are fixing.
//   'no_headroom_now' — the request would fit, but this minute is already
//                       spent. Waiting genuinely helps.
//
// Everything here is pure except the two settings helpers, so it is fully
// unit-testable offline.
// ============================================================================
import { BUDGET } from '../lib/config'
import { getSetting, setSetting } from '../db/db'

const OBSERVED_KEY = 'tokenBudget.observed.v1'

export type RequestCost = {
  inputTokens: number
  reservedTokens: number
  /** What the provider actually counts against the per-minute allowance. */
  billedTokens: number
}

export type Affordability =
  | { ok: true; cost: RequestCost }
  /** Permanent for this request. Do NOT offer a retry. */
  | { ok: false; reason: 'exceeds_budget'; cost: RequestCost; limit: number }

/**
 * Rough token count. Sub-word tokenisers average ~4 characters per token in
 * English and ~3.3 in German (longer compounds, more umlauts); 3.6 is the
 * calibrated middle. Deliberately pessimistic: over-estimating makes Klar
 * refuse slightly too early, which is safe. Under-estimating would let a doomed
 * request through, which is the bug.
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text ?? '').length / 3.6)
}

/** What one chat request will be billed. */
export function costOf(input: { system: string; user: string; maxTokens: number }): RequestCost {
  const inputTokens = estimateTokens(input.system) + estimateTokens(input.user)
  return {
    inputTokens,
    reservedTokens: input.maxTokens,
    billedTokens: inputTokens + input.maxTokens,
  }
}

/** Can this request ever succeed against `limit` tokens per minute? */
export function canAfford(cost: RequestCost, limit: number = BUDGET.assumedTpm): Affordability {
  if (cost.billedTokens > limit) {
    return { ok: false, reason: 'exceeds_budget', cost, limit }
  }
  return { ok: true, cost }
}

// --- Learning the real limit from the provider --------------------------------

/**
 * PURE. Providers state their real numbers in the error body, e.g. Groq's
 * "Request too large for model `openai/gpt-oss-120b` … Limit 8000, Requested 9124".
 * Reading it means Klar stops guessing — a paying user is not throttled by our
 * conservative default, and a changed limit is picked up automatically.
 * Returns null when nothing parseable is present.
 */
export function parseLimitFromError(message: string): { limit?: number; requested?: number } | null {
  const text = message ?? ''
  const limit = text.match(/limit[^0-9]{0,12}([0-9][0-9,._]*)/i)
  const requested = text.match(/request(?:ed)?[^0-9]{0,12}([0-9][0-9,._]*)/i)
  const toNumber = (raw: string | undefined) => {
    if (!raw) return undefined
    const value = Number(raw.replace(/[,_.]/g, ''))
    return Number.isFinite(value) && value > 0 ? value : undefined
  }
  const parsed = { limit: toNumber(limit?.[1]), requested: toNumber(requested?.[1]) }
  if (parsed.limit == null && parsed.requested == null) return null
  return parsed
}

/** The tokens-per-minute limit Klar believes it has, and where that belief came from. */
export async function loadTpmLimit(): Promise<{ tpm: number; source: 'default' | 'observed' }> {
  try {
    const stored = await getSetting<{ tpm?: number }>(OBSERVED_KEY)
    if (stored?.tpm && stored.tpm > 0) return { tpm: stored.tpm, source: 'observed' }
  } catch {
    // No database yet — the conservative default is the right answer.
  }
  return { tpm: BUDGET.assumedTpm, source: 'default' }
}

export async function saveTpmLimit(tpm: number): Promise<void> {
  if (!Number.isFinite(tpm) || tpm <= 0) return
  try {
    await setSetting(OBSERVED_KEY, { tpm, observedAt: new Date().toISOString() })
  } catch {
    // Learning the limit is an optimisation, never a user-visible failure.
  }
}

// --- Output-size estimates ----------------------------------------------------

/**
 * How many tokens a résumé rewrite actually needs, from the résumé's shape.
 *
 * Per bullet the model returns the rewritten sentence plus a tiny JSON wrapper
 * (~45 tokens measured); per role a title and envelope (~40); per project with
 * a source summary (~60); plus the summary itself and the change notes. The
 * 1.35 factor absorbs a verbose model. Clamped so a tiny résumé still has room
 * for valid JSON and a huge one never exceeds the old ceiling.
 */
export function estimateTailoringOutputTokens(input: {
  bulletCount: number
  roleCount: number
  projectsWithSummary: number
}): number {
  const raw =
    input.bulletCount * 45 +
    input.roleCount * 40 +
    input.projectsWithSummary * 60 +
    140 + // the summary
    90 // changeSummary notes
  return clamp(Math.ceil(raw * 1.35), BUDGET.minReservedTokens, BUDGET.maxReservedTokens)
}

/** A 220–320 word letter is ~450 tokens; reserve with headroom. */
export function estimateLetterOutputTokens(): number {
  return clamp(Math.ceil(450 * 1.35), BUDGET.minReservedTokens, BUDGET.maxReservedTokens)
}

/** One scored job returns ~170 tokens of JSON. */
export function estimateRerankOutputTokens(batchSize: number): number {
  return clamp(Math.ceil((batchSize * 170 + 80) * 1.35), BUDGET.minReservedTokens, BUDGET.maxReservedTokens)
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}