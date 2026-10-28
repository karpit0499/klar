// Run with: npx tsx test/maintainability-regressions.test.ts
//
// Characterization tests for the maintainability refactor. They pin the
// observable behavior of shared paths that were consolidated: tailoring usage
// and baseline assembly (whole and chunked), English/German prompt selection,
// HTTP status to error-category mapping, abort propagation, provider
// capability checks, packet cache keys, and Worker origin parsing.
import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'

// The Worker URL is read once when src/lib/config.ts is evaluated, so it must
// exist before any module that imports it is loaded.
;(globalThis as { VITE_WORKER_URL?: string }).VITE_WORKER_URL = 'https://worker.test'

const { normalizeResume } = await import('../src/resume/canonical.ts')
const { makeJob } = await import('../src/sources/normalize.ts')
const { costOf } = await import('../src/llm/budget.ts')
const {
  deriveTailoringChangeSummary,
  estimateRoleChunkRequest,
  systemPrompt,
  tailorResumeWithAi,
} = await import('../src/llm/tailorResume.ts')
const { pickLanguage, resumeToPlainText, tailorResume } = await import('../src/resume/tailor.ts')
const {
  buildCoverLetterPrompt,
  buildRecruiterMessagePrompt,
} = await import('../src/llm/coverLetter.ts')
const { buildInterviewPrompt, coerceInterviewPrep } = await import('../src/llm/interview.ts')
const { chatComplete } = await import('../src/llm/groq.ts')
const { getJson } = await import('../src/lib/http.ts')
const { testAdzunaConnection } = await import('../src/settings/adzunaConnection.ts')
const { AppError } = await import('../src/errors/appError.ts')
const { missingProviderRequirements, providerSupports, AI_CAPABILITIES } = await import('../src/ai/capabilities.ts')
const { corsOrigin, isFeedbackOriginAllowed, isOriginAllowed } = await import('../worker/src/index.ts')

type ResumeLanguage = 'de' | 'en'
type ChatBody = {
  model: string
  messages: { role: string; content: string }[]
  max_completion_tokens?: number
  max_tokens?: number
}

const originalFetch = globalThis.fetch

function chatResponse(content: string, totalTokens?: number): Response {
  return Response.json({
    choices: [{ finish_reason: 'stop', message: { content } }],
    ...(totalTokens == null ? {} : { usage: { total_tokens: totalTokens } }),
  })
}

function estimatedBilledTokens(body: ChatBody): number {
  return costOf({
    system: body.messages.find((message) => message.role === 'system')?.content ?? '',
    user: body.messages.find((message) => message.role === 'user')?.content ?? '',
    maxTokens: body.max_completion_tokens ?? body.max_tokens ?? 2048,
  }).billedTokens
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  assert.fail('Expected the promise to reject.')
}

const source = normalizeResume({
  contact: { name: 'Alex Example', email: 'alex@example.test', links: [] },
  summary: 'Email marketing specialist with HubSpot campaign experience.',
  experience: [
    {
      title: 'Email Marketing Specialist',
      company: 'Example GmbH',
      start: '01/2022',
      end: '12/2024',
      bullets: [
        'Created email campaigns in HubSpot.',
        'Reported campaign results to the marketing lead.',
      ],
    },
    {
      title: 'Marketing Assistant',
      company: 'Second GmbH',
      bullets: ['Maintained the newsletter contact list.'],
    },
  ],
  education: [{ institution: 'Example University', degree: 'BA', field: 'Marketing' }],
  skills: [{ group: 'Marketing', items: ['HubSpot', 'Email marketing'] }],
  languages: [{ lang: 'German', level: 'C1' }],
  projects: [{ name: 'Newsletter project', summary: 'Built a newsletter plan for a course.' }],
  certifications: [{ name: 'HubSpot Email Marketing' }],
})

const job = makeJob({
  source: 'greenhouse',
  source_id: 'email-marketing-refactor',
  title: 'Junior Email Marketing Specialist',
  company: 'Hiring GmbH',
  location: { city: 'Berlin', country: 'DE', remote: false },
  description: 'Create email campaigns, report results, and work with HubSpot.',
  url: 'https://example.test/job',
  language: 'en',
})

function faithfulTailoring(extraBulletText = ''): string {
  return JSON.stringify({
    summary: source.summary,
    experience: source.experience.map((role, sourceIndex) => ({
      sourceIndex,
      title: role.title,
      bullets: role.bullets.map((bullet, bulletIndex) => ({
        text: sourceIndex === 0 && bulletIndex === 0 ? `${bullet.text}${extraBulletText}` : bullet.text,
        sourceBulletIndexes: [bulletIndex],
      })),
    })),
    projects: source.projects.map((project, sourceIndex) => ({
      sourceIndex,
      summary: project.summary ?? '',
    })),
  })
}

