// Run with: npx tsx test/v243-budget.test.ts
//
// v2.4.3 · The regression that makes the reported incident impossible again.
//
// A student could not generate a tailored résumé at all: a single request was
// larger than her whole per-minute token allowance, so retrying never helped.
// The last block of this file walks a grid of résumé shapes and posting lengths
// and asserts that every one of them now fits — and it asserts the OLD payload
// did NOT fit, so the test still means something in a year's time.
//
// Everything here runs offline with no API key.
import { strict as assert } from 'node:assert'
import {
  canAfford, costOf, estimateLetterOutputTokens, estimateRerankOutputTokens,
  estimateTailoringOutputTokens, estimateTokens, parseLimitFromError,
} from '../src/llm/budget.ts'
import {
  projectEvidenceForPrompt, projectJobForPrompt, projectResumeForPrompt, resumeShape,
} from '../src/llm/promptProjection.ts'
import { estimateTailoringRequest, systemPrompt, userPrompt } from '../src/llm/tailorResume.ts'
import { buildCoverLetterPrompt, estimateLetterRequest } from '../src/llm/coverLetter.ts'
import { buildRerankPrompt } from '../src/match/rerank.ts'
import { isRequestTooLarge } from '../src/llm/groq.ts'
import { normalizeResume } from '../src/resume/canonical.ts'
import { makeJob } from '../src/sources/normalize.ts'
import { BUDGET, MATCH, PROMPT } from '../src/lib/config.ts'
import type { ResumeData } from '../src/resume/types.ts'
import type { NormalizedJob, Preferences, Profile } from '../src/types.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

// --- Fixtures ----------------------------------------------------------------

function buildResume(roles: number, bulletsPerRole: number): ResumeData {
  return normalizeResume({
    contact: {
      name: 'Amara Okafor', email: 'amara.okafor@example.com', phone: '+49 30 1234 5678',
      location: 'Berlin, Deutschland',
      links: [{ label: 'GitHub', url: 'https://github.com/amara' }, { label: 'LinkedIn', url: 'https://linkedin.com/in/amara' }],
    },
    summary: 'Email marketing specialist with four years of campaign experience, moving into data analysis.',
    experience: Array.from({ length: roles }, (_, r) => ({
      title: `Role Number ${r + 1} Specialist`,
      company: `Employer ${r + 1} Kommunikation GmbH`,
      city: 'Berlin', start: '01/2022', end: '12/2023',
      bullets: Array.from({ length: bulletsPerRole }, (_, b) =>
        `Segmented audiences and scheduled weekly campaigns across six market regions, item ${b + 1}.`),
    })),
    education: [{ degree: 'B.A.', field: 'Communication Science', institution: 'Freie Universitaet Berlin', city: 'Berlin', start: '10/2016', end: '09/2019' }],
    skills: [{ group: 'Tools', items: ['Excel', 'SQL', 'Google Analytics', 'Mailchimp'] }, { group: 'Methods', items: ['A/B Testing', 'Reporting'] }],
    languages: [{ lang: 'German', level: 'B2' }, { lang: 'English', level: 'C1' }, { lang: 'Igbo', level: 'Native' }],
    projects: [{ name: 'Churn dashboard', summary: 'A dashboard of weekly churn built for a university course.', tech: ['SQL', 'Excel'], link: 'https://github.com/amara/churn' }],
    certifications: ['Google Analytics Individual Qualification'],
  })
}

const PARAGRAPH =
  'Wir suchen zum naechstmoeglichen Zeitpunkt eine engagierte Person fuer die Unterstuetzung unseres Analytics-Teams. ' +
  'Sie arbeiten mit SQL und Python, erstellen Dashboards in Tableau, fuehren A/B-Tests durch und praesentieren ' +
  'Segmentierungsergebnisse an interne Stakeholder. Kommunikationsstaerke ist uns wichtig. '

function jd(chars: number): NormalizedJob {
  return makeJob({
    source: 'greenhouse', source_id: `jd-${chars}`, title: 'Junior Data Analyst (m/w/d)', company: 'Datenhaus GmbH',
    location: { country: 'DE', city: 'Berlin', remote: false },
    description: PARAGRAPH.repeat(Math.ceil(chars / PARAGRAPH.length)).slice(0, chars),
    url: 'https://example.test/job', language: 'de',
  })
}

