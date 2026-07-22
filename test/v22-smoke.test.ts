import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { translations } from '../src/i18n/translations'
import { buildResumeExtractionPrompt } from '../src/resume/extract'
import { SECTION_HEADINGS } from '../src/resume/types'

// English and German ship the same complete UI key set.
assert.deepEqual(Object.keys(translations.de).sort(), Object.keys(translations.en).sort())
assert.equal(SECTION_HEADINGS.en.experience, 'Experience')
assert.equal(SECTION_HEADINGS.de.experience, 'Berufserfahrung')
assert.match(buildResumeExtractionPrompt('Berufserfahrung: Entwicklerin bei Beispiel GmbH'), /Berufserfahrung/)
assert.match(buildResumeExtractionPrompt('Experience: Engineer at Example Ltd'), /Experience/)

// Mobile-width regression guard: dynamic viewport, safe areas, no horizontal overflow,
// wrapping utilities, and touch-sized shared controls stay in the shipped sources.
const css = source('src/index.css')
assert.match(css, /100dvh/)
assert.match(css, /overflow-x:\s*hidden/)
assert.match(css, /safe-area-inset-bottom/)
assert.match(css, /overflow-wrap:\s*anywhere/)
const atoms = source('src/ui/atoms.tsx')
assert.match(atoms, /min-h-tap/)
const safety = source('src/ui/SafetyCenter.tsx')
assert.match(safety, /sm:grid-cols-2/)
assert.match(safety, /whitespace-normal/)
const diagnostics = source('src/ui/SearchDiagnosticsPanel.tsx')
assert.match(diagnostics, /sm:grid-cols-2/)
const drawers = [source('src/ui/JobDrawer.tsx'), source('src/ui/TrackedDrawer.tsx'), source('src/ui/ApplicationBundle.tsx')]
for (const drawer of drawers) assert.match(drawer, /app-drawer/)

// Generation/download smoke coverage stays bilingual and includes both first-class formats.
const bundle = source('src/ui/ApplicationBundle.tsx')
assert.match(bundle, /downloadResumeDocx/)
assert.match(bundle, /printResumeAsPdf/)
assert.match(bundle, /'de'\s*\|\s*'en'|ResumeLanguage/)

console.log('v22-smoke.test.ts: all tests passed')

function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8')
}