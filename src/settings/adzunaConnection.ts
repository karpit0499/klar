import { workerUrl } from '../lib/http'
import { adzunaKeyHeaders } from '../sources/adzuna'
import type { AdzunaKey } from './adzunaKey'
import { AppError, isAppErrorData } from '../errors/appError'

export type ConnectionTestResult =
  | { ok: true; message: string }
  | { ok: false; error: AppError }

export async function testAdzunaConnection(key: AdzunaKey): Promise<ConnectionTestResult> {
  try {
    const url = workerUrl('adzuna', '/v1/api/jobs/de/search/1?results_per_page=1&what=test')
    const response = await fetch(url, { headers: adzunaKeyHeaders(key) })
    if (response.ok) return { ok: true, message: 'Adzuna connection works.' }
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null
    if (isAppErrorData(body?.error)) return { ok: false, error: new AppError(body.error) }
    const category = response.status === 429 ? 'rate_limit' : response.status === 401 || response.status === 403 ? 'credentials' : 'source'
    return {
      ok: false,
      error: new AppError({
        category,
        message:
          category === 'credentials'
            ? 'Adzuna rejected these credentials.'
            : category === 'rate_limit'
              ? 'Adzuna has reached its request limit.'
              : 'Adzuna is temporarily unavailable.',
        dataSafe: true,
        available: 'Other job sources remain available.',
        action: {
          label: category === 'credentials' ? 'Check both credential fields' : 'Try again later',
          kind: category === 'credentials' ? 'open_settings' : 'retry',
        },
        technical: `HTTP ${response.status}`,
      }),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof AppError
        ? error
        : new AppError({
            category: 'network',
            message: 'Klar could not reach the Adzuna connection test.',
            dataSafe: true,
            available: 'Other job sources remain available.',
            action: { label: 'Check the connection and retry', kind: 'retry' },
            technical: error instanceof Error ? error.message : String(error),
          }),
    }
  }
}