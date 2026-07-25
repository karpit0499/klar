// ============================================================================
// The default FabricFetch — the browser's only path to employer hosts. It calls
// the Worker's allowlisted `/fabric` route (never a raw upstream URL). The
// Worker validates host + path against its own allowlist, enforces GET-only,
// byte/type/timeout limits, redirect safety and XML hardening, then returns a
// JSON envelope { status, contentType, body }. Tests/fixtures inject their own
// FabricFetch and never touch the network.
// ============================================================================
import { WORKER_URL } from '../../lib/config'
import { AppError, isAppErrorData } from '../../errors/appError'
import type { FabricFetch } from './types'

export const workerFabricFetch: FabricFetch = async (input) => {
  if (!WORKER_URL) {
    throw new AppError({
      category: 'network',
      message: 'The Flexible Work source service is not configured.',
      dataSafe: true,
      available: 'Baseline job sources and saved data still work.',
      action: { label: 'Open Settings', kind: 'open_settings' },
      technical: 'VITE_WORKER_URL is not set; the /fabric route is unavailable.',
    })
  }
  const url =
    `${WORKER_URL}/fabric` +
    `?host=${encodeURIComponent(input.host)}` +
    `&path=${encodeURIComponent(input.path)}` +
    `&accept=${encodeURIComponent(input.accept)}` +
    `&max=${encodeURIComponent(String(input.maxBytes))}`

  let res: Response
  try {
    res = await fetch(url, { signal: input.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AppError({
      category: 'network',
      message: 'Klar could not reach the source service.',
      dataSafe: true,
      available: 'Baseline job sources and saved local data still work.',
      action: { label: 'Retry', kind: 'retry' },
      technical: error instanceof Error ? error.message : String(error),
    })
  }

  const text = await res.text()
  if (!res.ok) {
    try {
      const parsed = JSON.parse(text) as { error?: unknown }
      if (isAppErrorData(parsed.error)) throw new AppError(parsed.error)
    } catch (error) {
      if (error instanceof AppError) throw error
    }
    throw new AppError({
      category: res.status === 429 ? 'rate_limit' : 'source',
      message: 'A Flexible Work source returned an error.',
      dataSafe: true,
      available: 'Other sources and the baseline still return results.',
      action: { label: 'Retry', kind: 'retry' },
      technical: `HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`,
    })
  }

  const data = JSON.parse(text) as { status: number; contentType: string; body: string }
  return { status: data.status, contentType: data.contentType, body: data.body }
}