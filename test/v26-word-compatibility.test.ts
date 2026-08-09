import { strict as assert } from 'node:assert'
import { Packer } from 'docx'
import { unzipSync, strToU8, zipSync } from 'fflate'
import { checkWordCompatibility } from '../qa/documents/check-word-compatibility.mjs'
import { coverLetterDocument, createCoverLetterModel } from '../src/application/coverLetterDocx'
import { applicationPacketZip } from '../src/packets/download'
import {
  ARTIFACT_GENERATOR_CONTRACTS,
  currentArtifactProvenance,
} from '../src/packets/types'
import { normalizeResume } from '../src/resume/canonical'
import { resumeDocxDocument, resumeHasDocxUnsafeText, resumeToDocxBlob } from '../src/resume/docx'
import { RESUME_LAB_PRESETS, resumeLabDocument } from '../src/resume/designLab'
import { DocxUnsafeTextError, hasDocxUnsafeText, stripDocxUnsafeText } from '../src/export/wordCompatibility'
import type { NormalizedJob } from '../src/types'

// A resume and letter that exercise accents, long tokens and bullets. Word is
// stricter than LibreOffice, so this suite checks the produced bytes rather
// than trusting a headless PDF conversion.
const resume = normalizeResume({
  contact: {
    name: 'Zoë Müller',
    email: 'zoe.mueller@example.invalid',
    phone: '+49 30 555 0100',
    location: 'Berlin, Germany',
    links: [{ label: 'Portfolio', url: 'https://example.invalid/zoe' }],
  },
  summary: 'Data analyst who turns operational questions into clear decisions.',
  experience: [{
    title: 'Data Analyst',
    company: 'Example GmbH',
    city: 'Berlin',
    start: '01/2024',
    current: true,
    bullets: [
      'Built weekly reporting with SQL and Power BI.',
      'Documented metric definitions with operations partners.',
    ],
  }],
  education: [{ degree: 'MSc', field: 'Industrial Engineering', institution: 'Example University' }],
  skills: [{ group: 'Analysis', items: ['SQL', 'Power BI', 'Excel'] }],
  languages: [{ lang: 'German', level: 'C1' }, { lang: 'English', level: 'C1' }],
  projects: [{ name: 'Capacity dashboard', summary: 'Made refresh dates visible.', tech: ['SQL'] }],
  certifications: [{ name: 'Power BI Data Analyst', issuer: 'Microsoft' }],
})

const job: NormalizedJob = {
  id: 'word-compat-job',
  title: 'Senior Data Analyst',
  company: 'München & Söhne GmbH',
  description: 'Analysis role.',
  location: { city: 'Berlin', country: 'DE', remote: false },
  source: 'fixture',
  posted_at: '2026-07-20',
  fetched_at: '2026-07-28',
  url: 'https://example.invalid/job',
  tags: [],
}

function expectWordSafe(label: string, bytes: Uint8Array) {
  const result = checkWordCompatibility(label, bytes)
  assert.deepEqual(
    result.errors,
    [],
    `${label} must open in Microsoft Word without repair: ${result.errors.join(' | ')}`,
  )
  assert.equal(result.pass, true)
}

// --- the production resume exporter ----------------------------------------
for (const language of ['en', 'de'] as const) {
  expectWordSafe(
    `resume-${language}`,
    new Uint8Array(await Packer.toBuffer(resumeDocxDocument(resume, language))),
  )
}

// --- every resume design-lab preset ----------------------------------------
for (const preset of RESUME_LAB_PRESETS) {
  for (const language of ['en', 'de'] as const) {
    expectWordSafe(
      `resume-lab-${preset.id}-${language}`,
      new Uint8Array(await Packer.toBuffer(resumeLabDocument(resume, language, preset.id))),
    )
  }
}

// --- the cover letter in both languages ------------------------------------
const letterModels = (['en', 'de'] as const).map((language) => createCoverLetterModel({
  body: [
    'Die Position verbindet sich direkt mit meiner Arbeit an operativen Auswertungen.',
    'Bei Example GmbH erstelle ich wöchentliche Berichte mit SQL und Power BI.',
    'Über einen persönlichen Austausch würde ich mich freuen.',
  ].join('\n\n'),
  resume,
  job,
  language,
  details: {
    recipientName: 'Dr. Renée Example',
    recipientAddress: 'Long Street Name 123\n80331 München\nGermany',
    place: 'Berlin',
    dateIso: '2026-07-31',
  },
  now: new Date('2026-07-31T09:00:00.000Z'),
}))
for (const model of letterModels) {
  expectWordSafe(
    `cover-letter-${model.language}`,
    new Uint8Array(await Packer.toBuffer(coverLetterDocument(model))),
  )
}

// --- both members of the packet a user actually receives -------------------
const packetBlob = await applicationPacketZip(
  resume,
  'en',
  'klar-zoe-mueller-senior-data-analyst',
  letterModels[0],
  currentArtifactProvenance(ARTIFACT_GENERATOR_CONTRACTS.coverLetter),
)
const packetEntries = unzipSync(new Uint8Array(await packetBlob.arrayBuffer()))
const packetNames = Object.keys(packetEntries).sort()
assert.equal(packetNames.length, 2, 'the packet contains exactly the resume and the letter')
assert.ok(packetNames.every((entry) => entry.endsWith('.docx')), 'the packet contains no TXT')
for (const entry of packetNames) expectWordSafe(`packet:${entry}`, packetEntries[entry])

// --- the guard has teeth: the pre-fix shape must be rejected ---------------
const good = unzipSync(new Uint8Array(await Packer.toBuffer(coverLetterDocument(letterModels[0]))))
const regressed: Record<string, Uint8Array> = {}
for (const [entry, bytes] of Object.entries(good)) {
  if (entry === 'word/styles.xml' || entry === 'word/document.xml') {
    const xml = new TextDecoder().decode(bytes)
      .replace(/<w:style w:type="paragraph" w:styleId="Normal">[\s\S]*?<\/w:style>/, '')
      .replace(/ w:lineRule="auto"/g, '')
    regressed[entry] = strToU8(xml)
  } else {
    regressed[entry] = bytes
  }
}
const regressedResult = checkWordCompatibility('regressed.docx', zipSync(regressed))
assert.equal(regressedResult.pass, false, 'the checker must reject a missing Normal style')
assert.ok(
  regressedResult.errors.some((error) => error.startsWith('W06')),
  'a missing Normal style is reported',
)
assert.ok(
  regressedResult.errors.some((error) => error.startsWith('W09')),
  'w:line without w:lineRule is reported',
)

// --- control characters never reach a package ------------------------------
const CONTROL = String.fromCharCode(0x1F)
assert.equal(hasDocxUnsafeText(`clean text`), false)
assert.equal(hasDocxUnsafeText(`broken${CONTROL}text`), true)
assert.equal(stripDocxUnsafeText(`broken${CONTROL}text`), 'brokentext')
assert.equal(hasDocxUnsafeText(String.fromCharCode(0xD800)), true, 'a lone surrogate is unsafe')

const poisoned = normalizeResume({
  ...resume,
  summary: `Data analyst${CONTROL} who writes reports.`,
} as never)
assert.equal(resumeHasDocxUnsafeText(poisoned), true)
await assert.rejects(
  () => resumeToDocxBlob(poisoned, 'en'),
  (error: unknown) => error instanceof DocxUnsafeTextError,
  'a resume carrying a control character must be refused before packing',
)
await assert.rejects(
  () => applicationPacketZip(
    poisoned,
    'en',
    'klar-poisoned',
    letterModels[0],
    currentArtifactProvenance(ARTIFACT_GENERATOR_CONTRACTS.coverLetter),
  ),
  (error: unknown) => error instanceof DocxUnsafeTextError,
  'the packet must never ship a resume Word cannot open',
)

console.log('v26-word-compatibility.test.ts: all tests passed')
