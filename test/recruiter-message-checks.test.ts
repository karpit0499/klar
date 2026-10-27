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
  messageContext: RecruiterMessageContext = context,
): string[] {
  return checkRecruiterMessage(message, source, target, messageContext, language)
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
  'Ich würde mich über die Einladung zu einem Vorstellungsgespräch freuen.',
]) {
  assert.deepEqual(failingChecks(germanMessage(ask), 'de'), [], `German ask: ${ask}`)
}

// Verb forms of requests the list already accepts (Austausch, ansehen,
// anschauen); each ask relies on one form.
for (const ask of [
  'Ich würde mich gerne kurz mit Ihnen austauschen.',
  'Ich würde mich freuen, mich kurz mit Ihnen auszutauschen.',
  'Wären Sie so freundlich, sich mein Profil anzusehen?',
  'Hätten Sie Gelegenheit, sich mein Profil anzuschauen?',
]) {
  assert.deepEqual(failingChecks(germanMessage(ask), 'de'), [], `German ask: ${ask}`)
}
assert.deepEqual(
  failingChecks(germanMessage('Die Stelle habe ich mit Interesse gelesen.'), 'de'),
  ['human_ask'],
  'a German message without a request still fails only human_ask',
)

// No general compound rule: a word that merely ends in an accepted term is not
// a request.
for (const statement of [
  'Im Kundengespräch übersetze ich Analysen in klare Entscheidungen.',
  'Jede Anfrage aus dem Vertrieb beantworte ich mit einer klaren Auswertung.',
  'Die Nachfrage nach Datenanalysen wächst.',
  'Jede SQL-Abfrage dokumentiere ich sorgfältig.',
  'Den Datenaustausch zwischen den Systemen habe ich vereinfacht.',
  'Die Anforderungen entsprechen meiner bisherigen Arbeit.',
]) {
  assert.deepEqual(
    failingChecks(germanMessage(statement), 'de'),
    ['human_ask'],
    `not a German request: ${statement}`,
  )
}

// Deliberately not counted, as in English: offers (English "questions" does not
// count), reply requests (nor does "hearing from you"), and "Telefonat" (nor
// does "call").
for (const statement of [
  'Für Rückfragen stehe ich gerne zur Verfügung.',
  'Bei Fragen stehe ich Ihnen gerne zur Verfügung.',
  'Ich freue mich auf Ihre Rückmeldung.',
  'Ich würde mich über ein kurzes Telefonat freuen.',
]) {
  assert.deepEqual(
    failingChecks(germanMessage(statement), 'de'),
    ['human_ask'],
    `deliberately not a German request: ${statement}`,
  )
}

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
for (const claim of ['fließend', 'fliessend', 'FLIEẞEND', 'verhandlungssicher']) {
  assert.deepEqual(
    failingChecks(germanMessage(`Ich spreche ${claim} Englisch und freue mich auf ein Gespräch.`), 'de'),
    ['unsupported_claims'],
    `an unsupported German fluency claim is detected: ${claim}`,
  )
}
for (const [claim, evidence] of [['fliessend', 'fließendem'], ['fließend', 'fliessendem']]) {
  assert.deepEqual(
    failingChecks(
      germanMessage(`Ich spreche ${claim} Englisch und freue mich auf ein Gespräch.`),
      'de',
      normalizeResume({ ...resumeInput, summary: `Datenanalystin mit ${evidence} Englisch.` }),
    ),
    [],
    `a claim spelled "${claim}" is supported by evidence spelled "${evidence}"`,
  )
}
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

// The role/company, discovery-context, referral, and evidence checks match
// across ß/ss spellings in both directions. Only the ß word connects the
// message to the evidence here.
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
  return failingChecks(
    message,
    'de',
    normalizeResume({ ...resumeInput, summary: spellSource('Analystin für Straßenverkehrsdaten.') }),
    { ...job, company: spellSource('Großmann & Söhne GmbH') },
    {
      ...context,
      applicationState: 'referred',
      discoveryContext: spellSource('den Messestand in Gießen'),
      referralName: spellSource('Jürgen Strauß'),
    },
  )
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
