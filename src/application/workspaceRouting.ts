import type { WorkMode } from '../onboarding/setupState'

export function shouldVisitFlexibleSearch({
  tab,
  hasCareer,
  workMode,
}: {
  tab: 'dashboard' | 'search' | 'tracker' | 'settings'
  hasCareer: boolean
  workMode?: WorkMode
}): boolean {
  const activeMode: WorkMode = hasCareer ? (workMode ?? 'career') : 'flexible'
  return tab === 'search' && activeMode === 'flexible'
}