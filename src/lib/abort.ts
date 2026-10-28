// ============================================================================
// Cancellation detection.
//
// A cancelled request must propagate unchanged: it is never a provider
// failure, an unresolved resume role, or a failed scoring batch. Browsers
// reject fetch with a DOMException; some runtimes and polyfills reject with a
// plain Error whose name is "AbortError", so both shapes are recognized.
// ============================================================================

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (!!error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError')
  )
}
