// ============================================================================
// Shared Microsoft Word compatibility rules for every DOCX Klar produces.
//
// LibreOffice is forgiving about an incomplete WordprocessingML package; Word
// is not. Two differences account for almost every "it looked right until I
// opened it in Word" report:
//
//   1. The `docx` library emits built-in styles whose `w:basedOn`, `w:next` and
//      `w:link` point at `Normal` and `DefaultParagraphFont`, but it does not
//      emit those two styles unless they are declared. Word resolves a dangling
//      `basedOn` against its own built-in Normal - Calibri 11pt with 8pt space
//      after and 1.08 line spacing - so headings and body text silently pick up
//      Word's metrics instead of Klar's. LibreOffice falls back to the document
//      defaults and therefore still looks correct.
//
//   2. A `w:spacing` element carrying `w:line` without `w:lineRule` is
//      ambiguous. Word has historically read the missing attribute as
//      `atLeast`, turning a 1.15 multiple into a fixed minimum height and
//      visibly compressing the page.
//
// Both are fixed here, once, for the resume exporter, the cover-letter exporter
// and the resume design lab. `qa/documents/check-word-compatibility.mjs`
// re-checks the produced bytes so a later change cannot quietly regress them.
// ============================================================================

/** 1.15 line spacing expressed in 240ths of a line, as Word writes it. */
export const WORD_SAFE_LINE = 276

/** Always pair a `line` value with an explicit rule. */
export const WORD_SAFE_LINE_RULE = 'auto' as const

export type WordSafeStyleOptions = {
  /** Body font, applied to document defaults and to the Normal style. */
  font: string
  /** Body size in half-points, matching the `docx` library's convention. */
  size: number
  /** Optional line spacing in 240ths of a line. Omit for single spacing. */
  line?: number
}

/**
 * Build the `styles` block for a `docx` Document so Word inherits Klar's
 * metrics rather than its own built-in defaults.
 *
 * Declaring `Normal` and `DefaultParagraphFont` resolves every `w:basedOn`,
 * `w:next` and `w:link` reference the library emits for its built-in styles.
 */
export function wordSafeStyles(options: WordSafeStyleOptions) {
  const { font, size, line } = options
  const spacing = line === undefined
    ? undefined
    : { line, lineRule: WORD_SAFE_LINE_RULE }
  return {
    default: {
      document: {
        run: { font, size },
        ...(spacing ? { paragraph: { spacing } } : {}),
      },
    },
    paragraphStyles: [{
      id: 'Normal',
      name: 'Normal',
      quickFormat: true,
      run: { font, size },
      paragraph: { spacing: { before: 0, after: 0, ...(spacing ?? {}) } },
    }],
    characterStyles: [{
      id: 'DefaultParagraphFont',
      name: 'Default Paragraph Font',
      run: { font, size },
    }],
  }
}

/**
 * Characters XML 1.0 forbids outright, plus the replacement character. pdf.js
 * extraction and text pasted out of a PDF routinely carry these. Word refuses
 * to open a document containing them; LibreOffice repairs some silently.
 */
const FORBIDDEN_XML_CHARACTERS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/u

/** True when the text cannot be written into a valid WordprocessingML part. */
export function hasDocxUnsafeText(value: string): boolean {
  if (FORBIDDEN_XML_CHARACTERS.test(value)) return true
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

/** Remove every character that cannot be written into a DOCX part. */
export function stripDocxUnsafeText(value: string): string {
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        output += value[index] + value[index + 1]
        index += 1
      }
      continue
    }
    if (code >= 0xDC00 && code <= 0xDFFF) continue
    if (FORBIDDEN_XML_CHARACTERS.test(value[index])) continue
    output += value[index]
  }
  return output
}

export class DocxUnsafeTextError extends Error {
  readonly code = 'docx_unsafe_text'
  constructor(where: string) {
    super(
      `${where} contains characters that Microsoft Word cannot open. `
      + 'Re-import the source document or remove the control characters it carried.',
    )
    this.name = 'DocxUnsafeTextError'
  }
}

/**
 * Throw before packing when any supplied string would produce a package Word
 * refuses to open. Callers pass every string that reaches a `w:t` element.
 */
export function assertDocxSafeText(
  where: string,
  values: readonly (string | undefined)[],
): void {
  for (const value of values) {
    if (typeof value === 'string' && hasDocxUnsafeText(value)) {
      throw new DocxUnsafeTextError(where)
    }
  }
}