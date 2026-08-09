// ============================================================================
// Text-based PDF export for the tailored résumé.
//
// The browser prints semantic HTML that mirrors the production DOCX template.
// It remains selectable, single-column ATS text — never a rasterized canvas.
// ============================================================================
import type { ResumeData, ResumeLanguage } from './types'
import {
  RESUME_TEMPLATE_COLORS,
  RESUME_TEMPLATE_HEADINGS,
  crossCompatibleDateRange,
  displayResumeUrl,
  resumeAccent,
  resumeHeadline,
} from './template'

function esc(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>]/g,
    (character) => ({ '&': '&', '<': '<', '>': '>' }[character]!),
  )
}

function entryLine(primary: string, secondary = ''): string {
  if (!primary) return `<p class="entry-heading"><strong>${esc(secondary)}</strong></p>`
  return (
    `<p class="entry-heading"><strong>${esc(primary)}</strong>` +
    `${secondary ? ` <span> |  ${esc(secondary)}</span>` : ''}</p>`
  )
}

/** Build cross-compatible, ATS-safe HTML from the same ResumeData as DOCX. */
export function resumeToHtml(data: ResumeData, lang: ResumeLanguage): string {
  const headings = RESUME_TEMPLATE_HEADINGS[lang]
  const accent = resumeAccent(data)
  const headline = resumeHeadline(data)
  const parts: string[] = []

  parts.push('<header>')
  parts.push(`<h1>${esc(data.contact.name)}</h1>`)
  if (headline) parts.push(`<p class="headline">${esc(headline)}</p>`)

  const primaryContact = [
    data.contact.location,
    data.contact.phone,
    data.contact.email,
  ].filter(Boolean).map(esc)
  if (primaryContact.length) {
    parts.push(`<p class="contact">${primaryContact.join('  |  ')}</p>`)
  }
  const links = data.contact.links
    .map((link) => displayResumeUrl(link.url))
    .filter(Boolean)
    .map(esc)
  if (links.length) parts.push(`<p class="links">${links.join('  |  ')}</p>`)
  parts.push('</header>')

  if (data.summary) parts.push(`<p class="summary">${esc(data.summary)}</p>`)

  if (data.experience.length) {
    parts.push(`<section><h2>${esc(headings.experience)}</h2>`)
    for (const role of data.experience) {
      parts.push('<article>')
      parts.push(entryLine(role.title, role.company))
      const range = crossCompatibleDateRange(
        role.start,
        role.end,
        role.current,
        lang,
      )
      const metadata = [role.city, range].filter(Boolean).map(esc)
      if (metadata.length) {
        parts.push(`<p class="meta">${metadata.join('  |  ')}</p>`)
      }
      if (role.bullets.length) {
        parts.push(`<ul>${role.bullets.map((item) => `<li>${esc(item.text)}</li>`).join('')}</ul>`)
      }
      parts.push('</article>')
    }
    parts.push('</section>')
  }

  if (data.projects.length) {
    parts.push(`<section><h2>${esc(headings.projects)}</h2>`)
    for (const project of data.projects) {
      parts.push('<article>')
      parts.push(entryLine(project.name, project.summary))
      const metadata = [
        project.tech?.length ? project.tech.join(', ') : '',
        project.link ? displayResumeUrl(project.link) : '',
      ].filter(Boolean).map(esc)
      if (metadata.length) {
        parts.push(`<p class="meta">${metadata.join('  |  ')}</p>`)
      }
      parts.push('</article>')
    }
    parts.push('</section>')
  }

  if (data.education.length) {
    parts.push(`<section><h2>${esc(headings.education)}</h2>`)
    for (const education of data.education) {
      parts.push('<article>')
      const qualification = [education.degree, education.field]
        .filter(Boolean)
        .join(', ')
      const institution = [education.institution, education.city]
        .filter(Boolean)
        .join(', ')
      parts.push(entryLine(qualification, institution))
      const range = crossCompatibleDateRange(
        education.start,
        education.end,
        false,
        lang,
      )
      if (range) parts.push(`<p class="meta">${esc(range)}</p>`)
      parts.push('</article>')
    }
    parts.push('</section>')
  }

  if (data.certifications.length) {
    parts.push(`<section><h2>${esc(headings.certifications)}</h2>`)
    for (const certification of data.certifications) {
      parts.push(entryLine(
        certification.name,
        [certification.issuer, certification.issued]
          .filter(Boolean)
          .join(', '),
      ))
    }
    parts.push('</section>')
  }

  if (data.skills.length || data.languages.length) {
    parts.push(`<section><h2>${esc(headings.skillsAndLanguages)}</h2>`)
    for (const group of data.skills) {
      const label = group.group ? `<strong>${esc(group.group)}:</strong> ` : ''
      parts.push(`<p>${label}${esc(group.items.map((item) => item.name).join(', '))}</p>`)
    }
    if (data.languages.length) {
      parts.push(
        `<p><strong>${esc(headings.languages)}:</strong> ` +
        `${esc(data.languages.map((item) => `${item.lang}${item.level ? ` ${item.level}` : ''}`).join(' · '))}</p>`,
      )
    }
    parts.push('</section>')
  }

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(data.contact.name)} — CV</title>
<style>
  :root { --accent: #${accent}; --ink: #${RESUME_TEMPLATE_COLORS.ink}; --muted: #${RESUME_TEMPLATE_COLORS.muted}; --rule: #${RESUME_TEMPLATE_COLORS.rule}; }
  * { box-sizing: border-box; }
  html { background: white; }
  body { width: 176mm; margin: 14.5mm auto 15mm; font-family: Arial, Helvetica, sans-serif; color: var(--ink); font-size: 10pt; line-height: 1.18; }
  header { border-bottom: 0.5pt solid var(--rule); padding-bottom: 4pt; break-inside: avoid; }
  h1 { margin: 0 0 0.8pt; font-size: 23.5pt; line-height: 1.05; font-weight: 700; }
  p { margin: 0 0 1.3pt; }
  .headline { margin-bottom: 3pt; color: var(--accent); font-size: 11pt; font-weight: 700; }
  .contact, .links, .meta { color: var(--muted); font-size: 9pt; }
  .links { margin-top: 1pt; }
  .summary { margin: 2pt 0 4pt; font-size: 10.5pt; line-height: 1.2; }
  section { margin: 0; }
  h2 { margin: 7pt 0 3pt; border-bottom: 0.5pt solid var(--rule); color: var(--accent); font-size: 10.5pt; line-height: 1.15; font-weight: 700; text-transform: uppercase; break-after: avoid; }
  article { margin: 0; }
  .entry-heading { margin: 1pt 0 0.5pt; font-size: 10pt; break-after: avoid; }
  .entry-heading span { font-weight: 400; }
  .meta { margin-bottom: 1.5pt; font-weight: 700; break-after: avoid; }
  ul { margin: 0 0 1pt; padding-left: 15pt; }
  li { margin: 0 0 2.2pt; padding-left: 1pt; break-inside: avoid; }
  li::marker { color: var(--accent); }
  strong { font-weight: 700; }
  @page { size: A4 portrait; margin: 14.5mm 17mm 15mm; }
  @media print { body { width: auto; margin: 0; } }
</style>
</head>
<body>${parts.join('\n')}</body>
</html>`
}

/** Browser: open the print dialog so the user can save a selectable-text PDF. */
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
  setTimeout(() => document.body.removeChild(iframe), 1_000)
}