// ============================================================================
// Employment-type classification & filtering (features 7 & 8).
//
// Every source reports employment type differently (BA: full-time flag; Lever:
// `commitment`; Adzuna: `contract_time`; Ashby: `employmentType`; Arbeitnow:
// `job_types[0]`), and German postings use German words. We fold all of that
// into ONE canonical category, using the structured field first and the
// title/description text as a backstop. Pure + deterministic → unit-testable.
//
// Feature 8 (student mode) is a thin convenience on top: it selects the subset
// of categories a German student may legally hold (Werkstudent/Teilzeit/Minijob).
// ============================================================================
import type { NormalizedJob } from '../types'

export type EmploymentCategory =
  | 'full-time'
  | 'part-time'
  | 'werkstudent'   // working student
  | 'minijob'       // marginal employment (Minijob / 538-€-Job)
  | 'internship'    // Praktikum
  | 'contract'      // freelance / contract / temporary
  | 'other'

/** Human labels (EN) for the categories, in a sensible display order. */
export const EMPLOYMENT_LABELS: Record<EmploymentCategory, string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  werkstudent: 'Working student',
  minijob: 'Mini-job',
  internship: 'Internship',
  contract: 'Contract / freelance',
  other: 'Other',
}

export const EMPLOYMENT_ORDER: EmploymentCategory[] = [
  'full-time', 'part-time', 'werkstudent', 'minijob', 'internship', 'contract', 'other',
]

/** The categories a student in Germany can typically hold (feature 8). */
export const STUDENT_CATEGORIES: EmploymentCategory[] = ['werkstudent', 'part-time', 'minijob']

/**
 * Classify one job into a canonical employment category. Order matters: the
 * more specific German buckets (Werkstudent, Minijob, Praktikum) are tested
 * before the broad full-/part-time split so they win.
 */
export function classifyEmployment(job: NormalizedJob): EmploymentCategory {
  const et = (job.employment_type ?? '').toLowerCase()
  const hay = `${et} ${job.title} ${job.description.slice(0, 400)}`.toLowerCase()

  // Werkstudent (working student).
  if (/werkstudent|working student|student\s*(?:assistant|worker)|studentische/.test(hay)) {
    return 'werkstudent'
  }
  // Minijob / marginal employment.
  if (/minijob|mini-job|538\s*€|538-euro|geringf(?:ü|ue)gig|aushilfe|marginal employment/.test(hay)) {
    return 'minijob'
  }
  // Internship / Praktikum.
  if (/praktik(?:um|ant)|internship|intern\b|working student|trainee/.test(hay) &&
      !/werkstudent/.test(hay)) {
    if (/praktik|internship|\bintern\b/.test(hay)) return 'internship'
  }
  // Contract / freelance / temporary.
  if (/freelance|freiberuflich|contractor?\b|contract\b|befristet|temporary|interim|zeitarbeit|freie mitarbeit/.test(hay)) {
    return 'contract'
  }
  // Part-time (Teilzeit).
  if (/part[-\s]?time|teilzeit/.test(hay)) return 'part-time'
  // Full-time (Vollzeit) — explicit, or the structured field.
  if (/full[-\s]?time|vollzeit/.test(hay)) return 'full-time'
  if (et === 'full-time' || et === 'full_time') return 'full-time'
  if (et === 'part-time' || et === 'part_time') return 'part-time'

  return 'other'
}

/**
 * Keep jobs whose category is in `selected`. An empty selection means "no
 * employment filter" and returns everything (so the default view is unchanged).
 * `other` is included whenever the user hasn't narrowed, but excluded once they
 * pick specific categories — an unknown type shouldn't sneak past a filter.
 */
export function filterByEmployment(
  jobs: NormalizedJob[],
  selected: EmploymentCategory[],
): NormalizedJob[] {
  if (!selected.length) return jobs
  const set = new Set(selected)
  return jobs.filter((j) => set.has(classifyEmployment(j)))
}

/** Feature 8: constrain to student-holdable roles (Werkstudent/Teilzeit/Minijob). */
export function filterStudentRoles(jobs: NormalizedJob[]): NormalizedJob[] {
  return filterByEmployment(jobs, STUDENT_CATEGORIES)
}

/** Count how many jobs fall into each category (for filter chips with counts). */
export function employmentCounts(jobs: NormalizedJob[]): Record<EmploymentCategory, number> {
  const counts: Record<EmploymentCategory, number> = {
    'full-time': 0, 'part-time': 0, werkstudent: 0, minijob: 0, internship: 0, contract: 0, other: 0,
  }
  for (const j of jobs) counts[classifyEmployment(j)]++
  return counts
}