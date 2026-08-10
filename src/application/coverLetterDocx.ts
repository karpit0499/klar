import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  convertMillimetersToTwip,
} from 'docx'
import { strFromU8, unzipSync } from 'fflate'
import type { NormalizedJob } from '../types'
import type { ResumeData, ResumeLanguage } from '../resume/types'
import { triggerBlobDownload } from '../export/download'
import {
  WORD_SAFE_LINE,
  WORD_SAFE_LINE_RULE,
  wordSafeStyles,
} from '../export/wordCompatibility'
import {
  requireCurrentCoverLetterProvenance,
  type PacketArtifactProvenance,
} from '../packets/types'

export type LetterRecipient = {
  name?: string
  company: string
  addressLines: string[]
}

export type CoverLetterModel = {
  schemaVersion: 1
  language: ResumeLanguage
  sender: {
    name: string
    contactLines: string[]
  }
  recipient: LetterRecipient
  place: string
  dateIso: string
  subject: string
  greeting: string
  bodyParagraphs: string[]
  closing: string
  typedName: string
  enclosures: string[]
}

export type CoverLetterDetails = {
  recipientName?: string
  recipientAddress?: string
  place?: string
  dateIso?: string
}

export type CoverLetterDocumentCheck = {
  id:
    | 'required_fields'
    | 'blank_paragraphs'
    | 'placeholders'
    | 'unicode'
    | 'prompt_fragments'
    | 'body_greeting'
    | 'body_signoff'
    | 'body_header'
    | 'page_length'
    | 'single_column'
    | 'no_text_boxes'
    | 'selectable_text'
  ok: boolean
  severity: 'error' | 'warning'
  detail: string
}

export type CoverLetterDocxInspection = {
  text: string
  paragraphCount: number
  blankParagraphCount: number
  tableCount: number
  textBoxCount: number
  columnCount: number
  checks: CoverLetterDocumentCheck[]
}

/**
 * A formal German application uses "Sehr geehrte Frau …" or "Sehr geehrter
 * Herr …". The gendered article depends on the honorific, so fall back to the
 * neutral "Guten Tag" only when the recipient supplied no Herr/Frau prefix.
 */
function germanSalutation(name: string): string {
  const normalized = name.trim().toLowerCase()
  if (/^frau\b/.test(normalized)) return 'Sehr geehrte'
  if (/^herr\b/.test(normalized)) return 'Sehr geehrter'
  return 'Guten Tag'
}

const BODY_FONT = 'Arial'
const BODY_SIZE = 22
const SMALL_SIZE = 19
const SUBJECT_SIZE = 23
const MAXIMUM_TWO_PAGE_WORDS = 1_000

