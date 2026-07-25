// ============================================================================
// The progressive Search Session (roadmap §2). One local session runs every
// active connector concurrently in a bounded queue, NEVER Promise.all across the
// whole catalogue. Batches stream in; the model:
//
//   • merges duplicates IN PLACE (a direct-employer duplicate can replace an
//     aggregator apply link and enrich fields without moving the card),
//   • publishes page 1 at 10 results and fills it to 20,
//   • keeps published pages stable (append-only order — never reshuffled),
//   • honours the 8s low-supply escape hatch and the 60s hard deadline,
//   • ends every loading indicator at a terminal state (§2.4).
//
// The model is pure and synchronous (unit-testable); the runner owns timers,
// per-attempt timeouts and retries, all injectable for tests.
// ============================================================================
import type { NormalizedJob } from '../types'
import type { AppErrorData } from '../errors/appError'
import { serializeAppError, toAppError } from '../errors/appError'
import { normalizeKey } from '../lib/hash'
import {
  SEARCH_FIRST_PUBLISH_MIN,
  SEARCH_HARD_DEADLINE_MS,
  SEARCH_LOW_SUPPLY_PUBLISH_MS,
  SEARCH_PAGE_SIZE,
  canRetrySearchSource,
} from '../search/sessionPolicy'
import type { Connector, ConnectorContext, ConnectorResult, ConnectorType, FabricFetch, FlexibleQuery } from './connectors/types'

export type SourceStatus = 'pending' | 'running' | 'ok' | 'fallback' | 'error' | 'timeout' | 'skipped'
export type SessionPhase = 'idle' | 'searching' | 'complete' | 'partial' | 'limited'

export type SourceState = {
  connectorId: string
  employerFamily: string
  type: ConnectorType
  status: SourceStatus
  attempts: number
  count: number
  note?: string
  error?: AppErrorData
  latencyMs?: number
}

export type SearchSessionSnapshot = {
  id: string
  phase: SessionPhase
  pageSize: number
  /** Published pages (frozen membership). Empty until the first publish. */
  pages: NormalizedJob[][]
  totalPages: number
  publishedCount: number
  totalCount: number
  openEntryCount: number
  sources: SourceState[]
  activeCount: number
  finishedCount: number
  totalSources: number
  startedAt: number
  deadlineAt: number
  elapsedMs: number
  reason?: 'all_done' | 'deadline' | 'stopped'
}

function canonicalKeys(job: NormalizedJob): string[] {
  const fuzzy = `${normalizeKey(job.title)}|${normalizeKey(job.company)}|${normalizeKey(job.location.city ?? '')}`
  return [`id:${job.id}`, `fz:${fuzzy}`]
}

/** Merge `incoming` into `existing` in place; prefer direct-employer apply links. */
export function mergeOpportunity(existing: NormalizedJob, incoming: NormalizedJob): NormalizedJob {
  const incomingIsDirect = incoming.source === 'fabric' && existing.source !== 'fabric'
  const primary = incomingIsDirect ? incoming : existing
  const secondary = incomingIsDirect ? existing : incoming

  const also = [...(existing.also_on ?? []), ...(incoming.also_on ?? [])]
  if (secondary.url && secondary.url !== primary.url) {
    also.push({ source: secondary.source, source_id: secondary.source_id, url: secondary.url })
  }
  const seen = new Set<string>()
  const also_on = also.filter((entry) => (seen.has(entry.url) ? false : (seen.add(entry.url), true)))

  const union = <T>(a?: T[], b?: T[]): T[] | undefined => {
    const merged = [...new Set([...(a ?? []), ...(b ?? [])])]
    return merged.length ? merged : undefined
  }
  // Published provenance beats inferred when merging the two records.
  const fieldProvenance = { ...(secondary.fieldProvenance ?? {}), ...(primary.fieldProvenance ?? {}) }

  return {
    ...primary,
    description: primary.description.length >= secondary.description.length ? primary.description : secondary.description,
    posted_at: primary.posted_at ?? secondary.posted_at,
    validThrough: primary.validThrough ?? secondary.validThrough,
    salary: {
      min: primary.salary.min ?? secondary.salary.min,
      max: primary.salary.max ?? secondary.salary.max,
      currency: primary.salary.currency ?? secondary.salary.currency,
      period: primary.salary.period ?? secondary.salary.period,
    },
    employment: union(primary.employment, secondary.employment),
    roleFamilies: union(primary.roleFamilies, secondary.roleFamilies),
    workplaces: union(primary.workplaces, secondary.workplaces),
    tags: [...new Set([...primary.tags, ...secondary.tags])],
    also_on: also_on.length ? also_on : undefined,
    fieldProvenance: Object.keys(fieldProvenance).length ? fieldProvenance : undefined,
  }
}

