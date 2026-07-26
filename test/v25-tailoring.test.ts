// Run with: npx tsx test/v25-tailoring.test.ts
//
// v2.5 · the MERGE-BLOCKING anti-fabrication gate (ATS plan §7.1) plus the pure
// units around it. Every assertion here runs offline with no API key, so CI stays
// hermetic (Risk R6) while still proving the thing that actually matters:
//
//   a tailored bullet can never introduce a tool, metric, date or employer that
//   its cited source does not contain.
//
// The fixtures include a CAREER-CHANGER résumé (email marketing → data science),
// which is the case the ATS plan says the old fixtures never covered.
import { strict as assert } from 'node:assert'
import {
  auditBullet, auditRoleTitle, auditSummary, extractNumbers, extractTechTerms,
  isBulkAcceptable, lacksMeasurableOutcome, worstStatus,
} from '../src/llm/evidenceStatus.ts'
import {
  acceptAll, applyChanges, keywordEffect, proposeChanges, restoreChange, setDecision,
  setEditedText, summarizeChanges,
} from '../src/resume/changeSet.ts'
import { auditTailoringResponse, systemPrompt, userPrompt } from '../src/llm/tailorResume.ts'
import { JD_TERMS_SYSTEM, jdCacheKey, sanitizeJdTerms } from '../src/llm/jdTerms.ts'
import { coverageReport, mergeJdTerms } from '../src/resume/keywords.ts'
import { buildTailoredSummary, tailorBullets, tailorResume } from '../src/resume/tailor.ts'
import {
  DEFAULT_ENGINE, engineWarning, isDefaultEngine, engineDisplayName, normalizeBaseUrl,
  validateEngineDraft,
} from '../src/llm/provider.ts'
import { normalizeResume } from '../src/resume/canonical.ts'
import { makeJob } from '../src/sources/normalize.ts'
import type { ResumeData } from '../src/resume/types.ts'
import type { NormalizedJob, Profile } from '../src/types.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

// ---------------------------------------------------------------------------
// Fixture: the career-changer the plan is written for.
// ---------------------------------------------------------------------------
const changer: ResumeData = normalizeResume({
  contact: { name: 'Amara Okafor', email: 'amara@example.com', location: 'Berlin', links: [] },
  summary: 'Email marketing specialist moving into data.',
  experience: [
    {
      title: 'Email Marketing Specialist', company: 'Nordlicht GmbH', city: 'Berlin',
      start: '01/2022', current: true,
      bullets: [
        'Segmented audiences and scheduled campaigns each week.',
        'Reported campaign results to the marketing lead in spreadsheets.',
        'Ran A/B tests on subject lines and reported which won.',
      ],
    },
    {
      title: 'Marketing Assistant', company: 'Kleinwerk', city: 'Leipzig',
      start: '03/2020', end: '12/2021',
      bullets: ['Maintained the contact list and cleaned duplicate records.'],
    },
  ],
  education: [{ degree: 'B.A.', field: 'Communication', institution: 'FU Berlin', start: '10/2016', end: '09/2019' }],
  skills: [{ group: 'Tools', items: ['Excel', 'SQL'] }],
  languages: [{ lang: 'German', level: 'B2' }, { lang: 'English', level: 'C1' }],
  projects: [{ name: 'Churn dashboard', summary: 'A dashboard of weekly churn built for a course.' }],
  certifications: ['Google Analytics'],
})

function jd(description: string, title = 'Junior Data Analyst', language = 'en'): NormalizedJob {
  return makeJob({
    source: 'greenhouse', source_id: description.slice(0, 12), title, company: 'Datenhaus',
    location: { country: 'DE', remote: false, city: 'Berlin' },
    description, url: 'https://example.test/job', language,
  })
}

const analystJob = jd(
  'Junior Data Analyst. You will work with SQL and Python, build dashboards in Tableau, ' +
  'run A/B testing and present segmentation results. Stakeholder communication is important.',
)

