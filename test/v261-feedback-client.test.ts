import assert from 'node:assert/strict'
import test from 'node:test'
import type { PreparedIssueReport } from '../src/support/issueReport'

const REQUEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const prepared: PreparedIssueReport = {
  title: 'A reviewed report',
  body: 'The complete reviewed public issue body.',
  destination: 'public_issue',
  destinationUrl: 'https://github.com/karpit0499/klar/issues/new',
  composerUrl: 'https://github.com/karpit0499/klar/issues/new',
  composerTooLong: false,
  redactions: [],
}

test('the feedback client reuses the caller report ID and accepts only the fixed issue URL', async () => {
  ;(globalThis as { VITE_WORKER_URL?: string }).VITE_WORKER_URL = 'https://worker.example'
  const { IssueSubmissionError, submitPreparedIssue } = await import('../src/support/submitIssue')
  const originalFetch = globalThis.fetch
  let receivedId = ''
  try {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { requestId?: unknown }
      receivedId = String(payload.requestId)
      return Response.json({
        requestId: REQUEST_ID,
        issueNumber: 261,
        issueUrl: 'https://github.com/karpit0499/klar/issues/261',
      })
    }) as typeof fetch

    const receipt = await submitPreparedIssue(prepared, {
      requestId: REQUEST_ID,
      category: 'bug',
      severity: 'medium',
      turnstileToken: 'test-token',
    })
    assert.equal(receivedId, REQUEST_ID)
    assert.equal(receipt.requestId, REQUEST_ID)

    globalThis.fetch = (async () => Response.json({
      requestId: REQUEST_ID,
      issueNumber: 261,
      issueUrl: 'https://attacker.example/issues/261',
    })) as typeof fetch
    await assert.rejects(
      submitPreparedIssue(prepared, {
        requestId: REQUEST_ID,
        category: 'bug',
        severity: 'medium',
        turnstileToken: 'test-token',
      }),
      (caught: unknown) => caught instanceof IssueSubmissionError && caught.code === 'invalid_feedback_response',
    )

    globalThis.fetch = (async () => Response.json({
      requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      issueNumber: 261,
      issueUrl: 'https://github.com/karpit0499/klar/issues/261',
    })) as typeof fetch
    await assert.rejects(
      submitPreparedIssue(prepared, {
        requestId: REQUEST_ID,
        category: 'bug',
        severity: 'medium',
        turnstileToken: 'test-token',
      }),
      (caught: unknown) => caught instanceof IssueSubmissionError && caught.code === 'invalid_feedback_response',
    )
  } finally {
    globalThis.fetch = originalFetch
    delete (globalThis as { VITE_WORKER_URL?: string }).VITE_WORKER_URL
  }
})