/** The v2.4.2 payload, reconstructed so the test can prove the fix is real. */
function legacyUserPrompt(source: ResumeData, job: NormalizedJob): string {
  const indexed = {
    ...source,
    experience: source.experience.map((role, sourceIndex) => ({
      ...role, sourceIndex,
      bullets: role.bullets.map((bullet, sourceBulletIndex) => ({
        sourceBulletIndex, evidenceId: bullet.id, text: bullet.text,
      })),
    })),
    projects: source.projects.map((project, sourceIndex) => ({ ...project, sourceIndex })),
  }
  return JSON.stringify({
    job: { title: job.title, company: job.company, description: job.description },
    candidateSkills: source.skills.flatMap((group) => group.items.map((skill) => skill.name)),
    sourceResume: indexed,
  }, null, 2)
}

// ===========================================================================
// 1. Estimation primitives
// ===========================================================================
{
  ok(estimateTokens('') === 0, 'tokens: empty text costs nothing')
  ok(estimateTokens('a'.repeat(360)) === 100, 'tokens: 360 characters ≈ 100 tokens')
  const cost = costOf({ system: 'a'.repeat(360), user: 'b'.repeat(720), maxTokens: 1000 })
  ok(cost.inputTokens === 300, 'cost: input is system + user')
  ok(cost.reservedTokens === 1000, 'cost: the reservation is carried')
  ok(cost.billedTokens === 1300, 'cost: billed = input + reservation (the whole point)')
}

// ===========================================================================
// 2. Affordability — and the distinction that caused the incident
// ===========================================================================
{
  const small = costOf({ system: 'x'.repeat(360), user: 'y'.repeat(360), maxTokens: 500 })
  ok(canAfford(small, 8000).ok, 'afford: a small request is allowed')

  const huge = costOf({ system: 'x'.repeat(36000), user: 'y'.repeat(3600), maxTokens: 4096 })
  const verdict = canAfford(huge, 8000)
  ok(!verdict.ok, 'afford: a request bigger than the whole minute is refused')
  ok(!verdict.ok && verdict.reason === 'exceeds_budget', 'afford: refusal is PERMANENT, not "try later"')
  ok(!verdict.ok && verdict.limit === 8000, 'afford: the limit is reported so the UI can explain it')
  ok(BUDGET.assumedTpm === 8000, 'config: the conservative default matches the smallest common free tier')
}

// ===========================================================================
// 3. Learning the real limit from a provider error
// ===========================================================================
{
  const groq = parseLimitFromError(
    'Request too large for model `openai/gpt-oss-120b` in organization org_1 service tier on_demand on tokens per minute (TPM): Limit 8000, Requested 9124, please reduce your message size and try again.',
  )
  ok(groq?.limit === 8000, 'learn: the real Groq limit is read')
  ok(groq?.requested === 9124, 'learn: the requested size is read')

  const withCommas = parseLimitFromError('Limit 200,000 Requested 210,500')
  ok(withCommas?.limit === 200000, 'learn: thousands separators are handled')

  ok(parseLimitFromError('Something else went wrong') === null, 'learn: unparseable text yields null')
  ok(parseLimitFromError('') === null, 'learn: empty text yields null')

  ok(isRequestTooLarge(413, 'anything'), 'classify: 413 is always a too-large request')
  ok(isRequestTooLarge(429, 'Request too large for model X'), 'classify: a 429 saying "too large" is per-request')
  ok(!isRequestTooLarge(429, 'Rate limit reached for requests per minute'), 'classify: a plain 429 is a temporary quota')
  ok(!isRequestTooLarge(500, 'internal error'), 'classify: a server error is neither')
}

