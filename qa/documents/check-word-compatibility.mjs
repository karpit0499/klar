#!/usr/bin/env node
// ============================================================================
// Microsoft Word compatibility check for every DOCX Klar produces.
//
// LibreOffice renders many packages that Word either refuses to open or opens
// with different metrics. A resume or cover letter that reflows in Word is a
// failed deliverable even when the LibreOffice PDF looked perfect, so this
// check runs against the produced bytes and is part of the release gate.
//
// Every rule below is a real divergence between Word and LibreOffice, not a
// style preference. Rules marked "Word 2007" are the ones that make the older
// ECMA-376 reader report unreadable content and offer to repair the file.
//
// Usage:
//   node qa/documents/check-word-compatibility.mjs <directory-of-docx>
//   node qa/documents/check-word-compatibility.mjs <one-file.docx>
//
// Exit code 0 = every document is Word-safe. Exit code 1 = at least one error.
// ============================================================================

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'

// --- ECMA-376 Part 1 §17.3.1.26, the required child order of <w:pPr>. -------
// Word 2007 rejects a paragraph whose properties appear out of this order.
const PPR_ORDER = [
  'pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl',
  'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens',
  'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE',
  'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind',
  'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection',
  'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr',
  'sectPr', 'pPrChange',
]

// --- ECMA-376 Part 1 §17.3.2.27, the required child order of <w:rPr>. -------
const RPR_ORDER = [
  'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike',
  'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid',
  'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz',
  'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign',
  'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath',
]

const REQUIRED_PARTS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'word/document.xml',
  'word/styles.xml',
]

// Fonts every supported Word installation resolves without substitution.
const SAFE_FONTS = new Set([
  'Arial', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Constantia', 'Corbel',
  'Courier New', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana',
])

const FORBIDDEN_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/u

function attributesOf(tag) {
  const attributes = {}
  for (const match of tag.matchAll(/([A-Za-z0-9:_.-]+)="([^"]*)"/g)) {
    attributes[match[1]] = match[2]
  }
  return attributes
}

/** Ordered list of direct child element names of the first <w:pPr>/<w:rPr>. */
function childOrderViolations(xml, container, order) {
  const violations = []
  const open = new RegExp(`<w:${container}(?:\\s[^>]*)?>`, 'g')
  let match
  while ((match = open.exec(xml)) !== null) {
    const start = match.index + match[0].length
    const end = xml.indexOf(`</w:${container}>`, start)
    if (end < 0) continue
    const body = xml.slice(start, end)
    let depth = 0
    const children = []
    for (const token of body.matchAll(/<(\/?)w:([A-Za-z0-9]+)([^>]*?)(\/?)>/g)) {
      const [, closing, name, , selfClosing] = token
      if (closing) { depth -= 1; continue }
      if (depth === 0) children.push(name)
      if (!selfClosing) depth += 1
    }
    let previous = -1
    let previousName = ''
    for (const name of children) {
      const rank = order.indexOf(name)
      if (rank < 0) continue
      if (rank < previous) {
        violations.push(`<w:${name}> appears after <w:${previousName}> inside <w:${container}>`)
      } else {
        previous = rank
        previousName = name
      }
    }
  }
  return [...new Set(violations)]
}

