import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { parseRerank, isFailedMatchPlaceholder } from '../src/match/rerank'
import { coerceInterviewPrep } from '../src/llm/interview'
import { coerceProfile } from '../src/parse/profile'
import { buildResumeExtractionPrompt, coerceResumeData } from '../src/resume/extract'
import { normalizeResume } from '../src/resume/canonical'
import {
  clearJdTermCache,
  extractJdRequirements,
  jdCacheKey,
  readCachedJdTerms,
} from '../src/llm/jdTerms'
import { setSetting } from '../src/db/db'
import { makeJob } from '../src/sources/normalize'

const scoredAt = '2026-07-26T12:00:00.000Z'

// Re-ranking accepts only valid, requested, unique job rows and keeps the
// requested batch order. A missing score is not converted into a fake 0/100.
{
  const matches = parseRerank(JSON.stringify({
    results: [
      null,
      { jobId: 'invented-job', fitScore: 99, rationale: 'Not requested' },
      { jobId: 'job-2', fitScore: 'not-a-number', rationale: 'Malformed duplicate' },
      {
        jobId: 'job-1',
        fitScore: 64,
        verdict: 'excellent',
        rationale: 42,
        matchedSkills: 'SQL',
        missingSkills: [null, 'CRM', '', 'CRM'],
        salaryFit: 'nearby',
        locationFit: 'moon',
        seniorityFit: 'match',
        redFlags: [false, 'Different domain'],
        factors: null,
      },
      { jobId: 'job-1', fitScore: 100, rationale: 'Duplicate must not win' },
      {
        jobId: 'job-2',
        fitScore: '72',
        rationale: ' Relevant second requested job. ',
        matchedSkills: ['Email marketing', '', 'Email marketing'],
        salaryFit: 'unknown',
        locationFit: 'remote',
      },
    ],
  }), scoredAt, 'test-model', ['job-2', 'job-1'])

  assert.deepEqual(matches.map((match) => match.jobId), ['job-2', 'job-1'])
  assert.equal(matches[0].fitScore, 72)
  assert.deepEqual(matches[0].matchedSkills, ['Email marketing'])
  assert.equal(matches[0].locationFit, 'remote')
  assert.equal(matches[1].fitScore, 64)
  assert.equal(matches[1].verdict, 'good')
  assert.equal(matches[1].rationale, '')
  assert.deepEqual(matches[1].missingSkills, ['CRM'])
  assert.deepEqual(matches[1].redFlags, ['Different domain'])
  assert.equal(matches[1].salaryFit, 'unknown')
  assert.equal(matches[1].locationFit, undefined)
  assert.deepEqual(
    parseRerank('{"results":[null,{"jobId":"job-1"}]}', scoredAt, 'test-model', ['job-1']),
    [],
  )
  assert.equal(isFailedMatchPlaceholder({ fitScore: 0, rationale: null } as never), false)
}

// Nested interview data is normalized and can cite only IDs sent in the prompt.
{
  const resume = normalizeResume({
    contact: { name: 'Ari', links: [] },
    experience: [{
      title: 'Email Marketing Specialist',
      company: 'Example',
      bullets: ['Improved campaign segmentation.'],
    }],
    skills: [{ group: 'Marketing', items: ['Email marketing'] }],
  })
  const roleId = resume.experience[0].id
  const bulletId = resume.experience[0].bullets[0].id
  const skillId = resume.skills[0].items[0].id
  const prep = coerceInterviewPrep({
    likelyQuestions: [
      null,
      { question: '   ', evidenceIds: [bulletId], answerOutline: ['Ignored'] },
      {
        question: ' How did you segment campaigns? ',
        evidenceIds: [roleId, bulletId, skillId, 'invented-id', bulletId, null],
        answerOutline: [' Use the verified campaign example. ', '', 7],
      },
    ],
    questionsToAsk: [' What does success look like? ', '', 'What does success look like?', 9],
    gapsToPrepare: 'wrong type',
  }, resume)

  assert.equal(prep.likelyQuestions.length, 1)
  assert.equal(prep.likelyQuestions[0].question, 'How did you segment campaigns?')
  assert.deepEqual(prep.likelyQuestions[0].evidenceIds, [roleId, bulletId, skillId])
  assert.deepEqual(prep.likelyQuestions[0].answerOutline, ['Use the verified campaign example.'])
  assert.deepEqual(prep.questionsToAsk, ['What does success look like?'])
  assert.deepEqual(prep.gapsToPrepare, [])
}

