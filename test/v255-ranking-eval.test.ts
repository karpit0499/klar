// Run with: npx tsx test/v255-ranking-eval.test.ts
// Three independent career profiles gate the zero-token default. Flexible Work
// is tested separately because it never enters the career matcher at all.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { scoreJob } from '../src/match/prefilter.ts'
import { makeJob } from '../src/sources/normalize.ts'
import type { NormalizedJob, Preferences, Profile } from '../src/types.ts'

type Gold = { job: NormalizedJob; label: 0 | 1 | 2 | 3 }
type Scenario = { name: string; profile: Profile; prefs: Preferences; gold: Gold[] }

const recent = new Date().toISOString()
function job(id: string, title: string, description: string): NormalizedJob {
  return makeJob({
    source: 'greenhouse',
    source_id: id,
    title,
    company: 'Klar Eval GmbH',
    location: { country: 'DE', city: 'Berlin', remote: false },
    description,
    url: `https://example.test/${id}`,
    posted_at: recent,
  })
}

function profile(title: string, skills: string[], summary: string): Profile {
  return {
    summary,
    titles: [{ title }],
    skills: skills.map((name) => ({ name })),
    domains: [],
    totalYears: 2,
    education: [],
    languages: [],
    certifications: [],
    rawText: `${summary} ${skills.join(' ')}`,
  }
}

function prefs(targetTitles: string[], fields: string[], seniority: Preferences['seniority']): Preferences {
  return {
    targetTitles,
    fields,
    seniority,
    salary: { currency: 'EUR', period: 'year' },
    locations: [{ city: 'Berlin', radius_km: 30 }],
    workAuth: {},
    languages: [],
    mustHaves: [],
    dealbreakers: [],
  }
}

const scenarios: Scenario[] = [
  {
    name: 'experienced data scientist',
    profile: profile('Data Scientist', ['Python', 'SQL', 'TensorFlow', 'BigQuery'], 'Five years in data science and ML.'),
    prefs: prefs(['Data Scientist', 'Machine Learning Engineer'], ['Machine Learning'], 'mid'),
    gold: [
      { job: job('ds-1', 'Data Scientist', 'Python SQL experiments and TensorFlow models.'), label: 3 },
      { job: job('ds-2', 'Machine Learning Engineer', 'Python ML pipelines and BigQuery.'), label: 3 },
      { job: job('ds-3', 'Applied Data Scientist', 'Statistics Python SQL and experimentation.'), label: 3 },
      { job: job('ds-4', 'Data Engineer', 'ETL Airflow SQL.'), label: 2 },
      { job: job('ds-5', 'Backend Engineer', 'Java Spring services.'), label: 1 },
      { job: job('ds-6', 'Store Assistant', 'Retail shelves and checkout.'), label: 0 },
    ],
  },
  {
    name: 'career changer into analytics',
    profile: profile('Email Marketing Specialist', ['Excel', 'SQL', 'Google Analytics', 'A/B Testing'], 'Lifecycle marketer moving into data analysis.'),
    prefs: prefs(['Data Analyst', 'Business Intelligence Analyst'], ['Data', 'Business Intelligence'], 'junior'),
    gold: [
      { job: job('cc-1', 'Junior Data Analyst', 'SQL Excel dashboards and A/B test reporting.'), label: 3 },
      { job: job('cc-2', 'Business Intelligence Analyst', 'Power BI SQL stakeholder reporting.'), label: 3 },
      { job: job('cc-3', 'Product Data Analyst', 'Google Analytics SQL funnels and experiments.'), label: 3 },
      { job: job('cc-4', 'Marketing Analyst', 'Campaign reporting and Excel.'), label: 2 },
      { job: job('cc-5', 'CRM Manager', 'Email campaigns and lifecycle journeys.'), label: 1 },
      { job: job('cc-6', 'Warehouse Operative', 'Picking and packing.'), label: 0 },
    ],
  },
  {
    name: 'student entering data and BI',
    profile: profile('Student Assistant', ['Excel', 'SQL', 'Power BI'], 'Business student with coursework dashboards and SQL projects.'),
    prefs: prefs(['Working Student Data Analyst', 'Data Intern', 'Junior BI Analyst'], ['Data', 'BI'], 'intern'),
    gold: [
      { job: job('st-1', 'Working Student Data Analyst', 'Excel SQL dashboards for the analytics team.'), label: 3 },
      { job: job('st-2', 'Data Analyst Intern', 'SQL reporting and Power BI.'), label: 3 },
      { job: job('st-3', 'Junior BI Analyst', 'Power BI Excel and data quality.'), label: 3 },
      { job: job('st-4', 'Working Student Finance', 'Excel budgets and monthly reporting.'), label: 2 },
      { job: job('st-5', 'Senior Data Platform Lead', 'Lead architecture and team management.'), label: 1 },
      { job: job('st-6', 'Delivery Rider', 'Bike delivery shifts.'), label: 0 },
    ],
  },
]

for (const scenario of scenarios) {
  const ranked = scenario.gold
    .map((entry) => ({ ...entry, score: scoreJob(entry.job, scenario.profile, scenario.prefs) }))
    .sort((a, b) => b.score - a.score)
  const precisionAt3 = ranked.slice(0, 3).filter((entry) => entry.label >= 2).length / 3
  console.log(`[v2.5.5 ${scenario.name}] precision@3=${precisionAt3.toFixed(2)}`)
  assert.ok(precisionAt3 >= 0.95, `${scenario.name}: deterministic precision@3 gates the default`)
  assert.ok(
    ranked.filter((entry) => entry.label === 3)
      .every((strong) => ranked.filter((entry) => entry.label === 0)
        .every((irrelevant) => strong.score > irrelevant.score)),
    `${scenario.name}: every strong role outranks every irrelevant role`,
  )
}

const root = fileURLToPath(new URL('..', import.meta.url))
const flexible = readFileSync(`${root}/src/ui/FlexibleSearch.tsx`, 'utf8')
assert.doesNotMatch(flexible, /runMatching|rerankAll|chatComplete/, 'Flexible Work remains a separate zero-AI search path')

console.log('v255-ranking-eval.test.ts: all tests passed')