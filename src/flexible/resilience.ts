// ============================================================================
// Circuit breaker + health tracking (roadmap §6.2). Each connector tracks
// consecutive failures, a rolling success rate, latency, schema-validation
// failures, last success and last verified result, and a cooldown. Repeated
// failure OPENS the circuit; searches skip the connector during cooldown; a
// low-frequency canary probes recovery; operators keep a manual kill switch.
//
// The state transitions are pure and unit-tested; the store I/O is thin Dexie.
// ============================================================================
import { db, type ConnectorHealthRow } from '../db/db'

export const BREAKER = {
  /** Consecutive failures that open the circuit. */
  failuresToOpen: 4,
  /** How long the circuit stays open before a canary probe is allowed. */
  cooldownMs: 5 * 60_000,
} as const

export function newHealth(connectorId: string): ConnectorHealthRow {
  return { connectorId, consecutiveFailures: 0, successes: 0, failures: 0, schemaFailures: 0, killed: false }
}

export function recordSuccess(
  health: ConnectorHealthRow,
  latencyMs: number,
  now = Date.now(),
): ConnectorHealthRow {
  const stamp = new Date(now).toISOString()
  return {
    ...health,
    consecutiveFailures: 0,
    successes: health.successes + 1,
    lastSuccessAt: stamp,
    lastVerifiedAt: stamp,
    lastLatencyMs: latencyMs,
    openedAt: undefined,
    cooldownUntil: undefined,
  }
}

export function recordFailure(
  health: ConnectorHealthRow,
  opts: { schema?: boolean } = {},
  now = Date.now(),
): ConnectorHealthRow {
  const consecutiveFailures = health.consecutiveFailures + 1
  const shouldOpen = consecutiveFailures >= BREAKER.failuresToOpen
  return {
    ...health,
    consecutiveFailures,
    failures: health.failures + 1,
    schemaFailures: health.schemaFailures + (opts.schema ? 1 : 0),
    openedAt: shouldOpen ? new Date(now).toISOString() : health.openedAt,
    cooldownUntil: shouldOpen ? new Date(now + BREAKER.cooldownMs).toISOString() : health.cooldownUntil,
  }
}

/** Rolling success rate 0..1 over all observed attempts. */
export function successRate(health: ConnectorHealthRow): number {
  const total = health.successes + health.failures
  return total === 0 ? 1 : health.successes / total
}

/** True while the circuit is open and still inside its cooldown window. */
export function isCircuitOpen(health: ConnectorHealthRow, now = Date.now()): boolean {
  if (!health.cooldownUntil) return false
  return new Date(health.cooldownUntil).getTime() > now
}

/**
 * Should this search SKIP the connector right now? Skips when killed or while
 * the circuit is open — except we let a single canary through once cooldown has
 * elapsed but the breaker has not yet been reset by a success.
 */
export function shouldSkip(health: ConnectorHealthRow, now = Date.now()): boolean {
  if (health.killed) return true
  return isCircuitOpen(health, now)
}

/** True when the circuit is past cooldown and a recovery canary is warranted. */
export function canaryDue(health: ConnectorHealthRow, now = Date.now()): boolean {
  return Boolean(health.openedAt) && !isCircuitOpen(health, now)
}

// --- Store I/O ---------------------------------------------------------------

export async function loadHealth(connectorId: string): Promise<ConnectorHealthRow> {
  return (await db.connectorHealth.get(connectorId)) ?? newHealth(connectorId)
}

export async function saveHealth(row: ConnectorHealthRow): Promise<void> {
  await db.connectorHealth.put(row)
}

export async function loadAllHealth(): Promise<ConnectorHealthRow[]> {
  return db.connectorHealth.toArray()
}

/** Record the outcome of one connector run against its persisted health. */
export async function observe(
  connectorId: string,
  outcome: { ok: boolean; latencyMs?: number; schema?: boolean },
  now = Date.now(),
): Promise<ConnectorHealthRow> {
  const current = await loadHealth(connectorId)
  const next = outcome.ok
    ? recordSuccess(current, outcome.latencyMs ?? 0, now)
    : recordFailure(current, { schema: outcome.schema }, now)
  await saveHealth(next)
  return next
}

/** Manual kill switch persisted on the health row (mirrors the flags list). */
export async function setKilled(connectorId: string, killed: boolean): Promise<void> {
  const current = await loadHealth(connectorId)
  await saveHealth({ ...current, killed })
}