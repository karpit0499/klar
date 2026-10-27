import { strict as assert } from 'node:assert'
import { checkRecruiterMessage, type RecruiterMessageContext } from '../src/llm/coverLetter'
import { normalizeResume } from '../src/resume/canonical'
import type { ResumeData, ResumeLanguage } from '../src/resume/types'
import type { NormalizedJob } from '../src/types'

const resumeInput = {
  contact: {
    name: 'Zoë Müller',
    email: 'zoe.mueller@example.invalid',
    location: 'Berlin, Germany',
    links: [],
  },
  summary: 'Data analyst who turns operational questions into clear decisions.',
  experience: [{
    title: 'Data Analyst',
    company: 'Example GmbH',
    city: 'Berlin',
    start: '01/2024',
    current: true,
    bullets: ['Built weekly reporting with SQL and Power BI.'],
  }],
  education: [],
  skills: [{ group: 'Analysis', items: ['SQL', 'Power BI'] }],
  languages: [],
  projects: [],
  certifications: [],
}
const resume = normalizeResume(resumeInput)

const job: NormalizedJob = {
  id: 'job-1',
  source: 'greenhouse',
  source_id: 'source-1',
  title: 'Senior Data Analyst / Operations',
  company: 'München & Söhne GmbH',
  location: { city: 'München', country: 'DE', remote: false },
  description: 'Use SQL and Power BI to improve operational decisions.',
  url: 'https://example.invalid/jobs/1',
  salary: {},
  tags: ['SQL', 'Power BI'],
  fetched_at: '2026-07-31T00:00:00.000Z',
}

const context: RecruiterMessageContext = {
  style: 'conversational',
  applicationState: 'not_applied',
  channel: 'linkedin',
}

function germanMessage(ask: string, signOff = 'Mit freundlichen Grüßen'): string {
  return [
    'Guten Tag,',
    'die Position Senior Data Analyst / Operations bei München & Söhne GmbH passt zu meiner Arbeit mit SQL und Power BI.',
    ask,
    signOff,
    'Zoë Müller',
  ].join('\n')
}

function englishMessage(ask: string): string {
  return [
    'Hello,',
    'The Senior Data Analyst / Operations role at München & Söhne GmbH matches my work with SQL and Power BI.',
    ask,
    'Kind regards,',
    'Zoë',
  ].join('\n')
}

function failingChecks(
  message: string,
  language: ResumeLanguage,
  source: ResumeData = resume,
  target: NormalizedJob = job,
): string[] {
  return checkRecruiterMessage(message, source, target, context, language)
    .filter((check) => !check.ok)
    .map((check) => check.id)
}

// The checks compare against diacritic-stripped text, so umlaut terms must
// still be recognized. Each of the first four asks relies on one umlaut term.
for (const ask of [
  'Ich freue mich auf ein kurzes Gespräch.',
  'Darf ich Ihnen dazu eine kurze Rückfrage stellen?',
  'Hätten Sie in den nächsten Tagen Zeit für einen kurzen Anruf?',
  'Wären Sie offen für ein kurzes Telefonat?',
  'Hätten Sie Zeit für ein kurzes Gespräch?',
  'Ich freue mich auf ein Gespräch.',
  'Wären Sie offen für einen Austausch?',
]) {
  assert.deepEqual(failingChecks(germanMessage(ask), 'de'), [], `German ask: ${ask}`)
}

// German counterparts of the English "connect" and "<kind> conversation".
for (const ask of [
  'Ich würde mich freuen, mich mit Ihnen zu vernetzen.',
  'Hätten Sie Interesse an einem kurzen Kennenlerngespräch?',
  'Wäre ein kurzes Erstgespräch für Sie denkbar?',
  'Passt Ihnen ein kurzes Telefongespräch in der kommenden Woche?',
  'Wäre ein kurzes Videogespräch möglich?',
]) {
  assert.deepEqual(failingChecks(germanMessage(ask), 'de'), [], `German ask: ${ask}`)
}
assert.deepEqual(
  failingChecks(germanMessage('Die Stelle habe ich mit Interesse gelesen.'), 'de'),
  ['human_ask'],
  'a German message without a request still fails only human_ask',
)

// Any Grüße/Gruß closing counts, as any "regards" closing does in English.
// NFKD keeps ß, so the checks fold it: ß and ss spellings compare equal.
for (const signOff of [
  'Viele Grüße',
  'Freundliche Grüße',
  'Beste Grüße',
  'Mit freundlichen Grüßen',
  'Herzliche Grüße',
  'Mit besten Grüßen',
  'Mit freundlichem Gruß',
  'Viele Grüsse',
  'Mit freundlichen Grüssen',
]) {
  assert.deepEqual(
    failingChecks(germanMessage('Ich freue mich auf ein Gespräch.', signOff), 'de'),
    [],
    `German sign-off: ${signOff}`,
  )
}
assert.deepEqual(
  failingChecks(germanMessage('Ich freue mich auf ein Gespräch.', ''), 'de'),
  ['sign_off'],
  'a German message without a closing still fails only sign_off',
)
for (const claim of ['fließend', 'fliessend', 'verhandlungssicher']) {
  assert.deepEqual(
    failingChecks(germanMessage(`Ich spreche ${claim} Englisch und freue mich auf ein Gespräch.`), 'de'),
    ['unsupported_claims'],
    `an unsupported German fluency claim is detected: ${claim}`,
  )
}
assert.deepEqual(
  failingChecks(
    germanMessage('Ich spreche fliessend Englisch und freue mich auf ein Gespräch.'),
    'de',
    normalizeResume({ ...resumeInput, summary: 'Datenanalystin mit fließendem Englisch.' }),
  ),
  [],
  'a claim spelled with ss is supported by evidence spelled with ß',
)
assert.deepEqual(
  failingChecks(
    germanMessage('Ich freue mich auf ein Gespräch.').replace('München & Söhne GmbH', 'Weissbach GmbH'),
    'de',
    resume,
    { ...job, company: 'Weißbach GmbH' },
  ),
  [],
  'a company spelled with ß matches a message spelled with ss',
)

// English behaviour is unchanged; each ask relies on one English term.
for (const ask of [
  'Could you take a look at my profile when convenient?',
  'I would welcome a short conversation about the team.',
  'Could we speak briefly next week?',
  'Would a quick chat next week suit you?',
  'May I ask one question about the reporting stack?',
  'Would you be open to a short call?',
  'Would you be available for a short call?',
  'I would be glad to connect.',
]) {
  assert.deepEqual(failingChecks(englishMessage(ask), 'en'), [], `English ask: ${ask}`)
}
assert.deepEqual(
  failingChecks(englishMessage('Please reply.'), 'en'),
  ['human_ask'],
  'an English message without a low-pressure request still fails only human_ask',
)

console.log('recruiter-message-checks.test.ts: all tests passed')
