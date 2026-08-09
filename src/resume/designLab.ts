import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  convertMillimetersToTwip,
} from 'docx'
import { strFromU8, unzipSync } from 'fflate'
import type { ResumeData, ResumeLanguage } from './types'
import { PRESENT_LABEL, SECTION_HEADINGS, formatDateRange } from './types'
import { resumeDocxDocument } from './docx'
import { triggerBlobDownload } from '../export/download'
import { wordSafeStyles } from '../export/wordCompatibility'
import { getSetting, setSetting } from '../db/db'

export type ResumeLabPreset = 'current' | 'data' | 'classic' | 'editorial'
export type ResumeLabDecision =
  | 'pending'
  | 'sample_a_base'
  | 'classic_base'
  | 'editorial_base'
  | 'retain_current'

export type ResumeLabParsePreview = {
  text: string
  sections: string[]
  roleAssociations: {
    roleLine: string
    dateLine: string
    employerCandidate: string
  }[]
  paragraphCount: number
  tableCount: number
  drawingCount: number
  textBoxCount: number
  checks: { id: string; ok: boolean; detail: string }[]
}

export type ResumeLabDecisionRow = {
  decision: ResumeLabDecision
  allowedVariants: ResumeLabPreset[]
  defaultStatus: 'hold' | 'eligible_for_v28'
  prerequisites: {
    recruiterReviewComplete: boolean
    candidateReviewComplete: boolean
    parseAndRenderPass: boolean
    evidenceFidelityPass: boolean
    provenanceRecorded: boolean
  }
  note: string
  recordedAt: string
}

export const RESUME_LAB_INTENTIONALLY_EXCLUDED_FIELDS = Object.freeze([
  'schemaVersion',
  'stable record IDs',
  'evidenceRefs',
  'evidence ledger metadata',
  'reviewedAt',
])

export const RESUME_LAB_PRESETS: {
  id: ResumeLabPreset
  name: string
  researchSource: string
  intent: string
}[] = [
  {
    id: 'current',
    name: 'Current Klar',
    researchSource: 'v2.5.5 production baseline',
    intent: 'The existing conservative ATS-safe layout used as the control.',
  },
  {
    id: 'data',
    name: 'Data & analytics',
    researchSource: 'Sample A — anonymized code reconstruction',
    intent: 'Compact one-page component and spacing baseline with a restrained blue accent.',
  },
  {
    id: 'classic',
    name: 'Classic German',
    researchSource: 'Sample B — anonymized code reconstruction',
    intent: 'Dense reverse-chronological structure designed to remain readable across two pages.',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    researchSource: 'Sample C — anonymized code reconstruction',
    intent: 'Profile-forward one-page treatment with a restrained burgundy accent.',
  },
]

type PresetStyle = {
  font: string
  bodySize: number
  nameSize: number
  headingSize: number
  accent: string
  marginMm: number
  paragraphAfter: number
  headingBefore: number
  summaryAccent: boolean
}

const STYLES: Record<Exclude<ResumeLabPreset, 'current'>, PresetStyle> = {
  data: {
    font: 'Arial',
    bodySize: 20,
    nameSize: 58,
    headingSize: 21,
    accent: '1D4ED8',
    marginMm: 14,
    paragraphAfter: 18,
    headingBefore: 150,
    summaryAccent: false,
  },
  classic: {
    font: 'Arial',
    bodySize: 21,
    nameSize: 54,
    headingSize: 22,
    accent: '26384A',
    marginMm: 16,
    paragraphAfter: 24,
    headingBefore: 180,
    summaryAccent: false,
  },
  editorial: {
    font: 'Arial',
    bodySize: 20,
    nameSize: 58,
    headingSize: 21,
    accent: '7A263A',
    marginMm: 14,
    paragraphAfter: 18,
    headingBefore: 150,
    summaryAccent: true,
  },
}

