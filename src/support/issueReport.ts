import { APP_VERSION } from '../lib/version'

export const PUBLIC_ISSUES_URL = 'https://github.com/karpit0499/klar/issues/new'
export const PRIVATE_ADVISORY_URL = 'https://github.com/karpit0499/klar/security/advisories/new'
export const MAX_GITHUB_COMPOSER_URL = 7_000

export type IssueCategory =
  | 'bug'
  | 'incorrect_result'
  | 'source_problem'
  | 'accessibility'
  | 'privacy_security'
  | 'feature_request'

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical'

export type IssueReportDraft = {
  category: IssueCategory
  title: string
  happened: string
  steps: string
  expected: string
  severity: IssueSeverity
  includeDiagnostics: boolean
}

export type SafeDiagnosticSummary = {
  appVersion: string
  environment: 'web' | 'desktop'
  locale: 'en' | 'de'
  online: boolean
  viewport: string
  platformFamily: 'macOS' | 'Windows' | 'Linux' | 'iOS' | 'Android' | 'other'
  browserFamily: 'Chromium' | 'Firefox' | 'Safari' | 'Electron' | 'other'
}

export type PreparedIssueReport = {
  title: string
  body: string
  destination: 'public_issue' | 'private_advisory'
  destinationUrl: string
  composerUrl: string
  composerTooLong: boolean
  redactions: string[]
}

export function emptyIssueReport(): IssueReportDraft {
  return {
    category: 'bug',
    title: '',
    happened: '',
    steps: '',
    expected: '',
    severity: 'medium',
    includeDiagnostics: false,
  }
}

export function collectSafeDiagnostics(locale: 'en' | 'de'): SafeDiagnosticSummary {
  const userAgent = navigator.userAgent
  return {
    appVersion: APP_VERSION,
    environment: /\bElectron\//.test(userAgent) ? 'desktop' : 'web',
    locale,
    online: navigator.onLine,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    platformFamily: platformFamily(userAgent),
    browserFamily: browserFamily(userAgent),
  }
}

