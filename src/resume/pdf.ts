// ============================================================================
// Text-based PDF export for the tailored résumé (feature 12).
//
// The Appendix-A rule is explicit: NEVER a rasterized/image PDF (the Canva/Figma
// export trap). So instead of drawing to a canvas, we render the résumé as clean
// semantic HTML and open the browser's print dialog ("Save as PDF"). The result
// is real, selectable, ATS-parseable text — from the SAME ResumeData the DOCX
// uses. Zero dependencies (mirrors the print approach used for CSV/PDF exports).
// ============================================================================
import type { ResumeData, ResumeLanguage } from './types'
import { SECTION_HEADINGS, formatDateRange } from './types'

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
}

/** Build the ATS-safe HTML for a résumé (real text, single column, no images). */
export function resumeToHtml(data: ResumeData, lang: ResumeLanguage): string {
  const H = SECTION_HEADINGS[lang]
  const parts: string[] = []
  parts.push(`<h1>${esc(data.contact.name)}</h1>`)
  const contactBits = [
    data.contact.location, data.contact.email, data.contact.phone,
    ...data.contact.links.map((l) => l.url),
  ].filter(Boolean).map(esc)
  if (contactBits.length) parts.push(`<p class="contact">${contactBits.join(' &middot; ')}</p>`)

  if (data.summary) {
    parts.push(`<h2>${esc(H.summary)}</h2><p>${esc(data.summary)}</p>`)
  }
  if (data.experience.length) {
    parts.push(`<h2>${esc(H.experience)}</h2>`)
    for (const e of data.experience) {
      parts.push(`<p class="role"><strong>${esc([e.title, e.company, e.city].filter(Boolean).join(' — '))}</strong></p>`)
      const range = formatDateRange(e.start, e.end, e.current, lang)
      if (range) parts.push(`<p class="dates">${esc(range)}</p>`)
      if (e.bullets.length) parts.push(`<ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`)
    }
  }
  if (data.education.length) {
    parts.push(`<h2>${esc(H.education)}</h2>`)
    for (const ed of data.education) {
      const main = [ed.degree, ed.field].filter(Boolean).join(', ')
      const inst = [ed.institution, ed.city].filter(Boolean).join(', ')
      parts.push(`<p><strong>${esc([main, inst].filter(Boolean).join(' — '))}</strong></p>`)
      const range = formatDateRange(ed.start, ed.end, false, lang)
      if (range) parts.push(`<p class="dates">${esc(range)}</p>`)
    }
  }
  if (data.skills.length) {
    parts.push(`<h2>${esc(H.skills)}</h2>`)
    for (const g of data.skills) {
      parts.push(`<p>${g.group ? `<strong>${esc(g.group)}:</strong> ` : ''}${esc(g.items.join(', '))}</p>`)
    }
  }
  if (data.languages.length) {
    parts.push(`<h2>${esc(H.languages)}</h2><p>${esc(data.languages.map((l) => `${l.lang}${l.level ? ` — ${l.level}` : ''}`).join(' · '))}</p>`)
  }
  if (data.projects.length) {
    parts.push(`<h2>${esc(H.projects)}</h2>`)
    for (const p of data.projects) {
      parts.push(`<p><strong>${esc(p.name)}</strong>${p.summary ? ` — ${esc(p.summary)}` : ''}</p>`)
      const meta = [p.tech?.length ? p.tech.join(', ') : '', p.link ?? ''].filter(Boolean).join(' · ')
      if (meta) parts.push(`<p class="meta">${esc(meta)}</p>`)
    }
  }
  if (data.certifications.length) {
    parts.push(`<h2>${esc(H.certifications)}</h2><p>${esc(data.certifications.join(', '))}</p>`)
  }

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(data.contact.name)} — CV</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #0A0A0A; font-size: 11pt; line-height: 1.15; margin: 18mm; }
  h1 { font-size: 18pt; margin: 0 0 2pt; }
  h2 { font-size: 13pt; margin: 12pt 0 4pt; }
  p { margin: 0 0 3pt; }
  p.contact, p.dates, p.meta { color: #333; }
  p.dates { font-style: italic; }
  ul { margin: 2pt 0 6pt; padding-left: 16pt; }
  li { margin: 0 0 2pt; }
  @media print { @page { margin: 18mm; } }
</style></head><body>${parts.join('\n')}</body></html>`
}

/** Browser: open the print dialog on the résumé HTML (Save as PDF). Text-based. */
export function printResumeAsPdf(data: ResumeData, lang: ResumeLanguage): void {
  const html = resumeToHtml(data, lang)
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
  setTimeout(() => document.body.removeChild(iframe), 1000)
}