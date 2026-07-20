// ============================================================================
// Bundesagentur für Arbeit (BA) — Germany's federal job board. The anchor
// source (huge volume at entry/mid tiers). No CORS → goes through the Worker.
//
// Verified endpoints (public key "jobboerse-jobsuche", injected by the Worker):
//   search: /pc/v4/jobs?was=&wo=&umkreis=&size=&page=
//   detail: /pc/v4/jobdetails/<base64(refnr)>   (for the full description)
// The search list has NO description, so we fetch it lazily (drawer / matching).
// ============================================================================
import type { SearchQuery } from '../types'
import type { Adapter } from './types'
import { getJson, workerUrl } from '../lib/http'
import { clean, makeJob, toISO } from './normalize'
import { stripHtml } from '../lib/html'

type BaSearchResponse = {
  stellenangebote?: BaListing[]
  maxErgebnisse?: number
}
type BaListing = {
  refnr: string
  titel?: string
  beruf?: string
  arbeitgeber?: string
  aktuelleVeroeffentlichungsdatum?: string
  externeUrl?: string
  arbeitsort?: {
    ort?: string
    region?: string
    land?: string
    plz?: string
    koordinaten?: { lat?: number; lon?: number }
  }
}

/** Public web detail page — a reliable apply/detail link when externeUrl is absent. */
function baWebUrl(refnr: string): string {
  return `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`
}

export const fetchBa: Adapter = async (q: SearchQuery, opts = {}) => {
  const was = q.what.join(' ')
  const wo = q.where?.city ?? ''
  const umkreis = q.where?.radius_km ?? 25
  const page = opts.page ?? 1
  const qs =
    `/pc/v4/jobs?was=${encodeURIComponent(was)}` +
    (wo ? `&wo=${encodeURIComponent(wo)}` : '') +
    `&umkreis=${umkreis}&size=50&page=${page}`

  const data = await getJson<BaSearchResponse>(workerUrl('ba', qs), { signal: opts.signal })
  const listings = data.stellenangebote ?? []

  const jobs = listings
    .filter((l) => l.refnr)
    .map((l) => {
      const ext = clean(l.externeUrl)
      const koord = l.arbeitsort?.koordinaten
      return makeJob({
        source: 'ba',
        source_id: l.refnr,
        title: clean(l.titel) ?? clean(l.beruf) ?? 'Untitled role',
        company: clean(l.arbeitgeber) ?? 'Unknown company',
        location: {
          city: clean(l.arbeitsort?.ort),
          region: clean(l.arbeitsort?.region),
          country: clean(l.arbeitsort?.land) ?? 'Deutschland',
          remote: false, // the list view doesn't say; detail's homeofficemoeglich does
          lat: koord?.lat,
          lng: koord?.lon,
        },
        description: '', // enriched on demand — see fetchBaDetail
        url: ext && ext.startsWith('http') ? ext : baWebUrl(l.refnr),
        posted_at: toISO(l.aktuelleVeroeffentlichungsdatum),
        language: 'de',
        tags: [],
        raw: l,
      })
    })

  return { jobs }
}

// --- Lazy description enrichment (used by matching + the job drawer) ----------

type BaDetail = {
  stellenangebotsBeschreibung?: string
  verguetungsangabe?: string
  arbeitszeitVollzeit?: boolean
  homeofficemoeglich?: boolean
  vertragsdauer?: string
  stellenangebotsart?: string
}

/** Fetch the full description + salary hint + employment type for one BA job. */
export async function fetchBaDetail(
  refnr: string,
  signal?: AbortSignal,
): Promise<{
  description: string
  employment_type?: string
  remote?: boolean
  salaryText?: string
}> {
  // The detail endpoint keys on base64(refnr). btoa handles ASCII refnrs fine.
  const encoded = btoa(refnr)
  const data = await getJson<BaDetail>(workerUrl('ba', `/pc/v4/jobdetails/${encoded}`), {
    signal,
  })
  const salaryText =
    data.verguetungsangabe && data.verguetungsangabe !== 'KEINE_ANGABEN'
      ? data.verguetungsangabe
      : undefined
  return {
    description: stripHtml(data.stellenangebotsBeschreibung ?? ''),
    employment_type: data.arbeitszeitVollzeit ? 'full-time' : undefined,
    remote: data.homeofficemoeglich ?? undefined,
    salaryText,
  }
}