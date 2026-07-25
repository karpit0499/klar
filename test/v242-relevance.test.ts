// ============================================================================
// v2.4.2 regression guards — result CORRECTNESS for Flexible Work.
//
// The bug this locks down: a €90,000 "Steuerberater" vacancy in Kaiserslautern
// appeared in a Berlin minijob search, tagged "EVENING" and "KITCHEN". Three
// independent defects combined to produce it:
//
//   1. The flexible search had no relevance filter at all, so everything a
//      connector returned was published. (The career search has one; this one
//      never did.)
//   2. The Arbeitnow adapter ignores its query — it is an unfiltered "newest
//      jobs in Germany" feed — so it supplied senior roles in random cities.
//   3. The taxonomy classifier read perk boilerplate as job evidence:
//      "Feierabend" (= end of the working day) became evening work and an
//      office "Küche" became kitchen work, because one description mention
//      scored exactly the inclusion threshold.
// ============================================================================
import { strict as assert } from 'node:assert'
import { classifyFlexible, isCareerTitle } from '../src/flexible/taxonomy'
import { judgeOpportunity, filterOpportunities, cityMatches, payLooksCareer } from '../src/flexible/relevance'
import { SearchSessionModel } from '../src/flexible/searchSession'
import type { NormalizedJob } from '../src/types'
import type { FlexibleQuery } from '../src/flexible/connectors/types'

const query: FlexibleQuery = {
  cities: [{ city: 'Berlin', radius_km: 15 }],
  employment: ['minijob', 'part_time', 'working_student'],
  roleFamilies: [], workplaces: [], keywords: [],
}

function job(patch: Partial<NormalizedJob>): NormalizedJob {
  return {
    id: 'x', source: 'arbeitnow', source_id: 'x', title: '', company: 'C',
    location: { country: 'Deutschland', remote: false }, description: '',
    url: 'https://example.test', salary: {}, tags: [], fetched_at: '', ...patch,
  } as NormalizedJob
}

// --- 1. The exact reported posting is rejected ------------------------------
const reported = job({
  title: 'Steuerberater (m/w/d) in Kaiserslautern, auf Wunsch mit Partnerperspektive, gesucht - mindestens 90.000€',
  location: { city: 'Kaiserslautern', country: 'Deutschland', remote: false },
  salary: { min: 90000, currency: 'EUR', period: 'year' },
})
assert.equal(judgeOpportunity(reported, query).keep, false, 'the reported Steuerberater posting must be rejected')

// It must also fail on its own merits, independent of the city.
const reportedInBerlin = { ...reported, location: { city: 'Berlin', country: 'Deutschland', remote: false } }
const verdict = judgeOpportunity(reportedInBerlin, query)
assert.equal(verdict.keep, false, 'a career role in the right city is still not flexible work')

// --- 2. Perk boilerplate can no longer invent tags --------------------------
const perks = `Wir bieten ein modernes Büro mit voll ausgestatteter Küche, kostenlose Getränke,
flexible Arbeitszeiten und einen planbaren Feierabend. Am Wochenende frei. Ein Job-Rad steht bereit.`
for (const title of [
  'Senior Backend Engineer (Golang)',
  'Engineering Manager - Edge AI',
  'Associate Account Director',
  'Steuerberater (m/w/d)',
  'Rechtsanwalt (m/w/d)',
]) {
  const r = classifyFlexible({ title, description: perks })
  assert.equal(r.employment.length, 0, `${title}: perk text must not create employment tags`)
  assert.equal(r.roleFamilies.length, 0, `${title}: perk text must not create role tags`)
}

// A single incidental description mention is not enough on its own.
assert.equal(
  classifyFlexible({ title: 'Softwaretester (m/w/d)', description: 'Unser Lager ist im Erdgeschoss.' }).roleFamilies.length,
  0,
  'one incidental description word must not assert a role family',
)

