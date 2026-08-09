/**
 * Frozen executable archive of Klar v2.5.5's deterministic prefilter score.
 *
 * Source commit:
 *   fd9589edf42a7086e6745a90d9dfa854231298aa
 * Source files:
 *   src/match/prefilter.ts
 *     SHA-256 ea8e677a212f93adb7d35d1974a9d839041c813690f0bcf5e8166aed9bc10aa2
 *   src/match/relevance.ts
 *     SHA-256 c4a8a5372c66e89188ebf7910e2f1e6a1af8fe7178ff1e57a5d656fcd8153891
 *
 * This module intentionally duplicates the old behavior. Do not refactor it to
 * call the current ranker: the human release gate needs a stable historical
 * comparator even after production ranking code changes.
 *
 * The sole test-harness seam is `asOfMs`. v2.5.5 called Date.now() for recency;
 * the frozen corpus timestamp is injected here so a later rerun compares the
 * same historical instant. All weights, caps, admission rules, and stable-sort
 * behavior are otherwise the v2.5.5 implementation.
 */
import type { NormalizedJob, Preferences, Profile } from '../../src/types.ts'
import { normalizeKey } from '../../src/lib/hash.ts'

export const BASELINE_V255_COMMIT =
  'fd9589edf42a7086e6745a90d9dfa854231298aa'
export const BASELINE_V255_VERSION = 'v2.5.5-prefilter-frozen-1'

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
    /\bartificial intelligence\b/, /\bai\b/, /\bbi\b/, /\bdata scien\w*\b/,
    /\breporting\b/, /\bdatenanal\w*\b/, /\bdateningenieur\w*\b/,
    /\bdatenwissenschaft\w*\b/, /\bki\b/,
  ],
  engineering: [
    /\bengineer\w*\b/, /\bdeveloper\w*\b/, /\bsoftware\b/, /\bdevops\b/,
    /\barchitect\w*\b/, /\bprogrammier\w*\b/, /\bentwickler\w*\b/,
    /\bentwicklung\b/, /\bdateningenieur\w*\b/, /\bfrontend\b/, /\bbackend\b/,
    /\bfullstack\b/,
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
    /\bartificial intelligence\b/, /\banalytics?\b/, /\banalyst\b/,
    /\bengineer\w*\b/, /\bdeveloper\w*\b/, /\bengineering\b/,
    /\bbusiness intelligence\b/, /\bml\b/, /\bai\b/, /\bbi\b/,
    /\bdatenanal\w*\b/, /\bdateningenieur\w*\b/, /\bdatenwissenschaft\w*\b/,
    /\bki\b/, /\bit services?\b/,
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
const ACCOUNT_SALES_EVIDENCE =
  /\b(sales cycle|sales pipeline|close (?:the )?deal|close quota|quota[- ]carrying|quota target|prospecting|cold call|lead generation)\b/
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

type CareerRelevanceDecision =
  | { keep: true; score: number }
  | { keep: false; score: number; reason: 'role' | 'market' | 'seniority' }

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

function marketHits(text: string): Map<MarketFamily, number> {
  const hits = new Map<MarketFamily, number>()
  for (const [market, patterns] of Object.entries(MARKET_PATTERNS) as [MarketFamily, RegExp[]][]) {
    const count = patterns.reduce(
      (total, pattern) => total + Math.min(3, occurrences(text, pattern)),
      0,
    )
    if (count > 0) hits.set(market, count)
  }
  return hits
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
    if (titleHit || descriptionHits >= 2) matched.push(market)
  }
  if (matched.length) return { fit: 'matched', matched }
  if (job.description.trim().length < 40) return { fit: 'unknown', matched: [] }
  const titleMarkets = markets(`${job.title} ${job.tags.join(' ')}`)
  const conflictingTitle = [...titleMarkets].some((market) => !wanted.has(market))
  const descriptionMarkets = marketHits(description)
  const conflictingDescription = [...descriptionMarkets].some(
    ([market, count]) => !wanted.has(market) && count >= 2,
  )
  return conflictingTitle || conflictingDescription
    ? { fit: 'mismatch', matched: [] }
    : { fit: 'unknown', matched: [] }
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

function judgeCareerRelevanceV255(
  job: NormalizedJob,
  profile: Profile,
  prefs: Preferences,
): CareerRelevanceDecision {
  const targets = requestedTitles(profile, prefs)
  if (!targets.length) return { keep: true, score: 50 }

  const targetFamilies = families(targets.join(' '))
  const jobFamilies = families(job.title)
  const matchedFamilies = [...targetFamilies].filter((family) => jobFamilies.has(family))
  const targetTokens = distinctiveTokens(targets)
  const jobTokens = distinctiveTokens([job.title])
  const overlap = tokenOverlap(targetTokens, jobTokens)
  const familyMatch = matchedFamilies.length > 0
  const lexicalMatch = overlap > 0
  if (!familyMatch && !lexicalMatch) return { keep: false, score: 0, reason: 'role' }
  if (targetFamilies.has('account') && ACCOUNT_ACQUISITION_TITLE.test(normalized(job.title))) {
    return { keep: false, score: 0, reason: 'role' }
  }
  if (seniorityConflict(job, prefs)) return { keep: false, score: 0, reason: 'seniority' }

  const wantedMarkets = requestedMarkets(profile, prefs, targets)
  const marketEvidence = jobMarketEvidence(job, wantedMarkets)
  if (
    targetFamilies.has('account') &&
    wantedMarkets.has('marketing') &&
    ACCOUNT_SALES_EVIDENCE.test(normalized(job.description.slice(0, 1800))) &&
    !STRONG_MARKETING_EVIDENCE.some(
      (pattern) => pattern.test(normalized(job.description.slice(0, 1800))),
    )
  ) return { keep: false, score: 0, reason: 'market' }
  if (marketEvidence.fit === 'mismatch') return { keep: false, score: 0, reason: 'market' }

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
  return { keep: true, score: Math.max(1, Math.min(100, Math.round(score))) }
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeKey(value)
      .split(' ')
      .filter((word) => word.length > 2),
  )
}