function assertBaselineKeepsSourceSections(
  baseline: typeof source,
  language: ResumeLanguage,
): void {
  const deterministic = tailorResume(source, { ...job, language })
  // The reject-all floor keeps the person's original prose sections and the
  // deterministic ordering of skills and bullets.
  assert.equal(baseline.summary, source.summary)
  assert.deepEqual(baseline.contact, source.contact)
  assert.deepEqual(baseline.education, source.education)
  assert.deepEqual(baseline.languages, source.languages)
  assert.deepEqual(baseline.certifications, source.certifications)
  assert.deepEqual(baseline.projects, source.projects)
  assert.notEqual(baseline.projects[0], source.projects[0], 'baseline projects are copies')
  assert.deepEqual(baseline.skills, deterministic.data.skills)
  assert.deepEqual(baseline.experience, deterministic.data.experience)
}

// --- Whole-document tailoring: usage totals, retry accounting, baseline -------
{
  const bodies: ChatBody[] = []
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as ChatBody
    bodies.push(body)
    return chatResponse(faithfulTailoring(), 1_234)
  }) as typeof fetch
  try {
    const result = await tailorResumeWithAi(source, job, 'test-key', 'en')
    assert.equal(result.strategy, 'whole')
    assert.equal(result.attempts, 1)
    assert.equal(bodies.length, 1)
    assert.deepEqual(result.usage, {
      estimatedTokens: estimatedBilledTokens(bodies[0]),
      actualTokens: 1_234,
      requests: 1,
      model: 'openai/gpt-oss-120b',
    })
    assertBaselineKeepsSourceSections(result.baseline, 'en')
    assert.equal(result.language, 'en')
  } finally {
    globalThis.fetch = originalFetch
  }
}

{
  // The first answer adds an unsupported number, so the single targeted retry
  // runs. The second answer omits provider usage, which makes the actual total
  // unknown instead of silently under-reporting it.
  const bodies: ChatBody[] = []
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as ChatBody
    bodies.push(body)
    return bodies.length === 1
      ? chatResponse(faithfulTailoring(' Increased open rates by 45%.'), 900)
      : chatResponse(faithfulTailoring())
  }) as typeof fetch
  try {
    const result = await tailorResumeWithAi(source, { ...job, language: 'de' }, 'test-key', 'de')
    assert.equal(result.attempts, 2)
    assert.equal(bodies.length, 2)
    assert.match(bodies[1].messages[1].content, /CORRECTIONS REQUIRED/)
    assert.deepEqual(result.usage, {
      estimatedTokens: estimatedBilledTokens(bodies[0]) + estimatedBilledTokens(bodies[1]),
      actualTokens: undefined,
      requests: 2,
      model: 'openai/gpt-oss-120b',
    })
    assert.deepEqual(result.unresolved, [])
    assertBaselineKeepsSourceSections(result.baseline, 'de')
  } finally {
    globalThis.fetch = originalFetch
  }
}

// --- Chunked tailoring: per-role usage, attempts, baseline, abort ------------
const largeResume = normalizeResume({
  contact: { name: 'Amara Okafor', email: 'amara@example.com' },
  summary: 'Analyst moving from lifecycle marketing into product analytics.',
  experience: Array.from({ length: 14 }, (_, roleIndex) => ({
    title: `Analyst role ${roleIndex + 1}`,
    company: `Employer ${roleIndex + 1}`,
    start: '01/2022',
    end: '12/2023',
    bullets: Array.from({ length: 6 }, (_, bulletIndex) =>
      `Built SQL audience reports and weekly campaign analysis item ${bulletIndex + 1}.`),
  })),
  education: [],
  skills: [{ group: 'Tools', items: ['SQL', 'Excel', 'Power BI'] }],
  languages: [{ lang: 'English', level: 'C2' }],
  projects: [{ name: 'Dashboard', summary: 'Built a Power BI dashboard.' }],
  certifications: [],
})
const longJob = makeJob({
  source: 'greenhouse',
  source_id: 'chunked-refactor',
  title: 'Junior Data Analyst',
  company: 'Datenhaus GmbH',
  location: { country: 'DE', city: 'Berlin', remote: false },
  description: 'SQL Power BI reporting product analytics experimentation. '.repeat(300).slice(0, 12_000),
  url: 'https://example.test/chunked',
  language: 'en',
})

function roleChunkAnswer(body: ChatBody): string {
  const user = JSON.parse(body.messages.find((message) => message.role === 'user')?.content ?? '{}') as {
    role: { sourceIndex: number; title: string; bullets: { sourceBulletIndex: number; text: string }[] }
  }
  return JSON.stringify({
    sourceIndex: user.role.sourceIndex,
    title: user.role.title,
    bullets: user.role.bullets.map((bullet) => ({
      text: bullet.text,
      sourceBulletIndexes: [bullet.sourceBulletIndex],
    })),
  })
}