// --- 3. Negation is honoured ------------------------------------------------
assert.equal(
  classifyFlexible({ title: 'Bürokraft (m/w/d)', description: 'Keine Nachtschicht und keine Wochenendarbeit.' }).employment.length,
  0,
  '"keine Nachtschicht" must never be read as evidence OF night work',
)

// --- 4. Genuine flexible work still classifies (recall) ---------------------
const positives: [string, string][] = [
  ['Aushilfe (m/w/d) Kasse – Teilzeit', 'REWE Markt.'],
  ['Mitarbeiter Warenverräumung (m/w/d) Minijob', 'Auf 520-Euro-Basis.'],
  ['Küchenhilfe (m/w/d) Wochenende', 'Restaurant.'],
  ['Werkstudent (m/w/d) im Lager', 'Studentische Aushilfe.'],
  ['Paketzusteller (m/w/d) Aushilfe', 'Zustellung.'],
  ['Reinigungskraft (m/w/d) Teilzeit', 'Gebäudereinigung.'],
  ['Servicekraft (m/w/d) auf 520-Euro-Basis', 'Hotel.'],
  ['Saisonkraft Erntehelfer (m/w/d)', 'Sommersaison.'],
]
for (const [title, description] of positives) {
  const r = classifyFlexible({ title, description })
  assert.ok(
    r.employment.length + r.roleFamilies.length > 0,
    `recall regression: "${title}" no longer classifies as flexible work`,
  )
}

// --- 5. Career-title detection ---------------------------------------------
for (const t of ['Steuerberater (m/w/d)', 'Senior Engineer', 'Engineering Manager', 'Rechtsanwalt', 'Facharzt', 'Marktleiter']) {
  assert.ok(isCareerTitle(t), `${t} must be recognised as a career title`)
}
for (const t of ['Aushilfe Kasse', 'Küchenhilfe', 'Paketzusteller', 'Reinigungskraft', 'Werkstudent im Lager']) {
  assert.ok(!isCareerTitle(t), `${t} must NOT be treated as a career title`)
}

// --- 6. Location gate -------------------------------------------------------
assert.ok(cityMatches('Berlin-Mitte', 'Berlin'), 'district of the requested city matches')
assert.ok(cityMatches('10115 Berlin', 'Berlin'), 'postcode-prefixed city matches')
assert.ok(!cityMatches('Kaiserslautern', 'Berlin'), 'unrelated city must not match')
assert.ok(!cityMatches('Lauter', 'Kaiserslautern'), 'substring of another city must not match')
assert.equal(
  judgeOpportunity(job({ title: 'Kassierer (m/w/d) Minijob', location: { city: 'Hamburg', country: 'Deutschland', remote: false } }), query).keep,
  false, 'a perfect flexible job in the wrong city is still rejected',
)
assert.equal(
  judgeOpportunity(job({ title: 'Telefonist Minijob im Homeoffice (m/w/d)', location: { city: 'Mainz', country: 'Deutschland', remote: true } }), query).keep,
  true, 'a remote flexible job is location-independent',
)

// --- 7. Pay gate ------------------------------------------------------------
assert.ok(payLooksCareer(job({ salary: { min: 90000, period: 'year' } })), '90k/year is a career salary')
assert.ok(!payLooksCareer(job({ salary: { min: 13.5, period: 'hour' } })), '13.50/hour is flexible pay')
assert.ok(!payLooksCareer(job({ salary: {} })), 'unknown pay is not evidence against a job')