function overlap(left: Set<string>, right: Set<string>): number {
  let count = 0
  for (const token of left) if (right.has(token)) count += 1
  return count
}

function hasDealbreaker(job: NormalizedJob, prefs: Preferences): boolean {
  if (!prefs.dealbreakers.length) return false
  const haystack = `${job.title} ${job.company} ${job.description}`.toLowerCase()
  return prefs.dealbreakers.some(
    (dealbreaker) => dealbreaker.trim() && haystack.includes(dealbreaker.toLowerCase()),
  )
}

export function scoreJobV255(
  job: NormalizedJob,
  profile: Profile,
  prefs: Preferences,
  asOfMs: number,
): number {
  const relevance = judgeCareerRelevanceV255(job, profile, prefs)
  if (!relevance.keep) return 0
  const skillTokens = tokens(profile.skills.map((skill) => skill.name).join(' '))
  const descriptionTokens = tokens(job.description.slice(0, 2000))
  const skillHit = overlap(skillTokens, descriptionTokens)
  let score = relevance.score * 0.78
  score += Math.min(skillHit, 8) * 1.25
  if (job.salary.min != null || job.salary.max != null) score += 3
  if (job.posted_at) {
    const ageDays = (asOfMs - new Date(job.posted_at).getTime()) / 86_400_000
    if (ageDays >= 0) score += Math.max(0, 4 - ageDays / 10)
  }
  if (prefs.remoteOnly) {
    if (job.location.remote) score += 4
  } else if (job.location.city) {
    const city = normalizeKey(job.location.city)
    const wantedCities = prefs.locations.map((location) => normalizeKey(location.city))
    if (wantedCities.some((wanted) => wanted && city.includes(wanted))) score += 5
    else if (job.location.remote) score += 2
  }
  return Math.max(0, Math.min(100, score))
}

export type BaselineV255Ranked = {
  job: NormalizedJob
  score: number
  inputIndex: number
}

export function rankCandidateSetV255(
  jobs: NormalizedJob[],
  profile: Profile,
  prefs: Preferences,
  asOf: string,
): BaselineV255Ranked[] {
  const asOfMs = Date.parse(asOf)
  if (!Number.isFinite(asOfMs)) throw new Error('v2.5.5 baseline requires a valid frozen asOf')
  const survivors = jobs
    .map((job, inputIndex) => ({ job, inputIndex }))
    .filter(({ job }) => {
      if (hasDealbreaker(job, prefs)) return false
      if (prefs.remoteOnly && !job.location.remote) return false
      return judgeCareerRelevanceV255(job, profile, prefs).keep
    })
    .map(({ job, inputIndex }) => ({
      job,
      inputIndex,
      score: scoreJobV255(job, profile, prefs, asOfMs),
    }))
  // ES2019 stable sort reproduces v2.5.5's input-order tie behavior.
  survivors.sort((left, right) => right.score - left.score)
  return survivors
}
