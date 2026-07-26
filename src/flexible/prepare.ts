// ============================================================================
// v2.5 — Flexible Work "prepare & reach out", résumé-free and DETERMINISTIC.
//
// The roadmap asks for a short employer message, an availability summary and an
// optional compact profile card, "grounded only in the minimal flexible profile
// the user chose to enter … never invented experience".
//
// This module uses NO model at all, on purpose:
//   • it is impossible for a template to invent experience, so the honesty
//     guarantee is absolute rather than validated after the fact;
//   • it costs nothing and needs no API key — which is the whole point for the
//     student who never wants to write a résumé;
//   • it works offline and is trivially unit-testable in both languages.
//
// Klar still never applies for anyone. The message is text the person copies
// into the employer's OWN official route. There is no autofill and no submit.
// ============================================================================
import type { FlexibleWorkPreferences, NormalizedJob } from '../types'
import { employmentLabel } from './labels'

const DAY_LABELS: Record<string, [string, string]> = {
  monday: ['Monday', 'Montag'],
  tuesday: ['Tuesday', 'Dienstag'],
  wednesday: ['Wednesday', 'Mittwoch'],
  thursday: ['Thursday', 'Donnerstag'],
  friday: ['Friday', 'Freitag'],
  saturday: ['Saturday', 'Samstag'],
  sunday: ['Sunday', 'Sonntag'],
}

const PERIOD_LABELS: Record<string, [string, string]> = {
  morning: ['mornings', 'morgens'],
  day: ['daytime', 'tagsüber'],
  evening: ['evenings', 'abends'],
  night: ['nights', 'nachts'],
}

function list(items: string[], de: boolean): string {
  const clean = items.filter(Boolean)
  if (clean.length <= 1) return clean.join('')
  const last = clean[clean.length - 1]
  return `${clean.slice(0, -1).join(', ')} ${de ? 'und' : 'and'} ${last}`
}

/**
 * One honest sentence about when the person can work. Returns '' when the
 * profile says nothing about availability — Klar never guesses a schedule.
 */
export function buildAvailabilitySummary(
  preferences: FlexibleWorkPreferences,
  de: boolean,
): string {
  const parts: string[] = []
  const days = (preferences.schedule?.days ?? [])
    .map((day) => DAY_LABELS[day]?.[de ? 1 : 0])
    .filter((value): value is string => Boolean(value))
  const periods = (preferences.schedule?.periods ?? [])
    .map((period) => PERIOD_LABELS[period]?.[de ? 1 : 0])
    .filter((value): value is string => Boolean(value))
  const hours = preferences.schedule?.maxHoursPerWeek

  if (days.length) parts.push(de ? `${list(days, true)}` : `${list(days, false)}`)
  if (periods.length) parts.push(list(periods, de))
  const when = parts.join(', ')

  const sentences: string[] = []
  if (when) {
    sentences.push(de ? `Ich kann ${when} arbeiten.` : `I am available ${when}.`)
  }
  if (hours) {
    sentences.push(de ? `Bis zu ${hours} Stunden pro Woche.` : `Up to ${hours} hours per week.`)
  }
  if (preferences.earliestStart) {
    sentences.push(
      de ? `Verfügbar ab ${preferences.earliestStart}.` : `Available from ${preferences.earliestStart}.`,
    )
  }
  return sentences.join(' ')
}

/** How the person can get to work — only what they actually ticked. */
export function buildTransportLine(preferences: FlexibleWorkPreferences, de: boolean): string {
  const bits: string[] = []
  if (preferences.hasDrivingLicence) bits.push(de ? 'Führerschein' : 'a driving licence')
  if (preferences.hasBike) bits.push(de ? 'Fahrrad' : 'a bike')
  if (!bits.length) return ''
  return de ? `Ich habe ${list(bits, true)}.` : `I have ${list(bits, false)}.`
}

/** Language comfort, verbatim from what the person entered. */
export function buildLanguageLine(preferences: FlexibleWorkPreferences, de: boolean): string {
  const bits: string[] = []
  if (preferences.languageComfort?.german) {
    bits.push(de ? `Deutsch ${preferences.languageComfort.german}` : `German ${preferences.languageComfort.german}`)
  }
  if (preferences.languageComfort?.english) {
    bits.push(de ? `Englisch ${preferences.languageComfort.english}` : `English ${preferences.languageComfort.english}`)
  }
  if (!bits.length) return ''
  return de ? `Sprachen: ${bits.join(', ')}.` : `Languages: ${bits.join(', ')}.`
}

export type FlexibleMessageInput = {
  preferences: FlexibleWorkPreferences
  job: Pick<NormalizedJob, 'title' | 'company' | 'programName' | 'kind' | 'employerFamily' | 'location'>
  de: boolean
}

/**
 * A short, truthful enquiry the person can paste into the employer's own form,
 * email or messenger. Every sentence comes from a field they filled in.
 */
