// ============================================================================
// Career relevance gate (v2.5.3.1).
//
// Employer ATS feeds are intentionally broad: most of them return every open
// role for every configured company. This gate turns the user's requested
// titles into a deterministic allow-list of role families before either local
// ranking mode or the paid LLM sees a posting.
//
// Important: résumé skills are deliberately NOT an admission signal here.
// Skills can rank two relevant jobs, but Python on a marketing résumé must not
// admit "Senior Data Scientist" into an account-management search.
// ============================================================================
import type { NormalizedJob, Preferences, Profile } from '../types'
import { normalizeKey } from '../lib/hash'

export const CAREER_RELEVANCE_VERSION = 'career-relevance-v2.5.3.1'

type RoleFamily =
  | 'account'
  | 'marketing'
  | 'data'
  | 'engineering'
  | 'product'
  | 'design'
  | 'finance'
  | 'people'
  | 'legal'
  | 'health'
  | 'operations'
  | 'sales'

type MarketFamily =
  | 'marketing'
  | 'technology'
  | 'finance'
  | 'automotive'
  | 'retail'
  | 'hospitality'
  | 'healthcare'
  | 'industrial'
  | 'logistics'
  | 'education'

const FAMILY_PATTERNS: Record<RoleFamily, RegExp[]> = {
  account: [
    /\baccount(s)?\b/, /\bclient(s)?\b/, /\bcustomer success\b/,
    /\bcustomer experience\b/, /\brelationship management\b/,
    /\bkundenbetreu\w*\b/, /\bkundenberat\w*\b/, /\bkundenmanagement\b/,
    /\bclient service(s)?\b/,
  ],
  marketing: [
    /\bmarketing\b/, /\bcrm\b/, /\blifecycle\b/, /\bcampaign(s)?\b/,
    /\bkampagn\w*\b/, /\bbrand\b/, /\bcontent\b/, /\bsocial media\b/,
    /\bseo\b/, /\bsea\b/, /\bperformance marketing\b/, /\bemail\b/,
    /\bcommunications?\b/, /\bkommunikation\b/,
  ],
  data: [
    /\bdata\b/, /\banalytics?\b/, /\banalyst\b/, /\banalystin\b/,
    /\bbusiness intelligence\b/, /\bmachine learning\b/, /\bml\b/,
    /\bdata scien\w*\b/, /\breporting\b/,
  ],
  engineering: [
    /\bengineer\w*\b/, /\bdeveloper\w*\b/, /\bsoftware\b/, /\bdevops\b/,
    /\barchitect\w*\b/, /\bprogrammier\w*\b/, /\bentwickler\w*\b/,
    /\bentwicklung\b/, /\bfrontend\b/, /\bbackend\b/, /\bfullstack\b/,
  ],
  product: [/\bproduct\b/, /\bproduktmanager\w*\b/, /\bproduct owner\b/],
  design: [/\bdesign\w*\b/, /\bux\b/, /\bui\b/, /\bcreative\b/, /\bkreativ\w*\b/],
  finance: [
    /\bfinance\b/, /\bfinancial\b/, /\baccounting\b/, /\baccountant\b/,
    /\bcontroller\b/, /\baudit\w*\b/, /\bbuchhalt\w*\b/, /\bsteuer\w*\b/,
  ],
  people: [
    /\bhuman resources\b/, /\bhr\b/, /\bpeople\b/, /\brecruit\w*\b/,
    /\btalent\b/, /\bpersonalwesen\b/,
  ],
  legal: [/\blegal\b/, /\blawyer\b/, /\bcounsel\b/, /\bjurist\w*\b/, /\brecht\w*\b/],
  health: [
    /\bhealth\b/, /\bmedical\b/, /\bclinical\b/, /\bnurs\w*\b/,
    /\bdoctor\b/, /\bpflege\w*\b/, /\bmedizin\w*\b/,
  ],
  operations: [
    /\boperations?\b/, /\bsupply chain\b/, /\blogistics?\b/, /\bplanning\b/,
    /\bprocurement\b/, /\bwarehouse\b/, /\bfulfil\w*\b/, /\bdisposition\b/,
    /\blogistik\b/,
  ],
  sales: [
    /\bsales\b/, /\bvertrieb\b/, /\bbusiness development\b/,
    /\bpartnerships?\b/, /\bcommercial\b/, /\balliances?\b/,
  ],
}

