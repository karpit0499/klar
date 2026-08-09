import { strict as assert } from 'node:assert'
import { Packer } from 'docx'
import { strFromU8, unzipSync } from 'fflate'
import { checkWordCompatibility } from '../qa/documents/check-word-compatibility.mjs'
import { normalizeResume } from '../src/resume/canonical'
import {
  resumeDocxDocument,
  resumeHasDocxUnsafeText,
  resumeToDocxBlob,
} from '../src/resume/docx'
import { resumeToHtml } from '../src/resume/pdf'
import {
  RESUME_TEMPLATE_COLORS,
  resumeAccent,
  resumeHeadline,
} from '../src/resume/template'

const resume = normalizeResume({
  contact: {
    name: 'Kumar Arpit',
    email: 'kumar@example.invalid',
    phone: '+49 30 555 0100',
    location: 'Berlin, Germany',
    links: [
      { label: 'GitHub', url: 'https://github.com/example/' },
      { label: 'LinkedIn', url: 'https://linkedin.com/in/example/' },
    ],
  },
  summary: 'Data Engineer with hands-on experience building reliable analytics pipelines.',
  experience: [{
    title: 'Account Management Executive',
    company: 'Example GmbH',
    city: 'Berlin',
    start: '10/2022',
    end: '12/2024',
    bullets: [
      'Connected campaign data to BigQuery for reliable reporting.',
      'Built SQL-based segmentation and API integrations.',
    ],
  }],
  projects: [{
    name: 'Operations dashboard',
    summary: 'Planning prototype',
    tech: ['SQL', 'BigQuery'],
    link: 'https://example.invalid/dashboard',
  }],
  education: [{
    degree: 'M.Sc.',
    field: 'Data Science',
    institution: 'Example University',
    city: 'Potsdam',
    start: '10/2024',
    end: '09/2026',
  }],
  skills: [{ group: 'Programming', items: ['Python', 'SQL'] }],
  languages: [{ lang: 'English', level: 'C1' }, { lang: 'German', level: 'B1' }],
  certifications: [{
    name: 'Analytics Certificate',
    issuer: 'Example Institute',
    issued: '06/2025',
  }],
})

assert.equal(
  resumeHeadline(resume),
  'Account Management Executive',
  'schema v2 uses a held role instead of claiming the target vacancy title',
)
assert.equal(resumeAccent(resume), RESUME_TEMPLATE_COLORS.data)
assert.equal(
  resumeAccent(normalizeResume({
    ...resume,
    summary: 'CRM marketer with lifecycle and campaign experience.',
    experience: [{ ...resume.experience[0], title: 'CRM Campaign Manager' }],
  })),
  RESUME_TEMPLATE_COLORS.data,
  'the hotfix does not silently infer a palette from CRM wording',
)
assert.equal(
  resumeAccent(normalizeResume({
    ...resume,
    summary: 'Projektingenieur mit Erfahrung in Fertigung und Automatisierung.',
    experience: [{ ...resume.experience[0], title: 'Industrial Engineer' }],
  })),
  RESUME_TEMPLATE_COLORS.data,
  'the hotfix does not silently infer a palette from industrial wording',
)

const bytes = new Uint8Array(await Packer.toBuffer(resumeDocxDocument(resume, 'en')))
const compatibility = checkWordCompatibility('v2.6.0.1-resume.docx', bytes)
assert.deepEqual(compatibility.errors, [])
assert.equal(compatibility.pass, true)

const archive = unzipSync(bytes)
const documentXml = strFromU8(archive['word/document.xml'])
const stylesXml = strFromU8(archive['word/styles.xml'])
const numberingXml = strFromU8(archive['word/numbering.xml'])
const text = [...documentXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  .map((match) => match[1]
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>'))
  .join(' ')

assert.match(stylesXml, /w:ascii="Arial"/)
assert.match(documentXml, /w:color w:val="2357A5"/)
assert.match(documentXml, /w:color w:val="18202A"/)
assert.match(documentXml, /w:color w:val="5C6673"/)
assert.match(documentXml, /w:color="DCE2E8"/)
assert.match(documentXml, /w:top="822"/)
assert.match(documentXml, /w:right="964"/)
assert.match(documentXml, /w:bottom="850"/)
assert.match(documentXml, /w:left="964"/)
assert.match(numberingXml, /w:left="450"/)
assert.match(numberingXml, /w:hanging="225"/)
assert.match(numberingXml, /w:color w:val="2357A5"/)
assert.doesNotMatch(documentXml, /<w:tbl[ >]/)
assert.doesNotMatch(documentXml, /<w:drawing[ >]/)
assert.doesNotMatch(documentXml, /<w:txbxContent[ >]/)

for (const expected of [
  'Kumar Arpit',
  'Account Management Executive',
  'github.com/example',
  'Data Engineer with hands-on experience',
  'Experience',
  'Selected Projects',
  'Education',
  'Certifications',
  'Example Institute',
  '06/2025',
  'Skills & Languages',
]) {
  assert.match(text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
assert.doesNotMatch(text, /\bSummary\b/)
assert.ok(text.indexOf('Experience') < text.indexOf('Selected Projects'))
assert.ok(text.indexOf('Selected Projects') < text.indexOf('Education'))
assert.ok(text.indexOf('Education') < text.indexOf('Skills & Languages'))

const html = resumeToHtml(resume, 'en')
assert.match(html, /font-family: Arial/)
assert.match(html, /--accent: #2357A5/)
assert.match(html, /<p class="headline">Account Management Executive<\/p>/)
assert.match(html, /<h2>Skills & Languages<\/h2>/)
assert.match(html, /@page \{ size: A4 portrait; margin: 14\.5mm 17mm 15mm; \}/)
assert.doesNotMatch(html, /<h2>Summary<\/h2>/)
assert.doesNotMatch(html, /<table|<canvas|<img/i)

const control = String.fromCharCode(0x1F)
const poisoned = normalizeResume({
  ...resume,
  education: [{ ...resume.education[0], city: `Potsdam${control}` }],
} as never)
assert.equal(resumeHasDocxUnsafeText(poisoned), true)
await assert.rejects(() => resumeToDocxBlob(poisoned, 'en'))

console.log('v2601-resume-template.test.ts: all tests passed')