// ===========================================================================
// 1. P8 — the anti-fabrication gate. THIS is the merge blocker.
// ===========================================================================
{
  const source = ['Segmented audiences and scheduled campaigns each week.']

  // The ATS plan's own worked example: it adds a tool AND a specific.
  const planExample = auditBullet({
    after: 'Segmented audiences in Salesforce CRM on 30-day activity and open behaviour.',
    sources: source,
    jdTerms: ['segmentation'],
  })
  ok(planExample.status === 'blocked', 'P8: the plan\'s own example is blocked (it adds "30-day")')
  ok(planExample.addedNumbers.includes('30'), 'P8: the invented number is named')

  // Vocabulary translation with NO new specifics is exactly what P8 allows.
  const allowed = auditBullet({
    after: 'Built weekly audience segmentation and campaign scheduling.',
    sources: source,
    jdTerms: ['segmentation'],
  })
  ok(allowed.status === 'rephrased', 'P8: vocabulary translation is allowed')
  ok(allowed.addedNumbers.length === 0 && allowed.addedTerms.length === 0, 'P8: nothing was imported')

  // A tool the evidence never mentions needs a human, not a silent pass.
  const newTool = auditBullet({
    after: 'Segmented audiences weekly using Python.',
    sources: source,
    jdTerms: ['Python'],
  })
  ok(newTool.status === 'confirmation_required', 'P8: an unattested tool asks for confirmation')
  ok(newTool.addedTerms.includes('python'), 'P8: the unattested tool is named')

  // Numbers the source DOES contain survive untouched.
  const kept = auditBullet({
    after: 'Cut churn 12% by shipping models in Python.',
    sources: ['Shipped ML models in Python, cutting churn 12%.'],
  })
  ok(kept.status === 'rephrased', 'P8: a number present in the evidence is fine')

  // German number formats must not read as fabrications.
  const german = auditBullet({
    after: 'Umsatz um 12,5 % gesteigert.',
    sources: ['Steigerung des Umsatzes um 12,5 %.'],
  })
  ok(german.status !== 'blocked', 'P8: German decimal commas are not false positives')

  // Every source bullet, unchanged, is "supported".
  const identical = auditBullet({ after: source[0], sources: source })
  ok(identical.status === 'supported', 'P8: unchanged text is supported')
}

// ===========================================================================
// 2. P9 — no title inflation, no keyword stuffing.
// ===========================================================================
{
  const inflated = auditRoleTitle('Email Marketing Specialist', 'Senior Email Marketing Specialist')
  ok(inflated.status === 'blocked', 'P9: a past title cannot gain "Senior"')

  const tidied = auditRoleTitle('Email Marketing Specialist', 'Email Marketing Specialist (Campaigns)')
  ok(tidied.status === 'rephrased', 'P9: tidying a title is allowed')

  const kept = auditRoleTitle('Senior Analyst', 'Senior Analyst')
  ok(kept.status === 'supported', 'P9: an existing seniority word is kept')

  const echo = auditSummary('Email Marketing Specialist applying for Junior Data Analyst.', {
    jobTitle: 'Junior Data Analyst',
    sourceTitles: ['Email Marketing Specialist'],
    sources: changer.experience.flatMap((role) => role.bullets.map((bullet) => bullet.text)),
  })
  ok(echo.status !== 'blocked', 'P9: echoing the posting title verbatim is allowed')

  const invented = auditSummary('Head of Data applying for Junior Data Analyst.', {
    jobTitle: 'Junior Data Analyst',
    sourceTitles: ['Email Marketing Specialist'],
    sources: [],
  })
  ok(invented.status === 'blocked', 'P9: seniority in neither posting nor history is blocked')

  const stuffed = auditBullet({
    after: 'SQL reporting with SQL queries and more SQL reporting in SQL.',
    sources: ['Wrote SQL reports.'],
    jdTerms: ['SQL'],
  })
  ok(stuffed.status === 'confirmation_required', 'R9: keyword stuffing is caught')
  ok(stuffed.repeatedTerms.includes('sql'), 'R9: the over-repeated term is named')
}

