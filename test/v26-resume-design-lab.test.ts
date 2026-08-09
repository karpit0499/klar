import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { Packer } from 'docx'
import { db, setSetting } from '../src/db/db'
import { normalizeResume } from '../src/resume/canonical'
import {
  loadResumeLabDecision,
  parseResumeLabDocument,
  RESUME_LAB_PRESETS,
  parsePackedResumeDocx,
  resumeLabDocument,
  saveResumeLabDecision,
} from '../src/resume/designLab'
import { resumeDocxDocument } from '../src/resume/docx'

const resume = normalizeResume({
  contact: {
    name: 'Alex Example',
    email: 'alex@example.invalid',
    phone: '+49 30 555 0100',
    location: 'Berlin',
    links: [{ label: 'Portfolio', url: 'https://example.invalid/alex' }],
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
  education: [{
    degree: 'MSc',
    field: 'Industrial Engineering',
    institution: 'Example University',
    city: 'Berlin',
    start: '10/2021',
    end: '12/2023',
  }],
  skills: [{ group: 'Analysis', items: ['SQL', 'Power BI', 'Excel'] }],
  languages: [{ lang: 'German', level: 'B2' }, { lang: 'English', level: 'C1' }],
  projects: [{
    name: 'Demand dashboard',
    summary: 'Planning prototype',
    tech: ['SQL'],
    link: 'https://example.invalid/dashboard',
  }],
  certifications: [{ name: 'Analytics Certificate', issuer: 'Example Institute', issued: '06/2025' }],
})

for (const preset of RESUME_LAB_PRESETS) {
  const bytes = new Uint8Array(await Packer.toBuffer(resumeLabDocument(resume, 'en', preset.id)))
  assert.ok(bytes.length > 1_000, `${preset.id}: produces a real DOCX`)
  const preview = parsePackedResumeDocx(bytes)
  assert.equal(preview.tableCount, 0, `${preset.id}: no tables`)
  assert.equal(preview.drawingCount, 0, `${preset.id}: no drawings`)
  assert.equal(preview.textBoxCount, 0, `${preset.id}: no text boxes`)
  assert.ok(
    preview.sections.some((section) => section.toUpperCase() === 'EXPERIENCE'),
    `${preset.id}: semantic section order`,
  )
  assert.equal(preview.roleAssociations.length, 1, `${preset.id}: role/date association`)
  assert.equal(preview.roleAssociations[0].employerCandidate, 'Example GmbH')
  assert.match(preview.text, /Built weekly reporting/, `${preset.id}: evidence preserved`)
  assert.ok(preview.checks.every((check) => check.ok), `${preset.id}: structural checks pass`)
  const grounded = await parseResumeLabDocument(resume, 'en', preset.id)
  const fidelity = grounded.checks.find((check) => check.id === 'evidence-fidelity')
  if (preset.id === 'current') {
    assert.equal(fidelity?.ok, false, 'the production baseline honestly reports its known omission')
    assert.match(fidelity?.detail ?? '', /^1 source evidence string\(s\) missing$/)
  } else {
    assert.equal(fidelity?.ok, true, `${preset.id}: every source evidence string remains extractable`)
  }
}

const productionBytes = new Uint8Array(
  await Packer.toBuffer(resumeDocxDocument(resume, 'en')),
)
const currentControlBytes = new Uint8Array(
  await Packer.toBuffer(resumeLabDocument(resume, 'en', 'current')),
)
const productionPreview = parsePackedResumeDocx(productionBytes)
const currentControlPreview = parsePackedResumeDocx(currentControlBytes)
assert.equal(currentControlPreview.text, productionPreview.text)
assert.deepEqual(currentControlPreview.sections, productionPreview.sections)
assert.equal(currentControlPreview.paragraphCount, productionPreview.paragraphCount)
assert.doesNotMatch(currentControlPreview.text, /Portfolio/)
assert.match(currentControlPreview.text, /Example Institute/)
assert.match(currentControlPreview.text, /06\/2025/)

db.close()
await db.delete()
await db.open()
const prerequisites = {
  recruiterReviewComplete: false,
  candidateReviewComplete: false,
  parseAndRenderPass: true,
  evidenceFidelityPass: true,
  provenanceRecorded: true,
}
await assert.rejects(
  () => saveResumeLabDecision({
    decision: 'sample_a_base',
    allowedVariants: ['data', 'classic'],
    defaultStatus: 'eligible_for_v28',
    prerequisites,
    note: 'Human review is still incomplete.',
  }),
  /every study prerequisite/,
)
const completedPrerequisites = Object.fromEntries(
  Object.keys(prerequisites).map((key) => [key, true]),
) as typeof prerequisites
await setSetting('resumeDesignLabDecision.v26', {
  decision: 'pending',
  allowedVariants: ['data'],
  defaultStatus: 'eligible_for_v28',
  prerequisites: completedPrerequisites,
  note: 'Invalid historical row.',
  recordedAt: '2026-08-01T00:00:00.000Z',
})
assert.equal(
  (await loadResumeLabDecision()).defaultStatus,
  'hold',
  'an incoherent previously stored eligible row is rejected on read',
)
await assert.rejects(
  () => saveResumeLabDecision({
    decision: 'pending',
    allowedVariants: ['data'],
    defaultStatus: 'eligible_for_v28',
    prerequisites: completedPrerequisites,
    note: 'No base design was selected.',
  }),
  /non-pending base design/,
)
await assert.rejects(
  () => saveResumeLabDecision({
    decision: 'classic_base',
    allowedVariants: ['data'],
    defaultStatus: 'eligible_for_v28',
    prerequisites: completedPrerequisites,
    note: 'The selected base is absent from the allowed list.',
  }),
  /included in the allowed variants/,
)
const eligible = await saveResumeLabDecision({
  decision: 'retain_current',
  allowedVariants: ['current', 'data'],
  defaultStatus: 'eligible_for_v28',
  prerequisites: completedPrerequisites,
  note: 'All study evidence is complete; retain the control as the base.',
})
assert.equal(eligible.defaultStatus, 'eligible_for_v28')
assert.ok(eligible.allowedVariants.includes('current'))
await saveResumeLabDecision({
  decision: 'pending',
  allowedVariants: ['data', 'classic'],
  defaultStatus: 'hold',
  prerequisites,
  note: 'Waiting for two blinded human review groups.',
})
const stored = await loadResumeLabDecision()
assert.equal(stored.defaultStatus, 'hold')
assert.deepEqual(stored.allowedVariants, ['data', 'classic'])
assert.equal(stored.prerequisites.recruiterReviewComplete, false)

console.log('v26-resume-design-lab.test.ts: all tests passed')