/** Browser-local calendar date; UTC formatting can cross a day near midnight. */
export function localCalendarDateIso(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createCoverLetterModel({
  body,
  resume,
  job,
  language,
  details = {},
  now = new Date(),
}: {
  body: string
  resume: ResumeData
  job: NormalizedJob
  language: ResumeLanguage
  details?: CoverLetterDetails
  now?: Date
}): CoverLetterModel {
  const name = details.recipientName?.trim()
  const senderLocation = resume.contact.location?.trim() ?? ''
  const place =
    details.place?.trim() ||
    senderLocation.split(',')[0]?.trim() ||
    ''
  const dateIso = validDateIso(details.dateIso) ?? localCalendarDateIso(now)
  const addressLines = (details.recipientAddress ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
  const contactLines = [
    senderLocation,
    resume.contact.email,
    resume.contact.phone,
    ...resume.contact.links.map((link) => link.url),
  ].filter((line): line is string => Boolean(line?.trim()))

  return {
    schemaVersion: 1,
    language,
    sender: {
      name: resume.contact.name.trim(),
      contactLines,
    },
    recipient: {
      ...(name ? { name } : {}),
      company: job.company.trim(),
      addressLines,
    },
    place,
    dateIso,
    subject: language === 'de'
      ? `Bewerbung als ${job.title}`
      : `Application for ${job.title}`,
    greeting: name
      ? language === 'de'
        ? `${germanSalutation(name)} ${name},`
        : `Dear ${name},`
      : language === 'de'
        ? 'Sehr geehrte Damen und Herren,'
        : 'Dear Hiring Team,',
    bodyParagraphs: splitBodyParagraphs(body),
    closing: language === 'de' ? 'Mit freundlichen Grüßen' : 'Kind regards,',
    typedName: resume.contact.name.trim(),
    enclosures: [],
  }
}

export function validateCoverLetterModel(
  model: CoverLetterModel,
): CoverLetterDocumentCheck[] {
  const allText = [
    model.sender.name,
    ...model.sender.contactLines,
    model.recipient.name ?? '',
    model.recipient.company,
    ...model.recipient.addressLines,
    model.place,
    model.dateIso,
    model.subject,
    model.greeting,
    ...model.bodyParagraphs,
    model.closing,
    model.typedName,
    ...model.enclosures,
  ].join('\n')
  const wordCount = model.bodyParagraphs.join(' ').trim().split(/\s+/u).filter(Boolean).length
  const required =
    model.schemaVersion === 1 &&
    Boolean(model.sender.name) &&
    Boolean(model.recipient.company) &&
    Boolean(model.place) &&
    Boolean(model.subject) &&
    Boolean(model.greeting) &&
    Boolean(model.closing) &&
    Boolean(model.typedName) &&
    model.bodyParagraphs.length > 0
  const blanks = model.bodyParagraphs.filter((paragraph) => !paragraph.trim()).length
  const placeholders = unresolvedPlaceholderMatches(allText)
  const promptFragments = promptFragmentMatches(allText)
  const bodyWrappers = bodyWrapperFindings(model)
  const invalidUnicode = hasInvalidUnicode(allText)
  return [
    {
      id: 'required_fields',
      ok: required,
      severity: 'error',
      detail: required ? 'Required semantic letter fields are present' : 'A required letter field is empty',
    },
    {
      id: 'blank_paragraphs',
      ok: blanks === 0,
      severity: 'error',
      detail: blanks === 0 ? 'No blank body paragraphs' : `${blanks} blank body paragraph(s)`,
    },
    {
      id: 'placeholders',
      ok: placeholders.length === 0,
      severity: 'error',
      detail: placeholders.length === 0
        ? 'No unresolved placeholder'
        : `Unresolved placeholder: ${placeholders[0]}`,
    },
    {
      id: 'unicode',
      ok: !invalidUnicode,
      severity: 'error',
      detail: invalidUnicode ? 'Invalid control or replacement character detected' : 'Unicode text is valid',
    },
    {
      id: 'prompt_fragments',
      ok: promptFragments.length === 0,
      severity: 'error',
      detail: promptFragments.length === 0
        ? 'No prompt fragment'
        : `Prompt fragment detected: ${promptFragments[0]}`,
    },
    {
      id: 'body_greeting',
      ok: !bodyWrappers.greeting,
      severity: 'error',
      detail: bodyWrappers.greeting
        ? `Body contains a greeting already added by the document: ${bodyWrappers.greeting}`
        : 'Body does not repeat the document greeting',
    },
    {
      id: 'body_signoff',
      ok: !bodyWrappers.signoff,
      severity: 'error',
      detail: bodyWrappers.signoff
        ? `Body contains a sign-off already added by the document: ${bodyWrappers.signoff}`
        : 'Body does not repeat the document sign-off',
    },
    {
      id: 'body_header',
      ok: !bodyWrappers.header,
      severity: 'error',
      detail: bodyWrappers.header
        ? `Body contains an address, date, subject, or prompt-shaped header: ${bodyWrappers.header}`
        : 'Body does not repeat the document header',
    },
    {
      id: 'page_length',
      ok: wordCount <= MAXIMUM_TWO_PAGE_WORDS,
      severity: 'warning',
      detail: wordCount > MAXIMUM_TWO_PAGE_WORDS
        ? `${wordCount} body words may exceed two pages`
        : wordCount > 520
          ? `${wordCount} body words may exceed the one-page default`
          : `${wordCount} body words fits the one-page target`,
    },
  ]
}

export function coverLetterDocument(model: CoverLetterModel): Document {
  const fatal = validateCoverLetterModel(model).filter(
    (check) => check.severity === 'error' && !check.ok,
  )
  if (fatal.length > 0) {
    throw new Error(`Cover-letter validation failed: ${fatal.map((check) => check.detail).join('; ')}`)
  }

  const line = (
    text: string,
    {
      after = 0,
      before = 0,
      bold = false,
      size = BODY_SIZE,
      alignment,
    }: {
      after?: number
      before?: number
      bold?: boolean
      size?: number
      alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]
    } = {},
  ) => new Paragraph({
    spacing: { before, after, line: WORD_SAFE_LINE, lineRule: WORD_SAFE_LINE_RULE },
    ...(alignment ? { alignment } : {}),
    children: [new TextRun({
      text,
      font: BODY_FONT,
      size,
      bold,
    })],
  })

  const children: Paragraph[] = [
    line(model.sender.name, { bold: true, size: SUBJECT_SIZE, after: 20 }),
    ...model.sender.contactLines.map((text, index) =>
      line(text, {
        size: SMALL_SIZE,
        after: index === model.sender.contactLines.length - 1 ? 240 : 0,
      })),
    ...(model.recipient.name ? [line(model.recipient.name)] : []),
    line(model.recipient.company),
    ...model.recipient.addressLines.map((text) => line(text)),
    line(formatPlaceAndDate(model), {
      before: model.recipient.addressLines.length > 0 ? 240 : 320,
      after: 280,
      alignment: AlignmentType.RIGHT,
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 240 },
      children: [new TextRun({
        text: model.subject,
        font: BODY_FONT,
        size: SUBJECT_SIZE,
        bold: true,
      })],
    }),
    line(model.greeting, { after: 220 }),
    ...model.bodyParagraphs.map((text) => line(text, { after: 220 })),
    line(model.closing, { before: 120, after: 360 }),
    line(model.typedName),
    ...model.enclosures.map((text, index) =>
      line(
        index === 0
          ? `${model.language === 'de' ? 'Anlagen' : 'Enclosures'}: ${text}`
          : text,
        { before: index === 0 ? 280 : 0, size: SMALL_SIZE },
      )),
  ]

  return new Document({
    creator: 'Klar',
    title: `${model.sender.name} — ${model.subject}`,
    description: 'Klar application cover letter',
    styles: wordSafeStyles({
      font: BODY_FONT,
      size: BODY_SIZE,
      line: WORD_SAFE_LINE,
    }),
    sections: [{
      properties: {
        page: {
          size: {
            width: convertMillimetersToTwip(210),
            height: convertMillimetersToTwip(297),
          },
          margin: {
            top: convertMillimetersToTwip(20),
            right: convertMillimetersToTwip(22),
            bottom: convertMillimetersToTwip(20),
            left: convertMillimetersToTwip(25),
          },
        },
      },
      children,
    }],
  })
}

