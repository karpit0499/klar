import { strict as assert } from 'node:assert'
import { estimateTailoringOutputTokens } from '../src/llm/budget.ts'
import { TAILORING_OUTPUT } from '../src/llm/jsonSchemas.ts'
import {
  auditTailoringResponse,
  normalizeTailoringResponse,
  systemPrompt,
  tailorResumeWithAi,
  validateTailoringResponse,
} from '../src/llm/tailorResume.ts'
import { normalizeResume } from '../src/resume/canonical.ts'
import { makeJob } from '../src/sources/normalize.ts'

const source = normalizeResume({
  contact: { name: 'Alex Example', links: [] },
  summary: 'Email marketing specialist with HubSpot campaign experience.',
  experience: [
    {
      title: 'Email Marketing Specialist',
      company: 'Example GmbH',
      bullets: [
        'Created email campaigns in HubSpot.',
        'Reported campaign results to the marketing lead.',
        '   ',
      ],
    },
    {
      title: 'Marketing Assistant',
      company: 'Second GmbH',
      bullets: [],
    },
    {
      title: '',
      company: 'Untitled placement',
      bullets: ['Maintained the contact list.'],
    },
  ],
  education: [],
  skills: [{ group: 'Marketing', items: ['HubSpot', 'Email marketing'] }],
  languages: [],
  projects: [
    { name: 'Newsletter project', summary: 'Built a newsletter plan for a course.' },
    { name: 'Empty project' },
  ],
  certifications: [],
})

const job = makeJob({
  source: 'greenhouse',
  source_id: 'email-marketing',
  title: 'Junior Email Marketing Specialist',
  company: 'Hiring GmbH',
  location: { city: 'Berlin', country: 'DE', remote: false },
  description: 'Create email campaigns, report results, and work with HubSpot.',
  url: 'https://example.test/job',
  language: 'en',
})

// The English failure from production: valid JSON stopped before projects and
// the former cosmetic changeSummary field. Missing roles also stay unchanged.
const englishPartial = normalizeTailoringResponse(
  {
    summary: 'Email marketing specialist with HubSpot campaign experience.',
    experience: [
      {
        sourceIndex: 0,
        title: 'Email Marketing Specialist',
        bullets: [
          { text: 'Created email campaigns in HubSpot.', sourceBulletIndexes: [0] },
          // Invalid evidence is not partially accepted; source text fills in.
          { text: 'Invented claim.', sourceBulletIndexes: [99] },
        ],
      },
    ],
    changeSummary: ['Model-authored cosmetic note must be ignored.'],
  },
  source,
  'Deterministic English summary.',
)

validateTailoringResponse(englishPartial, source)
assert.equal(englishPartial.experience.length, source.experience.length)
assert.deepEqual(
  englishPartial.experience[0].bullets.map((bullet) => bullet.sourceBulletIndexes),
  [[0], [1]],
)
assert.equal(
  englishPartial.experience[0].bullets.some((bullet) => bullet.sourceBulletIndexes.includes(99)),
  false,
)
assert.deepEqual(englishPartial.experience[1].bullets, [])
assert.equal(englishPartial.experience[2].title, '', 'a blank source title cannot be invented')
assert.equal(englishPartial.experience[2].bullets[0].text, 'Maintained the contact list.')
assert.equal(englishPartial.projects[0].summary, 'Built a newsletter plan for a course.')
assert.equal(englishPartial.projects[1].summary, '')
assert.deepEqual(englishPartial.changeSummary, [])

// The German failure from production: an empty rewritten bullet becomes the
// exact source sentence, while a supported translated sentence remains.
const germanPartial = normalizeTailoringResponse(
  {
    summary: 'E-Mail-Marketing-Spezialist mit Erfahrung in HubSpot-Kampagnen.',
    experience: [
      {
        sourceIndex: 0,
        title: 'Email Marketing Specialist',
        bullets: [
          { text: '', sourceBulletIndexes: [0] },
          {
            text: 'Berichtete der Marketingleitung über Kampagnenergebnisse.',
            sourceBulletIndexes: [1],
          },
        ],
      },
      {
        sourceIndex: 1,
        title: 'Marketing Assistant',
        // A zero-evidence role must not acquire an invented model bullet.
        bullets: [{ text: 'Erfand eine Aufgabe.', sourceBulletIndexes: [0] }],
      },
    ],
    projects: [
      { sourceIndex: 0, summary: '' },
      { sourceIndex: 1, summary: 'Erfundene Projektbeschreibung.' },
    ],
  },
  source,
  'Deterministische deutsche Zusammenfassung.',
)

