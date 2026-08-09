import { stableHash } from '../../src/lib/hash.ts'
import type { NormalizedJob, Preferences, Profile } from '../../src/types.ts'
import type { ReviewScenario, RelevanceLabel, ReviewedJob } from './reviewerProtocol.ts'

export type SyntheticRankingItem = {
  job: NormalizedJob
  label: RelevanceLabel
  knownHardMismatch: boolean
}

export type SyntheticRankingScenario = {
  id: string
  profile: Profile
  preferences: Preferences
  items: SyntheticRankingItem[]
  review: ReviewScenario
}

type ScenarioDefinition = {
  id: string
  language: ReviewScenario['language']
  family: string
  seniority: Preferences['seniority']
  target: string
  fields: string[]
  profileTitle: string
  skills: string[]
  exactTitle: string
  adjacentTitle: string
  weakTitle: string
  irrelevantTitle: string
  required: string[]
  preferred: string
  city: string
}

const DEFINITIONS: ScenarioDefinition[] = [
  {
    id: 'data-en-mid',
    language: 'en',
    family: 'data/analytics',
    seniority: 'mid',
    target: 'Data Analyst',
    fields: ['Data', 'Business Intelligence'],
    profileTitle: 'Data Analyst',
    skills: ['SQL', 'Excel', 'Power BI', 'A/B Testing'],
    exactTitle: 'Data Analyst',
    adjacentTitle: 'Business Intelligence Analyst',
    weakTitle: 'Marketing Analyst',
    irrelevantTitle: 'Store Assistant',
    required: ['SQL', 'Excel'],
    preferred: 'Power BI',
    city: 'Berlin',
  },
  {
    id: 'software-en-senior',
    language: 'en',
    family: 'software/product',
    seniority: 'senior',
    target: 'Senior Software Engineer',
    fields: ['Software', 'Technology'],
    profileTitle: 'Software Engineer',
    skills: ['TypeScript', 'React', 'Docker', 'Git'],
    exactTitle: 'Senior Software Engineer',
    adjacentTitle: 'Senior Backend Developer',
    weakTitle: 'Data Engineer',
    irrelevantTitle: 'Financial Controller',
    required: ['TypeScript', 'Git'],
    preferred: 'Docker',
    city: 'Munich',
  },
  {
    id: 'industrial-de-mid',
    language: 'de',
    family: 'industrial engineering/manufacturing',
    seniority: 'mid',
    target: 'Industrial Engineer',
    fields: ['Industrial', 'Manufacturing'],
    profileTitle: 'Industrial Engineer',
    skills: ['SAP', 'Project Management', 'Excel'],
    exactTitle: 'Industrial Engineer',
    adjacentTitle: 'Manufacturing Engineer',
    weakTitle: 'Process Engineer',
    irrelevantTitle: 'CRM Manager',
    required: ['SAP', 'Project Management'],
    preferred: 'Excel',
    city: 'Stuttgart',
  },
  {
    id: 'crm-mixed-junior',
    language: 'mixed',
    family: 'marketing/CRM',
    seniority: 'junior',
    target: 'Junior CRM Manager',
    fields: ['CRM', 'Lifecycle Marketing'],
    profileTitle: 'CRM Specialist',
    skills: ['CRM', 'HubSpot', 'Marketing Automation', 'A/B Testing'],
    exactTitle: 'Junior CRM Manager',
    adjacentTitle: 'Lifecycle Marketing Specialist',
    weakTitle: 'Account Manager',
    irrelevantTitle: 'Warehouse Operative',
    required: ['CRM', 'Marketing Automation'],
    preferred: 'HubSpot',
    city: 'Hamburg',
  },
  {
    id: 'operations-de-intern',
    language: 'de',
    family: 'operations/supply chain',
    seniority: 'intern',
    target: 'Working Student Supply Chain',
    fields: ['Supply Chain', 'Logistics'],
    profileTitle: 'Student Assistant',
    skills: ['Excel', 'SAP', 'Data Analysis'],
    exactTitle: 'Working Student Supply Chain',
    adjacentTitle: 'Logistics Intern',
    weakTitle: 'Business Analyst',
    irrelevantTitle: 'Social Media Manager',
    required: ['Excel', 'Data Analysis'],
    preferred: 'SAP',
    city: 'Cologne',
  },
  {
    id: 'finance-en-junior',
    language: 'en',
    family: 'finance/administration',
    seniority: 'junior',
    target: 'Junior Financial Analyst',
    fields: ['Finance'],
    profileTitle: 'Finance Analyst',
    skills: ['Excel', 'SQL', 'Data Analysis'],
    exactTitle: 'Junior Financial Analyst',
    adjacentTitle: 'Junior Controller',
    weakTitle: 'Data Analyst',
    irrelevantTitle: 'Frontend Developer',
    required: ['Excel', 'Data Analysis'],
    preferred: 'SQL',
    city: 'Frankfurt',
  },
]

