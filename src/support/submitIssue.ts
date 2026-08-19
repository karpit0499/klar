import { WORKER_URL } from '../lib/config'
import type { IssueCategory, IssueSeverity, PreparedIssueReport } from './issueReport'

export type IssueReceipt = {
  requestId: string
  issueNumber: number
  issueUrl: string
}

export class IssueSubmissionError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code)
    this.name = 'IssueSubmissionError'
  }
}

export function directIssueSubmissionConfigured(): boolean {
  return Boolean(WORKER_URL && import.meta.env.VITE_TURNSTILE_SITE_KEY)
}

export async function submitPreparedIssue(
  report: PreparedIssueReport,
  input: {
    requestId: string
    category: Exclude<IssueCategory, 'privacy_security'>
    severity: IssueSeverity
    turnstileToken: string
    website?: string
    signal?: AbortSignal
  },
): Promise<IssueReceipt> {
  if (!WORKER_URL) throw new IssueSubmissionError('feedback_not_configured', 0)
  const response = await fetch(`${WORKER_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: input.requestId,
      title: report.title,
      body: report.body,
      category: input.category,
      severity: input.severity,
      turnstileToken: input.turnstileToken,
      website: input.website ?? '',
    }),
    signal: input.signal,
  })
  const payload = await response.json().catch(() => ({})) as {
    code?: unknown
    requestId?: unknown
    issueNumber?: unknown
    issueUrl?: unknown
  }
  if (!response.ok) {
    throw new IssueSubmissionError(
      typeof payload.code === 'string' ? payload.code : 'feedback_unavailable',
      response.status,
    )
  }
  if (
    typeof payload.requestId !== 'string' ||
    payload.requestId !== input.requestId ||
    typeof payload.issueNumber !== 'number' ||
    !Number.isSafeInteger(payload.issueNumber) ||
    payload.issueNumber < 1 ||
    typeof payload.issueUrl !== 'string' ||
    !isExpectedIssueUrl(payload.issueUrl, payload.issueNumber)
  ) throw new IssueSubmissionError('invalid_feedback_response', response.status)
  return {
    requestId: payload.requestId,
    issueNumber: payload.issueNumber,
    issueUrl: payload.issueUrl,
  }
}

function isExpectedIssueUrl(raw: string, issueNumber: number): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.search === '' &&
      url.hash === '' &&
      url.pathname === `/karpit0499/klar/issues/${issueNumber}`
  } catch {
    return false
  }
}
