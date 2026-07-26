// Run with: npx tsx test/resume.test.ts
// Covers the tailored-résumé generator (feature 12): deterministic tailoring,
// the parse self-check, and a REAL DOCX parse-safety check (generate → unzip →
// confirm section order + content survive as clean linear text).
//
// v2.5 (WS1) EXTENDS that check — it was already the strongest part of the
// export story, so the plan's job was to widen it, not replace it:
//   • it now runs for EVERY template variant (English and German headings), and
//   • it asserts COVERED-KEYWORD SURVIVAL: each term coverageReport() said the
//     résumé evidences must still be findable in the unzipped document text.
//     Section headings surviving is not enough; an ATS matches on the terms.
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
import { normalizeResume } from '../src/resume/canonical.ts'
import type { NormalizedJob, Profile } from '../src/types.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

const resume: ResumeData = normalizeResume({
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
})
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
  ok(out.find((g) => g.group === 'Programming')!.items[0].name === 'Python', 'tailor: JD item leads within its group')
}

// ---- tailorBullets: JD-mentioning bullets lead -----------------------------
{
  const out = tailorBullets(resume.experience[0].bullets, ['Kubernetes', 'TensorFlow'])
  ok(/Kubernetes|TensorFlow/.test(out[0].text), 'tailor: a JD-relevant bullet leads')
  ok(out.length === 3, 'tailor: no bullets lost in reordering')
}

// ---- tailorResume end-to-end -----------------------------------------------
{
  const t = tailorResume(resume, jd('Seeking ML Engineer: Python, Kubernetes, GCP, BigQuery, TensorFlow.', 'ML Engineer', 'en'), profile)
  ok(t.language === 'en', 'e2e: language chosen')
  ok(t.data.skills[0].group === 'Cloud' || t.data.skills[0].items.some((item) => item.name === 'Python'), 'e2e: skills reordered toward JD')
  ok(t.coverage.covered.length > 0, 'e2e: coverage attached')
  ok(t.data.experience.length === resume.experience.length, 'e2e: no experience dropped')
  ok(!!t.data.summary && /Kace|Data Scientist|focus/.test(t.data.summary), 'e2e: tailored summary built from facts')
  // No fabrication: every skill in the output existed in the input.
  const inputSkills = new Set(resume.skills.flatMap((g) => g.items.map((s) => s.name.toLowerCase())))
  const outputSkills = t.data.skills.flatMap((g) => g.items.map((s) => s.name.toLowerCase()))
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

// ---- REAL DOCX PARSE-SAFETY CHECK (every template variant) -----------------

/** Generate → write → unzip → linearize, exactly as an ATS would read it. */
async function docxText(data: ResumeData, lang: 'de' | 'en'): Promise<{ xml: string; text: string; bytes: number }> {
  const buf = await Packer.toBuffer(resumeDocxDocument(data, lang))
  const dir = mkdtempSync(join(tmpdir(), 'klar-docx-'))
  const file = join(dir, `cv-${lang}.docx`)
  writeFileSync(file, buf)
  const xml = execFileSync('unzip', ['-p', file, 'word/document.xml']).toString()
  const text = xml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return { xml, text, bytes: buf.length }
}

const VARIANTS = [
  {
    lang: 'en' as const,
    job: jd('Python, Kubernetes, GCP, BigQuery, TensorFlow', 'ML Engineer', 'en'),
    headings: ['Experience', 'Education', 'Skills'],
  },
  {
    lang: 'de' as const,
    job: jd(
      'Wir suchen eine Person mit Kenntnissen in Python, Kubernetes, GCP, BigQuery und TensorFlow. Deine Aufgaben und Erfahrung.',
      'ML Engineer',
      'de',
    ),
    headings: ['Berufserfahrung', 'Ausbildung', 'Kenntnisse'],
  },
]

async function docxCheck() {
  for (const variant of VARIANTS) {
    const t = tailorResume(resume, variant.job, profile)
    ok(t.language === variant.lang, `docx[${variant.lang}]: the variant renders in its own language`)
    const { xml, text, bytes } = await docxText(t.data, t.language)

    ok(bytes > 2000, `docx[${variant.lang}]: produces a non-trivial file`)
    ok(text.includes('Kace Doe'), `docx[${variant.lang}]: name present in body text`)
    ok(text.includes('kace@example.com'), `docx[${variant.lang}]: email present in BODY (not header/footer)`)
    ok(
      variant.headings.every((heading) => text.includes(heading)),
      `docx[${variant.lang}]: all sections present`,
    )
    const positions = variant.headings.map((heading) => text.indexOf(heading))
    ok(
      positions.every((position, index) => index === 0 || positions[index - 1] < position),
      `docx[${variant.lang}]: sections survive in canonical order`,
    )
    ok(
      text.includes('Data Scientist') && text.includes('Acme'),
      `docx[${variant.lang}]: experience content survives`,
    )
    // ATS-safety: the document.xml must contain NO table elements.
    ok(!/<w:tbl[ >]/.test(xml), `docx[${variant.lang}]: contains NO tables (parse-safe)`)

    // v2.5 (WS1): every term we CLAIM the résumé evidences must survive the
    // round-trip. Headings surviving is not enough — an ATS matches on terms.
    ok(t.coverage.covered.length > 0, `docx[${variant.lang}]: the fixture has covered terms to check`)
    const lost = t.coverage.covered.filter((term) => !text.toLowerCase().includes(term.toLowerCase()))
    ok(lost.length === 0, `docx[${variant.lang}]: every covered keyword survives (lost: ${lost.join(', ')})`)
  }

  console.log(`\nRésumé tests: ${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
docxCheck().catch((e) => { console.error(e); process.exit(1) })