// ============================================================================
// Semantic flexible-work taxonomy — the first classifier (roadmap §4).
//
// Deterministic and multilingual. It reads original titles + descriptions and
// classifies them into three INDEPENDENT dimensions:
//
//   • employment arrangement (minijob, part-time, working student, …)
//   • role family            (cashier, warehouse, delivery, kitchen, …)
//   • workplace              (supermarket, warehouse, restaurant, hotel, …)
//
// Signals, in descending weight: title patterns → description evidence →
// employer/brand context. Negative patterns veto false positives, and a career-
// seniority guard damps role families for management titles ("Marktleiter").
//
// Rules the roadmap fixes:
//   • It only SUGGESTS. It must never override explicit *published* employment
//     terms — `applyClassification` keeps published values authoritative.
//   • Every assignment keeps evidence and a 0..1 confidence.
//   • Unknown stays unknown (an empty result is a valid result).
//
// An optional local embedding classifier (§4) can add a single low-confidence
// suggestion for ambiguous titles; it is wired in `neuralSuggestion` but is a
// no-op unless a suggester is supplied, so this module stays deterministic.
// ============================================================================
import type {
  FlexibleEmployment,
  FlexibleRoleFamily,
  NormalizedJob,
  WorkplaceType,
} from '../types'
import { publishedEmployment } from './opportunity'

export type TaxonomyDimension = 'employment' | 'roleFamily' | 'workplace'
export type TaxonomyValue = FlexibleEmployment | FlexibleRoleFamily | WorkplaceType

export type TaxonomyEvidence = {
  dimension: TaxonomyDimension
  value: string
  matched: string
  where: 'title' | 'description' | 'employer'
}

export type FlexibleClassification = {
  employment: FlexibleEmployment[]
  roleFamilies: FlexibleRoleFamily[]
  workplaces: WorkplaceType[]
  /** value → 0..1 confidence, keyed as `${dimension}:${value}`. */
  confidence: Record<string, number>
  evidence: TaxonomyEvidence[]
}

export type ClassifyInput = {
  title: string
  description?: string
  employer?: string
  brand?: string
}

// --- Normalization ----------------------------------------------------------
// Lowercase, strip diacritics (ä→a, ö→o, ü→u, ß handled below), turn every run
// of non-alphanumerics into a single space, and pad with spaces so we can match
// whole tokens with a plain `includes(' token ')` — no regex-escaping surprises.
function normalize(text: string): string {
  return (
    ' ' +
    (text || '')
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // Fold the ASCII umlaut digraphs so "Kuechenhilfe" and "Küchenhilfe"
      // (→ "kuchenhilfe") collapse to the same token the aliases are written in.
      .replace(/ae/g, 'a')
      .replace(/oe/g, 'o')
      .replace(/ue/g, 'u')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim() +
    ' '
  )
}

/**
 * Fold an alias through exactly the same transformation as the text it will be
 * compared against.
 *
 * v2.4.2 bug fix: `normalize` folds the ASCII umlaut digraphs, so "ue" -> "u".
 * That is intended for "Kueche" -> "kuche", but it also rewrites ordinary words
 * — "steuerberater" becomes "steurberater". Aliases were written literally, so
 * any alias containing "ae", "oe" or "ue" could never match. Normalizing both
 * sides keeps them in the same space.
 */
function normalizeAlias(alias: string): string {
  return normalize(alias).trim()
}

/** Pre-fold an alias table once at module load. */
function foldAliases<K extends string>(table: Record<K, string[]>): Record<K, string[]> {
  const out = {} as Record<K, string[]>
  for (const [key, list] of Object.entries(table) as [K, string[]][]) {
    out[key] = [...new Set(list.map(normalizeAlias).filter(Boolean))]
  }
  return out
}

/**
 * Negations that invert a nearby token. "Keine Nachtschicht" (no night shift)
 * must never be read as evidence OF night work — v2.4.2.
 */
const NEGATIONS = ['kein', 'keine', 'keinen', 'keiner', 'ohne', 'nicht', 'statt', 'no', 'without']

/**
 * Perk boilerplate that reuses a work vocabulary word to describe a BENEFIT
 * rather than the job. These phrases are removed from the description before
 * classification, so "am Wochenende frei" (weekends off) can no longer be read
 * as weekend work — v2.4.2.
 */