const AS_OF = '2026-07-01T12:00:00.000Z'

export const SYNTHETIC_RANKING_CORPUS: SyntheticRankingScenario[] =
  DEFINITIONS.map(buildScenario)

function buildScenario(definition: ScenarioDefinition): SyntheticRankingScenario {
  const profile: Profile = {
    summary: `${definition.profileTitle} with evidence in ${definition.skills.join(', ')}.`,
    titles: [{ title: definition.profileTitle, seniority: definition.seniority, years: 4 }],
    skills: definition.skills.map((name) => ({ name })),
    domains: definition.fields,
    totalYears: definition.seniority === 'intern' ? 1 : definition.seniority === 'junior' ? 2 : 4,
    education: [{ degree: 'Bachelor', field: definition.fields[0], institution: 'Synthetic University' }],
    languages: [
      { lang: 'German', level: 'B2' },
      { lang: 'English', level: 'C1' },
    ],
    certifications: [],
  }
  const preferences: Preferences = {
    targetTitles: [definition.target],
    fields: definition.fields,
    seniority: definition.seniority,
    salary: { min: 50_000, currency: 'EUR', period: 'year' },
    locations: [{ city: definition.city, radius_km: 40 }],
    hybridOk: true,
    workAuth: { needsVisaSponsorship: true },
    languages: [],
    mustHaves: definition.required,
    dealbreakers: [],
    contractType: ['full time'],
  }

  const items: SyntheticRankingItem[] = []
  for (let index = 0; index < 50; index += 1) {
    const bucket =
      index < 10
        ? 'strong'
        : index < 20
          ? 'plausible'
          : index < 30
            ? 'adjacent'
            : index < 40
              ? 'weak'
              : index < 45
                ? 'irrelevant'
                : 'hard'
    const hard = bucket === 'hard'
    const label: RelevanceLabel =
      bucket === 'strong' || bucket === 'plausible'
        ? 3
        : bucket === 'adjacent'
          ? 2
          : bucket === 'weak'
            ? 1
            : 0
    const title =
      bucket === 'strong' || bucket === 'plausible' || hard
        ? definition.exactTitle
        : bucket === 'adjacent'
          ? definition.adjacentTitle
          : bucket === 'weak'
            ? definition.weakTitle
            : definition.irrelevantTitle
    const skillLines =
      bucket === 'strong' || hard
        ? definition.required.map((skill) => `- ${skill} is required.`)
        : bucket === 'plausible'
          ? [`- ${definition.required[0]} is required.`, `- ${definition.required[1]} is preferred.`]
          : bucket === 'adjacent'
            ? [`- ${definition.required[0]} is required.`]
            : ['- Communication is required.']
    const languageLine = definition.language === 'de'
      ? '- Deutsch B2 ist erforderlich.'
      : '- English B2 is required.'
    const description = [
      definition.language === 'de' ? 'Anforderungen:' : 'Requirements:',
      ...skillLines,
      languageLine,
      definition.language === 'de' ? 'Wünschenswert:' : 'Preferred:',
      `- ${definition.preferred} is preferred.`,
      hard ? '- No visa sponsorship is available.' : '',
      bucket === 'irrelevant'
        ? 'Daily work is unrelated to the requested professional function.'
        : `Work in ${definition.fields.join(' and ')} with evidence-led responsibilities.`,
    ].filter(Boolean).join('\n')
    items.push({
      job: syntheticJob(definition, index, title, description, bucket),
      label,
      knownHardMismatch: hard,
    })
  }

  const reviewedJobs: ReviewedJob[] = items.map((item) => ({
    jobId: item.job.id,
    sourceSnapshotId: `synthetic:${item.job.id}:v1`,
    extractionConfidence: 'high',
    difficulty: item.label === 1 || item.label === 2 ? 'difficult' : 'routine',
    requirements: definition.required.map((text) => ({
      text,
      priority: 'required',
      evidencePaths: [`profile.skills[${definition.skills.indexOf(text)}]`],
    })),
    constraints: [{
      key: 'work_authorization',
      judgment: item.knownHardMismatch ? 'known_mismatch' : 'unknown',
      rationale: item.knownHardMismatch
        ? 'Synthetic posting explicitly states that sponsorship is unavailable.'
        : 'Synthetic posting does not state a sponsorship policy.',
    }],
    reviewerLabels: [],
    adjudication: {
      finalLabel: item.label,
      adjudicatorId: 'synthetic-generator',
      reason: 'Deterministic fixture label; never eligible for a human gold set.',
    },
  }))
  const pairs = [
    { preferredId: items[0].job.id, otherId: items[20].job.id, difficulty: 'difficult' as const, reviewerIds: [], reason: 'Exact role and full evidence beats an adjacent role.' },
    { preferredId: items[10].job.id, otherId: items[30].job.id, difficulty: 'difficult' as const, reviewerIds: [], reason: 'Plausible role fit beats a weak cross-function role.' },
    { preferredId: items[20].job.id, otherId: items[45].job.id, difficulty: 'routine' as const, reviewerIds: [], reason: 'An adjacent eligible role beats an explicit hard mismatch.' },
  ]
  const review: ReviewScenario = {
    schemaVersion: 1,
    id: definition.id,
    status: 'synthetic_fixture',
    language: definition.language,
    jobFamily: definition.family,
    seniority: definition.seniority,
    candidateProfileVersion: 'synthetic-profile-v1',
    candidateProfileHash: stableHash(JSON.stringify(profile)),
    jobs: reviewedJobs,
    pairs,
    adjudicationNotes: [
      'Synthetic fixture only.',
      'Do not merge these labels into a human-reviewed evaluation or training set.',
    ],
  }
  return { id: definition.id, profile, preferences, items, review }
}

function syntheticJob(
  definition: ScenarioDefinition,
  index: number,
  title: string,
  description: string,
  bucket: string,
): NormalizedJob {
  const id = `${definition.id}-${String(index).padStart(2, '0')}`
  return {
    id,
    source: index % 2 ? 'greenhouse' : 'arbeitnow',
    source_id: id,
    title,
    company: `Synthetic ${definition.family} ${String(index).padStart(2, '0')}`,
    location: {
      city: definition.city,
      country: 'Germany',
      remote: index % 3 === 0,
    },
    description,
    url: `https://example.invalid/jobs/${id}`,
    posted_at: bucket === 'weak' ? '2026-05-01T12:00:00.000Z' : '2026-06-28T12:00:00.000Z',
    salary: { min: 52_000, max: 68_000, currency: 'EUR', period: 'year' },
    employment_type: 'full time',
    seniority: definition.seniority,
    language: definition.language === 'de' ? 'de' : 'en',
    tags: [...definition.fields, ...definition.required],
    fetched_at: AS_OF,
    sourceConfidence: index % 2 ? 'structured' : 'published',
  }
}