// ============================================================================
// Export results & the tracker (features 3.1 & 3.2). Everything is client-side:
//   • CSV  — built as a string and downloaded as a Blob (no dependency).
//   • XLSX — via write-excel-file, loaded with a dynamic import() so the library
//            is code-split and only fetched when the user actually exports.
//   • PDF  — a long ranked list paginates badly through a PDF library, so we use
//            the browser's own print-to-PDF via window.print(). Nothing here
//            ever touches the Worker.
//
// The row builders + CSV serializer are pure, so they're unit-testable.
// ============================================================================
import type { MatchResult, NormalizedJob, TrackedJob } from '../types'

/** A flat, string-keyed row — the shape both CSV and XLSX consume. */
export type Row = Record<string, string | number>

/** One row per ranked job (feature 3.1). */
export function jobsToRows(
  jobs: NormalizedJob[],
  matches: Record<string, MatchResult>,
): Row[] {
  return jobs.map((j) => {
    const m = matches[j.id]
    return {
      title: j.title,
      company: j.company,
      location: j.location.city ?? (j.location.remote ? 'Remote' : ''),
      remote: j.location.remote ? 'yes' : 'no',
      source: j.source,
      fitScore: m ? m.fitScore : '',
      verdict: m ? m.verdict : '',
      matchedSkills: m ? m.matchedSkills.join('; ') : '',
      missingSkills: m ? m.missingSkills.join('; ') : '',
      salaryMin: j.salary.min ?? '',
      salaryMax: j.salary.max ?? '',
      posted_at: j.posted_at ?? '',
      url: j.url,
    }
  })
}

/** One row per tracked application — the funnel a job seeker actually keeps (feature 3.2). */
export function trackedToRows(rows: TrackedJob[]): Row[] {
  return rows.map((r) => ({
    title: r.job.title,
    company: r.job.company,
    status: r.status,
    fitScore: r.match ? r.match.fitScore : '',
    appliedAt: r.appliedAt ?? '',
    notes: r.notes.replace(/\s+/g, ' ').trim(),
    reminders: r.reminders.map((x) => `${x.date}: ${x.text}`).join(' | '),
    contacts: r.contacts.map((c) => `${c.name}${c.email ? ` <${c.email}>` : ''}`).join(' | '),
    location: r.job.location.city ?? (r.job.location.remote ? 'Remote' : ''),
    source: r.job.source,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    url: r.job.url,
  }))
}

/** Escape one CSV cell per RFC 4180 (quote if it contains a comma, quote, or newline). */
function csvCell(value: string | number): string {
  const s = String(safeSpreadsheetCell(value))
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

/** Prevent user-controlled text from becoming a spreadsheet formula. */
export function safeSpreadsheetCell(value: string | number): string | number {
  if (typeof value !== 'string') return value
  return /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value
}

/** Serialize rows to a CSV string. Columns come from the first row's keys. */
export function rowsToCsv(rows: Row[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h] ?? '')).join(','))
  }
  return lines.join('\r\n')
}

/** Convert rows into the primitive cell matrix used by the safe XLSX writer. */
export function rowsToSheetData(rows: Row[]): Array<Array<string | number>> {
  if (rows.length === 0) return []
  const headers = Object.keys(rows[0])
  return [
    headers,
    ...rows.map((row) => headers.map((header) => safeSpreadsheetCell(row[header] ?? ''))),
  ]
}

export function safeSheetName(value: string): string {
  return value.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Sheet1'
}

// --- Browser download helpers (not exercised in Node tests) ------------------

/** Trigger a browser download of `content` as a file. */
export function downloadBlob(filename: string, content: BlobPart, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Download rows as a CSV file. */
export function downloadCsv(filename: string, rows: Row[]): void {
  downloadBlob(filename, rowsToCsv(rows), 'text/csv;charset=utf-8')
}

/** Download rows as an XLSX file without parsing untrusted workbook input. */
export async function downloadXlsx(filename: string, sheetName: string, rows: Row[]): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  await writeExcelFile(rowsToSheetData(rows), {
    sheet: safeSheetName(sheetName),
    stickyRowsCount: rows.length > 0 ? 1 : 0,
  }).toFile(filename)
}

/**
 * Open the browser's print dialog scoped to a printable HTML table, so the user
 * can "Save as PDF". We render into a hidden iframe to avoid disturbing the app.
 */
export function printRowsAsPdf(title: string, rows: Row[]): void {
  const headers = rows.length ? Object.keys(rows[0]) : []
  const esc = (s: unknown) =>
    String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  const thead = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`
  const tbody = rows
    .map((r) => `<tr>${headers.map((h) => `<td>${esc(r[h])}</td>`).join('')}</tr>`)
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #14181f; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f0f0f3; }
  @media print { @page { margin: 12mm; } }
</style></head>
<body><h1>${esc(title)}</h1><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  const win = iframe.contentWindow!
  win.focus()
  win.print()
  // Give the print dialog time to read the document before we remove it.
  setTimeout(() => document.body.removeChild(iframe), 1000)
}