const PERK_PHRASES = [
  'wochenende frei', 'freies wochenende', 'freie wochenenden', 'am wochenende frei',
  'kein wochenenddienst', 'ausgestattete kuche', 'ausgestatteter kuche', 'voll ausgestattete kuche',
  'betriebsrestaurant', 'betriebskantine', 'kantine', 'obstkorb', 'kostenlose getranke',
  'job rad', 'jobrad', 'dienstrad', 'firmenwagen', 'firmenrad', 'tankgutschein',
]

/** Remove perk boilerplate so it cannot masquerade as job evidence. */
function stripPerkPhrases(paddedText: string): string {
  let text = paddedText
  for (const phrase of FOLDED_PERKS) text = text.split(' ' + phrase + ' ').join(' ')
  return text
}

/**
 * Whole-token containment, with a negation veto. Every occurrence is checked;
 * the alias counts only if at least one occurrence is NOT preceded by a
 * negation within the previous four words.
 */
function hasToken(paddedText: string, alias: string): boolean {
  const needle = ' ' + alias + ' '
  let from = 0
  for (;;) {
    const at = paddedText.indexOf(needle, from)
    if (at === -1) return false
    if (!negatedBefore(paddedText, at)) return true
    from = at + 1
  }
}

/** True when one of the four words before `index` is a negation. */
function negatedBefore(paddedText: string, index: number): boolean {
  const before = paddedText.slice(Math.max(0, index - 40), index).trim().split(' ')
  const window = before.slice(-4)
  return window.some((word) => NEGATIONS.includes(word))
}

// --- Alias tables (diacritics already stripped to match `normalize`) ---------

const EMPLOYMENT_ALIASES: Record<FlexibleEmployment, string[]> = {
  minijob: ['minijob', 'mini job', '520 euro', '520 euro basis', '538 euro', 'geringfugig', 'geringfugige beschaftigung', 'auf 520 basis'],
  part_time: ['teilzeit', 'part time', 'teilzeitkraft', 'teilzeitbasis', 'part time basis'],
  working_student: ['werkstudent', 'werkstudentin', 'werkstudierende', 'working student', 'student assistant', 'studentische aushilfe', 'studentische hilfskraft', 'studentenjob'],
  temporary: ['befristet', 'befristung', 'aushilfe', 'aushilfskraft', 'zeitarbeit', 'leiharbeit', 'temporary', 'interim', 'zeitlich befristet'],
  seasonal: ['saison', 'saisonal', 'saisonkraft', 'saisonarbeit', 'seasonal', 'weihnachts', 'christmas', 'erntehelfer', 'sommersaison'],
  weekend: ['wochenende', 'wochenendjob', 'weekend', 'samstagsjob', 'samstags', 'sonntags', 'am wochenende'],
  evening: ['abend', 'abends', 'evening', 'spatschicht', 'abendschicht', 'abendkraft'],
  night: ['nacht', 'nachts', 'nachtschicht', 'night', 'night shift', 'nachtarbeit'],
}