// ===========================================================================
// 3. Number / term extraction primitives.
// ===========================================================================
{
  ok(extractNumbers('cut churn 12% over 3 months').join(',') === '12%,3', 'numbers: percent and count')
  ok(extractNumbers('12 %').includes('12%'), 'numbers: "12 %" normalises to 12%')
  ok(extractNumbers('no metrics here').length === 0, 'numbers: none found in plain prose')
  ok(extractTechTerms('Built pipelines in Python and BigQuery').includes('Python'), 'terms: dictionary hit')
  ok(!extractTechTerms('We use IT and HR systems').includes('IT'), 'terms: prose acronyms are ignored')
  ok(lacksMeasurableOutcome('Maintained the contact list.'), 'coaching: flags a bullet with no number')
  ok(!lacksMeasurableOutcome('Cut bounce rate 4%.'), 'coaching: a real number is not flagged')
  ok(worstStatus(['supported', 'blocked', 'rephrased']) === 'blocked', 'status: worst wins')
  ok(!isBulkAcceptable(['rephrased', 'confirmation_required']), 'status: bulk accept needs no human decisions')
  ok(isBulkAcceptable(['supported', 'rephrased']), 'status: safe sets may bulk accept')
}

// ===========================================================================
// 4. The change set: propose → decide → replay.
// ===========================================================================
{
  const jdTerms = ['segmentation', 'A/B Testing', 'SQL']
  const changes = proposeChanges(
    changer,
    {
      summary: {
        after: 'Email Marketing Specialist applying for Junior Data Analyst.',
        finding: auditSummary('Email Marketing Specialist applying for Junior Data Analyst.', {
          jobTitle: 'Junior Data Analyst', sourceTitles: ['Email Marketing Specialist'], sources: [],
        }),
      },
      titles: [
        { roleIndex: 0, after: 'Email Marketing Specialist', finding: auditRoleTitle('Email Marketing Specialist', 'Email Marketing Specialist') },
      ],
      bullets: [
        {
          roleIndex: 0, bulletIndex: 0,
          after: 'Built weekly audience segmentation and campaign scheduling.',
          sourceBulletIndexes: [0],
          finding: auditBullet({
            after: 'Built weekly audience segmentation and campaign scheduling.',
            sources: [changer.experience[0].bullets[0].text], jdTerms,
          }),
        },
        {
          roleIndex: 0, bulletIndex: 1,
          after: 'Ran A/B testing on subject lines and reported the winner. Delivered 40% lift.',
          sourceBulletIndexes: [2],
          finding: auditBullet({
            after: 'Ran A/B testing on subject lines and reported the winner. Delivered 40% lift.',
            sources: [changer.experience[0].bullets[2].text], jdTerms,
          }),
        },
      ],
      projects: [],
    },
    jdTerms,
  )

  const stats = summarizeChanges(changes)
  ok(stats.total >= 3, `changeSet: proposes one record per edit (${stats.total})`)
  ok(stats.blocked === 1, 'changeSet: the invented 40% is the single blocked change')
  ok(!stats.canBulkAccept, 'changeSet: bulk accept is refused while something is blocked')

  const blocked = changes.find((change) => change.finding.status === 'blocked')!
  ok(blocked.decision === 'rejected', 'changeSet: a blocked change defaults to rejected')

  const removed = changes.find((change) => change.target.kind === 'bullet-removed')
  ok(Boolean(removed), 'changeSet: a dropped source bullet is itself a reversible change')

  const gained = keywordEffect(
    changer.experience[0].bullets[0].text,
    'Built weekly audience segmentation and campaign scheduling.',
    jdTerms,
  )
  ok(gained.includes('segmentation'), 'changeSet: keyword effect names the gained term')

  // Replay: accepting nothing must return the person's own sentences.
  const baseline = tailorResume(changer, analystJob).data
  const allRejected = changes.map((change) => ({ ...change, decision: 'rejected' as const }))
  const rejectedData = applyChanges(baseline, changer, allRejected)
  const rejectedTexts = rejectedData.experience[0].bullets.map((bullet) => bullet.text)
  for (const bullet of changer.experience[0].bullets) {
    ok(rejectedTexts.includes(bullet.text), `replay: rejecting restores "${bullet.text.slice(0, 24)}…"`)
  }

  // Accepting the safe rewrite uses it, and never the blocked one.
  const accepted = setDecision(changes, 'bullet-0-0', 'accepted')
  const acceptedData = applyChanges(baseline, changer, accepted)
  ok(
    acceptedData.experience[0].bullets.some((bullet) => /audience segmentation/.test(bullet.text)),
    'replay: an accepted rewrite is used',
  )
  ok(
    !acceptedData.experience[0].bullets.some((bullet) => /40%/.test(bullet.text)),
    'replay: a blocked rewrite can never reach the document',
  )

  // acceptAll refuses while anything is blocked; it works once it is gone.
  ok(acceptAll(changes) === changes, 'replay: acceptAll is a no-op while blocked changes exist')
  const safeOnly = changes.filter((change) => change.finding.status !== 'blocked')
  ok(summarizeChanges(acceptAll(safeOnly)).accepted === safeOnly.length, 'replay: acceptAll works on a safe set')

  // A manual edit wins, and restore puts Klar's wording back.
  const edited = setEditedText(changes, 'bullet-0-0', 'My own wording.')
  ok(applyChanges(baseline, changer, edited).experience[0].bullets[0].text === 'My own wording.', 'replay: a manual edit is used verbatim')
  ok(restoreChange(edited, 'bullet-0-0').find((c) => c.id === 'bullet-0-0')!.edited === undefined, 'replay: restore drops the manual edit')

  // Evidence references survive so exports stay traceable.
  ok(
    acceptedData.experience[0].bullets.some((bullet) => bullet.evidenceRefs.length > 0),
    'replay: accepted bullets keep evidence references',
  )
}

