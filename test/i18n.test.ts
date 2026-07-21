// Run with: npx tsx test/i18n.test.ts
// Pure tests for the translation layer (feature 20): key-set parity between DE
// and EN, {placeholder} interpolation, and the English/raw-key fallback chain.
import { translations, translate, type TranslationKey } from '../src/i18n/translations.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

const enKeys = Object.keys(translations.en) as TranslationKey[]
const deKeys = Object.keys(translations.de) as TranslationKey[]

// ---- key-set parity --------------------------------------------------------
ok(enKeys.length > 30, `EN dictionary is populated (${enKeys.length} keys)`)
ok(deKeys.length === enKeys.length, `DE has the same number of keys as EN (${deKeys.length} vs ${enKeys.length})`)
const missingInDe = enKeys.filter((k) => !(k in translations.de))
ok(missingInDe.length === 0, `every EN key exists in DE (${missingInDe.slice(0, 3).join(', ')})`)
const extraInDe = deKeys.filter((k) => !(k in translations.en))
ok(extraInDe.length === 0, `DE has no stray keys absent from EN (${extraInDe.slice(0, 3).join(', ')})`)

// ---- no blank values -------------------------------------------------------
let blanks = 0
for (const k of enKeys) {
  if (!translations.en[k].trim() || !translations.de[k].trim()) blanks++
}
ok(blanks === 0, `no blank translation values (${blanks})`)

// ---- German-first sanity: a few keys actually differ from English ----------
const differing = enKeys.filter((k) => translations.de[k] !== translations.en[k])
ok(differing.length > 10, `DE is a real translation, not a copy of EN (${differing.length} keys differ)`)
ok(translate('de', 'nav.search') === 'Suche', 'de: nav.search → Suche')
ok(translate('en', 'nav.search') === 'Search', 'en: nav.search → Search')
ok(translate('de', 'card.save') === 'Merken', 'de: card.save → Merken (brand microcopy)')

// ---- interpolation ---------------------------------------------------------
ok(
  translate('en', 'search.scoring', { done: 3, total: 10 }) === 'Scoring 3/10 candidates…',
  'en: interpolates {done}/{total}',
)
ok(
  translate('de', 'card.gap', { skill: 'Kubernetes' }) === '+ Kubernetes',
  'de: interpolates {skill}',
)
ok(
  translate('en', 'search.hiddenCount', { n: 5 }) === '5 roles hidden by your filters',
  'en: interpolates {n}',
)
// Missing param leaves the placeholder visible rather than crashing.
ok(
  translate('en', 'search.near').includes('{city}'),
  'missing param leaves {city} placeholder intact',
)

// ---- fallback --------------------------------------------------------------
// An unknown key returns the key itself (readable degradation).
ok(
  translate('en', 'does.not.exist' as TranslationKey) === 'does.not.exist',
  'unknown key falls back to the raw key',
)

console.log(`\ni18n tests: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)