const ROLE_ALIASES: Record<Exclude<FlexibleRoleFamily, 'other'>, string[]> = {
  shelf_stocking: ['warenverraumung', 'regalauffullung', 'einraumen', 'verraumung', 'warenauffullung', 'shelf stock', 'stocking', 'regalbetreuung', 'warenverraum'],
  cashier: ['kasse', 'kassierer', 'kassiererin', 'kassenkraft', 'cashier', 'checkout', 'kassenaufsicht'],
  sales_assistant: ['verkauf', 'verkaufer', 'verkauferin', 'verkaufskraft', 'verkaufshilfe', 'verkaufsmitarbeiter', 'sales assistant', 'sales associate', 'retail associate', 'verkaufsberater', 'verkaufsberaterin'],
  picking_packing: ['kommission', 'kommissionierer', 'kommissionierung', 'picking', 'packing', 'picker', 'packer', 'pick and pack'],
  warehouse: ['lager', 'lagerist', 'lagermitarbeiter', 'lagerhelfer', 'warehouse', 'lagerarbeiter', 'lagerkraft'],
  parcel_sorting: ['paketsortierer', 'sortierer', 'sorter', 'parcel sort', 'sortierung', 'sortierkraft', 'paketsortierung'],
  delivery: ['auslieferung', 'zusteller', 'zustellung', 'delivery', 'kurier', 'fahrer', 'driver', 'rider', 'lieferfahrer', 'paketzusteller', 'auslieferungsfahrer', 'fahrradkurier', 'courier'],
  kitchen: ['kuche', 'kuchenhilfe', 'kitchen', 'koch', 'kochin', 'commis', 'spulkraft', 'spulhilfe', 'kitchen porter', 'beikoch'],
  counter_service: ['theke', 'thekenkraft', 'counter', 'counter service', 'verkaufstheke', 'barista', 'ausgabe', 'imbiss'],
  waiting_service: ['servicekraft', 'kellner', 'kellnerin', 'waiter', 'waitress', 'servicemitarbeiter', 'restaurantfachkraft', 'bedienung'],
  cleaning: ['reinigung', 'reinigungskraft', 'cleaner', 'cleaning', 'putzkraft', 'gebaudereinigung', 'unterhaltsreinigung'],
  housekeeping: ['housekeeping', 'zimmermadchen', 'room attendant', 'hausdame', 'zimmerreinigung', 'roomboy'],
  reception: ['rezeption', 'empfang', 'reception', 'receptionist', 'front office', 'empfangsmitarbeiter', 'empfangskraft'],
  event_staff: ['eventhelfer', 'messehelfer', 'promoter', 'hostess', 'event staff', 'eventpersonal', 'veranstaltungshelfer', 'messebau', 'eventcrew'],
  customer_service: ['kundenservice', 'kundenbetreuung', 'customer service', 'customer support', 'call center', 'callcenter', 'hotline', 'kundenberater'],
}

const WORKPLACE_ALIASES: Record<Exclude<WorkplaceType, 'other'>, string[]> = {
  supermarket: ['supermarkt', 'supermarket', 'lebensmittel', 'discounter', 'vollsortimenter', 'rewe', 'edeka', 'penny', 'aldi', 'lidl', 'kaufland', 'netto'],
  retail_store: ['geschaft', 'filiale', 'store', 'einzelhandel', 'retail', 'shop', 'kaufhaus', 'modehaus', 'boutique', 'ikea'],
  drugstore: ['drogerie', 'drugstore', 'rossmann', 'dm markt', 'dm drogerie'],
  warehouse: ['lager', 'logistikzentrum', 'warehouse', 'distribution', 'fulfillment', 'logistik'],
  parcel_hub: ['paketzentrum', 'parcel', 'sortierzentrum', 'depot', 'zustellbasis', 'frachtzentrum', 'verteilzentrum'],
  restaurant: ['restaurant', 'gastronomie', 'gaststatte', 'systemgastronomie', 'mcdonald', 'burger king', 'kfc', 'nordsee'],
  cafe: ['cafe', 'coffee', 'kaffee', 'starbucks', 'backerei', 'coffee shop'],
  hotel: ['hotel', 'beherbergung', 'hostel', 'accor', 'marriott', 'hilton', 'motel one', 'steigenberger'],
  delivery: ['lieferdienst', 'lieferservice', 'lieferando', 'wolt', 'flink', 'gorillas', 'kurierdienst'],
  event: ['veranstaltungsort', 'messe', 'stadion', 'arena', 'venue', 'konzert', 'event location'],
}

/**
 * Title tokens that mark a career / qualified-professional role. A title like
 * "Steuerberater" or "Senior Backend Engineer" is not flexible work no matter
 * what perk boilerplate its description contains, so these damp EVERY dimension
 * (v2.4.2 — previously they damped only role families, which let a tax adviser
 * be labelled "evening" from the word "Feierabend").
 */