{
  const bodies: ChatBody[] = []
  const progress: string[] = []
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as ChatBody
    bodies.push(body)
    return chatResponse(roleChunkAnswer(body), 100)
  }) as typeof fetch
  try {
    const result = await tailorResumeWithAi(largeResume, longJob, 'test-key', 'en', {
      onProgress: (event) => progress.push(`${event.done}/${event.total}:${event.label}`),
    })
    assert.equal(result.strategy, 'chunked')
    assert.equal(bodies.length, 14)
    assert.equal(result.attempts, 14, 'chunked attempts count provider requests')
    assert.deepEqual(result.usage, {
      estimatedTokens: bodies.reduce((total, body) => total + estimatedBilledTokens(body), 0),
      actualTokens: 1_400,
      requests: 14,
      model: 'openai/gpt-oss-120b',
    })
    assert.equal(progress.length, 28)
    assert.equal(progress[0], '0/14:Analyst role 1')
    assert.equal(progress[1], '1/14:Analyst role 1')
    assert.equal(progress[27], '14/14:Analyst role 14')
    assert.equal(result.baseline.summary, largeResume.summary)
    assert.deepEqual(result.baseline.languages, largeResume.languages)
    assert.deepEqual(result.baseline.projects, largeResume.projects)
    assert.notEqual(result.baseline.projects[0], largeResume.projects[0])
    assert.deepEqual(result.unresolved, [])
  } finally {
    globalThis.fetch = originalFetch
  }
}

{
  // A failed role keeps its evidence and records the role label once.
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as ChatBody
    const answer = roleChunkAnswer(body)
    return (JSON.parse(answer) as { sourceIndex: number }).sourceIndex === 3
      ? Response.json({ error: { message: 'temporary failure' } }, { status: 500 })
      : chatResponse(answer, 100)
  }) as typeof fetch
  try {
    const result = await tailorResumeWithAi(largeResume, longJob, 'test-key', 'en')
    assert.deepEqual(result.unresolved, [{
      location: 'Analyst role 4 · Employer 4',
      code: 'reworded',
      detail: 'AI could not complete this role; Klar kept the original evidence unchanged.',
    }])
    // The failed provider response is still a request whose usage is unknown.
    assert.equal(result.usage.requests, 14)
    assert.equal(result.usage.actualTokens, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
}

for (const abortError of [
  new DOMException('The operation was aborted.', 'AbortError'),
  Object.assign(new Error('aborted by a fetch polyfill'), { name: 'AbortError' }),
]) {
  // Cancellation is never converted into an "unresolved role" result.
  globalThis.fetch = (async () => {
    throw abortError
  }) as typeof fetch
  try {
    const caught = await rejection(tailorResumeWithAi(largeResume, longJob, 'test-key', 'en'))
    assert.equal(caught, abortError)
  } finally {
    globalThis.fetch = originalFetch
  }
}

// --- English/German output selection ----------------------------------------
{
  assert.match(systemPrompt('de'), /Write all generated prose in German\./)
  assert.match(systemPrompt('en'), /Write all generated prose in English\./)

  const germanChunk = estimateRoleChunkRequest(source, job, 'de', ['HubSpot'], 0)
  const englishChunk = estimateRoleChunkRequest(source, job, 'en', ['HubSpot'], 0)
  assert.match(germanChunk.system, /Rewrite exactly one supplied experience role in German\./)
  assert.match(englishChunk.system, /Rewrite exactly one supplied experience role in English\./)

  const germanLetter = buildCoverLetterPrompt(source, job, { language: 'de', tone: 'formal' }).split('\n')
  assert.equal(germanLetter[0], 'Write 280–380 words of cover-letter BODY text in German.')
  assert.equal(germanLetter[1], 'Tone: Förmliches Geschäftsdeutsch. Vollständige Sätze, Sie-Form, keine Umgangssprache.')
  assert.ok(germanLetter.includes('Write formal German in consistent Sie-register.'))
  const englishLetter = buildCoverLetterPrompt(source, job, { language: 'en' }).split('\n')
  assert.equal(englishLetter[0], 'Write 220–320 words of cover-letter BODY text in English.')
  assert.ok(englishLetter.includes('Write plain professional English.'))
  // Without an explicit language the posting decides.
  assert.match(
    buildCoverLetterPrompt(source, { ...job, language: 'de' }),
    /^Write 220–320 words of cover-letter BODY text in German\./,
  )

  const context = {
    style: 'formal' as const,
    applicationState: 'applied' as const,
    channel: 'email' as const,
  }
  const germanMessage = buildRecruiterMessagePrompt(source, job, context, { language: 'de' }).split('\n')
  assert.equal(germanMessage[0], 'Write one German email recruiter message.')
  assert.equal(germanMessage[3], 'Die Bewerbung wurde bereits eingereicht. Sage das eindeutig.')
  assert.ok(germanMessage.includes('Use an appropriate and consistent Sie-register.'))
  const englishMessage = buildRecruiterMessagePrompt(source, job, context, { language: 'en' }).split('\n')
  assert.equal(englishMessage[0], 'Write one English email recruiter message.')
  assert.ok(englishMessage.includes('Use ordinary professional language.'))

  assert.equal(pickLanguage({ ...job, language: 'de' }), 'de')
  assert.equal(pickLanguage({ ...job, language: 'en' }), 'en')
  assert.equal(
    pickLanguage({ ...job, language: undefined, description: 'Wir suchen Erfahrung und Kenntnisse in Deutsch.' }),
    'de',
  )
  assert.equal(pickLanguage({ ...job, language: undefined, description: 'We need SQL und reporting.' }), 'en')

  const plainGerman = resumeToPlainText(source, 'de').split('\n')
  assert.ok(plainGerman.includes('Kurzprofil'))
  assert.ok(plainGerman.includes('Berufserfahrung'))
  assert.ok(plainGerman.includes('Zertifikate'))
  assert.ok(resumeToPlainText({
    ...source,
    experience: [{ ...source.experience[0], current: true }],
  }, 'de').includes('01/2022 – heute'))
  assert.ok(resumeToPlainText({
    ...source,
    experience: [{ ...source.experience[0], current: true }],
  }, 'en').includes('01/2022 – Present'))
  assert.deepEqual(resumeToPlainText(source, 'en').split('\n').slice(0, 4), [
    'Alex Example',
    'alex@example.test',
    'Summary',
    'Email marketing specialist with HubSpot campaign experience.',
  ])

  const accepted = [
    { decision: 'accepted', target: { kind: 'summary' }, before: 'a', after: 'b' },
    { decision: 'accepted', target: { kind: 'bullet' }, before: 'a', after: 'b' },
    { decision: 'accepted', target: { kind: 'project-summary' }, before: 'a', after: 'b' },
    { decision: 'accepted', target: { kind: 'project-summary' }, before: 'c', after: 'd' },
  ] as unknown as Parameters<typeof deriveTailoringChangeSummary>[0]
  assert.deepEqual(deriveTailoringChangeSummary(accepted, 'de'), [
    'Kurzprofil auf die Stelle ausgerichtet.',
    '1 Formulierung aus belegter Erfahrung angepasst.',
    '2 Projektbeschreibungen aus dem Ausgangstext angepasst.',
  ])
  assert.deepEqual(deriveTailoringChangeSummary(accepted, 'en'), [
    'Professional summary aligned to the role.',
    '1 experience statement reframed from source evidence.',
    '2 project summaries reframed from source text.',
  ])
}

// --- Letter and recruiter-message usage is priced from the request sent ------
{
  const { draftCoverLetter, draftRecruiterMessage } = await import('../src/llm/coverLetter.ts')
  for (const style of ['formal', 'concise'] as const) {
    const bodies: ChatBody[] = []
    const usage: Array<{ estimated: { billedTokens: number }; actualTokens?: number; model: string }> = []
    globalThis.fetch = (async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as ChatBody)
      return chatResponse('Hello Morgan,\n\nA short note.\n\nBest regards,\nAlex', 77)
    }) as typeof fetch
    try {
      await draftRecruiterMessage(source, job, 'key', {
        style,
        applicationState: 'not_applied',
        channel: 'linkedin',
      }, { language: 'en', onUsage: (event) => usage.push(event) })
      await draftCoverLetter(source, job, 'key', { language: 'de', onUsage: (event) => usage.push(event) })
    } finally {
      globalThis.fetch = originalFetch
    }
    assert.equal(bodies[0].max_completion_tokens, style === 'formal' ? 400 : 300)
    assert.deepEqual(usage.map((event) => event.estimated.billedTokens), bodies.map(estimatedBilledTokens))
    assert.deepEqual(usage.map((event) => [event.actualTokens, event.model]), [
      [77, 'openai/gpt-oss-120b'],
      [77, 'openai/gpt-oss-120b'],
    ])
  }
}

