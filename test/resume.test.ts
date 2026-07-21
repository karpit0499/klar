// Run with: npx tsx test/resume.test.ts
// Covers the tailored-résumé generator (feature 12): deterministic tailoring,
// the parse self-check, and a REAL DOCX parse-safety check (generate → unzip →
// confirm section order + content survive as clean linear text).
import { Packer } from 'docx'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  tailorResume, tailorSkills, tailorBullets, pickLanguage, resumeToPlainText,
} from '../src/resume/tailor.ts'
import { coerceResumeData, buildResumeExtractionPrompt } from '../src/resume/extract.ts'
import { resumeDocxDocument } from '../src/resume/docx.ts'
import { makeJob } from '../src/sources/normalize.ts'
import type { ResumeData } from '../src/resume/types.ts'
import type { NormalizedJob, Profile } from '../src/types.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

const resume: ResumeData = {
  contact: { name: 'Kace Doe', email: 'kace@example.com', phone: '+49 30 1234',
    location: 'Berlin, Deutschland', links: [{ label: 'GitHub', url: 'https://github.com/karpit0499' }] },
  summary: 'Data scientist.',
  experience: [
    { title: 'Data Scientist', company: 'Acme', city: 'Berlin', start: '03/2021', current: true,
      bullets: [
        'Built dashboards in Tableau for the sales team.',
        'Shipped ML models in Python with TensorFlow, cutting churn 12%.',
        'Ran Kubernetes-based training pipelines on GCP.',
      ] },
    { title: 'Analyst', company: 'BetaCorp', city: 'Munich', start: '01/2019', end: '02/2021',
      bullets: ['Wrote SQL reports.', 'Automated ETL with Airflow.'] },
  ],
  education: [{ degree: 'M.Sc.', field: 'Data Science', institution: 'TU Berlin', city: 'Berlin', start: '10/2016', end: '09/2018' }],
  skills: [
    { group: 'Programming', items: ['Java', 'Python', 'SQL'] },
    { group: 'Cloud', items: ['GCP', 'BigQuery', 'Kubernetes'] },
    { group: 'Viz', items: ['Tableau'] },
  ],
  languages: [{ lang: 'German', level: 'C1' }, { lang: 'English', level: 'Native' }],
  projects: [{ name: 'reco-engine', summary: 'Recommender', tech: ['TensorFlow', 'BigQuery'], link: 'https://x' }],
  certifications: ['GCP Professional ML Engineer'],
}
const profile: Profile = {
  summary: 'DS', titles: [{ title: 'Data Scientist' }],
  skills: [{ name: 'Python' }, { name: 'SQL' }, { name: 'Kubernetes' }, { name: 'GCP' }, { name: 'BigQuery' }, { name: 'TensorFlow' }],
  domains: ['ML'], totalYears: 5, education: [], languages: [], certifications: [], rawText: 'Python SQL Kubernetes GCP',
}
function jd(desc: string, title = 'ML Engineer', lang?: string): NormalizedJob {
  return makeJob({ source: 'greenhouse', source_id: desc, title, company: 'C',
    location: { country: 'DE', remote: false, city: 'Berlin' }, description: desc, url: 'https://x', language: lang })
}

// ---- language pick ---------------------------------------------------------
ok(pickLanguage(jd('...', 'ML', 'de')) === 'de', 'lang: honors posting language de')
ok(pickLanguage(jd('...', 'ML', 'en')) === 'en', 'lang: honors posting language en')
ok(pickLanguage(jd('Wir suchen einen Data Scientist. Deine Aufgaben und Kenntnisse.')) === 'de', 'lang: sniffs German text')
ok(pickLanguage(jd('We are looking for a data scientist to join us.')) === 'en', 'lang: sniffs English text')

// ---- tailorSkills: JD-relevant groups + items lead -------------------------
{
  const jdTerms = ['Kubernetes', 'GCP', 'Python']
  const out = tailorSkills(resume.skills, jdTerms)
  ok(out[0].group === 'Cloud', 'tailor: group with most JD hits floats to top')
  ok(out.find((g) => g.group === 'Programming')!.items[0] === 'Python', 'tailor: JD item leads within its group')
}

// ---- tailorBullets: JD-mentioning bullets lead -----------------------------
{
  const out = tailorBullets(resume.experience[0].bullets, ['Kubernetes', 'TensorFlow'])
  ok(/Kubernetes|TensorFlow/.test(out[0]), 'tailor: a JD-relevant bullet leads')
  ok(out.length === 3, 'tailor: no bullets lost in reordering')
}