// ===========================================================================
// 4. Output reservations are sized, not constant
// ===========================================================================
{
  const tiny = estimateTailoringOutputTokens({ bulletCount: 1, roleCount: 1, projectsWithSummary: 0 })
  const normal = estimateTailoringOutputTokens({ bulletCount: 9, roleCount: 3, projectsWithSummary: 1 })
  const huge = estimateTailoringOutputTokens({ bulletCount: 200, roleCount: 30, projectsWithSummary: 10 })

  ok(tiny === BUDGET.minReservedTokens, 'reserve: a tiny résumé still gets room for valid JSON')
  ok(normal > tiny && normal < 2000, `reserve: a normal résumé reserves far less than 4096 (${normal})`)
  ok(huge === BUDGET.maxReservedTokens, 'reserve: never exceeds the old 4096 ceiling')
  ok(normal < 4096, 'reserve: the flat 4096 is gone')

  ok(estimateLetterOutputTokens() < 900, 'reserve: the letter reserves less than the old flat 900')
  ok(estimateRerankOutputTokens(MATCH.batchSize) < 2048, 'reserve: a match batch reserves less than the old 2048')
  ok(estimateRerankOutputTokens(1) < estimateRerankOutputTokens(10), 'reserve: matching scales with batch size')
}

// ===========================================================================
// 5. The projection invariant — nothing useless, nothing private, no lost index
// ===========================================================================
{
  const resume = buildResume(3, 4)
  const projected = JSON.stringify(projectResumeForPrompt(resume))

  for (const forbidden of ['"id"', '"evidenceRefs"', '"evidence"', '"evidenceId"', '"links"', '"schemaVersion"', '"reviewedAt"', '"email"', '"phone"', '"certifications"', '"languages"', '"education"']) {
    ok(!projected.includes(forbidden), `projection: ${forbidden} never reaches the provider`)
  }
  ok(!projected.includes('amara.okafor@example.com'), 'projection: the email address is not sent')
  ok(!projected.includes('+49 30 1234'), 'projection: the phone number is not sent')

  const shape = projectResumeForPrompt(resume)
  ok(shape.experience.length === 3, 'projection: every role survives')
  ok(shape.experience.every((role, index) => role.sourceIndex === index), 'projection: role indexes are preserved')
  ok(
    shape.experience.every((role) => role.bullets.every((bullet, index) => bullet.sourceBulletIndex === index)),
    'projection: bullet indexes are preserved — the validator depends on this',
  )
  ok(shape.experience[0].period === '01/2022-12/2023', 'projection: dates collapse to one field')
  ok(shape.skills.includes('SQL') && shape.skills.length === 6, 'projection: skill names survive, groups do not')
  ok(shape.projects[0].name === 'Churn dashboard', 'projection: projects keep name and summary')

  const jobProjection = projectJobForPrompt(jd(9000), { requirements: ['SQL'] })
  ok(jobProjection.excerpt.length === PROMPT.jobExcerptChars, 'projection: the posting is bounded to the configured excerpt')
  ok(jobProjection.excerpt === jd(9000).description.slice(0, PROMPT.jobExcerptChars), 'projection: the excerpt is taken from the START')
  ok(jobProjection.requirements?.[0] === 'SQL', 'projection: distilled requirements are carried when supplied')
  ok(projectJobForPrompt(jd(500)).requirements === undefined, 'projection: no empty requirements key is sent')

  // The letter still needs evidence ids, because its prompt grounds claims in them.
  const evidence = JSON.stringify(projectEvidenceForPrompt(resume))
  ok(evidence.includes('evidenceId'), 'projection: the letter keeps evidence ids')
  ok(!evidence.includes('amara.okafor@example.com'), 'projection: the letter does not send contact details')

  const counted = resumeShape(resume)
  ok(counted.roleCount === 3 && counted.bulletCount === 12 && counted.projectsWithSummary === 1, 'shape: counts are right')
}

