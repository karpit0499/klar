export const SOURCE_ATTEMPT_TIMEOUT_MIN_MS = 10_000
export const SOURCE_ATTEMPT_TIMEOUT_MAX_MS = 15_000
export const SEARCH_HARD_DEADLINE_MS = 60_000
export const SEARCH_MAX_RETRIES = 2
export const SEARCH_PAGE_SIZE = 20
export const SEARCH_FIRST_PUBLISH_MIN = 10
export const SEARCH_LOW_SUPPLY_PUBLISH_MS = 8_000

export type RetryableStatus = 408 | 429 | 500 | 502 | 503 | 504

export function canRetrySearchSource(input: {
  retryCount: number
  status?: number
  networkError?: boolean
  timedOut?: boolean
  retryAfterMs?: number
  remainingMs: number
}): boolean {
  if (input.retryCount >= SEARCH_MAX_RETRIES || input.remainingMs <= 0) return false
  if (input.networkError || input.timedOut) return true
  if (input.status === 429) {
    return input.retryAfterMs !== undefined && input.retryAfterMs < input.remainingMs
  }
  return input.status === 408 || (input.status !== undefined && input.status >= 500 && input.status <= 599)
}