export async function coverLetterToDocxBlob(
  model: CoverLetterModel,
): Promise<Blob> {
  return Packer.toBlob(coverLetterDocument(model))
}

export async function downloadCoverLetterDocx(
  model: CoverLetterModel,
  provenance: PacketArtifactProvenance,
  job: NormalizedJob,
): Promise<string> {
  requireCurrentCoverLetterProvenance(provenance)
  const filename = coverLetterFilename(model, job)
  triggerBlobDownload(await coverLetterToDocxBlob(model), filename)
  return filename
}

export function coverLetterFilename(
  model: CoverLetterModel,
  job?: Pick<NormalizedJob, 'company' | 'title'>,
): string {
  const components = [
    'klar',
    safeFilenamePart(model.sender.name, 34),
    safeFilenamePart(job?.company ?? model.recipient.company, 34),
    safeFilenamePart(job?.title ?? model.subject, 42),
    model.language,
    'cover-letter',
  ].filter(Boolean)
  return `${components.join('-').slice(0, 170).replace(/-+$/g, '')}.docx`
}

export function inspectCoverLetterDocx(
  bytes: Uint8Array,
): CoverLetterDocxInspection {
  const archive = unzipSync(bytes)
  const documentBytes = archive['word/document.xml']
  if (!documentBytes) throw new Error('The generated DOCX has no word/document.xml.')
  const xml = strFromU8(documentBytes)
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)]
    .map((match) => match[1])
  const textLines = paragraphs.map(extractParagraphText)
  const blankParagraphCount = textLines.filter((line) => !line.trim()).length
  const tableCount = countTags(xml, 'tbl')
  const textBoxCount = countTags(xml, 'txbxContent')
  const explicitColumns = [...xml.matchAll(/<w:cols\b[^>]*w:num="(\d+)"/g)]
    .map((match) => Number(match[1]))
  const columnCount = explicitColumns.length > 0 ? Math.max(...explicitColumns) : 1
  const text = textLines.filter(Boolean).join('\n')
  const modelAgnosticChecks: CoverLetterDocumentCheck[] = [
    {
      id: 'blank_paragraphs',
      ok: blankParagraphCount === 0,
      severity: 'error',
      detail: blankParagraphCount === 0
        ? 'No blank XML paragraph'
        : `${blankParagraphCount} blank XML paragraph(s)`,
    },
    {
      id: 'single_column',
      ok: columnCount === 1,
      severity: 'error',
      detail: columnCount === 1 ? 'Single-column reading order' : `${columnCount} columns detected`,
    },
    {
      id: 'no_text_boxes',
      ok: textBoxCount === 0,
      severity: 'error',
      detail: textBoxCount === 0 ? 'No text boxes' : `${textBoxCount} text box(es)`,
    },
    {
      id: 'selectable_text',
      ok: text.trim().length > 50,
      severity: 'error',
      detail: text.trim().length > 50 ? 'Selectable document text is present' : 'Document text is unexpectedly sparse',
    },
    {
      id: 'placeholders',
      ok: unresolvedPlaceholderMatches(text).length === 0,
      severity: 'error',
      detail: 'No unresolved placeholder in packed document',
    },
    {
      id: 'prompt_fragments',
      ok: promptFragmentMatches(text).length === 0,
      severity: 'error',
      detail: 'No prompt fragment in packed document',
    },
  ]
  return {
    text,
    paragraphCount: paragraphs.length,
    blankParagraphCount,
    tableCount,
    textBoxCount,
    columnCount,
    checks: modelAgnosticChecks,
  }
}