export function prepareIssueReport(
  draft: IssueReportDraft,
  diagnostics?: SafeDiagnosticSummary,
): PreparedIssueReport {
  const redactions = new Set<string>()
  const clean = (value: string) => redactUserText(value, redactions)
  const title = clean(draft.title).replace(/\s+/g, ' ').trim().slice(0, 180)
  const happened = clean(draft.happened).trim()
  const steps = clean(draft.steps).trim()
  const expected = clean(draft.expected).trim()
  const destination = draft.category === 'privacy_security'
    ? 'private_advisory'
    : 'public_issue'
  const body = [
    '## Category',
    categoryLabel(draft.category),
    '',
    '## Severity',
    severityLabel(draft.severity),
    '',
    '## What happened',
    happened || '_Not provided_',
    '',
    '## Steps to reproduce',
    steps || '_Not provided_',
    '',
    '## Expected result',
    expected || '_Not provided_',
    ...(draft.includeDiagnostics && diagnostics
      ? ['', '## Redacted diagnostics', '```text', diagnosticsText(diagnostics), '```']
      : []),
    '',
    '---',
    'Prepared locally by Klar. The reporter reviewed this text before opening GitHub.',
  ].join('\n')

  const destinationUrl = destination === 'public_issue'
    ? PUBLIC_ISSUES_URL
    : PRIVATE_ADVISORY_URL
  const composerUrl = destination === 'public_issue'
    ? `${destinationUrl}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
    : destinationUrl
  return {
    title,
    body,
    destination,
    destinationUrl,
    composerUrl,
    composerTooLong: composerUrl.length > MAX_GITHUB_COMPOSER_URL,
    redactions: [...redactions].sort(),
  }
}

export function validateIssueReport(draft: IssueReportDraft): string[] {
  const errors: string[] = []
  if (draft.title.trim().length < 5) errors.push('title')
  if (draft.happened.trim().length < 10) errors.push('happened')
  if (draft.title.length > 300) errors.push('title_too_long')
  if ([draft.happened, draft.steps, draft.expected].some((value) => value.length > 8_000)) {
    errors.push('body_too_long')
  }
  return errors
}

export async function copyPreparedReport(report: PreparedIssueReport): Promise<void> {
  await navigator.clipboard.writeText(`${report.title}\n\n${report.body}`)
}

function redactUserText(value: string, redactions: Set<string>): string {
  let output = value.replace(/\u0000/g, '')
  output = replace(
    output,
    /\b(?:gsk_[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|glpat-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|Bearer\s+[A-Za-z0-9._~-]{12,})\b/gi,
    '[secret redacted]',
    'provider secret',
    redactions,
  )
  output = replace(
    output,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    '[email redacted]',
    'email address',
    redactions,
  )
  // A file:// URL is what a browser address bar or an operating-system error
  // dialog hands the user, and its last segment is usually the personal
  // document this composer exists to keep out of a public Issue.
  output = replace(
    output,
    /file:\/{2,3}[^\s<>"'`)\]]+/gi,
    '[local path redacted]',
    'local path',
    redactions,
  )
  // Both separators, because a Windows path is routinely pasted with forward
  // slashes and a UNC share is routinely pasted as //server/share. A colon may
  // not precede it, otherwise the // of an ordinary https:// URL would match.
  output = replace(
    output,
    /(^|[^A-Za-z0-9:])(?:\\\\|\/\/)[A-Za-z0-9._-]+[\\/][^\s<>"'`)\]]+/gm,
    '$1[local path redacted]',
    'local path',
    redactions,
  )
  output = replace(
    output,
    /(^|[^A-Za-z0-9])[A-Za-z]:[\\/][^\s<>"'`)\]]+/gm,
    '$1[local path redacted]',
    'local path',
    redactions,
  )
  output = replace(
    output,
    /(^|[^A-Za-z0-9])~\/[^\s<>"'`)\]]*/gm,
    '$1[local path redacted]',
    'local path',
    redactions,
  )
  // Any non-alphanumeric may precede an absolute path, including ':' after a
  // label and '[' inside Markdown. The directory names are matched
  // case-insensitively because a case-insensitive volume accepts /users too.
  output = replace(
    output,
    /(^|[^A-Za-z0-9])\/(?:Users|home|private|tmp|var|opt|Volumes|Applications|Library|mnt|workspace|data|srv|etc)(?:\/[^\s<>"'`)\]]*)?/gim,
    '$1[local path redacted]',
    'local path',
    redactions,
  )
  output = output.replace(/\bhttps?:\/\/[^\s<>()]+/gi, (raw) => {
    try {
      const url = new URL(raw)
      if (!url.search && !url.hash) return raw
      redactions.add('URL query parameters')
      return `${url.origin}${url.pathname}`
    } catch {
      // The preview must never claim that nothing was removed.
      redactions.add('URL')
      return '[URL redacted]'
    }
  })
  output = replace(
    output,
    /\b(?:data:image\/[a-z0-9.+-]+;base64,|[A-Za-z0-9+/]{500,}={0,2})/gi,
    '[embedded data redacted]',
    'embedded data',
    redactions,
  )
  return output
}

function replace(
  value: string,
  pattern: RegExp,
  replacement: string,
  label: string,
  redactions: Set<string>,
): string {
  if (!pattern.test(value)) return value
  pattern.lastIndex = 0
  redactions.add(label)
  return value.replace(pattern, replacement)
}

function diagnosticsText(summary: SafeDiagnosticSummary): string {
  return [
    `Klar: ${summary.appVersion}`,
    `Environment: ${summary.environment}`,
    `Locale: ${summary.locale}`,
    `Platform family: ${summary.platformFamily}`,
    `Browser family: ${summary.browserFamily}`,
    `Viewport: ${summary.viewport}`,
    `Online: ${summary.online ? 'yes' : 'no'}`,
  ].join('\n')
}

function categoryLabel(category: IssueCategory): string {
  const labels: Record<IssueCategory, string> = {
    bug: 'Bug',
    incorrect_result: 'Incorrect result',
    source_problem: 'Data or source problem',
    accessibility: 'Accessibility',
    privacy_security: 'Privacy or security concern',
    feature_request: 'Feature request',
  }
  return labels[category]
}

function severityLabel(severity: IssueSeverity): string {
  return severity[0].toUpperCase() + severity.slice(1)
}

function platformFamily(userAgent: string): SafeDiagnosticSummary['platformFamily'] {
  if (/Android/i.test(userAgent)) return 'Android'
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS'
  if (/Windows/i.test(userAgent)) return 'Windows'
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macOS'
  if (/Linux/i.test(userAgent)) return 'Linux'
  return 'other'
}

function browserFamily(userAgent: string): SafeDiagnosticSummary['browserFamily'] {
  if (/\bElectron\//.test(userAgent)) return 'Electron'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Chrome\/|Chromium\/|Edg\//.test(userAgent)) return 'Chromium'
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return 'Safari'
  return 'other'
}