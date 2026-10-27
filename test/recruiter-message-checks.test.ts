import { strict as assert } from 'node:assert'
import { checkRecruiterMessage, type RecruiterMessageContext } from '../src/llm/coverLetter'
import { normalizeResume } from '../src/resume/canonical'
import type { ResumeData, ResumeLanguage } from '../src/resume/types'
import type { NormalizedJob } from '../src/types'

const resume = normalizeResume({
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
})

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
  overrides: { source?: ResumeData; job?: NormalizedJob; context?: RecruiterMessageContext } = {},
): string[] {
  return checkRecruiterMessage(
    message,
    overrides.source ?? resume,
    overrides.job ?? job,
    overrides.context ?? context,
    language,
  )
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
assert.deepEqual(
  failingChecks(germanMessage('Die Stelle habe ich mit Interesse gelesen.'), 'de'),
  ['human_ask'],
  'a German message without a request still fails only human_ask',
)

// "Gespräch" also counts as the last part of a compound.
for (const ask of [
  'Ich würde mich über ein kurzes Kennenlerngespräch freuen.',
  'Hätten Sie Interesse an einem kurzen Telefongespräch?',
  'Ich würde mich über die Einladung zu einem Vorstellungsgespräch freuen.',
]) {
  assert.deepEqual(failingChecks(germanMessage(ask), 'de'), [], `German compound ask: ${ask}`)
}

// Request verbs count as infinitive and zu-infinitive; each ask relies on one form.
for (const ask of [
  'Ich würde mich gerne kurz mit Ihnen austauschen.',
  'Ich würde mich freuen, mich kurz mit Ihnen auszutauschen.',
  'Wären Sie so freundlich, sich mein Profil anzusehen?',
  'Hätten Sie Gelegenheit, sich mein Profil anzuschauen?',
]) {
  assert.deepEqual(failingChecks(germanMessage(ask), 'de'), [], `German verb ask: ${ask}`)
}

// Words that merely end in another term are not requests.
for (const statement of [
  'Jede Anfrage aus dem Vertrieb beantworte ich mit einer klaren Auswertung.',
  'Die Nachfrage nach Datenanalysen wächst.',
  'Jede SQL-Abfrage dokumentiere ich sorgfältig.',
  'Den Datenaustausch zwischen den Systemen habe ich vereinfacht.',
  'Die Anforderungen entsprechen meiner bisherigen Arbeit.',
]) {
  assert.deepEqual(
    failingChecks(germanMessage(statement), 'de'),
    ['human_ask'],
    `a word ending in a German term is not a request: ${statement}`,
  )
}

// Deliberately not requests: offering availability for questions, and
// expecting a reply, which the prompt says not to demand (compare "Please
// reply." in English below).
for (const statement of [
  'Für Rückfragen stehe ich gerne zur Verfügung.',
  'Bei Fragen stehe ich Ihnen gerne zur Verfügung.',
  'Ich freue mich auf Ihre Rückmeldung.',
]) {
  assert.deepEqual(
    failingChecks(germanMessage(statement), 'de'),
    ['human_ask'],
    `deliberately not a German request: ${statement}`,
  )
}

// ß is folded to "ss" on both sides of every comparison, so Swiss and ASCII
// spelling counts exactly like ß spelling.
for (const signOff of [
  'Viele Grüße',
  'Freundliche Grüße',
  'Beste Grüße',
  'Mit freundlichen Grüßen',
  'Viele Grüsse',
  'Mit freundlichen Grüssen',
]) {
  assert.deepEqual(
    failingChecks(germanMessage('Ich freue mich auf ein Gespräch.', signOff), 'de'),
    [],
    `German sign-off: ${signOff}`,
  )
}
for (const fluently of ['fließend', 'fliessend', 'FLIEẞEND']) {
  assert.deepEqual(
    failingChecks(germanMessage(`Ich spreche ${fluently} Englisch und freue mich auf ein Gespräch.`), 'de'),
    ['unsupported_claims'],
    `an unsupported German fluency claim is detected: ${fluently}`,
  )
}

// A claim the evidence supports passes whichever spelling either side uses.
for (const [evidence, claim] of [['fließend', 'fliessend'], ['fliessend', 'fließend']]) {
  assert.deepEqual(
    failingChecks(
      germanMessage(`Ich präsentiere ${claim} auf Englisch und freue mich auf ein Gespräch.`),
      'de',
      { source: { ...resume, summary: `Analystin, die Ergebnisse ${evidence} auf Englisch präsentiert.` } },
    ),
    [],
    `evidence "${evidence}" supports the claim "${claim}"`,
  )
}

// The role/company, discovery-context, referral, and evidence checks match
// across spellings in both directions. Only the ß word connects the message
// to the evidence here.
function sharpSFailures(
  spellSource: (value: string) => string,
  spellMessage: (value: string) => string,
): string[] {
  const message = spellMessage([
    'Guten Tag,',
    'über den Messestand in Gießen bin ich auf die Position Senior Data Analyst / Operations bei Großmann & Söhne GmbH gestoßen; Jürgen Strauß hat mich empfohlen.',
    'Meine Arbeit mit Straßenverkehrsdaten passt zu Ihrem Team. Wären Sie offen für ein kurzes Gespräch?',
    'Viele Grüße',
    'Zoë Müller',
  ].join('\n'))
  return failingChecks(message, 'de', {
    source: { ...resume, summary: spellSource('Analystin für Straßenverkehrsdaten.') },
    job: { ...job, company: spellSource('Großmann & Söhne GmbH') },
    context: {
      ...context,
      applicationState: 'referred',
      discoveryContext: spellSource('den Messestand in Gießen'),
      referralName: spellSource('Jürgen Strauß'),
    },
  })
}
const asWritten = (value: string) => value
const swiss = (value: string) => value.replace(/ß/g, 'ss')
assert.deepEqual(sharpSFailures(asWritten, asWritten), [], 'ß spelling on both sides')
assert.deepEqual(sharpSFailures(asWritten, swiss), [], 'a Swiss-spelled message matches ß in the job, context, and evidence')
assert.deepEqual(sharpSFailures(swiss, asWritten), [], 'a message with ß matches Swiss spelling in the job, context, and evidence')

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