export function checkWordCompatibility(name, bytes) {
  const errors = []
  const warnings = []
  const add = (id, message) => errors.push(`${id}: ${message}`)

  let entries
  try {
    entries = unzipSync(bytes)
  } catch (error) {
    return { file: name, pass: false, errors: [`W01: not a readable ZIP (${error.message})`], warnings }
  }
  const partNames = Object.keys(entries)
  const text = (part) => (entries[part] ? strFromU8(entries[part]) : undefined)

  // --- W02 required parts -------------------------------------------------
  for (const required of REQUIRED_PARTS) {
    if (!partNames.includes(required)) add('W02', `missing required part ${required}`)
  }
  const document = text('word/document.xml')
  if (!document) {
    return { file: name, pass: false, errors: [...errors, 'W02: no word/document.xml'], warnings }
  }
  const styles = text('word/styles.xml') ?? ''
  const numbering = text('word/numbering.xml') ?? ''
  const contentTypes = text('[Content_Types].xml') ?? ''

  // --- W03 every XML part parses ------------------------------------------
  for (const part of partNames) {
    if (!/\.(xml|rels)$/.test(part)) continue
    const body = text(part) ?? ''
    const opens = (body.match(/<[A-Za-z][^>]*?(?<!\/)>/g) ?? []).length
    const closes = (body.match(/<\/[A-Za-z][^>]*>/g) ?? []).length
    if (opens !== closes) {
      add('W03', `${part} has ${opens} opening and ${closes} closing tags`)
    }
    if (!body.startsWith('<?xml')) add('W03', `${part} has no XML declaration`)
  }

  // --- W04 content types cover every part ---------------------------------
  const defaults = new Set(
    [...contentTypes.matchAll(/<Default[^>]*Extension="([^"]+)"/g)].map((m) => m[1].toLowerCase()),
  )
  const overrides = new Set(
    [...contentTypes.matchAll(/<Override[^>]*PartName="([^"]+)"/g)].map((m) => m[1]),
  )
  for (const part of partNames) {
    if (part === '[Content_Types].xml' || part.endsWith('/')) continue
    // path.extname('.rels') is empty, so read the segment after the last dot.
    const base = path.posix.basename(part)
    const dot = base.lastIndexOf('.')
    const extension = dot < 0 ? '' : base.slice(dot + 1).toLowerCase()
    if (overrides.has(`/${part}`) || defaults.has(extension)) continue
    add('W04', `${part} has no content type`)
  }

  // --- W05 no dangling style reference (Word falls back to its own Normal) --
  const defined = new Set([...styles.matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1]))
  const referenced = new Set([
    ...[...styles.matchAll(/<w:basedOn w:val="([^"]+)"/g)].map((m) => m[1]),
    ...[...styles.matchAll(/<w:next w:val="([^"]+)"/g)].map((m) => m[1]),
    ...[...styles.matchAll(/<w:link w:val="([^"]+)"/g)].map((m) => m[1]),
    ...[...document.matchAll(/<w:pStyle w:val="([^"]+)"/g)].map((m) => m[1]),
    ...[...document.matchAll(/<w:rStyle w:val="([^"]+)"/g)].map((m) => m[1]),
  ])
  for (const reference of referenced) {
    if (!defined.has(reference)) {
      add('W05', `style "${reference}" is referenced but not defined; Word substitutes its own built-in`)
    }
  }

  // --- W06 the default styles exist ---------------------------------------
  if (!defined.has('Normal')) {
    add('W06', 'no Normal style; Word applies Calibri 11pt with its own spacing')
  }
  if (!defined.has('DefaultParagraphFont')) {
    add('W06', 'no DefaultParagraphFont character style')
  }

  // --- W07 numbering references resolve -----------------------------------
  const numIdsDefined = new Set([...numbering.matchAll(/<w:num w:numId="(\d+)"/g)].map((m) => m[1]))
  const abstractDefined = new Set(
    [...numbering.matchAll(/<w:abstractNum w:abstractNumId="(\d+)"/g)].map((m) => m[1]),
  )
  for (const match of document.matchAll(/<w:numId w:val="(\d+)"/g)) {
    if (match[1] !== '0' && !numIdsDefined.has(match[1])) {
      add('W07', `numId ${match[1]} is used but not defined; Word drops the bullet`)
    }
  }
  for (const match of numbering.matchAll(/<w:num w:numId="\d+"[^>]*>\s*<w:abstractNumId w:val="(\d+)"/g)) {
    if (!abstractDefined.has(match[1])) add('W07', `abstractNumId ${match[1]} is referenced but not defined`)
  }

  // --- W08 relationship ids resolve ---------------------------------------
  for (const part of partNames) {
    if (!part.endsWith('.xml') || part.startsWith('_rels/')) continue
    const body = text(part) ?? ''
    const used = new Set([...body.matchAll(/r:(?:id|embed|link)="([^"]+)"/g)].map((m) => m[1]))
    if (used.size === 0) continue
    const relsPart = `${path.posix.dirname(part)}/_rels/${path.posix.basename(part)}.rels`
    const rels = text(relsPart) ?? ''
    const available = new Set([...rels.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]))
    for (const id of used) {
      if (!available.has(id)) add('W08', `${part} references ${id} but ${relsPart} does not define it`)
    }
  }

  // --- W09 line spacing is unambiguous ------------------------------------
  for (const part of ['word/document.xml', 'word/styles.xml']) {
    const body = text(part) ?? ''
    for (const match of body.matchAll(/<w:spacing\b[^>]*\/>/g)) {
      const attributes = attributesOf(match[0])
      if (attributes['w:line'] !== undefined && attributes['w:lineRule'] === undefined) {
        add('W09', `${part} sets w:line without w:lineRule; Word may read it as an exact minimum`)
      }
    }
  }

  // --- W10 property child order (Word 2007 reports unreadable content) -----
  for (const part of ['word/document.xml', 'word/styles.xml']) {
    const body = text(part) ?? ''
    for (const violation of childOrderViolations(body, 'pPr', PPR_ORDER)) {
      add('W10', `${part}: ${violation}`)
    }
    for (const violation of childOrderViolations(body, 'rPr', RPR_ORDER)) {
      add('W10', `${part}: ${violation}`)
    }
  }

  // --- W11 markup-compatibility prefixes are declared (Word 2007 hard-fail) -
  for (const part of partNames) {
    if (!part.endsWith('.xml')) continue
    const body = text(part) ?? ''
    const ignorable = body.match(/mc:Ignorable="([^"]*)"/)
    if (!ignorable) continue
    const declared = new Set([...body.matchAll(/xmlns:([A-Za-z0-9]+)=/g)].map((m) => m[1]))
    for (const prefix of ignorable[1].split(/\s+/).filter(Boolean)) {
      if (!declared.has(prefix)) {
        add('W11', `${part} lists mc:Ignorable prefix "${prefix}" without declaring it`)
      }
    }
  }

  // --- W12 sectPr closes the body -----------------------------------------
  if (!/<\/w:sectPr><\/w:body><\/w:document>\s*$/.test(document.trim())) {
    add('W12', 'the final <w:sectPr> is not the last child of <w:body>')
  }

  // --- W13 no character Word refuses to read ------------------------------
  for (const match of document.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
    if (FORBIDDEN_CHARACTERS.test(match[1])) {
      add('W13', 'document text contains a control character Word cannot open')
      break
    }
  }

  // --- W14 fonts resolve without substitution -----------------------------
  const fontTable = text('word/fontTable.xml') ?? ''
  const declaredFonts = new Set([...fontTable.matchAll(/w:name="([^"]+)"/g)].map((m) => m[1]))
  const usedFonts = new Set([
    ...[...document.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]),
    ...[...styles.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]),
  ])
  for (const font of usedFonts) {
    if (SAFE_FONTS.has(font)) continue
    if (declaredFonts.has(font)) continue
    warnings.push(`W14: "${font}" is neither a standard Word font nor declared in fontTable.xml`)
  }

  return { file: name, pass: errors.length === 0, errors, warnings }
}

async function main() {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: node qa/documents/check-word-compatibility.mjs <directory-or-file>')
    process.exit(64)
  }
  let files
  if (target.endsWith('.docx')) {
    files = [target]
  } else {
    files = (await readdir(target))
      .filter((entry) => entry.endsWith('.docx'))
      .sort()
      .map((entry) => path.join(target, entry))
  }
  if (files.length === 0) {
    console.error(`No .docx files found in ${target}`)
    process.exit(64)
  }
  const results = []
  for (const file of files) {
    results.push(checkWordCompatibility(path.basename(file), new Uint8Array(await readFile(file))))
  }
  const failed = results.filter((result) => !result.pass)
  console.log(JSON.stringify({
    checked: results.length,
    pass: failed.length === 0,
    results,
  }, null, 2))
  if (failed.length > 0) {
    console.error(`\nWord compatibility FAILED for ${failed.length} of ${results.length} document(s).`)
    process.exit(1)
  }
  console.error(`\nWord compatibility passed for all ${results.length} document(s).`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
