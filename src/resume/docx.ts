// ============================================================================
// Render a (tailored) ResumeData into Klar's production cross-compatible DOCX.
//
// The format is reconstructed from the three approved v2.6 reference samples:
// A4, single column, Arial, compact role grouping, a restrained production
// accent, real Heading 1 paragraphs, real bullets, and no tables, columns,
// text boxes, images, headers, or footers. Contact details remain plain text in
// the document body so Word, LibreOffice, Google Docs, and ATS parsers read the
// same linear order.
// ============================================================================
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import type { ResumeData, ResumeLanguage } from './types'
import { triggerBlobDownload } from '../export/download'
import {
  assertDocxSafeText,
  hasDocxUnsafeText,
  wordSafeStyles,
} from '../export/wordCompatibility'
import {
  RESUME_TEMPLATE_COLORS,
  RESUME_TEMPLATE_HEADINGS,
  crossCompatibleDateRange,
  displayResumeUrl,
  resumeAccent,
  resumeHeadline,
} from './template'

const BODY_FONT = 'Arial'
const BODY_SIZE = 20 // 10 pt
const SUMMARY_SIZE = 21 // 10.5 pt
const NAME_SIZE = 47 // 23.5 pt
const HEADLINE_SIZE = 22 // 11 pt
const HEADING_SIZE = 21 // 10.5 pt
const META_SIZE = 18 // 9 pt

const normalRun = (
  text: string,
  options: {
    bold?: boolean
    italics?: boolean
    color?: string
    size?: number
  } = {},
): TextRun => new TextRun({
  text,
  bold: options.bold,
  italics: options.italics,
  color: options.color ?? RESUME_TEMPLATE_COLORS.ink,
  size: options.size ?? BODY_SIZE,
  font: BODY_FONT,
})

function sectionHeading(text: string, accent: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 140, after: 60 },
    keepNext: true,
    keepLines: true,
    border: {
      bottom: {
        color: RESUME_TEMPLATE_COLORS.rule,
        size: 4,
        space: 2,
        style: BorderStyle.SINGLE,
      },
    },
    children: [new TextRun({
      text,
      bold: true,
      allCaps: true,
      color: accent,
      size: HEADING_SIZE,
      font: BODY_FONT,
    })],
  })
}

function entryLine(primary: string, secondary = ''): Paragraph {
  const children = primary
    ? [
        normalRun(primary, { bold: true }),
        ...(secondary ? [normalRun(`  |  ${secondary}`)] : []),
      ]
    : [normalRun(secondary, { bold: true })]
  return new Paragraph({
    spacing: { before: 20, after: 10 },
    keepNext: true,
    keepLines: true,
    children,
  })
}

function metaLine(text: string, keepNext = false): Paragraph {
  return new Paragraph({
    spacing: { after: 30 },
    keepNext,
    keepLines: true,
    children: [normalRun(text, {
      bold: true,
      color: RESUME_TEMPLATE_COLORS.muted,
      size: META_SIZE,
    })],
  })
}

function bulletLine(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: 'klar-cross-compatible-bullets', level: 0 },
    spacing: { after: 44 },
    keepLines: true,
    children: [normalRun(text)],
  })
}

function labelledLine(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 26 },
    keepLines: true,
    children: label
      ? [normalRun(`${label}:`, { bold: true }), normalRun(` ${value}`)]
      : [normalRun(value)],
  })
}

