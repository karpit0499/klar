import { db, getSetting, setSetting } from '../db/db'
import { getVaultStatus } from '../crypto/vault'
import { loadPreferences } from '../storage/careerData'
import { loadCanonicalResume, loadResumeDraft, preserveDraftBeforeRestart } from '../resume/store'
import type { DiscoveryMode, FlexibleWorkPreferences, Preferences } from '../types'

export type OnboardingStep = 'welcome' | 'resume' | 'review' | 'preferences' | 'flexible' | 'connections'

export type OnboardingProgress = {
  step: OnboardingStep
  discoveryMode: DiscoveryMode
  updatedAt: string
}

export type WorkspaceCapabilities = {
  canDiscoverCareer: boolean
  canDiscoverFlexible: boolean
  canPrepareApplications: boolean
  canUseResumeMatching: boolean
}

type SetupDetails = {
  discoveryMode: DiscoveryMode
  hasResume: boolean
  hasDraft: boolean
  hasPreferences: boolean
  capabilities: WorkspaceCapabilities
}

export type LocalSetupState =
  | { kind: 'absent'; resumeAt: 'welcome'; discoveryMode: 'career' }
  | ({ kind: 'partial'; resumeAt: OnboardingStep } & SetupDetails)
  | ({ kind: 'complete' } & SetupDetails)
  | { kind: 'locked'; hasEncryptedWorkspace: true }

const PROGRESS_KEY = 'onboardingProgressV2'
const DISCOVERY_MODE_KEY = 'workspaceDiscoveryModeV1'
const WORK_MODE_KEY = 'workspaceWorkModeV1'

/**
 * Which surface the workspace is currently showing. This is a VIEW choice, not a
 * capability: from v2.4.1 both surfaces are always reachable, so a résumé no
 * longer removes Flexible Work from the app.
 */
export type WorkMode = 'career' | 'flexible'

export async function loadWorkMode(): Promise<WorkMode | null> {
  const stored = await getSetting<WorkMode>(WORK_MODE_KEY)
  return stored === 'career' || stored === 'flexible' ? stored : null
}

export async function saveWorkMode(mode: WorkMode): Promise<void> {
  await setSetting(WORK_MODE_KEY, mode)
}

export function flexiblePreferencesReady(value?: FlexibleWorkPreferences): boolean {
  if (!value || value.locations.length === 0) return false
  return value.employment.length > 0 || value.workplaces.length > 0
}

export function workspaceCapabilities(
  hasResume: boolean,
  preferences: Preferences | null | undefined,
): WorkspaceCapabilities {
  return {
    canDiscoverCareer: hasResume && Boolean(preferences),
    canDiscoverFlexible: flexiblePreferencesReady(preferences?.flexibleWork),
    canPrepareApplications: hasResume,
    canUseResumeMatching: hasResume && Boolean(preferences),
  }
}

export async function detectLocalSetupState(): Promise<LocalSetupState> {
  const vault = await getVaultStatus()
  if (vault === 'locked') return { kind: 'locked', hasEncryptedWorkspace: true }
  const [resume, draft, preferences, progress, storedMode] = await Promise.all([
    loadCanonicalResume(),
    loadResumeDraft(),
    loadPreferences(),
    getSetting<OnboardingProgress>(PROGRESS_KEY),
    getSetting<DiscoveryMode>(DISCOVERY_MODE_KEY),
  ])
  const hasResume = Boolean(resume)
  const hasDraft = Boolean(draft)
  const hasPreferences = Boolean(preferences)
  const discoveryMode = progress?.discoveryMode ?? preferences?.discoveryMode ?? storedMode ?? 'career'
  const capabilities = workspaceCapabilities(hasResume, preferences)
  const completeForMode =
    discoveryMode === 'career'
      ? capabilities.canDiscoverCareer
      : discoveryMode === 'flexible'
        ? capabilities.canDiscoverFlexible
        : capabilities.canDiscoverCareer || capabilities.canDiscoverFlexible

  if (completeForMode && !progress) {
    return { kind: 'complete', discoveryMode, hasResume, hasDraft, hasPreferences, capabilities }
  }
  if (!hasResume && !hasDraft && !hasPreferences && !progress && !storedMode) {
    return { kind: 'absent', resumeAt: 'welcome', discoveryMode: 'career' }
  }
  const resumeAt = progress?.step
    ?? (hasDraft ? 'review' : discoveryMode === 'flexible' || discoveryMode === 'both' ? 'flexible' : hasResume ? 'preferences' : 'resume')
  return {
    kind: 'partial',
    resumeAt,
    discoveryMode,
    hasResume,
    hasDraft,
    hasPreferences,
    capabilities,
  }
}

export async function saveDiscoveryMode(discoveryMode: DiscoveryMode): Promise<void> {
  await setSetting(DISCOVERY_MODE_KEY, discoveryMode)
}

export async function saveOnboardingProgress(
  step: OnboardingStep,
  discoveryMode: DiscoveryMode = 'career',
): Promise<void> {
  await Promise.all([
    setSetting(PROGRESS_KEY, { step, discoveryMode, updatedAt: new Date().toISOString() } satisfies OnboardingProgress),
    saveDiscoveryMode(discoveryMode),
  ])
}

export async function clearOnboardingProgress(): Promise<void> {
  await db.settings.delete(PROGRESS_KEY)
}

/** Preserve a structured draft in bounded history before resetting the route. */
export async function restartSetupSafely(discoveryMode: DiscoveryMode = 'career'): Promise<void> {
  await preserveDraftBeforeRestart()
  await saveOnboardingProgress(discoveryMode === 'flexible' ? 'flexible' : 'resume', discoveryMode)
}