// --- Legacy profiles and resume data share one evidence projection ----------
{
  const legacyProfile = {
    summary: 'Legacy reporting analyst.',
    titles: [{ title: 'Reporting Analyst' }],
    skills: [{ name: 'SQL' }],
    domains: [],
    education: [],
    languages: [{ lang: 'English', level: 'C1' }],
    certifications: [],
  }
  const interviewPrompt = buildInterviewPrompt(legacyProfile, job)
  assert.match(interviewPrompt, /"title": "Reporting Analyst"/)
  assert.match(interviewPrompt, /"name":"SQL"/)
  const legacyLetter = buildCoverLetterPrompt(legacyProfile, job, { language: 'en' })
  assert.match(legacyLetter, /Reporting Analyst/)
  assert.match(legacyLetter, /Legacy reporting analyst\./)
  // The recruiter sign-off only comes from canonical resume contact data.
  assert.match(buildRecruiterMessagePrompt(legacyProfile, job, {
    style: 'conversational',
    applicationState: 'not_applied',
    channel: 'linkedin',
  }, { language: 'en' }), /"signOffName": null/)
  const prep = coerceInterviewPrep({
    likelyQuestions: [
      { question: '  Why HubSpot? ', evidenceIds: [source.experience[0].bullets[0].id, 'invented'], answerOutline: [' A ', 'A', ''] },
      { question: '   ' },
      'not a row',
    ],
    questionsToAsk: ['Team size?', 'Team size?', 7],
    gapsToPrepare: 'not a list',
  }, source)
  assert.deepEqual(prep, {
    likelyQuestions: [{
      question: 'Why HubSpot?',
      evidenceIds: [source.experience[0].bullets[0].id],
      answerOutline: ['A'],
    }],
    questionsToAsk: ['Team size?'],
    gapsToPrepare: [],
  })
}