export function resumeLabDocument(
  data: ResumeData,
  lang: ResumeLanguage,
  preset: ResumeLabPreset,
): Document {
  if (preset === 'current') return resumeDocxDocument(data, lang)
  const style = STYLES[preset]
  const headings = SECTION_HEADINGS[lang]
  const children: Paragraph[] = []
  const line = (
    text: string,
    options: {
      bold?: boolean
      italics?: boolean
      color?: string
      after?: number
      keepNext?: boolean
    } = {},
  ) => new Paragraph({
    spacing: { after: options.after ?? style.paragraphAfter },
    keepNext: options.keepNext,
    keepLines: true,
    children: [new TextRun({
      text,
      bold: options.bold,
      italics: options.italics,
      color: options.color,
      size: style.bodySize,
      font: style.font,
    })],
  })
  const heading = (text: string) => new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: style.headingBefore, after: 50 },
    keepNext: true,
    border: { bottom: { color: style.accent, size: 6, space: 3, style: BorderStyle.SINGLE } },
    children: [new TextRun({
      text: text.toUpperCase(),
      bold: true,
      color: style.accent,
      size: style.headingSize,
      font: style.font,
    })],
  })
  const bullet = (text: string, keepNext = false) => new Paragraph({
    numbering: { reference: `klar-lab-${preset}`, level: 0 },
    spacing: { after: style.paragraphAfter },
    keepNext,
    keepLines: true,
    children: [new TextRun({ text, size: style.bodySize, font: style.font })],
  })

  children.push(new Paragraph({
    spacing: { after: 24 },
    children: [new TextRun({
      text: data.contact.name,
      bold: true,
      color: style.accent,
      size: style.nameSize,
      font: style.font,
    })],
  }))
  const contact = [
    data.contact.location,
    data.contact.email,
    data.contact.phone,
    ...data.contact.links.map((item) => `${item.label}: ${item.url}`),
  ].filter(Boolean) as string[]
  if (contact.length) children.push(line(contact.join('  ·  '), { color: '4B5563', after: 60 }))

  if (data.summary) {
    children.push(heading(headings.summary))
    children.push(line(data.summary, {
      bold: style.summaryAccent,
      color: style.summaryAccent ? style.accent : undefined,
      after: 50,
    }))
  }
  if (data.experience.length) {
    children.push(heading(headings.experience))
    for (const role of data.experience) {
      children.push(line(
        [role.title, role.company, role.city].filter(Boolean).join(' — '),
        { bold: true, after: 8, keepNext: true },
      ))
      const dates = formatDateRange(role.start, role.end, role.current, lang)
      if (dates) {
        children.push(line(dates, {
          italics: true,
          color: '4B5563',
          after: 15,
          keepNext: role.bullets.length > 0,
        }))
      }
      for (const [index, item] of role.bullets.entries()) {
        children.push(bullet(item.text, index < role.bullets.length - 1))
      }
    }
  }
  if (data.projects.length) {
    children.push(heading(headings.projects))
    for (const project of data.projects) {
      children.push(line(
        `${project.name}${project.summary ? ` — ${project.summary}` : ''}`,
        { bold: true, keepNext: Boolean(project.tech?.length || project.link) },
      ))
      const meta = [project.tech?.join(', '), project.link].filter(Boolean).join(' · ')
      if (meta) children.push(line(meta, { color: '4B5563' }))
    }
  }
  if (data.education.length) {
    children.push(heading(headings.education))
    for (const education of data.education) {
      const qualification = [education.degree, education.field].filter(Boolean).join(', ')
      const institution = [education.institution, education.city].filter(Boolean).join(', ')
      children.push(line([qualification, institution].filter(Boolean).join(' — '), {
        bold: true,
        after: 8,
        keepNext: Boolean(education.start || education.end),
      }))
      const dates = formatDateRange(education.start, education.end, false, lang)
      if (dates) children.push(line(dates, { italics: true, color: '4B5563' }))
    }
  }
  if (data.skills.length) {
    children.push(heading(headings.skills))
    for (const group of data.skills) {
      children.push(line(
        `${group.group ? `${group.group}: ` : ''}${group.items.map((item) => item.name).join(', ')}`,
      ))
    }
  }
  if (data.languages.length) {
    children.push(heading(headings.languages))
    children.push(line(data.languages
      .map((item) => `${item.lang}${item.level ? ` — ${item.level}` : ''}`)
      .join(' · ')))
  }
  if (data.certifications.length) {
    children.push(heading(headings.certifications))
    for (const certification of data.certifications) {
      children.push(line([
        certification.name,
        certification.issuer,
        certification.issued,
      ].filter(Boolean).join(' — ')))
    }
  }

  return new Document({
    creator: 'Klar résumé design lab',
    title: `${data.contact.name} — ${preset} résumé lab`,
    description: 'Internal v2.6 evaluation output. Not the production default.',
    styles: wordSafeStyles({ font: style.font, size: style.bodySize }),
    numbering: {
      config: [{
        reference: `klar-lab-${preset}`,
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: {
                left: convertMillimetersToTwip(5),
                hanging: convertMillimetersToTwip(3),
              },
            },
          },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertMillimetersToTwip(style.marginMm),
            right: convertMillimetersToTwip(style.marginMm),
            bottom: convertMillimetersToTwip(style.marginMm),
            left: convertMillimetersToTwip(style.marginMm),
          },
        },
      },
      children,
    }],
  })
}