// ===========================================================================
// 6. THE REGRESSION GATE — every realistic request must now fit
// ===========================================================================
{
  const shapes: [number, number][] = [[1, 2], [2, 3], [3, 4], [4, 4], [5, 5], [6, 5]]
  const sizes = [500, 1500, 3000, 6000, 9000, 12000]
  let worstNew = 0
  let legacyFailures = 0

  for (const [roles, bullets] of shapes) {
    const resume = buildResume(roles, bullets)
    for (const size of sizes) {
      const job = jd(size)

      const request = estimateTailoringRequest(resume, job, 'de')
      worstNew = Math.max(worstNew, request.cost.billedTokens)
      ok(
        canAfford(request.cost, BUDGET.assumedTpm).ok,
        `GATE: ${roles} roles × ${bullets} bullets, JD ${size} chars fits (${request.cost.billedTokens} tokens)`,
      )

      // And prove the old payload did NOT fit, so this test keeps its meaning.
      const legacyCost = costOf({
        system: systemPrompt('de'), user: legacyUserPrompt(resume, job), maxTokens: 4096,
      })
      if (!canAfford(legacyCost, BUDGET.assumedTpm).ok) legacyFailures += 1
    }
  }

  ok(worstNew < BUDGET.assumedTpm, `GATE: worst case across the grid is ${worstNew} < ${BUDGET.assumedTpm}`)
  ok(legacyFailures > 0, `GATE: the v2.4.2 payload failed ${legacyFailures} of these cases — the fix is real`)

  // The specific reported case: 3 roles, a 6,000-character German posting.
  const reported = estimateTailoringRequest(buildResume(3, 4), jd(6000), 'en')
  const legacyReported = costOf({
    system: systemPrompt('en'), user: legacyUserPrompt(buildResume(3, 4), jd(6000)), maxTokens: 4096,
  })
  ok(!canAfford(legacyReported, 8000).ok, 'GATE: the reported case failed before the fix')
  ok(canAfford(reported.cost, 8000).ok, 'GATE: the reported case succeeds after the fix')
  ok(
    reported.cost.billedTokens < legacyReported.billedTokens / 2,
    `GATE: the reported case more than halved (${legacyReported.billedTokens} → ${reported.cost.billedTokens})`,
  )
  console.log(`  reported case: ${legacyReported.billedTokens} → ${reported.cost.billedTokens} billed tokens`)
}

// ===========================================================================
// 7. The letter and the matcher shrank too
// ===========================================================================
{
  const resume = buildResume(3, 4)
  const job = jd(9000)

  const letter = estimateLetterRequest(resume, job)
  ok(letter.cost.billedTokens < 4010, `letter: cheaper than v2.4.2 (${letter.cost.billedTokens} < 4010)`)
  ok(canAfford(letter.cost, BUDGET.assumedTpm).ok, 'letter: fits the per-minute allowance')
  ok(buildCoverLetterPrompt(resume, job).includes('VERIFIED RÉSUMÉ EVIDENCE'), 'letter: the rules are unchanged')
  ok(!buildCoverLetterPrompt(resume, job).includes('+49 30 1234'), 'letter: no contact details are sent')

  const profile: Profile = {
    summary: '', titles: [{ title: 'Email Marketing Specialist' }],
    skills: [{ name: 'Excel' }, { name: 'SQL' }], domains: ['marketing'], totalYears: 4,
    education: [], languages: [], certifications: [],
  }
  const prefs: Preferences = {
    targetTitles: ['Data Analyst'], fields: [], seniority: 'junior',
    salary: { currency: 'EUR', period: 'year' }, locations: [{ city: 'Berlin', radius_km: 30 }],
    workAuth: {}, languages: [], mustHaves: [], dealbreakers: [],
  }
  const batch = Array.from({ length: MATCH.batchSize }, (_, i) => jd(4000 + i))
  const prompt = buildRerankPrompt(profile, prefs, batch)
  ok(!prompt.includes('"lat"'), 'matching: no unused coordinates are sent')
  ok(prompt.includes('JOBS TO SCORE'), 'matching: the prompt structure is unchanged')
  ok(prompt.includes('fitScore'), 'matching: the scoring contract is unchanged')
  const batchCost = costOf({ system: 'x'.repeat(400), user: prompt, maxTokens: estimateRerankOutputTokens(batch.length) })
  ok(batchCost.billedTokens < 4762, `matching: one batch is cheaper than v2.4.2 (${batchCost.billedTokens} < 4762)`)
  ok(MATCH.maxConsecutiveBatchFailures === 2, 'matching: the loop stops after repeated failures')
}

console.log(`\nv2.4.3 budget tests: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)