function splitBodyParagraphs(body: string): string[] {
  const normalized = body
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .trim()
  if (!normalized) return []
  const groups = normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return groups.length > 0 ? groups : [normalized.replace(/\s+/g, ' ')]
}

function formatPlaceAndDate(model: CoverLetterModel): string {
  const date = new Date(`${model.dateIso}T12:00:00Z`)
  const formatted = new Intl.DateTimeFormat(
    model.language === 'de' ? 'de-DE' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' },
  ).format(date)
  return `${model.place}, ${formatted}`
}

function validDateIso(value: string | undefined): string | undefined {
  const candidate = value?.trim()
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return undefined
  const parsed = new Date(`${candidate}T12:00:00Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== candidate) {
    return undefined
  }
  return candidate
}

function safeFilenamePart(value: string, maximum: number): string {
  return value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.\s_-]+|[.\s_-]+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, maximum)
}

function unresolvedPlaceholderMatches(value: string): string[] {
  return value.match(
    /\{\{[^}]+\}\}|\[(?:insert|your|company|name|date|address)[^\]]*\]|<(?:insert|placeholder|name|date|address)[^>]*>|\b(?:TODO|PLACEHOLDER)\b/gi,
  ) ?? []
}

function promptFragmentMatches(value: string): string[] {
  return value.match(
    /VERIFIED (?:RESUME|R\u00c9SUM\u00c9) EVIDENCE|JOB REQUIREMENTS|MATCH CONTEXT|EXPLICIT CONTACT CONTEXT|SYSTEM PROMPT|```(?:json)?/gi,
  ) ?? []
}

type BodyWrapperFindings = {
  greeting?: string
  signoff?: string
  header?: string
}

