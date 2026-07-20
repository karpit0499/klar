// ============================================================================
// Résumé text extraction — 100% client-side. PDFs via pdf.js, DOCX via
// mammoth, and plain text / paste directly. The file never leaves the browser.
//
// The heavy libraries (pdf.js ~1MB, mammoth) are loaded with DYNAMIC import()
// so they're split into separate chunks and only downloaded the first time a
// user actually parses a file — keeping the initial app load small.
//
// pdf.js GOTCHA: it needs a Web Worker. In Vite we import the worker with the
// `?url` suffix and hand the URL to GlobalWorkerOptions.workerSrc. Skipping
// this yields the classic "No GlobalWorkerOptions.workerSrc specified" error.
// ============================================================================
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

export type ExtractResult = { text: string; kind: 'pdf' | 'docx' | 'text' }

async function extractPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pages: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ('str' in it ? (it as TextItem).str : ''))
      .join(' ')
    pages.push(line)
  }
  return pages.join('\n')
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

/** Extract raw text from an uploaded résumé file. */
export async function extractText(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    return { text: normalize(await extractPdf(file)), kind: 'pdf' }
  }
  if (name.endsWith('.docx') || file.type.includes('officedocument.wordprocessingml')) {
    return { text: normalize(await extractDocx(file)), kind: 'docx' }
  }
  // .txt / .md / anything else → read as text.
  return { text: normalize(await file.text()), kind: 'text' }
}

/** Collapse excessive whitespace while keeping paragraph breaks. */
export function normalize(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}