// A role is what someone does; a market is the business context in which they
// do it. Keeping these separate prevents "Account Manager — Email Marketing"
// and "Account Manager — Car Rental Sales" from being treated as equivalents.
const MARKET_PATTERNS: Record<MarketFamily, RegExp[]> = {
  marketing: [
    /\bdigital marketing\b/, /\bemail marketing\b/, /\bmarketing\b/, /\bcrm\b/,
    /\blifecycle\b/, /\bretention\b/, /\bcampaign\w*\b/, /\bkampagn\w*\b/,
    /\badvertis\w*\b/, /\bwerbung\b/, /\bmartech\b/, /\bmarketing agency\b/,
    /\bmedia agency\b/, /\bklaviyo\b/, /\bmailchimp\b/, /\bhubspot\b/,
    /\bsalesforce marketing cloud\b/, /\bsfmc\b/, /\bpostscript\b/,
    /\bnewsletter\b/,
  ],
  technology: [
    /\bsoftware\b/, /\bsaas\b/, /\bcloud\b/, /\bcyber\w*\b/, /\bsecurity\b/,
    /\bidentity access\b/, /\biam\b/, /\bdata\b/, /\bmachine learning\b/,
    /\bartificial intelligence\b/, /\bengineering\b/, /\bit services?\b/,
  ],
  finance: [
    /\bfintech\b/, /\bbanking\b/, /\binsurance\b/, /\bfinancial services?\b/,
    /\bpayments?\b/, /\binvestment\b/,
  ],
  automotive: [
    /\bautomotive\b/, /\bcar rental\b/, /\brental car\b/, /\bvehicle\w*\b/,
    /\bfleet\b/, /\bmobility\b/, /\bautohaus\b/, /\bautomobil\w*\b/,
  ],
  retail: [
    /\bretail\b/, /\becommerce\b/, /\be commerce\b/, /\bconsumer goods?\b/,
    /\bfmcg\b/, /\bonline shop\b/,
  ],
  hospitality: [
    /\bhospitality\b/, /\bhotel\b/, /\btravel\b/, /\btourism\b/,
    /\brestaurant\b/,
  ],
  healthcare: [
    /\bhealthcare\b/, /\bmedical\b/, /\bpharma\w*\b/, /\bclinical\b/,
    /\bmedtech\b/,
  ],
  industrial: [
    /\bmanufactur\w*\b/, /\bindustrial\b/, /\bconstruction\b/,
    /\benergy\b/, /\bmaschinenbau\b/,
  ],
  logistics: [
    /\blogistics?\b/, /\bsupply chain\b/, /\bfreight\b/, /\bshipping\b/,
    /\bwarehouse\b/,
  ],
  education: [
    /\beducation\b/, /\bedtech\b/, /\buniversity\b/, /\bschool\b/,
    /\bbildung\b/, /\bhochschule\b/,
  ],
}

const SENIOR_TITLE = /\b(senior|sr|staff|principal|lead|head|director|chief|vice president|vp|c[etf]o|general manager|geschäftsführer\w*|bereichsleit\w*|abteilungsleit\w*|teamleit\w*)\b/
const JUNIOR_TITLE = /\b(junior|jr|entry level|graduate|trainee|intern|internship|werkstudent\w*|praktik\w*|associate)\b/
const ACCOUNT_ACQUISITION_TITLE = /\b(account|sales|business) development representative\b|\b(sdr|bdr)\b/
const STRONG_MARKETING_EVIDENCE = [
  /\bdigital marketing\b/, /\bemail marketing\b/, /\bmarketing automation\b/,
  /\bmarketing agency\b/, /\badvertising agency\b/, /\bmedia agency\b/,
  /\bperformance marketing\b/, /\blifecycle marketing\b/, /\bcontent marketing\b/,
  /\bsocial media marketing\b/, /\baffiliate marketing\b/, /\bbrand marketing\b/,
  /\bcampaign management\b/, /\bcrm campaign\w*\b/, /\bpaid media\b/,
  /\bklaviyo\b/, /\bmailchimp\b/, /\bsalesforce marketing cloud\b/, /\bsfmc\b/,
  /\bpostscript\b/,
]
const TITLE_NOISE = new Set([
  'and', 'the', 'for', 'with', 'junior', 'senior', 'mid', 'entry', 'level',
  'manager', 'management', 'executive', 'specialist', 'associate', 'consultant',
  'officer', 'coordinator', 'lead', 'head', 'director', 'role', 'position',
  'mwd', 'fmd', 'all', 'genders', 'remote',
])

const SPECIALTY_TERMS = new Set([
  'email', 'crm', 'lifecycle', 'retention', 'campaign', 'kampagne', 'automation',
  'klaviyo', 'mailchimp', 'hubspot', 'sfmc', 'postscript', 'newsletter', 'digital',
])

export type CareerRejectionReason = 'role' | 'market' | 'seniority'

