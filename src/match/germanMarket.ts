// ============================================================================
// German-market hard filters (features 2.1 & 2.2).
//
// These are the two things that actually DISQUALIFY a candidate on the German
// market: a German-language requirement above the user's level, and a role that
// explicitly won't sponsor a visa. We detect both DETERMINISTICALLY from the
// posting text (no LLM, no network) so the filters are honest and testable.
// The UI turns each into a toggle that hides or segregates the blocked roles.
// ============================================================================
import type { NormalizedJob, Preferences } from '../types'

// --- CEFR language levels ----------------------------------------------------
// Ranked 0–4 so we can compare "required" vs "the user has".
//   0 = none/unknown · 1 = A (basic) · 2 = B (professional) · 3 = C (fluent) · 4 = native
export function cefrRank(level: string | undefined | null): number | null {
  if (!level) return null
  const s = level.toLowerCase()
  if (/(muttersprach|native|mother\s*tongue)/.test(s)) return 4
  if (/\bc[12]\b|verhandlungssicher|flie(ss|ß)end|fluent/.test(s)) return 3
  if (/\bb[12]\b|professional|gute?\b|good|intermediate/.test(s)) return 2
  if (/\ba[12]\b|basic|grund|beginner|conversational/.test(s)) return 1
  return null
}

/** The user's German level (rank 0–4) from their preferences, or null if unknown. */
export function userGermanRank(prefs: Preferences): number | null {
  const de = (prefs.languages ?? []).find((l) => /deutsch|german/i.test(l.lang))
  if (!de) return null
  return cefrRank(de.min_level)
}

// --- Detect a German-language requirement in a posting -----------------------
export type GermanRequirement = { required: boolean; level: number | null }

export function detectGermanRequirement(job: NormalizedJob): GermanRequirement {
  const hay = `${job.title}\n${job.description}`.toLowerCase()

  // Explicit CEFR level tied to German, e.g. "Deutsch C1" or "German (B2)".
  const near = hay.match(/(?:deutsch|german)[^.\n]{0,24}\b([abc][12])\b/) ||
    hay.match(/\b([abc][12])\b[^.\n]{0,24}(?:deutsch|german)/)
  if (near) {
    const letter = near[1][0]
    const level = letter === 'c' ? 3 : letter === 'b' ? 2 : 1
    return { required: true, level }
  }
  // Native / mother-tongue German.
  if (/(deutsch\s+als\s+muttersprache|muttersprach\w*\s+deutsch|native\s+german|german\s+(?:\w+\s+)?native)/.test(hay)) {
    return { required: true, level: 4 }
  }
  // Fluent / negotiation-level German.
  if (/(verhandlungssicher\w*\s+deutsch|flie(?:ss|ß)end\w*\s+deutsch|fluent\s+german|fluent\s+in\s+german)/.test(hay)) {
    return { required: true, level: 3 }
  }
  // Generic "German required" phrasing (level unspecified → assumed professional).
  if (/(deutschkenntnisse\s+(?:sind\s+)?(?:erforderlich|notwendig|zwingend|voraussetzung)|(?:sehr\s+)?gute\s+deutschkenntnisse|deutsch\s+(?:ist\s+)?(?:erforderlich|voraussetzung|zwingend)|german\s+(?:language\s+)?(?:skills\s+)?(?:is\s+|are\s+)?(?:required|mandatory|essential|a\s+must)|require[sd]?\s+german|proficiency\s+in\s+german)/.test(hay)) {
    return { required: true, level: null }
  }
  return { required: false, level: null }
}

/** True when the posting requires German above the user's level (feature 2.1). */
export function germanBlocks(job: NormalizedJob, userRank: number | null): boolean {
  const { required, level } = detectGermanRequirement(job)
  if (!required) return false
  if (userRank == null) return false // we don't know the user's level → don't hide
  const requiredRank = level ?? 2 // unspecified requirement → assume professional (B)
  return requiredRank > userRank
}

// --- Detect visa-sponsorship stance ------------------------------------------
export type VisaStance = 'offers' | 'denies' | 'unknown'

export function detectVisaSponsorship(job: NormalizedJob): VisaStance {
  const hay = `${job.title}\n${job.description}`.toLowerCase()
  const denies =
    /(no\s+visa\s+sponsorship|cannot\s+sponsor|can'?t\s+sponsor|not\s+able\s+to\s+sponsor|do\s+not\s+(?:offer|provide)\s+(?:visa\s+)?sponsorship|don'?t\s+(?:offer|provide)\s+(?:visa\s+)?sponsorship|unable\s+to\s+sponsor|without\s+(?:visa\s+)?sponsorship|no\s+sponsorship\s+available|must\s+(?:already\s+)?have\s+(?:the\s+right\s+to\s+work|work\s+author[iz]sation|a\s+valid\s+work\s+permit)|must\s+be\s+(?:eligible|authorized)\s+to\s+work|existing\s+work\s+authori[sz]ation|keine\s+visa|arbeitserlaubnis\s+(?:erforderlich|vorausgesetzt))/.test(hay)
  const offers =
    /(visa\s+sponsorship|we\s+sponsor|sponsorship\s+(?:is\s+)?available|relocation\s+and\s+visa|visa\s+support|we\s+(?:can\s+)?support\s+(?:your\s+)?visa|happy\s+to\s+sponsor)/.test(hay)
  // Denial is checked first: phrases like "no visa sponsorship" contain the same
  // words as an offer, so a negation must win.
  if (denies) return 'denies'
  if (offers) return 'offers'
  return 'unknown'
}

/** True when the user needs sponsorship and the posting says it won't (feature 2.2). */
export function visaBlocks(job: NormalizedJob, prefs: Preferences): boolean {
  if (!prefs.workAuth?.needsVisaSponsorship) return false
  return detectVisaSponsorship(job) === 'denies'
}

// --- Combined filter ---------------------------------------------------------
export type HardFilterToggles = { hideGermanAboveLevel: boolean; hideNoVisaSponsorship: boolean }

/** Human-readable reasons a job is filtered out, given the active toggles ([] = passes). */
export function hardFilterReasons(
  job: NormalizedJob,
  prefs: Preferences,
  toggles: HardFilterToggles,
): string[] {
  const reasons: string[] = []
  const userRank = userGermanRank(prefs)
  if (toggles.hideGermanAboveLevel && germanBlocks(job, userRank)) {
    reasons.push('requires German above your level')
  }
  if (toggles.hideNoVisaSponsorship && visaBlocks(job, prefs)) {
    reasons.push('no visa sponsorship')
  }
  return reasons
}

export type Partitioned<T> = { shown: T[]; hidden: { item: T; reasons: string[] }[] }

/** Split a list of jobs into shown vs hidden according to the hard filters. */
export function partitionByHardFilters(
  jobs: NormalizedJob[],
  prefs: Preferences,
  toggles: HardFilterToggles,
): Partitioned<NormalizedJob> {
  const shown: NormalizedJob[] = []
  const hidden: { item: NormalizedJob; reasons: string[] }[] = []
  for (const job of jobs) {
    const reasons = hardFilterReasons(job, prefs, toggles)
    if (reasons.length) hidden.push({ item: job, reasons })
    else shown.push(job)
  }
  return { shown, hidden }
}