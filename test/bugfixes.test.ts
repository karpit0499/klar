import { strict as assert } from 'node:assert'
import { tailorResume } from '../src/resume/tailor'
import { validateTailoringResponse } from '../src/llm/tailorResume'
import { extractJdTerms } from '../src/resume/keywords'
import { buildProfilePrompt } from '../src/parse/profile'
import { isFailedMatchPlaceholder, rerankAll } from '../src/match/rerank'
import type { ResumeData } from '../src/resume/types'
import type { NormalizedJob, Preferences, Profile } from '../src/types'

const resume: ResumeData = {
  contact: {
    name: 'Alex Example',
    email: 'alex@example.com',
    links: [],
  },
  summary: 'Product manager.',
  experience: [
    {
      title: 'Product Manager',
      company: 'Example GmbH',
      start: '01/2022',
      current: true,
      bullets: [
        'Led product discovery with customer interviews.',
        'Worked with engineering to ship workflow improvements.',
      ],
    },
  ],
  education: [],
  skills: [{ group: 'Product', items: ['Product discovery', 'Roadmaps'] }],
  languages: [{ lang: 'English', level: 'Native' }],
  projects: [],
  certifications: [],
}

const profile: Profile = {
  summary: 'Product manager',
  titles: [{ title: 'Product Manager', years: 3 }],
  skills: [{ name: 'Product discovery' }],
  domains: ['Software'],
  languages: [{ lang: 'English', level: 'Native' }],
  education: [],
  certifications: [],
  totalYears: 3,
  rawText: 'Product manager with product discovery and engineering collaboration experience.',
}

const preferences: Preferences = {
  targetTitles: ['Product Manager'],
  fields: [],
  seniority: 'senior',
  salary: { min: 70_000, currency: 'EUR', period: 'year' },
  locations: [{ city: 'Berlin', radius_km: 50 }],
  workAuth: {},
  languages: [{ lang: 'German', min_level: 'B2' }],
  mustHaves: ['B2B SaaS'],
  dealbreakers: [],
}

const job: NormalizedJob = {
  id: 'job-1',
  source: 'arbeitnow',
  source_id: 'job-1',
  title: 'Senior Product Manager',
  company: 'Hiring GmbH',
  location: { city: 'Berlin', country: 'DE', remote: false },
  description: 'Lead product discovery and partner with engineering.',
  url: 'https://example.com/job',
  posted_at: '2026-07-21',
  salary: {},
  language: 'de',
  tags: [],
  fetched_at: '2026-07-21T00:00:00.000Z',
}

const validResponse = {
  summary: 'Senior Product Manager mit Schwerpunkt Product Discovery.',
  experience: [
    {
      sourceIndex: 0,
      title: 'Product Manager',
      bullets: [
        {
          text: 'Steuerte die Produktfindung durch strukturierte Kundeninterviews.',
          sourceBulletIndexes: [0],
        },
        {
          text: 'Arbeitete eng mit Engineering zusammen, um Workflows zu verbessern.',
          sourceBulletIndexes: [1],
        },
      ],
    },
  ],
  projects: [],
  changeSummary: ['Relevante Product-Discovery-Erfahrung steht an erster Stelle.'],
}

validateTailoringResponse(validResponse, resume)

assert.throws(
  () =>
    validateTailoringResponse(
      {
        ...validResponse,
        experience: [
          {
            ...validResponse.experience[0],
            bullets: [{ text: 'Invented claim', sourceBulletIndexes: [99] }],
          },
        ],
      },
      resume,
    ),
  /unknown source evidence/,
)

assert.throws(
  () =>
    validateTailoringResponse(
      { ...validResponse, experience: [] },
      resume,
    ),
  /did not return every source role/,
)

const english = tailorResume(resume, { ...job, language: 'en' }, profile)
const german = tailorResume(resume, { ...job, language: 'de' }, profile)
assert.equal(english.language, 'en')
assert.equal(german.language, 'de')

const productPosting = {
  ...job,
  description: 'Own the product from discovery through go-live and go-to-market. Use LLM assistants.',
}
assert.deepEqual(extractJdTerms(productPosting), ['LLM'])

const datedPrompt = buildProfilePrompt('01/2022 – Present', new Date('2026-07-21T00:00:00.000Z'))
assert.match(datedPrompt, /Treat 2026-07-21 as today's date/)
assert.match(datedPrompt, /calculate years from its own date range/)

assert.equal(
  isFailedMatchPlaceholder({
    jobId: 'legacy-failure',
    fitScore: 0,
    verdict: 'weak',
    rationale: 'Scoring failed for this batch.',
    matchedSkills: [],
    missingSkills: [],
    redFlags: [],
    scoredAt: '2026-07-21T00:00:00.000Z',
    modelVersion: 'legacy',
  }),
  true,
)

const originalFetch = globalThis.fetch
globalThis.fetch = async () => new Response('{"error":{"message":"rate limited"}}', { status: 429 })
try {
  const failedBatches = await rerankAll(profile, preferences, [job], 'test-key')
  assert.deepEqual(failedBatches, [], 'failed scoring batches must not become fake 0/100 results')
} finally {
  globalThis.fetch = originalFetch
}

console.log('bugfixes.test.ts: all tests passed')