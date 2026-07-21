// Run with: npx tsx test/embedders.test.ts
// Covers the async embedder seam + the comparison harness (features 18 & 19).
// It runs FULLY OFFLINE: it compares the hashing embedder against the char-ngram
// stand-in candidate, and exercises the async ranking path with a deterministic
// MOCK neural embedder (the real one needs a 100 MB download — that download is
// exactly what this gate decides whether to pay for).
import { defaultEmbedder } from '../src/match/embeddings.ts'
import {
  syncToAsync, makeCharNgramEmbedder, scoreBySimilarityAsync, semanticPrefilterAsync,
  type AsyncTextEmbedder,
} from '../src/match/neuralEmbedder.ts'
import { evaluateEmbedder, compareEmbedders, type GoldItem } from '../src/match/embedderCompare.ts'
import { makeJob } from '../src/sources/normalize.ts'
import type { NormalizedJob, Profile, Preferences } from '../src/types.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

const profile: Profile = {
  summary: 'DS 5y', titles: [{ title: 'Data Scientist' }],
  skills: [{ name: 'Python' }, { name: 'SQL' }, { name: 'TensorFlow' }, { name: 'BigQuery' }],
  domains: ['machine learning'], totalYears: 5, education: [], languages: [], certifications: [], rawText: '',
}
const prefs: Preferences = {
  targetTitles: ['Data Scientist', 'Machine Learning Engineer'], fields: ['ML'], seniority: 'mid',
  salary: { currency: 'EUR', period: 'year' }, locations: [{ city: 'Berlin', radius_km: 30 }],
  workAuth: {}, languages: [], mustHaves: [], dealbreakers: [],
}
function j(id: string, title: string, description: string): NormalizedJob {
  return makeJob({ source: 'ba', source_id: id, title, company: 'C',
    location: { country: 'DE', remote: false, city: 'Berlin' }, description, url: 'https://x/' + id })
}
const gold: GoldItem[] = [
  { job: j('1', 'Senior Data Scientist', 'Build ML models in Python with TensorFlow and BigQuery.'), label: 3 },
  { job: j('2', 'Machine Learning Engineer', 'Python, PyTorch, ML pipelines on GCP and BigQuery.'), label: 3 },
  { job: j('3', 'Data Scientist', 'Statistics, experimentation, SQL and Python modelling.'), label: 3 },
  { job: j('4', 'Data Engineer', 'ETL with Airflow, SQL, BigQuery and Python.'), label: 2 },
  { job: j('5', 'Data Analyst', 'SQL dashboards, reporting and Excel analysis.'), label: 2 },
  { job: j('6', 'Backend Engineer', 'Java, Spring, microservices and REST APIs.'), label: 1 },
  { job: j('7', 'Truck Driver', 'Driving, logistics and parcel delivery routes.'), label: 0 },
  { job: j('8', 'Landscape Gardener', 'Gardening, mowing lawns and trimming hedges.'), label: 0 },
]

async function main() {
  const hashing = syncToAsync(defaultEmbedder)
  const charNgram = makeCharNgramEmbedder()

  // ---- async ranking works + orders sensibly -------------------------------
  const ranked = await scoreBySimilarityAsync(gold.map((g) => g.job), profile, prefs, hashing)
  ok(ranked.length === 8, 'async: ranks every job')
  const topIds = ranked.slice(0, 3).map((r) => r.job.source_id)
  ok(!topIds.includes('7') && !topIds.includes('8'), 'async: irrelevant roles are not in the top 3')

  // ---- async pre-filter caps to limit + drops dealbreakers -----------------
  const cut = await semanticPrefilterAsync(gold.map((g) => g.job), profile, prefs, 4, hashing)
  ok(cut.length === 4, 'async: pre-filter respects the limit')

  // ---- evaluate a single embedder ------------------------------------------
  const m = await evaluateEmbedder(hashing, gold, profile, prefs)
  ok(m.precisionAt3 >= 0.66, 'eval: hashing precision@3 is strong on the gold set')
  ok(m.spearman > 0.4, 'eval: hashing correlates with human labels')

  // ---- the comparison harness (the gate for feature 19) --------------------
  const result = await compareEmbedders(hashing, charNgram, gold, profile, prefs)
  ok(!!result.baseline && !!result.candidate, 'compare: reports metrics for both')
  ok(typeof result.recommendCandidate === 'boolean', 'compare: produces a ship recommendation')
  ok(/justified|bar|hashing/.test(result.reason), 'compare: explains the recommendation')
  console.log(`[compare] baseline p@3=${result.baseline.precisionAt3.toFixed(2)} ρ=${result.baseline.spearman.toFixed(2)} | candidate p@3=${result.candidate.precisionAt3.toFixed(2)} ρ=${result.candidate.spearman.toFixed(2)} → ${result.recommendCandidate ? 'SHIP' : 'KEEP HASHING'}`)

  // ---- gate arithmetic: a clearly-better candidate over a WEAK baseline ----
  // (Real hashing already aces this gold set, so we need headroom to show the
  //  gate flip. A constant-vector embedder is a deliberately weak baseline.)
  const weak: AsyncTextEmbedder = { id: 'mock-weak', dim: 4, async embed() { return [1, 0, 0, 0] } }
  const perfect: AsyncTextEmbedder = {
    id: 'mock-perfect', dim: 4,
    // Encode the label directly so ranking is perfect — stands in for a strong
    // neural embedder to prove the gate flips to SHIP on a real gain.
    async embed(text: string) {
      const g = gold.find((x) => text.includes(x.job.title))
      return [g ? g.label : 0, 0, 0, 0]
    },
  }
  const strong = await compareEmbedders(weak, perfect, gold, profile, prefs)
  ok(strong.recommendCandidate === true, 'gate: a genuinely better embedder (over a weak baseline) is recommended to ship')

  // ---- gate arithmetic: an identical candidate is NOT recommended ----------
  const same = await compareEmbedders(hashing, syncToAsync(defaultEmbedder), gold, profile, prefs)
  ok(same.recommendCandidate === false, 'gate: no improvement → keep the free hashing pre-filter')

  console.log(`\nEmbedder tests: ${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })