// ============================================================================
// Render a (tailored) ResumeData into an ATS-safe DOCX (feature 12).
//
// Follows the Appendix-A "Klar Standard" rules: SINGLE COLUMN, no tables /
// columns / text boxes / images, contact details as plain text in the BODY
// (never a header/footer — parsers skip those), real round bullets, consistent
// MM/YYYY dates, Calibri 11pt body / 12–13pt bold headings, ~1.5cm margins.
//
// `resumeDocxDocument` returns a `docx` Document (used by the parse-safety test
// via Packer.toBuffer); `downloadResumeDocx` packs it to a Blob and downloads it
// in the browser. Both render the SAME content.
// ============================================================================
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat, convertMillimetersToTwip,
} from 'docx'
import type { ResumeData, ResumeLanguage } from './types'
import { SECTION_HEADINGS, formatDateRange } from './types'

const BODY_FONT = 'Calibri'
const BODY_SIZE = 22 // 11pt (half-points)
const NAME_SIZE = 32 // 16pt
const HEADING_SIZE = 26 // 13pt

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, bold: true, size: HEADING_SIZE, font: BODY_FONT })],
  })
}
function line(text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 20 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? BODY_SIZE, font: BODY_FONT })],
  })
}
function bullet(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: 'klar-bullets', level: 0 },
    spacing: { after: 20 },
    children: [new TextRun({ text, size: BODY_SIZE, font: BODY_FONT })],
  })
}

/** Build the docx Document for a (tailored) résumé in the given language. */
export function resumeDocxDocument(data: ResumeData, lang: ResumeLanguage): Document {
  const H = SECTION_HEADINGS[lang]
  const children: Paragraph[] = []

  // --- Contact (plain text, in the body) -------------------------------------
  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: data.contact.name, bold: true, size: NAME_SIZE, font: BODY_FONT })],
  }))
  const contactBits = [
    data.contact.location, data.contact.email, data.contact.phone,
    ...data.contact.links.map((l) => l.url),
  ].filter(Boolean) as string[]
  if (contactBits.length) children.push(line(contactBits.join('  ·  ')))

  // --- Summary / Kurzprofil --------------------------------------------------
  if (data.summary) {
    children.push(heading(H.summary))
    children.push(line(data.summary))
  }

  // --- Experience ------------------------------------------------------------
  if (data.experience.length) {
    children.push(heading(H.experience))
    for (const e of data.experience) {
      const head = [e.title, e.company, e.city].filter(Boolean).join(' — ')
      children.push(line(head, { bold: true }))
      const range = formatDateRange(e.start, e.end, e.current, lang)
      if (range) children.push(line(range, { italics: true }))
      for (const b of e.bullets) children.push(bullet(b))
    }
  }

  // --- Education -------------------------------------------------------------
  if (data.education.length) {
    children.push(heading(H.education))
    for (const ed of data.education) {
      const main = [ed.degree, ed.field].filter(Boolean).join(', ')
      const inst = [ed.institution, ed.city].filter(Boolean).join(', ')
      children.push(line([main, inst].filter(Boolean).join(' — '), { bold: true }))
      const range = formatDateRange(ed.start, ed.end, false, lang)
      if (range) children.push(line(range, { italics: true }))
    }
  }

  // --- Skills (grouped, comma lists — no bars) --------------------------------
  if (data.skills.length) {
    children.push(heading(H.skills))
    for (const g of data.skills) {
      children.push(line(`${g.group ? g.group + ': ' : ''}${g.items.join(', ')}`))
    }
  }

  // --- Languages -------------------------------------------------------------
  if (data.languages.length) {
    children.push(heading(H.languages))
    children.push(line(data.languages.map((l) => `${l.lang}${l.level ? ` — ${l.level}` : ''}`).join('  ·  ')))
  }

  // --- Projects --------------------------------------------------------------
  if (data.projects.length) {
    children.push(heading(H.projects))
    for (const p of data.projects) {
      const t = `${p.name}${p.summary ? ` — ${p.summary}` : ''}`
      children.push(line(t, { bold: true }))
      const meta = [p.tech?.length ? p.tech.join(', ') : '', p.link ?? ''].filter(Boolean).join('  ·  ')
      if (meta) children.push(line(meta))
    }
  }

  // --- Certifications --------------------------------------------------------
  if (data.certifications.length) {
    children.push(heading(H.certifications))
    children.push(line(data.certifications.join(', ')))
  }

  return new Document({
    creator: 'Klar',
    title: `${data.contact.name} — CV`,
    styles: {
      default: { document: { run: { font: BODY_FONT, size: BODY_SIZE } } },
    },
    numbering: {
      config: [{
        reference: 'klar-bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022', // real round bullet •
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: convertMillimetersToTwip(6), hanging: convertMillimetersToTwip(4) } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertMillimetersToTwip(18), right: convertMillimetersToTwip(18),
            bottom: convertMillimetersToTwip(18), left: convertMillimetersToTwip(18),
          },
        },
      },
      children,
    }],
  })
}

/** Browser: pack the résumé to a .docx Blob. */
export async function resumeToDocxBlob(data: ResumeData, lang: ResumeLanguage): Promise<Blob> {
  return Packer.toBlob(resumeDocxDocument(data, lang))
}

/** Browser: generate and download the tailored résumé as a .docx file. */
export async function downloadResumeDocx(
  data: ResumeData,
  lang: ResumeLanguage,
  filename: string,
): Promise<void> {
  const blob = await resumeToDocxBlob(data, lang)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}