export type CareerRelevanceDecision =
  | { keep: true; score: number; matchedFamilies: RoleFamily[]; matchedMarkets: MarketFamily[] }
  | {
      keep: false
      score: number
      reason: CareerRejectionReason
      matchedFamilies: RoleFamily[]
      matchedMarkets: MarketFamily[]
    }

function normalized(value: string): string {
  return ` ${normalizeKey(value).split(/\s+/).filter(Boolean).join(' ')} `
}

function families(value: string): Set<RoleFamily> {
  const text = normalized(value)
  const out = new Set<RoleFamily>()
  for (const [family, patterns] of Object.entries(FAMILY_PATTERNS) as [RoleFamily, RegExp[]][]) {
    if (patterns.some((pattern) => pattern.test(text))) out.add(family)
  }
  return out
}

function markets(value: string): Set<MarketFamily> {
  const text = normalized(value)
  const out = new Set<MarketFamily>()
  for (const [market, patterns] of Object.entries(MARKET_PATTERNS) as [MarketFamily, RegExp[]][]) {
    if (patterns.some((pattern) => pattern.test(text))) out.add(market)
  }
  return out
}

function requestedMarkets(profile: Profile, prefs: Preferences, targets: string[]): Set<MarketFamily> {
  const scores = new Map<MarketFamily, number>()
  const add = (value: string, weight: number) => {
    for (const market of markets(value)) scores.set(market, (scores.get(market) ?? 0) + weight)
  }
  targets.forEach((value) => add(value, 5))
  // This is the user's explicit "Job market / field" choice, so it must be
  // strong enough to define the market even when a manually-created profile
  // has no summary or prior titles yet.
  prefs.fields.forEach((value) => add(value, 5))
  profile.titles.forEach((value) => add(value.title, 4))
  add(profile.summary, 2)
  const top = Math.max(0, ...scores.values())
  if (top < 4) return new Set()
  return new Set([...scores].filter(([, score]) => score === top).map(([market]) => market))
}

function occurrences(text: string, pattern: RegExp): number {
  return [...text.matchAll(new RegExp(pattern.source, 'g'))].length
}

function jobMarketEvidence(
  job: NormalizedJob,
  wanted: Set<MarketFamily>,
): { fit: 'matched' | 'unknown' | 'mismatch'; matched: MarketFamily[] } {
  if (!wanted.size) return { fit: 'unknown', matched: [] }
  const title = normalized(job.title)
  const titleAndTags = normalized(`${job.title} ${job.tags.join(' ')}`)
  const description = normalized(job.description.slice(0, 1800))
  const matched: MarketFamily[] = []
  for (const market of wanted) {
    const patterns = MARKET_PATTERNS[market]
    const titleHit = patterns.some((pattern) => pattern.test(titleAndTags))
    const descriptionHits = patterns.reduce(
      (total, pattern) => total + Math.min(3, occurrences(description, pattern)),
      0,
    )
    if (market === 'marketing') {
      const titleHit = MARKET_PATTERNS.marketing.some((pattern) => pattern.test(title))
      const strongDescription = STRONG_MARKETING_EVIDENCE.some((pattern) => pattern.test(description))
      if (titleHit || strongDescription) matched.push(market)
      continue
    }
    // One incidental phrase such as "work with the marketing team" is not
    // enough to classify a car-rental sales role as a marketing-market role.
    if (titleHit || descriptionHits >= 2) matched.push(market)
  }
  if (matched.length) return { fit: 'matched', matched }
  if (job.description.trim().length < 40) return { fit: 'unknown', matched: [] }
  return { fit: 'mismatch', matched: [] }
}

function distinctiveTokens(values: string[]): Set<string> {
  return new Set(
    values
      .flatMap((value) => normalizeKey(value).split(/\s+/))
      .filter((token) => token.length > 2 && !TITLE_NOISE.has(token) && !/^\d+$/.test(token)),
  )
}

function tokenOverlap(left: Set<string>, right: Set<string>): number {
  let count = 0
  for (const token of left) if (right.has(token)) count += 1
  return count
}

function requestedTitles(profile: Profile, prefs: Preferences): string[] {
  const explicit = prefs.targetTitles.map((title) => title.trim()).filter(Boolean)
  return explicit.length ? explicit : profile.titles.map((title) => title.title.trim()).filter(Boolean)
}

function seniorityConflict(job: NormalizedJob, prefs: Preferences): boolean {
  if (prefs.seniority !== 'intern' && prefs.seniority !== 'junior') return false
  const levelText = normalized(`${job.title} ${job.seniority ?? ''}`)
  return SENIOR_TITLE.test(levelText) || /\b(enterprise|strategic)\b/.test(levelText)
}