export async function parseResumeLabDocument(
  data: ResumeData,
  lang: ResumeLanguage,
  preset: ResumeLabPreset,
): Promise<ResumeLabParsePreview> {
  // `toBuffer()` asks JSZip for its Node-only `nodebuffer` output and therefore
  // fails in the real browser surface. The lab is browser UI, so build the same
  // package as a Blob and inspect its bytes through the standard Web API.
  const blob = await Packer.toBlob(resumeLabDocument(data, lang, preset))
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const preview = parsePackedResumeDocx(bytes)
  const normalizedOutput = normalizeComparisonText(preview.text)
  const expectedEvidence = [
    data.contact.name,
    data.contact.location,
    data.contact.email,
    data.contact.phone,
    ...data.contact.links.flatMap((link) => [link.label, link.url]),
    data.summary,
    ...data.experience.flatMap((role) => [
      role.title,
      role.company,
      role.city,
      role.start,
      role.current ? PRESENT_LABEL[lang] : role.end,
      ...role.bullets.map((bullet) => bullet.text),
    ]),
    ...data.education.flatMap((education) => [
      education.degree,
      education.field,
      education.institution,
      education.city,
      education.start,
      education.end,
    ]),
    ...data.skills.flatMap((group) => [
      group.group,
      ...group.items.map((item) => item.name),
    ]),
    ...data.projects.flatMap((project) => [
      project.name,
      project.summary,
      ...(project.tech ?? []),
      project.link,
    ]),
    ...data.certifications.flatMap((certification) => [
      certification.name,
      certification.issuer,
      certification.issued,
    ]),
    ...data.languages.flatMap((language) => [language.lang, language.level]),
  ].filter((value): value is string => Boolean(value?.trim()))
  const missingEvidence = expectedEvidence.filter((value) =>
    !normalizedOutput.includes(normalizeComparisonText(value)),
  )
  return {
    ...preview,
    checks: [
      ...preview.checks,
      {
        id: 'evidence-fidelity',
        ok: missingEvidence.length === 0,
        detail: missingEvidence.length === 0
          ? `Every user-visible source field remains extractable; intentionally excluded technical fields: ${RESUME_LAB_INTENTIONALLY_EXCLUDED_FIELDS.join(', ')}`
          : `${missingEvidence.length} source evidence string(s) missing`,
      },
    ],
  }
}

