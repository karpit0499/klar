// Run with: npx tsx test/eval.test.ts
// Evaluation harness for MATCHING QUALITY (feature 1.2). It scores a small,
// hand-labelled gold set with the deterministic pre-filter (and the semantic
// ranker) and reports precision@k + Spearman rank correlation against the human
// labels. This is the evidence that the ranking actually works — the single
// biggest omission for a portfolio piece. It runs offline (no key, no network),
// so it also fits CI. The same gold set can be pushed through the full LLM
// re-rank with a key for an end-to-end number.
import { scoreJob } from '../src/match/prefilter.ts'
import { scoreBySimilarity } from '../src/match/semantic.ts'
import { makeJob } from '../src/sources/normalize.ts'
import type { NormalizedJob, Profile, Preferences } from '../src/types.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

// --- The gold set: (job, human relevance label 0–3) for one candidate --------
const profile: Profile = {
  summary: 'Data scientist, 5y', titles: [{ title: 'Data Scientist' }],
  skills: [{ name: 'Python' }, { name: 'SQL' }, { name: 'TensorFlow' }, { name: 'BigQuery' }],
  domains: ['machine learning'], totalYears: 5, education: [], languages: [], certifications: [], rawText: '',
}
const prefs: Preferences = {
  targetTitles: ['Data Scientist', 'Machine Learning Engineer'], fields: ['ML'], seniority: 'mid',
  salary: { currency: 'EUR', period: 'year' }, locations: [{ city: 'Berlin', radius_km: 30 }],
  workAuth: {}, languages: [], mustHaves: [], dealbreakers: [],
}
const recent = new Date().toISOString()
function j(id: string, title: string, description: string): NormalizedJob {
  return makeJob({
    source: 'ba', source_id: id, title, company: 'C',
    location: { country: 'DE', remote: false, city: 'Berlin' },
    description, url: 'https://x/' + id, posted_at: recent,
  })
}

// label: 3 = strong, 2 = adjacent, 1 = tangential, 0 = irrelevant
const gold: { job: NormalizedJob; label: number }[] = [
  { job: j('1', 'Senior Data Scientist', 'Build ML models in Python with TensorFlow and BigQuery.'), label: 3 },
  { job: j('2', 'Machine Learning Engineer', 'Python, PyTorch, ML pipelines on GCP and BigQuery.'), label: 3 },
  { job: j('3', 'Data Scientist', 'Statistics, experimentation, SQL and Python modelling.'), label: 3 },
  { job: j('4', 'Data Engineer', 'ETL with Airflow, SQL, BigQuery and Python.'), label: 2 },
  { job: j('5', 'Data Analyst', 'SQL dashboards, reporting and Excel analysis.'), label: 2 },
  { job: j('6', 'Backend Engineer', 'Java, Spring, microservices and REST APIs.'), label: 1 },
  { job: j('7', 'Truck Driver', 'Driving, logistics and parcel delivery routes.'), label: 0 },
  { job: j('8', 'Landscape Gardener', 'Gardening, mowing lawns and trimming hedges.'), label: 0 },
]

// --- Metrics -----------------------------------------------------------------
/** Fraction of the top-k ranked items whose label meets `threshold`. */
function precisionAtK(rankedLabels: number[], k: number, threshold: number): number {
  const top = rankedLabels.slice(0, k)
  return top.filter((l) => l >= threshold).length / k
}

/** Average-tie ranks of an array (1 = smallest). */
function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x)
  const r = new Array<number>(xs.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1].x === order[i].x) j++
    const avg = (i + j) / 2 + 1 // average of positions i..j (1-indexed)
    for (let k = i; k <= j; k++) r[order[k].i] = avg
    i = j + 1
  }
  return r
}

function pearson(a: number[], b: number[]): number {
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb
    num += x * y; da += x * x; db += y * y
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db)
}

/** Spearman rank correlation between two score vectors. */
function spearman(a: number[], b: number[]): number {
  return pearson(ranks(a), ranks(b))
}

// --- Evaluate the keyword pre-filter -----------------------------------------
{
  const scored = gold.map((g) => ({ ...g, score: scoreJob(g.job, profile, prefs) }))
  const ranked = [...scored].sort((a, b) => b.score - a.score)
  const rankedLabels = ranked.map((r) => r.label)

  const p3 = precisionAtK(rankedLabels, 3, 2) // relevant = adjacent or better
  const p5 = precisionAtK(rankedLabels, 5, 2)
  const rho = spearman(scored.map((s) => s.score), scored.map((s) => s.label))
  console.log(`\n[keyword]  precision@3=${p3.toFixed(2)}  precision@5=${p5.toFixed(2)}  spearman=${rho.toFixed(3)}`)

  ok(p3 === 1, 'eval(keyword): precision@3 is perfect (top 3 are all relevant)')
  ok(p5 >= 0.8, 'eval(keyword): precision@5 >= 0.8')
  ok(rho >= 0.8, 'eval(keyword): strong rank correlation with human labels')

  // Sanity guarantee: every clearly-strong role outranks every clearly-weak one.
  const strong = scored.filter((s) => s.label === 3)
  const weak = scored.filter((s) => s.label === 0)
  const guaranteed = strong.every((s) => weak.every((w) => s.score > w.score))
  ok(guaranteed, 'eval(keyword): clearly-strong roles always outrank clearly-weak ones')
}

// --- Evaluate the semantic ranker (feature 1.4) ------------------------------
{
  const scored = scoreBySimilarity(gold.map((g) => g.job), profile, prefs)
  const labelOf = new Map(gold.map((g) => [g.job.id, g.label]))
  const rankedLabels = scored.map((s) => labelOf.get(s.job.id) ?? 0)
  const scores = scored.map((s) => s.score)
  const labels = scored.map((s) => labelOf.get(s.job.id) ?? 0)

  const p3 = precisionAtK(rankedLabels, 3, 2)
  const rho = spearman(scores, labels)
  console.log(`[semantic] precision@3=${p3.toFixed(2)}  spearman=${rho.toFixed(3)}`)

  ok(p3 >= 0.66, 'eval(semantic): precision@3 >= 0.66')
  ok(rho >= 0.5, 'eval(semantic): positive rank correlation with human labels')
}

console.log(`\nEval tests: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)