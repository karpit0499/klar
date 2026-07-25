// ============================================================================
// v2.4.1 regression guards.
//
// 1. Flexible Work must stay reachable for EVERY user. Before v2.4.1 both the
//    Flexible Work home and the Flexible Work search were rendered only when
//    `!(canonical && profile)` — saving a résumé silently removed the whole
//    feature and stranded any saved flexible searches.
// 2. The flexible search session must restart when the query changes.
// 3. WCAG AA colour tokens.
// 4. Every textarea in the résumé editor needs an accessible name.
// ============================================================================
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { translate } from '../src/i18n/translations'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = (path: string) => readFileSync(root + path, 'utf8')

const app = source('src/App.tsx')
const home = source('src/ui/FlexibleWorkHome.tsx')
const search = source('src/ui/FlexibleSearch.tsx')
const settings = source('src/ui/SettingsStep.tsx')
const controller = source('src/flexible/useFlexibleSearch.ts')
const editor = source('src/ui/ResumeEditor.tsx')
const css = source('src/index.css')
const setupState = source('src/onboarding/setupState.ts')

// --- 1. Flexible Work is never gated on the absence of a résumé -------------
assert.doesNotMatch(
  app,
  /!\(canonical && profile\)/,
  'Flexible Work must not be gated on "has no résumé"',
)
assert.match(app, /WorkModeSwitch/, 'the workspace exposes a career/flexible switch')
assert.match(app, /const hasCareer = Boolean\(canonical && profile\)/)
assert.match(app, /activeMode: WorkMode = hasCareer \? \(workMode \?\? 'career'\) : 'flexible'/)
// The résumé branch of the search tab must not be the only branch any more.
assert.match(app, /tab === 'search' && showFlexible/)
// Settings always offers a route into Flexible Work.
assert.match(app, /onEditFlexible=\{\(\) => void editFlexible\(\)\}/)
assert.match(app, /hasFlexible=\{Boolean\(preferences\.flexibleWork\)\}/)
assert.match(settings, /hasFlexible/)

// The work-mode choice is persisted, so the surface survives a reload.
assert.match(setupState, /export type WorkMode = 'career' \| 'flexible'/)
assert.match(setupState, /export async function saveWorkMode/)
assert.match(setupState, /export async function loadWorkMode/)

// A résumé user has nothing to "add", so that button is optional.
assert.match(home, /onAddResume\?: \(\) => void/)
assert.match(home, /switcher\?: ReactNode/)
assert.match(search, /switcher\?: React\.ReactNode/)

// --- 2. The search restarts when the query changes -------------------------
assert.match(controller, /const autoKey = useMemo\(/)
assert.match(controller, /\}, \[autoKey\]\)/)
assert.doesNotMatch(
  controller,
  /if \(opts\.auto\) start\(\)\n\s+return \(\) => abortRef\.current\?\.abort\(\)\n\s+\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\n\s+\}, \[\]\)/,
  'the auto-start effect must not be mount-only',
)

// --- 3. Colour tokens meet WCAG 2.1 AA (4.5:1) -----------------------------
function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}
function contrast(a: string, b: string): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
function token(name: string, scope: 'light' | 'dark'): string {
  const block = scope === 'light'
    ? css.slice(css.indexOf(':root'), css.indexOf('.dark {'))
    : css.slice(css.indexOf('.dark {'))
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  assert.ok(match, `token --${name} not found in ${scope}`)
  return match![1]
}

const lightBackgrounds = ['#ffffff', '#fafaf8', '#f5f5f3']
const darkBackgrounds = ['#141416', '#1a1a1d', '#0b0b0c']

for (const background of lightBackgrounds) {
  assert.ok(contrast(token('text-3', 'light'), background) >= 4.5, `light text-3 on ${background}`)
  assert.ok(contrast(token('text-2', 'light'), background) >= 4.5, `light text-2 on ${background}`)
  assert.ok(contrast(token('success', 'light'), background) >= 4.5, `light success on ${background}`)
  assert.ok(contrast(token('danger', 'light'), background) >= 4.5, `light danger on ${background}`)
}
for (const background of darkBackgrounds) {
  assert.ok(contrast(token('text-3', 'dark'), background) >= 4.5, `dark text-3 on ${background}`)
  assert.ok(contrast(token('text-2', 'dark'), background) >= 4.5, `dark text-2 on ${background}`)
}
// Destructive button fill.
assert.ok(contrast(token('danger-ink', 'light'), token('danger', 'light')) >= 4.5, 'light danger button')
assert.ok(contrast(token('danger-ink', 'dark'), token('danger', 'dark')) >= 4.5, 'dark danger button')
// The dark accent has to clear AA on its own 16% tint (nav, chips, toggles).
const darkAccent = token('accent', 'dark')
for (const background of darkBackgrounds) {
  const tintAlpha = 0.16
  const blend = [1, 3, 5].map((i) => {
    const fg = parseInt(darkAccent.slice(i, i + 2), 16)
    const bg = parseInt(background.slice(i, i + 2), 16)
    return Math.round(tintAlpha * fg + (1 - tintAlpha) * bg)
  })
  const tint = '#' + blend.map((v) => v.toString(16).padStart(2, '0')).join('')
  assert.ok(contrast(darkAccent, tint) >= 4.5, `dark accent on its tint over ${background}`)
}

// --- 4. Résumé editor textareas have accessible names ----------------------
const textareas = editor.match(/<textarea[^>]*/g) ?? []
assert.ok(textareas.length >= 3, 'expected the résumé editor textareas')
for (const tag of textareas) {
  assert.match(tag, /aria-label=/, `textarea without an accessible name: ${tag.slice(0, 60)}`)
}

// --- 5. Result cards cannot force horizontal overflow ----------------------
assert.match(search, /<li key=\{job\.id\} className="min-w-0">/)

// --- 6. Bilingual parity for the new keys ----------------------------------
for (const key of ['workmode.career', 'workmode.flexible', 'flexible.home.setUp'] as const) {
  assert.ok(translate('en', key).length > 0, `missing en ${key}`)
  assert.ok(translate('de', key).length > 0, `missing de ${key}`)
}
assert.equal(translate('en', 'workmode.flexible'), 'Flexible work')
assert.equal(translate('de', 'workmode.flexible'), 'Flexible Arbeit')

console.log('v241-flexible-access.test.ts: all tests passed')