// --- HTTP status to error category -------------------------------------------
{
  const cases: Array<[number, string, string, string]> = [
    [429, 'rate_limit', 'This source has reached its request limit.', 'retry'],
    [401, 'credentials', 'This source rejected its credentials.', 'open_settings'],
    [403, 'credentials', 'This source rejected its credentials.', 'open_settings'],
    [404, 'source', 'This job source returned an error.', 'retry'],
    [500, 'source', 'This job source returned an error.', 'retry'],
  ]
  for (const [status, category, message, kind] of cases) {
    globalThis.fetch = (async () => new Response('plain failure', { status, statusText: 'Status' })) as typeof fetch
    try {
      const caught = await rejection(getJson('https://source.test/jobs'))
      assert.ok(caught instanceof AppError)
      assert.equal(caught.category, category, `getJson ${status}`)
      assert.equal(caught.message, message)
      assert.equal(caught.action.kind, kind)
      assert.equal(caught.technical, `HTTP ${status} Status — plain failure`)
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  // A Worker-provided AppError body wins over the generic status mapping.
  globalThis.fetch = (async () => Response.json({
    error: {
      category: 'credentials',
      message: 'Adzuna credentials are not configured.',
      dataSafe: true,
      available: 'Other job sources and saved local data remain available.',
      action: { label: 'Add Adzuna credentials in Settings', kind: 'open_settings' },
      technical: 'not_configured',
    },
  }, { status: 503 })) as typeof fetch
  try {
    const caught = await rejection(getJson('https://source.test/jobs'))
    assert.ok(caught instanceof AppError)
    assert.equal(caught.message, 'Adzuna credentials are not configured.')
    assert.equal(caught.technical, 'not_configured')
  } finally {
    globalThis.fetch = originalFetch
  }

  globalThis.fetch = (async () => {
    throw new TypeError('Failed to fetch')
  }) as typeof fetch
  try {
    const caught = await rejection(getJson('https://source.test/jobs'))
    assert.ok(caught instanceof AppError)
    assert.equal(caught.category, 'network')
    assert.equal(caught.technical, 'Failed to fetch')
  } finally {
    globalThis.fetch = originalFetch
  }

  const abort = new DOMException('Aborted', 'AbortError')
  globalThis.fetch = (async () => {
    throw abort
  }) as typeof fetch
  try {
    assert.equal(await rejection(getJson('https://source.test/jobs')), abort)
  } finally {
    globalThis.fetch = originalFetch
  }
}

{
  const cases: Array<[number, string, string, string, string]> = [
    [401, 'credentials', 'Adzuna rejected these credentials.', 'Check both credential fields', 'open_settings'],
    [403, 'credentials', 'Adzuna rejected these credentials.', 'Check both credential fields', 'open_settings'],
    [429, 'rate_limit', 'Adzuna has reached its request limit.', 'Try again later', 'retry'],
    [502, 'source', 'Adzuna is temporarily unavailable.', 'Try again later', 'retry'],
  ]
  const requested: string[] = []
  for (const [status, category, message, label, kind] of cases) {
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested.push(String(input))
      return new Response('<html>quota</html>', { status })
    }) as typeof fetch
    try {
      const result = await testAdzunaConnection({ appId: 'id', appKey: 'key' })
      assert.equal(result.ok, false)
      assert.ok(!result.ok)
      assert.equal(result.error.category, category, `adzuna ${status}`)
      assert.equal(result.error.message, message)
      assert.equal(result.error.action.label, label)
      assert.equal(result.error.action.kind, kind)
      assert.equal(result.error.technical, `HTTP ${status}`)
    } finally {
      globalThis.fetch = originalFetch
    }
  }
  assert.equal(requested[0], 'https://worker.test/adzuna/v1/api/jobs/de/search/1?results_per_page=1&what=test')

  globalThis.fetch = (async () => Response.json({ results: [] })) as typeof fetch
  try {
    assert.deepEqual(await testAdzunaConnection({ appId: 'id', appKey: 'key' }), {
      ok: true,
      message: 'Adzuna connection works.',
    })
  } finally {
    globalThis.fetch = originalFetch
  }

  // The Worker's own structured explanation is passed through unchanged.
  globalThis.fetch = (async () => Response.json({
    error: {
      category: 'credentials',
      message: 'Adzuna needs both the App ID and App key from the same account.',
      dataSafe: true,
      available: 'Other job sources and saved local data remain available.',
      action: { label: 'Enter both Adzuna values', kind: 'open_settings' },
      technical: 'partial_user_credentials',
    },
  }, { status: 400 })) as typeof fetch
  try {
    const result = await testAdzunaConnection({ appId: 'id', appKey: 'key' })
    assert.ok(!result.ok)
    assert.ok(result.error instanceof AppError)
    assert.equal(result.error.message, 'Adzuna needs both the App ID and App key from the same account.')
    assert.equal(result.error.technical, 'partial_user_credentials')
  } finally {
    globalThis.fetch = originalFetch
  }
}

