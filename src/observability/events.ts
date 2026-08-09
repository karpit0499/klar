import { getSetting, setSetting } from '../db/db'

export type OperationalEventName =
  | 'failed_parse'
  | 'blocked_page'
  | 'stale_listing'
  | 'duplicate_merge'
  | 'export_failure'
  | 'report_prepared'
  | 'runtime_crash'
  | 'runtime_cancelled'

export type OperationalEvent = {
  id: string
  name: OperationalEventName
  at: string
  outcome: 'ok' | 'error'
  sourceFamily?: string
  documentKind?: 'resume' | 'cover_letter' | 'packet' | 'diagnostic'
}

const SETTINGS_KEY = 'operationalEvents.v26'
const MAX_EVENTS = 100
const DOCUMENT_KINDS = new Set<NonNullable<OperationalEvent['documentKind']>>([
  'resume',
  'cover_letter',
  'packet',
  'diagnostic',
])
let eventMutationQueue: Promise<void> = Promise.resolve()

function queueEventMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = eventMutationQueue
    .catch(() => undefined)
    .then(mutation)
  eventMutationQueue = operation.then(() => undefined, () => undefined)
  return operation
}

/**
 * Store only bounded, content-free operational facts. Callers cannot attach
 * arbitrary metadata, text, URLs, paths, names, or generated content.
 */
export async function recordOperationalEvent(
  event: Omit<OperationalEvent, 'id' | 'at'> & { at?: string },
): Promise<OperationalEvent> {
  if (!EVENT_NAMES.has(event.name)) {
    throw new TypeError('Invalid operational event name.')
  }
  if (event.outcome !== 'ok' && event.outcome !== 'error') {
    throw new TypeError('Invalid operational event outcome.')
  }
  const row: OperationalEvent = {
    id: crypto.randomUUID(),
    name: event.name,
    at: safeTimestamp(event.at) ? event.at : new Date().toISOString(),
    outcome: event.outcome,
  }
  if (event.sourceFamily && safeToken(event.sourceFamily)) {
    row.sourceFamily = event.sourceFamily
  }
  if (event.documentKind && DOCUMENT_KINDS.has(event.documentKind)) {
    row.documentKind = event.documentKind
  }
  return queueEventMutation(async () => {
    const current = await listOperationalEvents()
    await setSetting(SETTINGS_KEY, [row, ...current].slice(0, MAX_EVENTS))
    return row
  })
}

export async function listOperationalEvents(): Promise<OperationalEvent[]> {
  const stored = await getSetting<unknown>(SETTINGS_KEY)
  if (!Array.isArray(stored)) return []
  return stored.filter(isOperationalEvent).slice(0, MAX_EVENTS)
}

export async function clearOperationalEvents(): Promise<void> {
  await queueEventMutation(async () => {
    await setSetting(SETTINGS_KEY, [])
  })
}

function isOperationalEvent(value: unknown): value is OperationalEvent {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<OperationalEvent>
  return (
    typeof row.id === 'string'
    && safeTimestamp(row.at)
    && EVENT_NAMES.has(row.name as OperationalEventName)
    && (row.outcome === 'ok' || row.outcome === 'error')
    && (row.sourceFamily === undefined || safeToken(row.sourceFamily))
    && (
      row.documentKind === undefined
      || DOCUMENT_KINDS.has(row.documentKind)
    )
  )
}

function safeTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value))
  )
}

function safeToken(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value)
}

const EVENT_NAMES = new Set<OperationalEventName>([
  'failed_parse',
  'blocked_page',
  'stale_listing',
  'duplicate_merge',
  'export_failure',
  'report_prepared',
  'runtime_crash',
  'runtime_cancelled',
])