const CAREER_SENIORITY = [
  // Management
  'leiter', 'leiterin', 'leitung', 'manager', 'managerin', 'teamleiter', 'filialleiter',
  'marktleiter', 'bezirksleiter', 'abteilungsleiter', 'geschaftsfuhrer', 'prokurist',
  'head', 'director', 'chief', 'vp', 'vorstand', 'partner',
  // Seniority markers
  'senior', 'lead', 'principal', 'staff', 'expert', 'spezialist', 'specialist',
  // Regulated / qualified professions
  'steuerberater', 'steuerfachangestellte', 'wirtschaftsprufer', 'rechtsanwalt',
  'anwalt', 'jurist', 'notar', 'arzt', 'arztin', 'facharzt', 'apotheker',
  'psychologe', 'therapeut', 'architekt', 'ingenieur', 'wirtschaftsingenieur',
  'buchhalter', 'bilanzbuchhalter', 'controller', 'auditor',
  // Technical / knowledge work
  'engineer', 'developer', 'entwickler', 'softwareentwickler', 'programmierer',
  'consultant', 'berater', 'analyst', 'scientist', 'data', 'devops', 'architect',
  'referent', 'projektleiter', 'produktmanager', 'account', 'recruiter',
]

// Every alias table is folded once, at load, into the same normalized space
// the text is compared in.
const FOLDED_EMPLOYMENT = foldAliases(EMPLOYMENT_ALIASES)
const FOLDED_ROLE = foldAliases(ROLE_ALIASES)
const FOLDED_WORKPLACE = foldAliases(WORKPLACE_ALIASES)
const FOLDED_CAREER = [...new Set(CAREER_SENIORITY.map(normalizeAlias).filter(Boolean))]
const FOLDED_PERKS = [...new Set(PERK_PHRASES.map(normalizeAlias).filter(Boolean))]

// Weights per signal location. Title is the strongest evidence.
//
// v2.4.2: description weight dropped 1.5 -> 1 and the threshold raised 1.5 -> 2.
// Previously a SINGLE incidental description word scored exactly the threshold,
// so one mention of an office "Küche" in a perks list was enough to tag a job
// as kitchen work. Now: a title hit (3) qualifies on its own, an employer/brand
// hit (2) qualifies for workplace, and description evidence needs at least two
// DISTINCT aliases (1 + 1) before it can assert anything by itself.
const WEIGHT = { title: 3, description: 1, employer: 2 } as const
const INCLUDE_THRESHOLD = 2
// A career title damps every dimension hard enough that even a title hit
// (3 * 0.2 = 0.6) stays below the threshold.
const CAREER_DAMP = 0.2

type Hit = { value: string; where: TaxonomyEvidence['where']; matched: string; weight: number }

function collect(
  dimension: TaxonomyDimension,
  aliases: Record<string, string[]>,
  fields: { title: string; description: string; context: string },
): { scores: Map<string, number>; evidence: TaxonomyEvidence[] } {
  const hits: Hit[] = []
  for (const [value, list] of Object.entries(aliases)) {
    for (const alias of list) {
      if (hasToken(fields.title, alias)) hits.push({ value, where: 'title', matched: alias, weight: WEIGHT.title })
      else if (hasToken(fields.description, alias)) hits.push({ value, where: 'description', matched: alias, weight: WEIGHT.description })
      else if (dimension === 'workplace' && hasToken(fields.context, alias)) hits.push({ value, where: 'employer', matched: alias, weight: WEIGHT.employer })
    }
  }
  const scores = new Map<string, number>()
  const evidence: TaxonomyEvidence[] = []
  const seen = new Set<string>()
  for (const hit of hits) {
    scores.set(hit.value, (scores.get(hit.value) ?? 0) + hit.weight)
    const key = `${hit.value}:${hit.where}:${hit.matched}`
    if (!seen.has(key)) {
      seen.add(key)
      evidence.push({ dimension, value: hit.value, matched: hit.matched, where: hit.where })
    }
  }
  return { scores, evidence }
}

/**
 * Classify a title/description into the three flexible dimensions. Pure and
 * deterministic. Returns selected values (score ≥ threshold), a 0..1 confidence
 * per value, and the evidence that produced each.
 */
/** True when a title reads as a career / qualified-professional role. */
export function isCareerTitle(title: string): boolean {
  const padded = normalize(title)
  return FOLDED_CAREER.some((token) => hasToken(padded, token))
}

