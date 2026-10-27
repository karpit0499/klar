// ============================================================================
// Defensive coercion for untrusted JSON (AI responses, restored rows, caches).
//
// Every structured consumer treats provider output as a partial proposal: a
// wrongly typed value becomes an empty value of the expected shape, never an
// exception and never invented content. Keeping these helpers in one place
// means every consumer applies exactly the same rules.
// ============================================================================

/** A plain (non-array, non-null) object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** The value when it is a plain object, otherwise an empty object. */
export function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

/** The value when it is an array, otherwise an empty array. */
export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Trimmed text, or '' for anything that is not a string. */
export function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Trimmed, non-empty, first-occurrence-unique strings in their original order. */
export function uniqueStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const item = cleanText(value)
    if (!item || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

/** `uniqueStrings` for a value that may not be an array at all. */
export function stringList(value: unknown): string[] {
  return uniqueStrings(array(value))
}