// Profile coercion filters blank/wrongly typed nested rows without making up
// values for fields the provider omitted.
{
  const profile = coerceProfile({
    summary: 123,
    titles: [null, { title: ' ' }, { title: ' Account Executive ', years: -2 }, { title: 'CRM Assistant', years: 1.5 }],
    skills: [{ name: '' }, { name: ' HubSpot ', level: 4 }, null],
    domains: [' Email marketing ', '', 7, 'Email marketing'],
    totalYears: Number.POSITIVE_INFINITY,
    education: [null, {}, { institution: ' Example University ' }],
    languages: [{ lang: '' }, { lang: ' German ', level: ' B2 ' }, 4],
    certifications: [null, ' Analytics ', '', 'Analytics'],
  }, 'source text')

  assert.equal(profile.summary, '')
  assert.deepEqual(profile.titles, [
    { title: 'Account Executive' },
    { title: 'CRM Assistant', years: 1.5 },
  ])
  assert.deepEqual(profile.skills, [{ name: 'HubSpot' }])
  assert.deepEqual(profile.domains, ['Email marketing'])
  assert.equal(profile.totalYears, undefined)
  assert.deepEqual(profile.education, [{ institution: 'Example University' }])
  assert.deepEqual(profile.languages, [{ lang: 'German', level: 'B2' }])
  assert.deepEqual(profile.certifications, ['Analytics'])
  assert.equal(profile.rawText, 'source text')
  assert.equal(coerceProfile(null, 'raw').titles.length, 0)
}

// Résumé extraction drops empty nested rows, ignores a string "false" instead
// of treating it as true, and states the strict nullable contract in the prompt.
{
  const resume = coerceResumeData({
    contact: {
      name: 'Ari',
      links: [null, { label: '', url: '' }, { label: 'Portfolio', url: 'https://example.test' }],
    },
    experience: [
      null,
      { title: '', company: '', bullets: ['', '   ', null] },
      {
        title: 'Account Executive',
        company: 'Example',
        current: 'false',
        bullets: ['', 'Supported lifecycle email campaigns.', { text: ' ' }],
      },
    ],
    education: [null, {}, { institution: 'Example University' }],
    skills: [{ group: 'Empty', items: ['', null] }, { group: 'Marketing', items: [' HubSpot '] }],
    languages: [{ lang: '' }, { lang: 'German', level: 'B2' }],
    projects: [null, {}, { name: 'Campaign audit', summary: null, tech: [null, 'Excel', ''] }],
    certifications: ['', null, { name: '' }, { name: 'Google Analytics' }],
  })

  assert.equal(resume.contact.links.length, 1)
  assert.equal(resume.experience.length, 1)
  assert.equal(resume.experience[0].current, false)
  assert.deepEqual(resume.experience[0].bullets.map((bullet) => bullet.text), [
    'Supported lifecycle email campaigns.',
  ])
  assert.equal(resume.education.length, 1)
  assert.equal(resume.skills.length, 1)
  assert.equal(resume.languages.length, 1)
  assert.equal(resume.projects.length, 1)
  assert.deepEqual(resume.projects[0].tech, ['Excel'])
  assert.equal(resume.certifications.length, 1)

  const prompt = buildResumeExtractionPrompt('Ari')
  assert.match(prompt, /Every listed key is required/)
  assert.match(prompt, /end=null/)
  assert.match(prompt, /email: string\|null/)
}

// Empty or rejected JD terms must not become a durable cache hit.
{
  const job = makeJob({
    source: 'greenhouse',
    source_id: 'jd-cache',
    title: 'Junior Email Marketing Specialist',
    company: 'Example',
    location: { country: 'DE', city: 'Berlin', remote: false },
    description: 'Build lifecycle email campaigns in HubSpot.',
    url: 'https://example.test/job',
  })

  await setSetting('jdTerms.v1', [{
    key: jdCacheKey(job),
    terms: [],
    extractedAt: scoredAt,
  }])
  assert.equal(await readCachedJdTerms(job), null)

  await clearJdTermCache()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      finish_reason: 'stop',
      message: { content: '{"requirements":["Salesforce"]}' },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  try {
    const result = await extractJdRequirements(job, 'test-key')
    assert.deepEqual(result.terms, [])
    assert.equal(result.source, 'dictionary-only')
    assert.equal(await readCachedJdTerms(job), null)
  } finally {
    globalThis.fetch = originalFetch
  }
}

// The packet actions return before requesting a key or spending tokens until
// their persistent row has opened.
{
  const source = readFileSync(new URL('../src/ui/ApplicationBundle.tsx', import.meta.url), 'utf8')
  assert.match(source, /if \(!packet\) return/)
}

console.log('v2532-structured-consumers.test.ts: all tests passed')