// --- 8. Keeps: the gate must not be over-eager ------------------------------
const keepers: [string, NormalizedJob][] = [
  ['minijob in the requested city', job({ title: 'Kassierer (m/w/d) Minijob', location: { city: 'Berlin', country: 'Deutschland', remote: false } })],
  ['district of the requested city', job({ title: 'Aushilfe (m/w/d) Kasse – Teilzeit', location: { city: 'Berlin-Mitte', country: 'Deutschland', remote: false } })],
  ['official route card', job({ kind: 'open_entry', title: 'REWE — official job search', cityAvailability: ['Berlin'], location: { city: 'Berlin', country: 'Deutschland', remote: false } })],
  ['curated employer, plain title', job({ title: 'Mitarbeiter (m/w/d) Markt', connectorId: 'rewe-group', location: { city: 'Berlin', country: 'Deutschland', remote: false } })],
]
for (const [label, candidate] of keepers) {
  assert.equal(judgeOpportunity(candidate, query).keep, true, `over-filtering: ${label} must be kept`)
}

// --- 9. The gate is actually wired into the session -------------------------
{
  const model = new SearchSessionModel({
    id: 't', startedAt: 0, deadlineAt: 60_000, query,
    connectors: [{ connectorId: 'baseline-arbeitnow', employerFamily: 'Arbeitnow', type: 'api' }],
  })
  model.ingest('baseline-arbeitnow', {
    opportunities: [
      reported,
      job({ title: 'Senior Data Scientist', location: { city: 'München', country: 'Deutschland', remote: false } }),
      job({ title: 'Kassierer (m/w/d) Minijob', location: { city: 'Berlin', country: 'Deutschland', remote: false } }),
    ],
    usedFallback: false,
  }, 10)
  model.finish('all_done')
  const snap = model.snapshot(1000)
  assert.equal(snap.totalCount, 1, 'only the genuine flexible job survives the session gate')
  assert.equal(snap.sources[0].filteredOut, 2, 'the source reports how many it dropped')
  assert.ok(snap.filtered.location + snap.filtered.career > 0, 'rejection reasons are counted')
}

// --- 10. A model with no query stays a pure accumulator ---------------------
{
  const model = new SearchSessionModel({
    id: 't2', startedAt: 0, deadlineAt: 60_000,
    connectors: [{ connectorId: 'c', employerFamily: 'C', type: 'api' }],
  })
  model.ingest('c', { opportunities: [reported], usedFallback: false }, 1)
  model.finish('all_done')
  assert.equal(model.snapshot(1).totalCount, 1, 'without a query the model must not filter')
}

// --- 11. Real vacancies rank above open-entry route cards -------------------
{
  const model = new SearchSessionModel({
    id: 't3', startedAt: 0, deadlineAt: 60_000, query,
    connectors: [{ connectorId: 'c', employerFamily: 'C', type: 'api' }],
  })
  model.ingest('c', {
    opportunities: [
      job({ id: 'r1', kind: 'open_entry', title: 'Lidl — official job search', cityAvailability: ['Berlin'], location: { city: 'Berlin', country: 'Deutschland', remote: false } }),
      job({ id: 'r2', kind: 'open_entry', title: 'REWE — official job search', cityAvailability: ['Berlin'], location: { city: 'Berlin', country: 'Deutschland', remote: false } }),
      job({ id: 'v1', title: 'Kassierer (m/w/d) Minijob', location: { city: 'Berlin', country: 'Deutschland', remote: false } }),
    ],
    usedFallback: false,
  }, 1)
  model.finish('all_done')
  const first = model.snapshot(1).pages[0]
  assert.equal(first[0].id, 'v1', 'a real vacancy must lead page 1, not a fallback route card')
  assert.equal(first[1].kind, 'open_entry', 'route cards follow, in arrival order')
}

// --- 12. Filter bookkeeping -------------------------------------------------
{
  const outcome = filterOpportunities([reported, job({ title: 'Kassierer (m/w/d) Minijob', location: { city: 'Berlin', country: 'Deutschland', remote: false } })], query)
  assert.equal(outcome.kept.length, 1)
  assert.equal(outcome.rejected.length, 1)
  assert.equal(outcome.rejected[0].reason, 'location')
}

console.log('v242-relevance.test.ts: all tests passed')