function bodyWrapperFindings(model: CoverLetterModel): BodyWrapperFindings {
  const paragraphs = model.bodyParagraphs.map((paragraph) => paragraph.trim()).filter(Boolean)
  const first = paragraphs[0] ?? ''
  const joined = paragraphs.join('\n')
  const tail = paragraphs.slice(-2).join(' ')
  const last = paragraphs[paragraphs.length - 1] ?? ''
  const greeting = first.match(
    /^(?:dear\b|to whom it may concern\b|hello(?:\s|[,!])|hi(?:\s|[,!])|sehr geehrt(?:e|er|es|en)\b|liebe(?:r|s|n)?\b|guten tag(?:\s|[,!])|hallo(?:\s|[,!]))[^\n]{0,120}/iu,
  )?.[0]
  const closing = `${joined}\n${tail}`.match(
    /(?:^|\n|[.!?]\s+)((?:(?:kind|best|warm) )?regards\b[^\n]{0,100}|sincerely\b[^\n]{0,100}|yours (?:sincerely|faithfully)\b[^\n]{0,100}|mit freundlichen gr(?:üßen|uessen|ussen)\b[^\n]{0,100}|(?:viele|freundliche|beste|herzliche) gr(?:üße|uesse|usse)\b[^\n]{0,100}|hochachtungsvoll\b[^\n]{0,100})\s*$/iu,
  )?.[1]
  const repeatedSignature = normalizedWrapperValue(last) === normalizedWrapperValue(model.typedName)
    ? last
    : undefined

  const headerParagraphs = paragraphs.slice(0, 6)
  const promptHeader = headerParagraphs.find((paragraph) =>
    /(?:^|\s)(?:sender|from|recipient|to|address|date|subject|re|absender|empfänger|empfaenger|anschrift|adresse|datum|betreff)\s*:/iu.test(paragraph) ||
    /^(?:application for|bewerbung (?:als|um))\b/iu.test(paragraph),
  )
  const semanticHeaderValues = [
    model.sender.name,
    ...model.sender.contactLines,
    model.recipient.name ?? '',
    model.recipient.company,
    ...model.recipient.addressLines,
    model.dateIso,
    formatPlaceAndDate(model),
    model.subject,
  ]
    .map(normalizedWrapperValue)
    .filter(Boolean)
  const repeatedHeader = headerParagraphs.find((paragraph) =>
    semanticHeaderValues.includes(normalizedWrapperValue(paragraph)),
  )
  const genericDateOrAddress = headerParagraphs.find((paragraph) =>
    standaloneDateWrapper(paragraph) || standaloneAddressWrapper(paragraph),
  )

  return {
    ...(greeting ? { greeting: greeting.slice(0, 120) } : {}),
    ...(closing || repeatedSignature
      ? { signoff: (closing ?? repeatedSignature)!.slice(0, 120) }
      : {}),
    ...(promptHeader || repeatedHeader || genericDateOrAddress
      ? { header: (promptHeader ?? repeatedHeader ?? genericDateOrAddress)!.slice(0, 120) }
      : {}),
  }
}

function normalizedWrapperValue(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US')
}

function standaloneDateWrapper(value: string): boolean {
  const normalized = value.trim()
  return /^(?:[\p{L} .'-]{1,60},\s*)?(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}|\d{1,2}\.?\s+(?:januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+\d{4})$/iu.test(normalized)
}

function standaloneAddressWrapper(value: string): boolean {
  const normalized = value.trim()
  return (
    /^\d{5}\s+[\p{L}][\p{L} .'-]{1,80}$/u.test(normalized) ||
    /^(?:[\p{L} .'-]+(?:straße|strasse|street|road|avenue|lane|weg|platz)|\d{1,5}\s+[\p{L} .'-]+(?:street|road|avenue|lane))\s+\d{0,5}[a-z]?$/iu.test(normalized)
  )
}

function hasInvalidUnicode(value: string): boolean {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/u.test(value)) return true
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xD800 && code <= 0xDBFF) {
      // charCodeAt past the end returns NaN, and every comparison with NaN is
      // false, so a high surrogate at the very end must be tested positively.
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true
      index += 1
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      return true
    }
  }
  return false
}

function extractParagraphText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1]))
    .join('')
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function countTags(xml: string, localName: string): number {
  return [...xml.matchAll(new RegExp(`<w:${localName}\\b`, 'g'))].length
}