export function parsePackedResumeDocx(bytes: Uint8Array): ResumeLabParsePreview {
  const archive = unzipSync(bytes)
  const xml = archive['word/document.xml']
  if (!xml) throw new Error('The generated DOCX has no word/document.xml.')
  const documentXml = strFromU8(xml)
  const paragraphs = [...documentXml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)]
    .map((match) => match[1])
  const productionHeadings = new Set(
    Object.values(SECTION_HEADINGS)
      .flatMap((headings) => Object.values(headings))
      .map(normalizeComparisonText),
  )
  const paragraphRows = paragraphs.map((paragraph) => {
    const text = extractParagraphText(paragraph).trim()
    const headingOne = /<w:pStyle\b[^>]*w:val="Heading1"/i.test(paragraph)
    const productionHeading = (
      productionHeadings.has(normalizeComparisonText(text))
      && /<w:b\b/i.test(paragraph)
    )
    return { text, heading: headingOne || productionHeading }
  })
  const textLines = paragraphRows.map((row) => row.text).filter(Boolean)
  const sections = paragraphRows.filter((row) => row.heading).map((row) => row.text)
  const roleAssociations = extractRoleAssociations(paragraphRows)
  const tableCount = countTags(documentXml, 'tbl')
  const drawingCount = countTags(documentXml, 'drawing')
  const textBoxCount = countTags(documentXml, 'txbxContent')
  return {
    text: textLines.join('\n'),
    sections,
    roleAssociations,
    paragraphCount: paragraphs.length,
    tableCount,
    drawingCount,
    textBoxCount,
    checks: [
      { id: 'single-column', ok: !/<w:cols\b[^>]*w:num="[2-9]"/i.test(documentXml), detail: 'Single-column document body' },
      { id: 'no-tables', ok: tableCount === 0, detail: 'No layout tables' },
      { id: 'no-drawings', ok: drawingCount === 0, detail: 'No images or drawing objects' },
      { id: 'no-text-boxes', ok: textBoxCount === 0, detail: 'No text boxes' },
      {
        id: 'semantic-headings',
        ok: sections.length > 0,
        detail: 'Recognized Heading 1 or production section markers',
      },
      { id: 'text-present', ok: textLines.length >= 3, detail: 'Readable body text in document order' },
      {
        id: 'date-employer-association',
        ok: !sections.some((section) => /EXPERIENCE|BERUFSERFAHRUNG/i.test(section))
          || roleAssociations.length > 0,
        detail: roleAssociations.length > 0
          ? `${roleAssociations.length} role/date association(s) found in reading order`
          : 'No experience role/date pair was required',
      },
    ],
  }
}

function extractRoleAssociations(
  paragraphs: { text: string; heading: boolean }[],
): ResumeLabParsePreview['roleAssociations'] {
  const result: ResumeLabParsePreview['roleAssociations'] = []
  let insideExperience = false
  let previousText = ''
  for (const paragraph of paragraphs) {
    if (paragraph.heading) {
      insideExperience = /EXPERIENCE|BERUFSERFAHRUNG/i.test(paragraph.text)
      previousText = ''
      continue
    }
    if (!insideExperience || !paragraph.text) continue
    if (
      previousText &&
      /(?:0[1-9]|1[0-2])\/\d{4}|\b(?:Present|heute)\b/i.test(paragraph.text)
    ) {
      const parts = previousText.split(/\s+(?:—|\|)\s+/)
      result.push({
        roleLine: previousText,
        dateLine: paragraph.text,
        employerCandidate: parts[1] ?? '',
      })
    }
    previousText = paragraph.text
  }
  return result
}

function normalizeComparisonText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractParagraphText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1]))
    .join('')
}

function countTags(xml: string, localName: string): number {
  return [...xml.matchAll(new RegExp(`<w:${localName}\\b`, 'g'))].length
}

function decodeXml(value: string): string {
  return value
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&/g, '&')
}