// ===========================================================================
// 5. auditTailoringResponse — the retry decision.
// ===========================================================================
{
  const response = {
    summary: 'Email Marketing Specialist applying for Junior Data Analyst.',
    experience: [
      {
        sourceIndex: 0, title: 'Email Marketing Specialist',
        bullets: [{ text: 'Grew the list by 400 contacts.', sourceBulletIndexes: [0] }],
      },
      {
        sourceIndex: 1, title: 'Marketing Assistant',
        bullets: [{ text: 'Cleaned duplicate records in the contact list.', sourceBulletIndexes: [0] }],
      },
    ],
    projects: [{ sourceIndex: 0, summary: 'A dashboard of weekly churn built for a course.' }],
    changeSummary: ['Reframed for analytics'],
  }
  const audited = auditTailoringResponse(response, changer, analystJob, ['SQL'])
  ok(audited.blockers.length === 1, 'audit: one blocker for the invented 400')
  ok(/400/.test(audited.blockers[0].instruction), 'audit: the retry instruction names the invented number')
  ok(audited.proposal.bullets.length === 2, 'audit: every returned bullet becomes a proposal')

  const prompt = systemPrompt('en')
  ok(/REFRAMING RULE/.test(prompt), 'prompt: P8 is stated as a rule')
  ok(/never add a seniority word/i.test(prompt), 'prompt: P9 title rule is stated')
  ok(/keyword stuffing/i.test(prompt), 'prompt: stuffing is forbidden')
  ok(/job\.requirements/.test(prompt), 'prompt: the posting vocabulary is referenced by its real field name')

  const user = userPrompt(changer, analystJob, ['SQL', 'Tableau'], ['Fix the 400.'])
  ok(/"requirements"/.test(user), 'prompt: requirements are supplied to the model')
  ok(/"SQL"/.test(user) && /"Tableau"/.test(user), 'prompt: the actual terms are carried')
  // v2.4.3 projection invariants, asserted here too so the v2.5 payload cannot regress.
  for (const forbidden of ['"evidenceRefs"', '"evidenceId"', '"links"', '"schemaVersion"', 'amara@example.com']) {
    ok(!user.includes(forbidden), `prompt: ${forbidden} never reaches the provider`)
  }
  ok(/CORRECTIONS REQUIRED/.test(user), 'prompt: the retry carries targeted corrections')
  ok(/sourceBulletIndex/.test(user), 'prompt: bullets stay explicitly indexed')
}

