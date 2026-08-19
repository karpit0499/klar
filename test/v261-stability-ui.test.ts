import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { translations } from '../src/i18n/translations'

const source = (path: string) => readFileSync(path, 'utf8')

const app = source('src/App.tsx')
const resume = source('src/ui/ResumeWorkspace.tsx')
const support = source('src/ui/SupportWorkspace.tsx')
const dialog = source('src/ui/ConfirmDialog.tsx')
const search = source('src/ui/SearchStep.tsx')
const diagnosticsModel = source('src/search/diagnostics.ts')
const diagnosticsPanel = source('src/ui/SearchDiagnosticsPanel.tsx')
const card = source('src/ui/JobCard.tsx')
const settings = source('src/ui/SettingsStep.tsx')
const flexibleHome = source('src/ui/FlexibleWorkHome.tsx')

assert.match(app, /resume: '#\/resume'/, 'Resume has a stable deep link')
assert.match(app, /support: '#\/support'/, 'Support has a stable deep link')
assert.match(app, /window\.addEventListener\('popstate'/, 'browser Back/Forward is observed')
assert.match(app, /pending\.source === 'history'\) history\.back\(\)/, 'confirmed history navigation resumes the requested Back/Forward move')
assert.match(app, /data-page="dashboard"/, 'route focus has an explicit Dashboard root')
assert.match(app, /data-page="search"/, 'route focus has an explicit Search root')
assert.match(app, /data-page="tracker"/, 'route focus has an explicit Tracker root')
assert.match(app, /data-page="settings"/, 'route focus has an explicit Settings root')
assert.match(app, /<ResumeEmptyWorkspace/, 'a direct Resume route remains useful in a Flexible-only workspace')
assert.match(app, /const primaryTab: PrimaryTab = tab === 'resume' \|\| tab === 'support' \? 'dashboard' : tab/, 'secondary workspaces keep Dashboard selected in primary navigation')
assert.match(app, /const active = primaryTab === item\.id/g, 'desktop and mobile navigation share the secondary-route mapping')
assert.match(resume, /export function ResumeEmptyWorkspace/)
assert.match(app, /<FlexibleWorkHome[\s\S]*?onSupport=\{\(\) => changeTab\('support'\)\}/, 'Flexible-only Dashboard can open Support')
assert.match(flexibleHome, /t\('dashboard\.supportTitle'\)/)
assert.match(flexibleHome, /t\('dashboard\.openSupport'\)/)

assert.doesNotMatch(resume, /window\.confirm|\bconfirm\(/, 'Resume navigation never uses the inaccessible native confirm')
assert.match(dialog, /role="alertdialog"/)
assert.match(dialog, /aria-modal="true"/)
assert.match(dialog, /event\.key === 'Escape'/)
assert.match(dialog, /event\.key !== 'Tab'/, 'the custom dialog traps keyboard focus')
assert.match(dialog, /previousFocus\?\.focus\(\)/, 'closing a custom dialog restores focus')
assert.doesNotMatch(settings, /\bconfirm\(/, 'Settings never uses the inaccessible native confirm')
assert.match(settings, /<ConfirmDialog/)
assert.doesNotMatch(settings, /onAddResume|Add resume|Lebenslauf hinzufügen/)

assert.match(search, /generation: \+\+runGeneration\.current/)
assert.match(search, /current\.controller\.abort\('cancelled'\)/)
assert.match(search, /signal: current\.controller\.signal/)
assert.match(search, /if \(!isCurrent\(\)\) return/, 'stale async continuations are ignored')
assert.match(search, /onMatches: publishMatches/, 'progressive matching callbacks use the generation guard')
assert.match(search, /search\.errorTrack/, 'tracker-save errors are surfaced')
for (const field of [
  'aiComparedCount',
  'aiExactAgreementCount',
  'aiMeanAbsoluteDelta',
  'aiSuspiciousEquality',
]) {
  assert.match(diagnosticsModel, new RegExp(field))
  assert.match(search, new RegExp(`${field}: matchDiagnostics`))
}
assert.match(diagnosticsPanel, /role="alert"/)
assert.match(diagnosticsPanel, /search\.aiEqualityWarning/)
assert.match(diagnosticsPanel, /search\.aiExactAgreement/)
assert.match(diagnosticsPanel, /search\.aiMeanAbsoluteDelta/)

assert.doesNotMatch(
  card,
  /<a[^>]*>[\s\S]*?<Button[\s\S]*?<\/a>/,
  'the external posting link cannot contain a nested button',
)
assert.match(support, /KB_URL/, 'Support links use deploy-time KB configuration')
assert.doesNotMatch(resume, /locale === 'de'|\bde \?/, 'Resume workspace copy comes from the typed dictionary')
assert.doesNotMatch(support, /locale === 'de'|\bde \?/, 'Support workspace copy comes from the typed dictionary')

for (const key of [
  'route.unsavedTitle',
  'resume.workspaceTitle',
  'resume.emptyIntro',
  'resume.add',
  'support.title',
  'search.cancelled',
  'search.aiEqualityWarning',
  'feedback.error.challenge',
] as const) {
  assert.ok(translations.en[key].trim())
  assert.ok(translations.de[key].trim())
  assert.notEqual(translations.en[key], translations.de[key])
}

console.log('v261-stability-ui.test.ts: all tests passed')