/** Build the production DOCX for a tailored résumé in the requested language. */
export function resumeDocxDocument(data: ResumeData, lang: ResumeLanguage): Document {
  const accent = resumeAccent(data)
  const headings = RESUME_TEMPLATE_HEADINGS[lang]
  const children: Paragraph[] = []

  const headline = resumeHeadline(data)
  const primaryContact = [
    data.contact.location,
    data.contact.phone,
    data.contact.email,
  ].filter(Boolean).join('  |  ')
  const links = data.contact.links
    .map((link) => displayResumeUrl(link.url))
    .filter(Boolean)
    .join('  |  ')

  const headerRows: {
    text: string
    size: number
    bold: boolean
    color: string
    after: number
  }[] = [{
    text: data.contact.name,
    size: NAME_SIZE,
    bold: true,
    color: RESUME_TEMPLATE_COLORS.ink,
    after: 16,
  }]
  if (headline) {
    headerRows.push({
      text: headline,
      size: HEADLINE_SIZE,
      bold: true,
      color: accent,
      after: 60,
    })
  }
  if (primaryContact) {
    headerRows.push({
      text: primaryContact,
      size: META_SIZE,
      bold: false,
      color: RESUME_TEMPLATE_COLORS.muted,
      after: links ? 20 : 80,
    })
  }
  if (links) {
    headerRows.push({
      text: links,
      size: META_SIZE,
      bold: false,
      color: RESUME_TEMPLATE_COLORS.muted,
      after: 80,
    })
  }

  headerRows.forEach((row, index) => {
    const last = index === headerRows.length - 1
    children.push(new Paragraph({
      spacing: { after: row.after },
      keepNext: true,
      keepLines: true,
      border: last
        ? {
            bottom: {
              color: RESUME_TEMPLATE_COLORS.rule,
              size: 4,
              space: 3,
              style: BorderStyle.SINGLE,
            },
          }
        : undefined,
      children: [normalRun(row.text, {
        bold: row.bold,
        color: row.color,
        size: row.size,
      })],
    }))
  })

  // The approved samples use an unlabeled profile paragraph under the header.
  if (data.summary) {
    children.push(new Paragraph({
      spacing: { before: 40, after: 80 },
      keepLines: true,
      children: [normalRun(data.summary, { size: SUMMARY_SIZE })],
    }))
  }

  if (data.experience.length) {
    children.push(sectionHeading(headings.experience, accent))
    for (const role of data.experience) {
      children.push(entryLine(role.title, role.company))
      const range = crossCompatibleDateRange(
        role.start,
        role.end,
        role.current,
        lang,
      )
      const metadata = [role.city, range].filter(Boolean).join('  |  ')
      if (metadata) children.push(metaLine(metadata, role.bullets.length > 0))
      for (const item of role.bullets) children.push(bulletLine(item.text))
    }
  }

  if (data.projects.length) {
    children.push(sectionHeading(headings.projects, accent))
    for (const project of data.projects) {
      children.push(entryLine(project.name, project.summary))
      const metadata = [
        project.tech?.length ? project.tech.join(', ') : '',
        project.link ? displayResumeUrl(project.link) : '',
      ].filter(Boolean).join('  |  ')
      if (metadata) children.push(metaLine(metadata))
    }
  }

  if (data.education.length) {
    children.push(sectionHeading(headings.education, accent))
    for (const education of data.education) {
      const qualification = [education.degree, education.field]
        .filter(Boolean)
        .join(', ')
      const institution = [education.institution, education.city]
        .filter(Boolean)
        .join(', ')
      children.push(entryLine(qualification, institution))
      const range = crossCompatibleDateRange(
        education.start,
        education.end,
        false,
        lang,
      )
      if (range) children.push(metaLine(range))
    }
  }

  if (data.certifications.length) {
    children.push(sectionHeading(headings.certifications, accent))
    for (const certification of data.certifications) {
      children.push(entryLine(
        certification.name,
        [certification.issuer, certification.issued]
          .filter(Boolean)
          .join(', '),
      ))
    }
  }

  if (data.skills.length || data.languages.length) {
    children.push(sectionHeading(headings.skillsAndLanguages, accent))
    for (const group of data.skills) {
      children.push(labelledLine(
        group.group ?? '',
        group.items.map((item) => item.name).join(', '),
      ))
    }
    if (data.languages.length) {
      children.push(labelledLine(
        headings.languages,
        data.languages
          .map((item) => `${item.lang}${item.level ? ` ${item.level}` : ''}`)
          .join('  ·  '),
      ))
    }
  }

  return new Document({
    creator: 'Klar',
    title: `${data.contact.name} — CV`,
    description: 'Klar cross-compatible résumé template',
    styles: wordSafeStyles({ font: BODY_FONT, size: BODY_SIZE }),
    numbering: {
      config: [{
        reference: 'klar-cross-compatible-bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: {
                left: 450,
                hanging: 225,
              },
            },
            run: {
              color: accent,
              font: BODY_FONT,
              size: BODY_SIZE,
            },
          },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 822,
            right: 964,
            bottom: 850,
            left: 964,
          },
        },
      },
      children,
    }],
  })
}

/** Every string that can reach a w:t element in the production document. */
function resumeTextValues(data: ResumeData): (string | undefined)[] {
  return [
    data.contact.name,
    data.contact.location,
    data.contact.email,
    data.contact.phone,
    ...data.contact.links.map((link) => link.url),
    ...data.contact.links.map((link) => link.label),
    data.summary,
    ...data.experience.flatMap((role) => [
      role.title,
      role.company,
      role.city,
      role.start,
      role.end,
      ...role.bullets.map((bullet) => bullet.text),
    ]),
    ...data.education.flatMap((entry) => [
      entry.degree,
      entry.field,
      entry.institution,
      entry.city,
      entry.start,
      entry.end,
    ]),
    ...data.skills.flatMap((group) => [
      group.group,
      ...group.items.map((item) => item.name),
    ]),
    ...data.languages.map((entry) => entry.lang),
    ...data.languages.map((entry) => entry.level),
    ...data.projects.flatMap((project) => [
      project.name,
      project.summary,
      project.link,
      ...(project.tech ?? []),
    ]),
    ...data.certifications.flatMap((entry) => [
      entry.name,
      entry.issuer,
      entry.issued,
    ]),
  ]
}

/** True when this résumé would produce a DOCX Word cannot open. */
export function resumeHasDocxUnsafeText(data: ResumeData): boolean {
  return resumeTextValues(data).some(
    (value) => typeof value === 'string' && hasDocxUnsafeText(value),
  )
}

/** Browser: pack the résumé into a Word-compatible DOCX Blob. */
export async function resumeToDocxBlob(
  data: ResumeData,
  lang: ResumeLanguage,
): Promise<Blob> {
  assertDocxSafeText('This résumé', resumeTextValues(data))
  return Packer.toBlob(resumeDocxDocument(data, lang))
}

/** Browser: generate and download the tailored résumé as a DOCX file. */
export async function downloadResumeDocx(
  data: ResumeData,
  lang: ResumeLanguage,
  filename: string,
): Promise<void> {
  const blob = await resumeToDocxBlob(data, lang)
  triggerBlobDownload(blob, filename)
}