// ===========================================================================
// 6. WS2 — the requirement extractor's sanitiser (pure, hermetic).
// ===========================================================================
{
  const raw = {
    requirements: [
      'SQL', 'Tableau', 'A/B testing', 'stakeholder communication',
      'experience',            // meta word → dropped
      'Kubernetes',            // not in the posting → dropped
      'sql',                   // duplicate → dropped
      '   ', 42, null,         // junk → dropped
      '5',                     // bare number → dropped
    ],
  }
  const terms = sanitizeJdTerms(raw, analystJob)
  ok(terms.includes('SQL') && terms.includes('Tableau'), 'WS2: posting terms survive')
  ok(terms.includes('stakeholder communication'), 'WS2: non-tech requirements survive (the whole point)')
  ok(!terms.includes('Kubernetes'), 'WS2: an invented requirement is dropped')
  ok(!terms.some((term) => term.toLowerCase() === 'experience'), 'WS2: meta words are dropped')
  ok(new Set(terms.map((t) => t.toLowerCase())).size === terms.length, 'WS2: no duplicates')
  ok(sanitizeJdTerms({ requirements: Array(50).fill('SQL query') }, analystJob).length <= 12, 'WS2: hard cap holds')
  ok(sanitizeJdTerms('not an object', analystJob).length === 0, 'WS2: garbage in → empty out')
  ok(/VERBATIM/.test(JD_TERMS_SYSTEM), 'WS2: the prompt demands verbatim wording')
  ok(jdCacheKey(analystJob) === jdCacheKey(analystJob), 'WS2: the cache key is stable')
  ok(jdCacheKey(analystJob) !== jdCacheKey(jd('A totally different posting.')), 'WS2: the cache key separates postings')
}

// ===========================================================================
// 7. Coverage with extractor terms — additive, never substitutive.
// ===========================================================================
{
  const profile: Profile = {
    summary: 'Email marketer', titles: [{ title: 'Email Marketing Specialist' }],
    skills: [{ name: 'SQL' }, { name: 'Excel' }],
    domains: ['marketing'], totalYears: 4, education: [], languages: [], certifications: [],
    // coverageReport keeps its exact v2.4 matching (whole-phrase, no stemming),
    // so the backstop corpus has to state the term as the posting spells it.
    rawText: 'audience segmentation, A/B tests, SQL, Excel',
  }
  const before = coverageReport(analystJob, profile)
  const after = coverageReport(analystJob, profile, ['stakeholder communication', 'segmentation'])
  ok(after.total > before.total, 'WS2: extractor terms widen the report')
  ok(before.covered.every((term) => after.covered.includes(term)), 'WS2: nothing previously covered is lost')
  ok(after.missing.includes('stakeholder communication'), 'WS2: an unevidenced requirement shows as missing')
  ok(after.covered.includes('segmentation'), 'WS2: a requirement the résumé text attests shows as covered')

  ok(mergeJdTerms(['SQL'], ['sql', 'Tableau']).length === 2, 'merge: case-insensitive dedup')
  ok(mergeJdTerms(['SQL'], ['k8s'])[1] === 'Kubernetes', 'merge: aliases canonicalise')
  ok(mergeJdTerms(['SQL'], [])[0] === 'SQL', 'merge: the deterministic list stays first')
}