/**
 * Decide whether a posting belongs in this career search. The title is the hard
 * signal; description/fields only add a small ranking boost after admission.
 */
export function judgeCareerRelevance(
  job: NormalizedJob,
  profile: Profile,
  prefs: Preferences,
): CareerRelevanceDecision {
  const targets = requestedTitles(profile, prefs)
  // A user with no usable target title gets the old broad behavior rather than
  // an unexplained empty screen. Intake normally guarantees at least one title.
  if (!targets.length) {
    return { keep: true, score: 50, matchedFamilies: [], matchedMarkets: [] }
  }

  const targetFamilies = families(targets.join(' '))
  const jobFamilies = families(job.title)
  const matchedFamilies = [...targetFamilies].filter((family) => jobFamilies.has(family))
  const targetTokens = distinctiveTokens(targets)
  const jobTokens = distinctiveTokens([job.title])
  const overlap = tokenOverlap(targetTokens, jobTokens)

  const familyMatch = matchedFamilies.length > 0
  const lexicalMatch = overlap > 0
  if (!familyMatch && !lexicalMatch) {
    return {
      keep: false, score: 0, reason: 'role', matchedFamilies, matchedMarkets: [],
    }
  }
  if (targetFamilies.has('account') && ACCOUNT_ACQUISITION_TITLE.test(normalized(job.title))) {
    return {
      keep: false, score: 0, reason: 'role', matchedFamilies, matchedMarkets: [],
    }
  }
  if (seniorityConflict(job, prefs)) {
    return {
      keep: false, score: 0, reason: 'seniority', matchedFamilies, matchedMarkets: [],
    }
  }

  const wantedMarkets = requestedMarkets(profile, prefs, targets)
  const marketEvidence = jobMarketEvidence(job, wantedMarkets)
  if (marketEvidence.fit === 'mismatch') {
    return {
      keep: false, score: 0, reason: 'market', matchedFamilies, matchedMarkets: [],
    }
  }

  const fieldFamilies = families(prefs.fields.join(' '))
  const context = normalized(`${job.title} ${job.tags.join(' ')} ${job.description.slice(0, 1200)}`)
  let score = familyMatch ? 56 : 38
  score += Math.min(24, overlap * 12)
  if ([...fieldFamilies].some((family) => families(context).has(family))) score += 8
  if (marketEvidence.fit === 'matched') score += 10
  const intentSpecialties = distinctiveTokens([
    ...targets,
    ...prefs.fields,
    ...profile.titles.map((title) => title.title),
    profile.summary,
  ])
  const jobSpecialties = distinctiveTokens([
    job.title,
    job.tags.join(' '),
    job.description.slice(0, 1200),
  ])
  const specialtyOverlap = [...intentSpecialties]
    .filter((token) => SPECIALTY_TERMS.has(token) && jobSpecialties.has(token))
    .length
  score += Math.min(12, specialtyOverlap * 3)
  if (JUNIOR_TITLE.test(normalized(`${job.title} ${job.seniority ?? ''}`))) {
    if (prefs.seniority === 'junior' || prefs.seniority === 'intern') score += 8
  }
  const normalizedTitle = normalized(job.title)
  if (targets.some((target) => {
    const wanted = normalized(target).trim()
    return wanted.length > 3 && normalizedTitle.includes(` ${wanted} `)
  })) score += 8

  return {
    keep: true,
    score: Math.max(1, Math.min(100, Math.round(score))),
    matchedFamilies,
    matchedMarkets: marketEvidence.matched,
  }
}

export type CareerRelevanceDiagnostics = {
  inputCount: number
  removed: number
  removedBy: Record<CareerRejectionReason, number>
  finalCount: number
}

export function filterCareerRelevantJobs(
  jobs: NormalizedJob[],
  profile: Profile,
  prefs: Preferences,
): { jobs: NormalizedJob[]; diagnostics: CareerRelevanceDiagnostics } {
  const kept: NormalizedJob[] = []
  const diagnostics: CareerRelevanceDiagnostics = {
    inputCount: jobs.length,
    removed: 0,
    removedBy: { role: 0, market: 0, seniority: 0 },
    finalCount: 0,
  }
  for (const job of jobs) {
    const decision = judgeCareerRelevance(job, profile, prefs)
    if (decision.keep) kept.push(job)
    else {
      diagnostics.removed += 1
      diagnostics.removedBy[decision.reason] += 1
    }
  }
  diagnostics.finalCount = kept.length
  return { jobs: kept, diagnostics }
}
