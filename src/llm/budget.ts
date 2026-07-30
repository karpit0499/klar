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

export type TokenBudget = {
  tpm: number
  rpm?: number
  tpd?: number
  source: 'default' | 'observed'
  observedAt?: string
}

export type Affordability =
  | { ok: true; cost: RequestCost }
  /** Permanent for this request. Do NOT offer a retry. */
  | { ok: false; reason: 'exceeds_budget'; cost: RequestCost; limit: number }
  /** Temporary: this request fits by itself, but the rolling minute is full. */
  | {
      ok: false
      reason: 'no_headroom_now'
      cost: RequestCost
      available: number
      retryAfterMs: number
    }

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

/** Conservative seed used until the configured provider reports its real limit. */
export const DEFAULT_BUDGET: TokenBudget = {
  tpm: BUDGET.assumedTpm,
  rpm: 30,
  source: 'default',
}

type SpendEntry = { id: number; at: number; tokens: number }

/**
 * Rolling, in-memory 60-second ledger. It deliberately forgets on reload:
 * persisting request timestamps would add privacy and clock-skew problems
 * without improving safety after a fresh page load.
 */
export class RollingTokenLedger {
  private entries: SpendEntry[] = []
  private nextId = 1

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly windowMs = 60_000,
  ) {}

  private prune(): void {
    const cutoff = this.now() - this.windowMs
    this.entries = this.entries.filter((entry) => entry.at > cutoff)
  }

  record(cost: RequestCost): number {
    this.prune()
    const id = this.nextId++
    this.entries.push({ id, at: this.now(), tokens: Math.max(0, cost.billedTokens) })
    return id
  }

  settle(id: number, actualTokens?: number): void {
    if (actualTokens == null || !Number.isFinite(actualTokens) || actualTokens < 0) return
    const entry = this.entries.find((candidate) => candidate.id === id)
    if (entry) entry.tokens = actualTokens
  }

  spent(): number {
    this.prune()
    return this.entries.reduce((sum, entry) => sum + entry.tokens, 0)
  }

  requests(): number {
    this.prune()
    return this.entries.length
  }

  remaining(limit: number): number {
    return Math.max(0, limit - this.spent())
  }

  retryAfterMs(tokensNeeded: number, limit: number): number {
    this.prune()
    let available = Math.max(0, limit - this.spent())
    if (tokensNeeded <= available) return 0
    for (const entry of this.entries) {
      available += entry.tokens
      if (tokensNeeded <= available) {
        return Math.max(0, entry.at + this.windowMs - this.now())
      }
    }
    return this.windowMs
  }

  retryAfterRequestMs(limit: number): number {
    this.prune()
    if (this.entries.length < limit) return 0
    const entry = this.entries[this.entries.length - limit]
    return entry
      ? Math.max(0, entry.at + this.windowMs - this.now())
      : this.windowMs
  }

  reset(): void {
    this.entries = []
  }
}

const ledger = new RollingTokenLedger()
const listeners = new Set<() => void>()

export function recordSpend(cost: RequestCost): number {
  const id = ledger.record(cost)
  listeners.forEach((listener) => listener())
  return id
}

export function settleSpend(id: number, actualTokens?: number): void {
  ledger.settle(id, actualTokens)
  listeners.forEach((listener) => listener())
}

export function spentInLastMinute(): number {
  return ledger.spent()
}

export function requestsInLastMinute(): number {
  return ledger.requests()
}

export function remainingThisMinute(budget: TokenBudget | number): number {
  return ledger.remaining(typeof budget === 'number' ? budget : budget.tpm)
}

export function remainingRequestsThisMinute(budget: TokenBudget): number | undefined {
  return budget.rpm == null
    ? undefined
    : Math.max(0, budget.rpm - ledger.requests())
}

export function subscribeBudget(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test-only reset; production callers never need to erase the rolling window. */
export function resetSpendLedgerForTests(): void {
  ledger.reset()
  listeners.forEach((listener) => listener())
}

/** Can this request succeed against the whole and currently remaining minute? */
export function canAfford(
  cost: RequestCost,
  budget: TokenBudget | number = DEFAULT_BUDGET,
  currentSpent: number = spentInLastMinute(),
  retryAfterMs?: number,
  currentRequests: number = requestsInLastMinute(),
): Affordability {
  const limit = typeof budget === 'number' ? budget : budget.tpm
  if (cost.billedTokens > limit) {
    return { ok: false, reason: 'exceeds_budget', cost, limit }
  }
  const available = Math.max(0, limit - Math.max(0, currentSpent))
  const rpm = typeof budget === 'number' ? undefined : budget.rpm
  const requestsFull = rpm != null && currentRequests >= rpm
  if (cost.billedTokens > available || requestsFull) {
    const tokenWait = ledger.retryAfterMs(cost.billedTokens, limit)
    const requestWait = rpm == null ? 0 : ledger.retryAfterRequestMs(rpm)
    return {
      ok: false,
      reason: 'no_headroom_now',
      cost,
      available,
      retryAfterMs: retryAfterMs ?? Math.max(tokenWait, requestWait),
    }
  }
  return { ok: true, cost }
}

export async function waitForHeadroom(
  cost: RequestCost,
  budget: TokenBudget | number,
  options: {
    signal?: AbortSignal
    onWait?: (remainingMs: number) => void
    now?: () => number
    sleep?: (ms: number) => Promise<void>
  } = {},
): Promise<void> {
  const now = options.now ?? (() => Date.now())
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  while (true) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const verdict = canAfford(cost, budget)
    if (verdict.ok) {
      options.onWait?.(0)
      return
    }
    if (verdict.reason === 'exceeds_budget') return
    const until = now() + Math.max(50, verdict.retryAfterMs)
    options.onWait?.(Math.max(0, until - now()))
    await sleep(Math.min(1_000, Math.max(50, until - now())))
  }
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

export async function loadBudget(): Promise<TokenBudget> {
  const loaded = await loadTpmLimit()
  return { ...DEFAULT_BUDGET, ...loaded }
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
 * Per bullet the model returns the rewritten sentence plus its evidence indexes;
 * roles and projects add their JSON envelopes. GPT-OSS also spends part of
 * `max_completion_tokens` on reasoning, so the previous 1.35 multiplier could
 * stop a valid English or German answer before the closing fields. The 1.55
 * factor includes that measured headroom. Cosmetic change notes are no longer
 * generated by the provider. Clamped so a tiny résumé still has room for valid
 * JSON and a huge one never exceeds the established ceiling.
 */
export function estimateTailoringOutputTokens(input: {
  bulletCount: number
  roleCount: number
  projectsWithSummary: number
}): number {
  const raw =
    input.bulletCount * 56 +
    input.roleCount * 46 +
    input.projectsWithSummary * 72 +
    220 // summary, root envelope, and closing JSON
  return clamp(Math.ceil(raw * 1.55), BUDGET.minReservedTokens, BUDGET.maxReservedTokens)
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