{
  const { appErrorFromResponseText } = await import('../src/errors/appError.ts')
  const { workerFabricFetch } = await import('../src/flexible/connectors/proxy.ts')
  const structured = {
    category: 'rate_limit',
    message: 'The source is rate limited.',
    dataSafe: true,
    available: 'Other sources still work.',
    action: { label: 'Retry', kind: 'retry' },
    technical: 'upstream_429',
  }
  const parsed = appErrorFromResponseText(JSON.stringify({ error: structured }))
  assert.ok(parsed instanceof AppError)
  assert.deepEqual(parsed.toJSON(), structured)
  for (const text of ['', 'not json', 'null', '[]', '42', '{"error":"plain"}', JSON.stringify({ error: { ...structured, dataSafe: 'yes' } })]) {
    assert.equal(appErrorFromResponseText(text), null, text)
  }

  const fabricInput = { host: 'jobs.example.test', path: '/feed', accept: 'json' as const, maxBytes: 1000 }
  globalThis.fetch = (async () => Response.json({ error: structured }, { status: 429 })) as typeof fetch
  try {
    const caught = await rejection(workerFabricFetch(fabricInput))
    assert.ok(caught instanceof AppError)
    assert.equal(caught.technical, 'upstream_429')
  } finally {
    globalThis.fetch = originalFetch
  }
  globalThis.fetch = (async () => new Response('busy', { status: 429, statusText: 'Too Many' })) as typeof fetch
  try {
    const caught = await rejection(workerFabricFetch(fabricInput))
    assert.ok(caught instanceof AppError)
    assert.equal(caught.category, 'rate_limit')
    assert.equal(caught.message, 'A Flexible Work source returned an error.')
    assert.equal(caught.technical, 'HTTP 429 Too Many — busy')
  } finally {
    globalThis.fetch = originalFetch
  }
  globalThis.fetch = (async () => new Response('down', { status: 503, statusText: 'Unavailable' })) as typeof fetch
  try {
    const caught = await rejection(workerFabricFetch(fabricInput))
    assert.ok(caught instanceof AppError)
    assert.equal(caught.category, 'source')
  } finally {
    globalThis.fetch = originalFetch
  }
  const abort = new DOMException('Aborted', 'AbortError')
  globalThis.fetch = (async () => {
    throw abort
  }) as typeof fetch
  try {
    assert.equal(await rejection(workerFabricFetch(fabricInput)), abort)
  } finally {
    globalThis.fetch = originalFetch
  }
}