/** Pure, synchronous session state. The runner feeds it; the UI reads snapshots. */
export class SearchSessionModel {
  readonly id: string
  readonly startedAt: number
  readonly deadlineAt: number
  private readonly pageSize: number
  private readonly firstPublishMin: number
  private ordered: NormalizedJob[] = []
  private keyIndex = new Map<string, number>()
  private sources = new Map<string, SourceState>()
  private firstPublished = false
  private finished = false
  private reason?: SearchSessionSnapshot['reason']

  constructor(opts: {
    id: string
    startedAt: number
    deadlineAt: number
    pageSize?: number
    firstPublishMin?: number
    connectors: { connectorId: string; employerFamily: string; type: ConnectorType }[]
  }) {
    this.id = opts.id
    this.startedAt = opts.startedAt
    this.deadlineAt = opts.deadlineAt
    this.pageSize = opts.pageSize ?? SEARCH_PAGE_SIZE
    this.firstPublishMin = opts.firstPublishMin ?? SEARCH_FIRST_PUBLISH_MIN
    for (const c of opts.connectors) {
      this.sources.set(c.connectorId, {
        connectorId: c.connectorId,
        employerFamily: c.employerFamily,
        type: c.type,
        status: 'pending',
        attempts: 0,
        count: 0,
      })
    }
  }

  markRunning(id: string): void {
    const state = this.sources.get(id)
    if (state) { state.status = 'running'; state.attempts += 1 }
  }

  markSkipped(id: string, note?: string): void {
    const state = this.sources.get(id)
    if (state) { state.status = 'skipped'; state.note = note }
  }

  /** Ingest one connector's batch: merge/append opportunities, update its state. */
  ingest(id: string, result: ConnectorResult, latencyMs: number): void {
    const state = this.sources.get(id)
    for (const opp of result.opportunities) this.add(opp)
    if (state) {
      state.status = result.usedFallback ? 'fallback' : 'ok'
      state.count = result.opportunities.length
      state.note = result.note
      state.latencyMs = latencyMs
      if (result.error) state.error = result.error
    }
  }

  markError(id: string, error: unknown, opts: { timedOut?: boolean } = {}): void {
    const state = this.sources.get(id)
    if (!state) return
    state.status = opts.timedOut ? 'timeout' : 'error'
    state.error = serializeAppError(
      toAppError(error, { category: 'source', message: `${state.employerFamily} could not complete this search.` }),
    )
  }

  private add(opp: NormalizedJob): void {
    let index = -1
    for (const key of canonicalKeys(opp)) {
      const found = this.keyIndex.get(key)
      if (found !== undefined) { index = found; break }
    }
    if (index >= 0) {
      this.ordered[index] = mergeOpportunity(this.ordered[index], opp)
      for (const key of canonicalKeys(this.ordered[index])) this.keyIndex.set(key, index)
      return
    }
    const next = this.ordered.length
    this.ordered.push(opp)
    for (const key of canonicalKeys(opp)) this.keyIndex.set(key, next)
  }

  /** Reveal page 1 once the threshold, escape hatch, or completion is reached. */
  evaluatePublish(opts: { lowSupplyElapsed?: boolean } = {}): void {
    if (this.firstPublished) return
    const enough = this.ordered.length >= this.firstPublishMin
    const escape = Boolean(opts.lowSupplyElapsed) && this.ordered.length > 0
    if (enough || escape || (this.finished && this.ordered.length > 0)) this.firstPublished = true
  }