export function buildEmployerMessage({ preferences, job, de }: FlexibleMessageInput): string {
  const name = preferences.contact?.name?.trim()
  const employer = (job.employerFamily || job.company || '').trim()
  const role = (job.kind === 'open_entry' ? job.programName || job.title : job.title).trim()
  const city = job.location?.city || preferences.locations[0]?.city || ''
  const employmentBits = preferences.employment.slice(0, 2).map((item) => employmentLabel(item, de))

  const lines: string[] = []
  lines.push(de ? 'Guten Tag,' : 'Hello,')
  lines.push('')

  const opening = de
    ? `ich interessiere mich für die Stelle „${role}“${employer ? ` bei ${employer}` : ''}${city ? ` in ${city}` : ''}.`
    : `I am interested in the ${role} role${employer ? ` at ${employer}` : ''}${city ? ` in ${city}` : ''}.`
  lines.push(opening)

  if (employmentBits.length) {
    lines.push(
      de
        ? `Ich suche ${list(employmentBits, true)}.`
        : `I am looking for ${list(employmentBits, false).toLowerCase()} work.`,
    )
  }

  const availability = buildAvailabilitySummary(preferences, de)
  if (availability) lines.push(availability)

  const transport = buildTransportLine(preferences, de)
  if (transport) lines.push(transport)

  const languages = buildLanguageLine(preferences, de)
  if (languages) lines.push(languages)

  lines.push(
    de
      ? 'Über eine kurze Rückmeldung, ob die Stelle noch frei ist, freue ich mich.'
      : 'Could you let me know whether the position is still open?',
  )
  lines.push('')
  lines.push(de ? 'Freundliche Grüße' : 'Kind regards')
  if (name) lines.push(name)
  const contactBits = [preferences.contact?.email?.trim(), preferences.contact?.phone?.trim()].filter(Boolean)
  if (contactBits.length) lines.push(contactBits.join(' · '))

  return lines.join('\n')
}

// --- The optional compact profile card ---------------------------------------

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>]/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character]!),
  )
}

/**
 * A one-page, text-only card the person can print to PDF and hand over. Same
 * print-to-PDF approach as the résumé exporter: real selectable text, no images,
 * no raster — and no photo, so it never carries data an employer must not ask for.
 */
export function profileCardHtml(preferences: FlexibleWorkPreferences, de: boolean): string {
  const name = preferences.contact?.name?.trim() || (de ? 'Kurzprofil' : 'Short profile')
  const contact = [preferences.contact?.email?.trim(), preferences.contact?.phone?.trim()]
    .filter(Boolean)
    .map(esc)
    .join(' &middot; ')
  const cities = preferences.locations
    .map((location) => `${location.city} (${location.radius_km} km)`)
    .map(esc)
    .join(', ')
  const employment = preferences.employment.map((item) => employmentLabel(item, de)).map(esc).join(', ')
  const rows: string[] = []
  if (cities) rows.push(row(de ? 'Orte' : 'Locations', cities))
  if (employment) rows.push(row(de ? 'Gesucht' : 'Looking for', employment))
  const availability = buildAvailabilitySummary(preferences, de)
  if (availability) rows.push(row(de ? 'Verfügbarkeit' : 'Availability', esc(availability)))
  const transport = buildTransportLine(preferences, de)
  if (transport) rows.push(row(de ? 'Mobilität' : 'Getting there', esc(transport)))
  const languages = buildLanguageLine(preferences, de)
  if (languages) rows.push(row(de ? 'Sprachen' : 'Languages', esc(languages)))

  return `<!doctype html><html lang="${de ? 'de' : 'en'}"><head><meta charset="utf-8">
<title>${esc(name)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #0A0A0A; font-size: 11pt; line-height: 1.35; margin: 18mm; }
  h1 { font-size: 18pt; margin: 0 0 2pt; }
  p.contact { color: #333; margin: 0 0 10pt; }
  dl { margin: 0; }
  dt { font-weight: bold; margin-top: 8pt; }
  dd { margin: 0 0 2pt; }
  p.note { color: #333; font-size: 9pt; margin-top: 14pt; }
  @media print { @page { margin: 18mm; } }
</style></head><body>
<h1>${esc(name)}</h1>
${contact ? `<p class="contact">${contact}</p>` : ''}
<dl>${rows.join('')}</dl>
<p class="note">${de
    ? 'Erstellt mit Klar. Alle Angaben stammen aus dem eigenen Profil.'
    : 'Created with Klar. Every detail comes from this person’s own profile.'}</p>
</body></html>`
}

function row(label: string, value: string): string {
  return `<dt>${esc(label)}</dt><dd>${value}</dd>`
}

/** Browser: open the print dialog on the card (Save as PDF). Text-based. */
export function printProfileCard(preferences: FlexibleWorkPreferences, de: boolean): void {
  const html = profileCardHtml(preferences, de)
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