// ===========================================================================
// 8. WS4a deterministic layer: ranking + the exact-title echo.
// ===========================================================================
{
  const ranked = tailorBullets(changer.experience[0].bullets, ['A/B Testing', 'segmentation'])
  ok(ranked.length === 3, 'rank: no bullet is lost')
  ok(/A\/B|Segmented/.test(ranked[0].text), 'rank: the most relevant bullet leads')

  const summaryEn = buildTailoredSummary(changer, coverageReport(analystJob, {
    summary: '', titles: [], skills: [], domains: [], education: [], languages: [], certifications: [], rawText: '',
  }), 'en', 'Junior Data Analyst')
  ok(summaryEn.includes('Junior Data Analyst'), 'WS4.5: the posting title appears verbatim')
  ok(/applying for/.test(summaryEn), 'WS4.5: it is phrased as intent, never as a held title')

  const summaryDe = buildTailoredSummary(changer, coverageReport(analystJob, {
    summary: '', titles: [], skills: [], domains: [], education: [], languages: [], certifications: [], rawText: '',
  }), 'de', 'Junior Data Analyst')
  ok(/Bewerbung als/.test(summaryDe), 'WS4.5: the German summary uses "Bewerbung als"')

  const noEcho = buildTailoredSummary(changer, coverageReport(analystJob, {
    summary: '', titles: [], skills: [], domains: [], education: [], languages: [], certifications: [], rawText: '',
  }), 'en', 'Email Marketing Specialist')
  ok(!/applying for/.test(noEcho), 'WS4.5: no echo when the title already matches')

  // The deterministic path never loses or invents content.
  const result = tailorResume(changer, analystJob, undefined, ['segmentation'])
  ok(result.data.experience.length === changer.experience.length, 'WS4a: no role dropped')
  const inputSkills = new Set(changer.skills.flatMap((group) => group.items.map((item) => item.name)))
  ok(
    result.data.skills.flatMap((group) => group.items.map((item) => item.name)).every((name) => inputSkills.has(name)),
    'WS4a: no skill fabricated (output ⊆ input)',
  )
}

// ===========================================================================
// 9. WS3 — the engine layer's pure functions (and the honest R2 warning).
// ===========================================================================
{
  ok(normalizeBaseUrl('  https://x.test/v1///  ') === 'https://x.test/v1', 'engine: base URL is normalised')
  ok(isDefaultEngine(DEFAULT_ENGINE), 'engine: defaults are recognised')
  ok(engineDisplayName(DEFAULT_ENGINE) === 'Groq', 'engine: the default is named Groq')
  ok(
    engineDisplayName({ ...DEFAULT_ENGINE, baseUrl: 'http://localhost:11434/v1' }) === 'localhost:11434',
    'engine: a custom endpoint is named by host',
  )

  const bad = validateEngineDraft({ baseUrl: 'not a url', model: 'm', fastModel: '', requiresKey: true, fastMatching: false })
  ok(!bad.ok && bad.problem === 'baseUrl', 'engine: a malformed URL is refused')
  const scheme = validateEngineDraft({ baseUrl: 'ftp://x.test', model: 'm', fastModel: '', requiresKey: true, fastMatching: false })
  ok(!scheme.ok && scheme.problem === 'scheme', 'engine: only http/https are accepted')
  const noModel = validateEngineDraft({ baseUrl: 'https://x.test/v1', model: '  ', fastModel: '', requiresKey: true, fastMatching: false })
  ok(!noModel.ok && noModel.problem === 'model', 'engine: a model id is required')
  const good = validateEngineDraft({ baseUrl: 'https://x.test/v1/', model: 'a', fastModel: '', requiresKey: false, fastMatching: true })
  ok(good.ok && good.value.fastModel === 'a', 'engine: an empty fast model falls back to the main model')

  const local = { ...DEFAULT_ENGINE, baseUrl: 'http://localhost:11434/v1' }
  ok(engineWarning(local, 'https:') === 'mixed_content', 'R2: an http endpoint on an https page is flagged')
  ok(engineWarning(local, 'http:') === 'insecure_dev', 'R2: local dev over http is allowed')
  ok(engineWarning(DEFAULT_ENGINE, 'https:') === null, 'R2: the hosted default needs no warning')
  ok(
    engineWarning({ ...DEFAULT_ENGINE, baseUrl: 'https://other.test/v1', requiresKey: false }, 'https:') === 'no_key',
    'engine: a keyless custom endpoint is disclosed',
  )
}

console.log(`\nv2.5 tailoring tests: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)