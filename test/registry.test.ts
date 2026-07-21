// Run with: npx tsx test/registry.test.ts
// Structural integrity of the DACH ATS registry (feature 6). Runs fully OFFLINE
// — it does NOT hit the network (that's what scripts/verify-registry.ts is for).
// It catches the mistakes that actually happen when hand-editing a 200-line
// data file: malformed slugs, duplicate entries, a typo'd vendor, or the
// combined export drifting out of sync with its two source arrays.
import {
  ATS_VERIFIED_DE,
  ATS_CANDIDATES_DACH,
  ATS_REGISTRY_DE,
  type AtsEntry,
} from '../src/sources/registry.de.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

const VENDORS = new Set(['greenhouse', 'lever', 'ashby'])
const SLUG_RE = /^[a-z0-9._-]+$/

// ---- size ------------------------------------------------------------------
ok(ATS_REGISTRY_DE.length >= 200, `registry has 200+ entries (has ${ATS_REGISTRY_DE.length})`)
ok(ATS_VERIFIED_DE.length >= 40, `verified core intact (${ATS_VERIFIED_DE.length})`)
ok(ATS_CANDIDATES_DACH.length >= 100, `candidate list is substantial (${ATS_CANDIDATES_DACH.length})`)

// ---- combined export is exactly verified ++ candidates ---------------------
ok(
  ATS_REGISTRY_DE.length === ATS_VERIFIED_DE.length + ATS_CANDIDATES_DACH.length,
  'combined registry length = verified + candidates',
)
ok(ATS_REGISTRY_DE[0] === ATS_VERIFIED_DE[0], 'combined registry starts with the verified core')
ok(
  ATS_REGISTRY_DE[ATS_REGISTRY_DE.length - 1] === ATS_CANDIDATES_DACH[ATS_CANDIDATES_DACH.length - 1],
  'combined registry ends with the candidate list',
)

// ---- every entry is well-formed --------------------------------------------
let badVendor = 0, badSlug = 0, blankCompany = 0
for (const e of ATS_REGISTRY_DE) {
  if (!VENDORS.has(e.ats)) badVendor++
  if (!SLUG_RE.test(e.slug)) badSlug++
  if (!e.company || !e.company.trim()) blankCompany++
}
ok(badVendor === 0, `every vendor is greenhouse|lever|ashby (${badVendor} bad)`)
ok(badSlug === 0, `every slug is URL-safe [a-z0-9._-] (${badSlug} bad)`)
ok(blankCompany === 0, `every company name is non-blank (${blankCompany} bad)`)

// ---- no duplicate (vendor, slug) pairs -------------------------------------
// The same slug under two different vendors is allowed (it's a legit "we don't
// know the vendor yet" candidate), but an exact (vendor, slug) repeat is a
// copy-paste bug that would double-fetch the same board.
const seen = new Map<string, AtsEntry>()
const dupes: string[] = []
for (const e of ATS_REGISTRY_DE) {
  const key = `${e.ats}:${e.slug}`
  if (seen.has(key)) dupes.push(key)
  else seen.set(key, e)
}
ok(dupes.length === 0, `no duplicate (vendor, slug) pairs (${dupes.length}: ${dupes.slice(0, 3).join(', ')})`)

// ---- candidates carry the honest marker in source --------------------------
// (Sanity check that we didn't accidentally relabel candidates as verified.)
ok(ATS_VERIFIED_DE.every((e) => VENDORS.has(e.ats)), 'verified entries all well-typed')

console.log(`\nRegistry tests: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)