// ---- tailorResume end-to-end -----------------------------------------------
{
  const t = tailorResume(resume, jd('Seeking ML Engineer: Python, Kubernetes, GCP, BigQuery, TensorFlow.', 'ML Engineer', 'en'), profile)
  ok(t.language === 'en', 'e2e: language chosen')
  ok(t.data.skills[0].group === 'Cloud' || t.data.skills[0].items.includes('Python'), 'e2e: skills reordered toward JD')
  ok(t.coverage.covered.length > 0, 'e2e: coverage attached')
  ok(t.data.experience.length === resume.experience.length, 'e2e: no experience dropped')
  ok(!!t.data.summary && /Kace|Data Scientist|focus/.test(t.data.summary), 'e2e: tailored summary built from facts')
  // No fabrication: every skill in the output existed in the input.
  const inputSkills = new Set(resume.skills.flatMap((g) => g.items.map((s) => s.toLowerCase())))
  const outputSkills = t.data.skills.flatMap((g) => g.items.map((s) => s.toLowerCase()))
  ok(outputSkills.every((s) => inputSkills.has(s)), 'e2e: no skill fabricated (output ⊆ input)')
}

// ---- parse self-check (plain text) -----------------------------------------
{
  const t = tailorResume(resume, jd('Python, Kubernetes', 'ML', 'en'), profile)
  const text = resumeToPlainText(t.data, t.language)
  const idxExp = text.indexOf('Experience')
  const idxEdu = text.indexOf('Education')
  const idxSkills = text.indexOf('Skills')
  ok(idxExp > 0 && idxEdu > idxExp && idxSkills > idxEdu, 'parse: canonical section order preserved (Exp→Edu→Skills)')
  ok(text.includes('Kace Doe') && text.includes('kace@example.com'), 'parse: contact survives as plain text')
  ok(text.includes('• '), 'parse: bullets survive as real bullet lines')
}

// ---- extraction prompt + coercion ------------------------------------------
{
  const prompt = buildResumeExtractionPrompt('Kace, Data Scientist, Python, TU Berlin')
  ok(/MM\/YYYY/.test(prompt) && /do not guess/i.test(prompt), 'extract: prompt pins MM/YYYY + no-fabrication')
  const coerced = coerceResumeData({ contact: { name: 'X' }, experience: [{ title: 'T', company: 'C', bullets: ['b'] }] } as any)
  ok(coerced.contact.name === 'X' && coerced.skills.length === 0 && coerced.certifications.length === 0, 'extract: coercion fills missing arrays')
  const empty = coerceResumeData({} as any)
  ok(empty.contact.name === '' && empty.experience.length === 0, 'extract: empty input → safe empty ResumeData')
}

// ---- REAL DOCX PARSE-SAFETY CHECK ------------------------------------------
async function docxCheck() {
  const t = tailorResume(resume, jd('Python, Kubernetes, GCP, BigQuery, TensorFlow', 'ML', 'en'), profile)
  const buf = await Packer.toBuffer(resumeDocxDocument(t.data, t.language))
  const dir = mkdtempSync(join(tmpdir(), 'klar-docx-'))
  const file = join(dir, 'cv.docx')
  writeFileSync(file, buf)
  // Extract the document's text as an ATS would read it (linearized).
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml']).toString()
  const text = xml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  ok(buf.length > 2000, 'docx: produces a non-trivial file')
  ok(text.includes('Kace Doe'), 'docx: name present in body text')
  ok(text.includes('kace@example.com'), 'docx: email present in BODY (not header/footer)')
  ok(text.includes('Experience') && text.includes('Education') && text.includes('Skills'), 'docx: all sections present')
  const iExp = text.indexOf('Experience'), iEdu = text.indexOf('Education'), iSk = text.indexOf('Skills')
  ok(iExp < iEdu && iEdu < iSk, 'docx: sections survive in canonical order')
  ok(text.includes('Data Scientist') && text.includes('Acme'), 'docx: experience content survives')
  // ATS-safety: the document.xml must contain NO table elements.
  ok(!/<w:tbl[ >]/.test(xml), 'docx: contains NO tables (parse-safe)')

  console.log(`\nRésumé tests: ${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
docxCheck().catch((e) => { console.error(e); process.exit(1) })