  finish(reason: SearchSessionSnapshot['reason']): void {
    this.finished = true
    this.reason = reason
    if (this.ordered.length > 0) this.firstPublished = true
    for (const state of this.sources.values()) {
      if (state.status === 'pending' || state.status === 'running') {
        state.status = reason === 'deadline' ? 'timeout' : 'skipped'
      }
    }
  }

  snapshot(now: number): SearchSessionSnapshot {
    const sources = [...this.sources.values()]
    const finishedCount = sources.filter((s) => ['ok', 'fallback', 'error', 'timeout', 'skipped'].includes(s.status)).length
    const activeCount = sources.length - finishedCount
    const pages = this.firstPublished ? chunk(this.ordered, this.pageSize) : []
    const openEntryCount = this.ordered.filter((job) => job.kind === 'open_entry').length

    let phase: SessionPhase = 'idle'
    if (!this.finished) {
      phase = 'searching'
    } else {
      // A source that errored, timed out, or was cut off by the deadline "did
      // not finish" — that is partial (limited) coverage, not a clean complete.
      const anyUnfinished = sources.some((s) => s.status === 'error' || s.status === 'timeout' || s.status === 'skipped')
      phase = this.ordered.length === 0 ? 'limited' : anyUnfinished ? 'partial' : 'complete'
    }

    return {
      id: this.id,
      phase,
      pageSize: this.pageSize,
      pages,
      totalPages: pages.length,
      publishedCount: this.firstPublished ? this.ordered.length : 0,
      totalCount: this.ordered.length,
      openEntryCount,
      sources,
      activeCount,
      finishedCount,
      totalSources: sources.length,
      startedAt: this.startedAt,
      deadlineAt: this.deadlineAt,
      elapsedMs: now - this.startedAt,
      reason: this.reason,
    }
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// --- The async orchestrator --------------------------------------------------

export type RunSearchOptions = {
  connectors: Connector[]
  query: FlexibleQuery
  proxy: FabricFetch
  onUpdate: (snapshot: SearchSessionSnapshot) => void
  signal?: AbortSignal
  deadlineMs?: number
  lowSupplyMs?: number
  concurrency?: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
  newSessionId?: () => string
}

/** Run a full progressive search. Resolves with the final snapshot. */
export async function runSearchSession(opts: RunSearchOptions): Promise<SearchSessionSnapshot> {
  const now = opts.now ?? (() => Date.now())
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((handle) => clearTimeout(handle))
  const deadlineMs = opts.deadlineMs ?? SEARCH_HARD_DEADLINE_MS
  const lowSupplyMs = opts.lowSupplyMs ?? SEARCH_LOW_SUPPLY_PUBLISH_MS
  const concurrency = opts.concurrency ?? 6
  const startedAt = now()
  const deadlineAt = startedAt + deadlineMs

  const rootController = new AbortController()
  const onExternalAbort = () => rootController.abort()
  if (opts.signal) {
    if (opts.signal.aborted) rootController.abort()
    else opts.signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  const model = new SearchSessionModel({
    id: opts.newSessionId?.() ?? `fs_${startedAt}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt,
    deadlineAt,
    connectors: opts.connectors.map((c) => ({
      connectorId: c.config.id,
      employerFamily: c.config.employerFamily,
      type: c.config.type,
    })),
  })

  const emit = () => opts.onUpdate(model.snapshot(now()))
  emit()

  const lowSupplyTimer = setTimer(() => {
    model.evaluatePublish({ lowSupplyElapsed: true })
    emit()
  }, lowSupplyMs)

  let deadlineHit = false
  const deadlineTimer = setTimer(() => {
    deadlineHit = true
    rootController.abort()
  }, deadlineMs)

  const ctx: ConnectorContext = { proxy: opts.proxy, signal: rootController.signal, now }
  const queue = [...opts.connectors]

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      if (rootController.signal.aborted) return
      const connector = queue.shift()!
      await runConnector(connector, opts.query, ctx, model, {
        deadlineAt,
        now,
        rootSignal: rootController.signal,
      })
      model.evaluatePublish()
      emit()
    }
  }

  const pool = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  await Promise.all(pool)

  clearTimer(lowSupplyTimer)
  clearTimer(deadlineTimer)
  opts.signal?.removeEventListener('abort', onExternalAbort)

  model.finish(deadlineHit ? 'deadline' : opts.signal?.aborted && !deadlineHit ? 'stopped' : 'all_done')
  const finalSnapshot = model.snapshot(now())
  opts.onUpdate(finalSnapshot)
  return finalSnapshot
}

/** Run one connector with per-attempt timeout + bounded retries (§2.1). */
async function runConnector(
  connector: Connector,
  query: FlexibleQuery,
  ctx: ConnectorContext,
  model: SearchSessionModel,
  opts: { deadlineAt: number; now: () => number; rootSignal: AbortSignal },
): Promise<void> {
  const id = connector.config.id
  const attemptTimeoutMs = clampAttemptTimeout(connector.config.attemptTimeoutMs)
  let retryCount = 0

  for (;;) {
    if (opts.rootSignal.aborted) { model.markSkipped(id, 'Search deadline reached'); return }
    model.markRunning(id)
    const startedAt = opts.now()
    const attempt = await runAttempt(connector, query, ctx, attemptTimeoutMs, opts.rootSignal)
    const latency = opts.now() - startedAt

    if (attempt.ok) { model.ingest(id, attempt.result, latency); return }
    if (attempt.aborted) { model.markSkipped(id, 'Search deadline reached'); return }

    const remainingMs = opts.deadlineAt - opts.now()
    const retry = connector.config.retryEligible && canRetrySearchSource({
      retryCount,
      status: attempt.status,
      networkError: attempt.networkError,
      timedOut: attempt.timedOut,
      remainingMs,
    })
    if (!retry) {
      model.markError(id, attempt.error, { timedOut: attempt.timedOut })
      return
    }
    retryCount += 1
  }
}

function clampAttemptTimeout(ms: number): number {
  return Math.min(15_000, Math.max(10_000, ms))
}

type AttemptOutcome =
  | { ok: true; result: ConnectorResult }
  | { ok: false; error: unknown; timedOut?: boolean; networkError?: boolean; status?: number; aborted?: boolean }

async function runAttempt(
  connector: Connector,
  query: FlexibleQuery,
  ctx: ConnectorContext,
  timeoutMs: number,
  rootSignal: AbortSignal,
): Promise<AttemptOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const timeout = new Promise<AttemptOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: new Error('attempt timeout'), timedOut: true }), timeoutMs)
  })
  // The hard deadline (or a user Stop) must end an in-flight attempt promptly,
  // even if the source ignores the abort signal.
  const aborted = new Promise<AttemptOutcome>((resolve) => {
    if (rootSignal.aborted) return resolve({ ok: false, error: new Error('aborted'), aborted: true })
    onAbort = () => resolve({ ok: false, error: new Error('aborted'), aborted: true })
    rootSignal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    const run = connector
      .run(query, ctx)
      .then((result): AttemptOutcome => ({ ok: true, result }))
      .catch((error): AttemptOutcome => ({
        ok: false,
        error,
        networkError: isNetworkError(error),
        status: statusOf(error),
      }))
    return await Promise.race([run, timeout, aborted])
  } finally {
    if (timer) clearTimeout(timer)
    if (onAbort) rootSignal.removeEventListener('abort', onAbort)
  }
}

function isNetworkError(error: unknown): boolean {
  return error instanceof Error && /network|reach|fetch/i.test(error.message)
}
function statusOf(error: unknown): number | undefined {
  const technical = (error as { technical?: string })?.technical
  const match = technical?.match(/HTTP (\d{3})/)
  return match ? Number(match[1]) : undefined
}