{
  const cases: Array<[number, Record<string, unknown>, string, string, string]> = [
    [401, { message: 'Invalid API Key' }, 'credentials', 'Groq rejected this API key.', 'open_settings'],
    [403, { message: 'Forbidden' }, 'credentials', 'Groq rejected this API key.', 'open_settings'],
    [429, { message: 'Too many requests, slow down' }, 'rate_limit', 'Groq has reached its current request limit.', 'retry'],
    [500, { message: 'Internal error' }, 'source', 'Groq could not complete this request.', 'retry'],
    [
      404,
      { message: 'The model `retired-model` does not exist', code: 'model_not_found' },
      'validation',
      'Groq does not offer the model "openai/gpt-oss-120b" any more.',
      'open_settings',
    ],
  ]
  for (const [status, error, category, message, kind] of cases) {
    globalThis.fetch = (async () => Response.json({ error }, { status })) as typeof fetch
    try {
      const caught = await rejection(chatComplete({ system: 'system', user: 'user', apiKey: 'key' }))
      assert.ok(caught instanceof AppError)
      assert.equal(caught.category, category, `chat ${status}`)
      assert.equal(caught.message, message)
      assert.equal(caught.action.kind, kind)
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  for (const abortError of [
    new DOMException('Aborted', 'AbortError'),
    Object.assign(new Error('aborted'), { name: 'AbortError' }),
  ]) {
    globalThis.fetch = (async () => {
      throw abortError
    }) as typeof fetch
    try {
      assert.equal(await rejection(chatComplete({ system: 's', user: 'u', apiKey: 'k' })), abortError)
    } finally {
      globalThis.fetch = originalFetch
    }
  }
}

// --- Provider capability checks agree with their diagnostic explanation ------
{
  const capabilities = Object.keys(AI_CAPABILITIES) as Array<keyof typeof AI_CAPABILITIES>
  const providers = [
    { structuredOutput: true, adapters: ['base', 'precision', 'writer'], languages: ['de', 'en'] },
    { structuredOutput: false, adapters: ['base', 'precision', 'writer'], languages: ['de', 'en'] },
    { structuredOutput: true, adapters: ['base', 'writer'], languages: ['en'] },
    { structuredOutput: true, adapters: ['base'], languages: ['de'] },
  ]
  for (const shape of providers) {
    for (const enabled of [capabilities, capabilities.slice(0, 2)]) {
      const provider = {
        providerId: 'test',
        kind: 'cloud' as const,
        capabilities: new Set(enabled),
        languages: new Set(shape.languages as Array<'de' | 'en'>),
        adapters: new Set(shape.adapters as Array<'base' | 'precision' | 'writer'>),
        structuredOutput: shape.structuredOutput,
        cancellation: true,
      }
      for (const capability of capabilities) {
        for (const language of ['de', 'en'] as const) {
          const missing = missingProviderRequirements(provider, capability, language)
          assert.equal(providerSupports(provider, capability, language), missing.length === 0)
        }
      }
    }
  }
  const limited = {
    providerId: 'limited',
    kind: 'local' as const,
    capabilities: new Set(['cover_letter' as const]),
    languages: new Set(['en' as const]),
    adapters: new Set(['base' as const]),
    structuredOutput: false,
    cancellation: false,
  }
  assert.deepEqual(missingProviderRequirements(limited, 'evidence_selection', 'de'), [
    'capability:evidence_selection',
    'language:de',
    'adapter:precision',
    'structured_output',
  ])
}

// --- Packet cache keys: one builder, identical to both former derivations ----
{
  const {
    generationCacheKey,
    letterCacheKey,
    recruiterMessageCacheKey,
    resumeCacheKey,
  } = await import('../src/packets/cache.ts')
  const {
    emptyLanguageState,
    recruiterMessageContext,
    updateLanguageState,
    newPacket,
  } = await import('../src/packets/types.ts')
  const { DEFAULT_ENGINE } = await import('../src/llm/provider.ts')
  const engine = { ...DEFAULT_ENGINE }
  const match = {
    jobId: job.id,
    fitScore: 70,
    verdict: 'good' as const,
    rationale: 'Relevant HubSpot work.',
    matchedSkills: ['HubSpot'],
    missingSkills: ['Braze'],
    salaryFit: 'unknown' as const,
    locationFit: 'exact' as const,
    seniorityFit: 'match' as const,
    redFlags: [],
    scoredAt: '2026-08-01T00:00:00.000Z',
    modelVersion: 'test',
  }
  const states = [
    emptyLanguageState(),
    {
      ...emptyLanguageState('formal'),
      jdTerms: ['HubSpot', 'Email marketing'],
      messageStyle: 'formal' as const,
      messageApplicationState: 'referred' as const,
      messageChannel: 'email' as const,
      recruiterName: '  Morgan Recruiter ',
      messageDiscoveryContext: ' Saw it on the careers page ',
      messageReferralName: ' Taylor ',
    },
    {
      ...emptyLanguageState('concise'),
      messageStyle: undefined,
      messageApplicationState: undefined,
      messageChannel: undefined,
      recruiterName: '   ',
    },
  ]
  for (const language of ['en', 'de'] as const) {
    for (const state of states) {
      for (const currentMatch of [match, undefined]) {
        // The former inline freshness-check formulas.
        assert.equal(
          resumeCacheKey({ resume: source, job, language, engine, jdTerms: state.jdTerms }),
          generationCacheKey({ kind: 'resume', source, job, language, engine, jdTerms: state.jdTerms }),
        )
        assert.equal(
          letterCacheKey({ resume: source, job, language, engine, jdTerms: state.jdTerms, tone: state.letterTone, match: currentMatch }),
          generationCacheKey({
            kind: 'letter',
            source,
            job,
            language,
            engine,
            jdTerms: state.jdTerms,
            variant: state.letterTone,
            context: currentMatch
              ? {
                  matchedSkills: currentMatch.matchedSkills,
                  missingSkills: currentMatch.missingSkills,
                  rationale: currentMatch.rationale,
                }
              : null,
          }),
        )
        const context = recruiterMessageContext(state, source.contact.name)
        const messageKey = recruiterMessageCacheKey({ resume: source, job, language, engine, jdTerms: state.jdTerms, context })
        assert.equal(messageKey, generationCacheKey({
          kind: 'message',
          source,
          job,
          language,
          engine,
          jdTerms: state.jdTerms,
          variant: state.messageStyle ?? 'conversational',
          context: {
            applicationState: state.messageApplicationState ?? 'not_applied',
            channel: state.messageChannel ?? 'linkedin',
            recruiterName: state.recruiterName?.trim() || null,
            discoveryContext: state.messageDiscoveryContext?.trim() || null,
            referralName: state.messageReferralName?.trim() || null,
          },
        }))
        // The former generation-time formula, built from the memoized context.
        assert.equal(messageKey, generationCacheKey({
          kind: 'message',
          source,
          job,
          language,
          engine,
          jdTerms: state.jdTerms,
          variant: context.style,
          context: {
            applicationState: context.applicationState,
            channel: context.channel,
            recruiterName: context.recruiterName ?? null,
            discoveryContext: context.discoveryContext ?? null,
            referralName: context.referralName ?? null,
          },
        }))
      }
    }
  }
  assert.deepEqual(recruiterMessageContext(undefined, 'Alex Example'), {
    style: 'conversational',
    applicationState: 'not_applied',
    channel: 'linkedin',
    recruiterName: undefined,
    discoveryContext: undefined,
    referralName: undefined,
    signOffName: 'Alex Example',
  })

  // Updating a language that has no state yet starts from the empty state and
  // never touches the other language.
  const packet = newPacket('career', job)
  updateLanguageState(packet, 'de', (previous) => ({ ...previous, recruiterName: 'Morgan' }))
  assert.deepEqual(packet.languages.de, { ...emptyLanguageState(), recruiterName: 'Morgan' })
  assert.equal(packet.languages.en, undefined)
  updateLanguageState(packet, 'de', (previous) => ({ ...previous, messageChannel: 'email' }))
  assert.equal(packet.languages.de?.recruiterName, 'Morgan')
  assert.equal(packet.languages.de?.messageChannel, 'email')
}

// --- Worker origin allow-list parsing ----------------------------------------
{
  const allowList = ' https://a.example , ,https://b.example '
  assert.equal(corsOrigin('https://b.example', allowList), 'https://b.example')
  assert.equal(corsOrigin('https://evil.example', allowList), 'https://a.example')
  assert.equal(corsOrigin(null, allowList), 'https://a.example')
  assert.equal(corsOrigin('https://b.example', undefined), '*')
  assert.equal(corsOrigin('https://b.example', ' * '), '*')
  assert.equal(corsOrigin('https://b.example', ' , '), '*')
  assert.equal(isOriginAllowed('https://b.example', allowList), true)
  assert.equal(isOriginAllowed('https://evil.example', allowList), false)
  assert.equal(isOriginAllowed(null, allowList), true)
  assert.equal(isOriginAllowed('https://evil.example', '*'), true)
  assert.equal(isOriginAllowed('https://evil.example', ' , '), false)
  assert.equal(isFeedbackOriginAllowed('https://a.example', allowList), true)
  assert.equal(isFeedbackOriginAllowed('https://evil.example', allowList), false)
  assert.equal(isFeedbackOriginAllowed('https://a.example', '*'), false)
  assert.equal(isFeedbackOriginAllowed(null, allowList), false)
}

// --- Shared helpers introduced by the refactor ---------------------------------
{
  const { array, cleanText, isRecord, record, stringList, uniqueStrings } = await import('../src/lib/coerce.ts')
  const { isAbortError } = await import('../src/lib/abort.ts')
  const { httpStatusErrorCategory } = await import('../src/errors/appError.ts')
  const { promptLanguageName } = await import('../src/llm/promptProjection.ts')
  const { asResumeData, isResumeData } = await import('../src/resume/canonical.ts')

  for (const value of [null, undefined, 0, '', 'text', [], [1], true]) {
    assert.equal(isRecord(value), false)
    assert.deepEqual(record(value), {})
  }
  const row = { a: 1 }
  assert.equal(isRecord(row), true)
  assert.equal(record(row), row, 'records are returned as-is, not copied')
  const list = [1, 'two']
  assert.equal(array(list), list)
  assert.deepEqual(array('not a list'), [])
  assert.equal(cleanText('  padded  '), 'padded')
  assert.equal(cleanText(42), '')
  assert.deepEqual(uniqueStrings([' SQL ', 'SQL', '', 7, null, 'Excel', 'sql']), ['SQL', 'Excel', 'sql'])
  assert.deepEqual(stringList(['a', ' a ', 'b']), ['a', 'b'])
  assert.deepEqual(stringList('a'), [])

  assert.equal(isAbortError(new DOMException('stop', 'AbortError')), true)
  assert.equal(isAbortError(Object.assign(new Error('stop'), { name: 'AbortError' })), true)
  assert.equal(isAbortError({ name: 'AbortError' }), true)
  assert.equal(isAbortError(new DOMException('slow', 'TimeoutError')), false)
  assert.equal(isAbortError(new Error('AbortError')), false)
  for (const value of [null, undefined, 'AbortError', 0]) assert.equal(isAbortError(value), false)

  assert.deepEqual(
    [429, 401, 403, 400, 404, 500, 502, 0].map(httpStatusErrorCategory),
    ['rate_limit', 'credentials', 'credentials', 'source', 'source', 'source', 'source', 'source'],
  )

  assert.equal(promptLanguageName('de'), 'German')
  assert.equal(promptLanguageName('en'), 'English')

  assert.equal(isResumeData(source), true)
  assert.equal(asResumeData(source), source, 'canonical resumes pass through unchanged')
  const legacy = {
    summary: 'Legacy summary.',
    titles: [{ title: 'Analyst' }],
    skills: [{ name: 'SQL' }],
    domains: [],
    education: [],
    languages: [],
    certifications: ['Cert'],
  }
  assert.equal(isResumeData(legacy), false)
  const converted = asResumeData(legacy)
  assert.equal(converted.schemaVersion, 2)
  assert.equal(converted.summary, 'Legacy summary.')
  assert.deepEqual(converted.experience.map((role) => role.title), ['Analyst'])
  assert.deepEqual(converted.certifications.map((item) => item.name), ['Cert'])
}

// --- The Groq key prompt always leaves its busy state ---------------------------
{
  // Saving can fail after a successful validation (locked vault, storage
  // quota). The dialog must show that error instead of spinning forever.
  const { readFileSync } = await import('node:fs')
  const prompt = readFileSync(new URL('../src/ui/GroqKeyPrompt.tsx', import.meta.url), 'utf8')
  assert.match(
    prompt,
    /try \{\s+await saveGroqKey\(clean, remember\)\s+\} catch \(caught\) \{[\s\S]*?setError\(toAppError\(caught,[\s\S]*?setBusy\(false\); return\s+\}/,
  )
}

console.log('maintainability-regressions.test.ts: all tests passed')
