// ============================================================================
// v2.5 · Application-quality feature flags + kill switches.
//
// Risk R10 of the ATS plan says the riskiest v2.5 changes (the LLM requirement
// extractor and the reframing/review engine) must ship behind the same kind of
// flag fabric v2.4 already delivered for connectors — so an operator can turn
// one thing off WITHOUT redeploying the static client. This module is the exact
// same shape as `src/flexible/flags.ts`, deliberately: one stored object, safe
// defaults, and a partial-patch save.
//
// Turning a flag off must always fall back to a WORKING, honest path:
//   jdRequirementExtractor off → deterministic dictionary coverage only
//   tailoringReview        off → the v2.4 "generate and download" flow
//   customEngine           off → hosted Groq defaults only
//   packets                off → nothing is persisted; the drawer is session-only
// ============================================================================
import { getSetting, setSetting } from '../db/db'

export type AppFlags = {
  /** WS2: add LLM-proposed job requirements on top of the term dictionary. */
  jdRequirementExtractor: boolean
  /** WS4a: evidence statuses, the change review, and the one bounded retry. */
  tailoringReview: boolean
  /** WS3: user-configurable OpenAI-compatible engine (base URL + model). */
  customEngine: boolean
  /** v2.5: persist an application packet per job (career and flexible). */
  packets: boolean
}

const KEY = 'appFlags.v25'

export const DEFAULT_APP_FLAGS: AppFlags = {
  jdRequirementExtractor: true,
  tailoringReview: true,
  customEngine: true,
  packets: true,
}

export async function loadAppFlags(): Promise<AppFlags> {
  try {
    const stored = await getSetting<Partial<AppFlags>>(KEY)
    return { ...DEFAULT_APP_FLAGS, ...stored }
  } catch {
    // No database yet (first paint, or a non-browser context): safe defaults.
    return { ...DEFAULT_APP_FLAGS }
  }
}

export async function saveAppFlags(patch: Partial<AppFlags>): Promise<AppFlags> {
  const next = { ...(await loadAppFlags()), ...patch }
  await setSetting(KEY, next)
  return next
}

export async function resetAppFlags(): Promise<AppFlags> {
  await setSetting(KEY, { ...DEFAULT_APP_FLAGS })
  return { ...DEFAULT_APP_FLAGS }
}