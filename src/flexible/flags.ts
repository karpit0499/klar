// ============================================================================
// Feature flags + per-connector kill switches (roadmap §5.2 / §6.2 / v2.4
// deliverables). Stored in the plaintext settings store (non-sensitive). An
// operator can disable the whole fabric, a single connector, or the optional
// embedding classifier WITHOUT redeploying the static client.
// ============================================================================
import { getSetting, setSetting } from '../db/db'
import type { ConnectorConfig } from './connectors/types'

export type FlexibleFlags = {
  /** Master switch for the whole Source Fabric (baseline API always stays on). */
  fabricEnabled: boolean
  /** Optional local embedding classifier for ambiguous titles (§4). */
  embeddingClassifier: boolean
  /** Connector ids disabled by the operator (kill switches). */
  disabledConnectors: string[]
}

const KEY = 'flexibleFlags.v1'

export const DEFAULT_FLEXIBLE_FLAGS: FlexibleFlags = {
  fabricEnabled: true,
  embeddingClassifier: false,
  disabledConnectors: [],
}

export async function loadFlexibleFlags(): Promise<FlexibleFlags> {
  const stored = await getSetting<Partial<FlexibleFlags>>(KEY)
  return {
    ...DEFAULT_FLEXIBLE_FLAGS,
    ...stored,
    disabledConnectors: stored?.disabledConnectors ?? [],
  }
}

export async function saveFlexibleFlags(patch: Partial<FlexibleFlags>): Promise<FlexibleFlags> {
  const next = { ...(await loadFlexibleFlags()), ...patch }
  await setSetting(KEY, next)
  return next
}

/** Flip one connector's kill switch. */
export async function setConnectorKilled(connectorId: string, killed: boolean): Promise<FlexibleFlags> {
  const flags = await loadFlexibleFlags()
  const set = new Set(flags.disabledConnectors)
  if (killed) set.add(connectorId)
  else set.delete(connectorId)
  return saveFlexibleFlags({ disabledConnectors: [...set] })
}

/** True when a connector may run under the current flags + its own health flag. */
export function isConnectorEnabled(flags: FlexibleFlags, config: ConnectorConfig): boolean {
  if (!config.health.enabled) return false
  if (flags.disabledConnectors.includes(config.id)) return false
  // Baseline API connectors are the always-on floor; the master switch only
  // gates the employer-direct fabric.
  if (!flags.fabricEnabled && config.type !== 'api') return false
  return true
}