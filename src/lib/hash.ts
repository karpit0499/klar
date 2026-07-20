// ============================================================================
// Stable, synchronous string hash (FNV-1a, 32-bit) rendered as hex.
// Used to build dedup keys like id = hash(`${source}:${source_id}`).
// Not cryptographic — collision risk is negligible at portfolio scale and it
// keeps adapters synchronous (no async/await plumbing just to make an id).
// ============================================================================

export function stableHash(input: string): string {
  let h = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    // 32-bit FNV prime multiply via shifts, kept in unsigned range
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Normalize a string for fuzzy comparison (lowercase, strip accents/punct). */
export function normalizeKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/\b(gmbh|se|ag|inc|ltd|co|kg|mbh)\b/g, '') // company suffixes
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}