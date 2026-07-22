import { db, getSetting, setSetting } from '../db/db'
import { getVaultStatus, readSensitiveContent } from '../crypto/vault'
import { loadPreferences } from '../storage/careerData'

export type OnboardingStep = 'resume' | 'profile-review' | 'preferences'

export type OnboardingProgress = {
  step: OnboardingStep
  updatedAt: string
}

export type LocalSetupState =
  | { kind: 'absent'; resumeAt: 'resume' }
  | { kind: 'partial'; resumeAt: OnboardingStep; hasProfile: boolean; hasPreferences: boolean }
  | { kind: 'complete'; hasProfile: true; hasPreferences: true }
  | { kind: 'locked'; hasEncryptedWorkspace: true }

const PROGRESS_KEY = 'onboardingProgressV1'

export async function detectLocalSetupState(): Promise<LocalSetupState> {
  const vault = await getVaultStatus()
  if (vault === 'locked') return { kind: 'locked', hasEncryptedWorkspace: true }

  const [preferences, progress] = await Promise.all([
    loadPreferences(),
    getSetting<OnboardingProgress>(PROGRESS_KEY),
  ])
  let hasProfile = false
  if (vault === 'unlocked') {
    hasProfile = Boolean((await readSensitiveContent())?.profiles.length)
  } else {
    hasProfile = (await db.profiles.count()) > 0
  }
  const hasPreferences = Boolean(preferences)
  if (hasProfile && hasPreferences) return { kind: 'complete', hasProfile: true, hasPreferences: true }
  if (!hasProfile && !hasPreferences && !progress) return { kind: 'absent', resumeAt: 'resume' }

  const resumeAt: OnboardingStep = progress?.step ?? (hasProfile ? 'preferences' : 'resume')
  return { kind: 'partial', resumeAt, hasProfile, hasPreferences }
}

export async function saveOnboardingProgress(step: OnboardingStep): Promise<void> {
  await setSetting(PROGRESS_KEY, { step, updatedAt: new Date().toISOString() } satisfies OnboardingProgress)
}

export async function clearOnboardingProgress(): Promise<void> {
  await db.settings.delete(PROGRESS_KEY)
}