validateTailoringResponse(germanPartial, source)
assert.equal(germanPartial.experience[0].bullets[0].text, 'Berichtete der Marketingleitung über Kampagnenergebnisse.')
assert.equal(
  germanPartial.experience[0].bullets.some(
    (bullet) => bullet.text === 'Created email campaigns in HubSpot.',
  ),
  true,
)
assert.deepEqual(germanPartial.experience[1].bullets, [])
assert.equal(germanPartial.projects[0].summary, 'Built a newsletter plan for a course.')
assert.equal(germanPartial.projects[1].summary, '')

// Summary evidence includes the source summary and skills. A truthful HubSpot
// summary is therefore not falsely rejected in either language.
for (const response of [englishPartial, germanPartial]) {
  const audited = auditTailoringResponse(response, source, job, ['HubSpot'])
  assert.equal(
    audited.blockers.some((blocker) => blocker.location === 'summary'),
    false,
  )
}

const schema = TAILORING_OUTPUT.schema as {
  properties: Record<string, unknown>
  required: string[]
}
assert.equal('changeSummary' in schema.properties, false)
assert.equal(schema.required.includes('changeSummary'), false)

for (const language of ['en', 'de'] as const) {
  const prompt = systemPrompt(language)
  assert.doesNotMatch(prompt, /"changeSummary"/)
  assert.match(prompt, /no supplied bullets/i)
  assert.match(prompt, /at most 32 words/)
  assert.match(prompt, /"projects": \[\]/)
}

const normalReservation = estimateTailoringOutputTokens({
  bulletCount: 9,
  roleCount: 3,
  projectsWithSummary: 1,
})
assert.ok(normalReservation >= 1400, `completion headroom is too small: ${normalReservation}`)
assert.ok(normalReservation < 2000, `normal completion reservation regressed: ${normalReservation}`)

// Exercise the complete EN/DE call path with the same partial provider shapes.
// Both requests must finish in one attempt and keep all source sections usable.
const originalFetch = globalThis.fetch
const requestLanguages: string[] = []
globalThis.fetch = async (_input, init) => {
  const request = JSON.parse(String(init?.body)) as {
    messages: { role: string; content: string }[]
  }
  const system = request.messages.find((message) => message.role === 'system')?.content ?? ''
  const german = system.includes('Write all generated prose in German.')
  requestLanguages.push(german ? 'de' : 'en')
  const content = german
    ? JSON.stringify({
        summary: source.summary,
        experience: [{
          sourceIndex: 0,
          title: source.experience[0].title,
          bullets: [{ text: '', sourceBulletIndexes: [0] }],
        }],
      })
    : JSON.stringify({
        summary: source.summary,
        experience: [{
          sourceIndex: 0,
          title: source.experience[0].title,
          bullets: [{ text: source.experience[0].bullets[0].text, sourceBulletIndexes: [0] }],
        }],
      })
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] })
}

try {
  const english = await tailorResumeWithAi(source, { ...job, language: 'en' }, 'test-key', 'en')
  const german = await tailorResumeWithAi(source, { ...job, language: 'de' }, 'test-key', 'de')
  for (const result of [english, german]) {
    assert.equal(result.attempts, 1)
    assert.equal(result.data.experience.length, source.experience.length)
    assert.equal(result.data.projects.length, source.projects.length)
    assert.equal(result.data.experience[0].bullets.length >= 2, true)
  }
  assert.deepEqual(requestLanguages, ['en', 'de'])
} finally {
  globalThis.fetch = originalFetch
}

// Exact production EN path: Groq rejects strict schema because the generated
// object stopped before projects. The client recovers failed_generation and
// tailoring completes from the partial edit set without another paid call.
let failedGenerationCalls = 0
globalThis.fetch = async () => {
  failedGenerationCalls += 1
  return Response.json({
    error: {
      message: 'Generated JSON does not match the expected schema.',
      type: 'invalid_request_error',
      code: 'json_validate_failed',
      failed_generation: JSON.stringify({
        summary: source.summary,
        experience: [{
          sourceIndex: 0,
          title: source.experience[0].title,
          bullets: [{
            text: source.experience[0].bullets[0].text,
            sourceBulletIndexes: [0],
          }],
        }],
      }),
    },
  }, { status: 400 })
}
try {
  const recovered = await tailorResumeWithAi(
    source,
    { ...job, language: 'en' },
    'test-key',
    'en',
  )
  assert.equal(failedGenerationCalls, 1)
  assert.equal(recovered.attempts, 1)
  assert.equal(recovered.data.experience.length, source.experience.length)
  assert.equal(recovered.data.projects.length, source.projects.length)
} finally {
  globalThis.fetch = originalFetch
}

console.log('v2532-tailoring-recovery.test.ts: all tests passed')