export function classifyFlexible(input: ClassifyInput): FlexibleClassification {
  const title = normalize(input.title)
  const description = stripPerkPhrases(normalize(input.description ?? ''))
  const context = normalize([input.employer, input.brand].filter(Boolean).join(' '))
  const fields = { title, description, context }

  const careerTitle = FOLDED_CAREER.some((token) => hasToken(title, token))

  const emp = collect('employment', FOLDED_EMPLOYMENT, fields)
  const role = collect('roleFamily', FOLDED_ROLE, fields)
  const place = collect('workplace', FOLDED_WORKPLACE, fields)

  const confidence: Record<string, number> = {}
  const evidence: TaxonomyEvidence[] = [...emp.evidence, ...role.evidence, ...place.evidence]

  const select = <T extends string>(
    dimension: TaxonomyDimension,
    scores: Map<string, number>,
    damp = false,
  ): T[] => {
    const chosen: T[] = []
    for (const [value, rawScore] of scores) {
      const score = damp && careerTitle ? rawScore * CAREER_DAMP : rawScore
      const conf = Math.min(1, score / WEIGHT.title)
      confidence[`${dimension}:${value}`] = Math.round(conf * 100) / 100
      if (score >= INCLUDE_THRESHOLD) chosen.push(value as T)
    }
    return chosen
  }

  // v2.4.2: a career title now damps EMPLOYMENT as well as role families.
  // Previously only role families were damped, so a professional role still
  // collected arrangement tags ("evening", "weekend") from perk boilerplate.
  //
  // Workplace is deliberately NOT damped: it describes the employer ("REWE is a
  // supermarket"), which stays true regardless of how senior the role is.
  return {
    employment: select<FlexibleEmployment>('employment', emp.scores, true),
    roleFamilies: select<FlexibleRoleFamily>('roleFamily', role.scores, true),
    workplaces: select<WorkplaceType>('workplace', place.scores),
    confidence,
    evidence,
  }
}

/** Optional embedding hook (§4). No-op unless a suggester is supplied. */
export type NeuralSuggester = (input: ClassifyInput) => { roleFamily: FlexibleRoleFamily; confidence: number } | null

export function neuralSuggestion(
  input: ClassifyInput,
  suggester?: NeuralSuggester,
): { roleFamily: FlexibleRoleFamily; confidence: number } | null {
  if (!suggester) return null
  const suggestion = suggester(input)
  // A local classifier may only ADD a low-confidence suggestion, never assert.
  if (!suggestion || suggestion.confidence >= 0.6) return null
  return suggestion
}

/**
 * Merge classifier output into an Opportunity WITHOUT overriding employer-
 * published employment terms, and record inferred provenance for anything the
 * classifier added. Published values always win and stay first.
 */
export function applyClassification(
  job: NormalizedJob,
  opts: { source?: string; suggester?: NeuralSuggester } = {},
): NormalizedJob {
  const result = classifyFlexible({
    title: job.title,
    description: job.description,
    employer: job.canonicalEmployer ?? job.company,
    brand: job.brand,
  })

  const published = publishedEmployment(job)
  const employment = dedupe<FlexibleEmployment>([...published, ...result.employment])

  const roleFamilies = dedupe<FlexibleRoleFamily>([...(job.roleFamilies ?? []), ...result.roleFamilies])
  const workplaces = dedupe<WorkplaceType>([...(job.workplaces ?? []), ...result.workplaces])

  const suggestion = neuralSuggestion(
    { title: job.title, description: job.description, employer: job.company },
    opts.suggester,
  )
  if (suggestion && !roleFamilies.includes(suggestion.roleFamily)) {
    roleFamilies.push(suggestion.roleFamily)
  }

  const fieldProvenance = { ...job.fieldProvenance }
  const source = opts.source ?? job.connectorId ?? job.source
  if (result.employment.length && !fieldProvenance.employment) {
    fieldProvenance.employment = { method: 'inferred', source, observedAt: new Date().toISOString() }
  }
  if (roleFamilies.length && !fieldProvenance.roleFamilies) {
    fieldProvenance.roleFamilies = { method: 'inferred', source, observedAt: new Date().toISOString() }
  }
  if (workplaces.length && !fieldProvenance.workplaces) {
    fieldProvenance.workplaces = { method: 'inferred', source, observedAt: new Date().toISOString() }
  }

  return {
    ...job,
    employment: employment.length ? employment : undefined,
    roleFamilies: roleFamilies.length ? roleFamilies : undefined,
    workplaces: workplaces.length ? workplaces : undefined,
    fieldProvenance: Object.keys(fieldProvenance).length ? fieldProvenance : undefined,
  }
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)]
}