export async function downloadResumeLabDocument(
  data: ResumeData,
  lang: ResumeLanguage,
  preset: ResumeLabPreset,
): Promise<void> {
  const blob = await Packer.toBlob(resumeLabDocument(data, lang, preset))
  triggerBlobDownload(blob, `klar-resume-lab-${preset}-${lang}.docx`)
}

const DECISION_KEY = 'resumeDesignLabDecision.v26'

export async function loadResumeLabDecision(): Promise<ResumeLabDecisionRow> {
  const stored = await getSetting<ResumeLabDecisionRow>(DECISION_KEY)
  if (
    stored
    && ['pending', 'sample_a_base', 'classic_base', 'editorial_base', 'retain_current']
      .includes(stored.decision)
    && Array.isArray(stored.allowedVariants)
    && stored.allowedVariants.every((value) =>
      RESUME_LAB_PRESETS.some((preset) => preset.id === value))
    && (stored.defaultStatus === 'hold' || stored.defaultStatus === 'eligible_for_v28')
    && isDecisionPrerequisites(stored.prerequisites)
    && typeof stored.note === 'string'
    && typeof stored.recordedAt === 'string'
    && isCoherentResumeLabDecision(stored)
  ) {
    return stored
  }
  return {
    decision: 'pending',
    allowedVariants: [],
    defaultStatus: 'hold',
    prerequisites: {
      recruiterReviewComplete: false,
      candidateReviewComplete: false,
      parseAndRenderPass: false,
      evidenceFidelityPass: false,
      provenanceRecorded: false,
    },
    note: '',
    recordedAt: '',
  }
}

export async function saveResumeLabDecision(
  input: Omit<ResumeLabDecisionRow, 'recordedAt'>,
): Promise<ResumeLabDecisionRow> {
  const allowedVariants = [...new Set(input.allowedVariants)].filter((value) =>
    RESUME_LAB_PRESETS.some((preset) => preset.id === value))
  const allPrerequisitesPass = Object.values(input.prerequisites).every(Boolean)
  const selectedBase = selectedPresetForDecision(input.decision)
  if (input.defaultStatus === 'eligible_for_v28') {
    if (!allPrerequisitesPass) {
      throw new Error('A v2.8 default cannot become eligible until every study prerequisite passes.')
    }
    if (!selectedBase) {
      throw new Error('A v2.8-eligible decision must choose a non-pending base design.')
    }
    if (!allowedVariants.includes(selectedBase)) {
      throw new Error('The selected base design must also be included in the allowed variants.')
    }
  }
  const row = {
    decision: input.decision,
    allowedVariants,
    defaultStatus: input.defaultStatus,
    prerequisites: { ...input.prerequisites },
    note: input.note.trim().slice(0, 1_000),
    recordedAt: new Date().toISOString(),
  }
  await setSetting(DECISION_KEY, row)
  return row
}

export function selectedPresetForDecision(
  decision: ResumeLabDecision,
): ResumeLabPreset | null {
  if (decision === 'sample_a_base') return 'data'
  if (decision === 'classic_base') return 'classic'
  if (decision === 'editorial_base') return 'editorial'
  if (decision === 'retain_current') return 'current'
  return null
}

function isCoherentResumeLabDecision(
  row: Pick<ResumeLabDecisionRow, 'decision' | 'allowedVariants' | 'defaultStatus' | 'prerequisites'>,
): boolean {
  if (row.defaultStatus === 'hold') return true
  const selectedBase = selectedPresetForDecision(row.decision)
  return Boolean(
    selectedBase
    && row.allowedVariants.includes(selectedBase)
    && Object.values(row.prerequisites).every(Boolean),
  )
}

function isDecisionPrerequisites(
  value: unknown,
): value is ResumeLabDecisionRow['prerequisites'] {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return [
    'recruiterReviewComplete',
    'candidateReviewComplete',
    'parseAndRenderPass',
    'evidenceFidelityPass',
    'provenanceRecorded',
  ].every((key) => typeof row[key] === 'boolean')
}