import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  MAX_GITHUB_COMPOSER_URL,
  emptyIssueReport,
  prepareIssueReport,
  validateIssueReport,
} from '../src/support/issueReport'

const draft = {
  ...emptyIssueReport(),
  title: 'Search leaked user@example.com and gsk_abcdefghijklmnopqrstuvwxyz',
  happened: 'A request used https://example.test/jobs?q=private and /Users/alice/secret.txt.',
  steps: 'Open C:\\Users\\Alice\\resume.docx and retry the request.',
  expected: 'No Bearer abcdefghijklmnopqrstuvwxyz token should appear.',
  severity: 'high' as const,
  includeDiagnostics: true,
}

const report = prepareIssueReport(draft, {
  appVersion: '2.6.0',
  environment: 'desktop',
  locale: 'en',
  online: true,
  viewport: '1280x720',
  platformFamily: 'macOS',
  browserFamily: 'Electron',
})

assert.equal(report.destination, 'public_issue')
assert.match(report.composerUrl, /^https:\/\/github\.com\/karpit0499\/klar\/issues\/new\?/)
assert.doesNotMatch(report.body, /user@example\.com/)
assert.doesNotMatch(report.body, /gsk_/)
assert.doesNotMatch(report.body, /\/Users\/alice/)
assert.doesNotMatch(report.body, /C:\\Users/)
assert.doesNotMatch(report.body, /secret\.txt|resume\.docx/)
assert.doesNotMatch(report.body, /\?q=private/)
assert.doesNotMatch(report.body, /abcdefghijklmnopqrstuvwxyz/)
assert.match(report.title, /\[email redacted\]/)
assert.match(report.body, /Environment: desktop/)
assert.ok(report.redactions.length >= 4)
assert.ok(report.composerUrl.length < MAX_GITHUB_COMPOSER_URL)

const nestedPathReport = prepareIssueReport({
  ...draft,
  happened: [
    'Inspect /Users/example/private/resume.docx, /home/alice/jobs/application.pdf,',
    '/private/tmp/klar/report.json, /Volumes/External/private.docx,',
    '/workspace/klar/log.txt, and https://example.test/private/tmp/public-doc.',
  ].join(' '),
  steps: [
    'Inspect C:\\Users\\Alice\\Documents\\private-letter.docx',
    'and \\\\fileserver\\applicants\\resume.docx.',
  ].join(' '),
})
assert.doesNotMatch(
  nestedPathReport.body,
  /private\/resume|jobs\/application|klar\/report|External|workspace|Documents|private-letter|fileserver|applicants/,
)
assert.match(
  nestedPathReport.body,
  /https:\/\/example\.test\/private\/tmp\/public-doc/,
  'ordinary URL path segments are not mistaken for local filesystem roots',
)
assert.equal(
  (nestedPathReport.body.match(/\[local path redacted\]/g) ?? []).length,
  7,
)

const privateReport = prepareIssueReport({
  ...draft,
  category: 'privacy_security',
  title: 'Private vulnerability',
})
assert.equal(privateReport.destination, 'private_advisory')
assert.equal(
  privateReport.composerUrl,
  'https://github.com/karpit0499/klar/security/advisories/new',
)

const credentialReport = prepareIssueReport({
  ...draft,
  title: 'Credential scanner regression',
  happened: [
    'github_pat_11AA22BB33CC44DD55EE66FF77GG88HH',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'glpat-abcdefghijklmnopqrstuvwxyz',
    'xoxb-123456789012-abcdefghijklmnopqrstuv',
    'AKIAABCDEFGHIJKLMNOP',
    'AIzaabcdefghijklmnopqrstuvwxyz1234567890',
  ].join(' '),
})
assert.doesNotMatch(
  credentialReport.body,
  /github_pat_|ghp_|glpat-|xoxb-|AKIAABCDEFGHIJKLMNOP|AIza/,
)

assert.deepEqual(validateIssueReport(emptyIssueReport()), ['title', 'happened'])
assert.deepEqual(validateIssueReport({
  ...emptyIssueReport(),
  title: 'Valid title',
  happened: 'A complete description.',
}), [])

const component = readFileSync('src/ui/IssueReportCard.tsx', 'utf8')
assert.doesNotMatch(component, /if \(!opened\)/)
assert.match(component, /Chromium deliberately/)
assert.match(component, /asked your browser to open GitHub/)
assert.match(component, /Only you can submit it in GitHub/)
assert.match(component, /browser denied clipboard access/)
assert.match(component, /recordOperationalEvent\(\{[\s\S]*?\}\)\.catch\(\(\) => undefined\)/)
assert.match(component, /if \(screenshotUrl\.current\) URL\.revokeObjectURL\(screenshotUrl\.current\)/)
assert.match(component, /useEffect\(\(\) => \(\) => \{[\s\S]*?URL\.revokeObjectURL/)
assert.match(component, /setDraft\(emptyIssueReport\(\)\)\s+clearScreenshot\(\)/)
assert.match(component, /setOpen\(false\)[\s\S]*?setReviewed\(false\)[\s\S]*?clearScreenshot\(\)/)
assert.match(component, /function chooseScreenshot\(file\?: File\) \{\s+revokeScreenshotUrl\(\)\s+setScreenshot\(undefined\)/)

const app = readFileSync('src/App.tsx', 'utf8')
assert.match(app, /flexSearchVisited/)
assert.match(app, /hidden=\{tab !== 'search' \|\| !showFlexible\}/)
assert.match(app, /<SearchStep active=\{tab === 'search' && !showFlexible\}/)
assert.match(app, /active=\{tab === 'search' && showFlexible\}/)
assert.match(readFileSync('src/ui/SearchStep.tsx', 'utf8'), /\{active && open && \(/)
assert.match(readFileSync('src/ui/FlexibleSearch.tsx', 'utf8'), /\{active && preparing && onSavePreferences && \(/)

const securityPolicy = readFileSync('SECURITY.md', 'utf8')
assert.match(securityPolicy, /security\/advisories\/new/)
assert.match(securityPolicy, /issues\/new\/choose/)
assert.match(securityPolicy, /Never attach a real résumé/)
const issueConfig = readFileSync('.github/ISSUE_TEMPLATE/config.yml', 'utf8')
assert.match(issueConfig, /blank_issues_enabled:\s*true/)
assert.match(issueConfig, /security\/advisories\/new/)

console.log('v26-issue-report.test.ts: all tests passed')