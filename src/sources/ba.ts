// ============================================================================
// Bundesagentur für Arbeit (BA) — Germany's federal job board. The anchor
// source (huge volume at entry/mid tiers). No CORS → goes through the Worker.
//
// Verified endpoints (public key "jobboerse-jobsuche", injected by the Worker):
//   search: /pc/v6/jobs?was=&wo=&umkreis=&angebotsart=&size=&page=
//   detail: /pc/v4/jobdetails/<base64(refnr)>   (for the full description)
// The search list has NO description, so we fetch it lazily (drawer / matching).
// ============================================================================
import type { SearchQuery } from '../types'
import type { Adapter } from './types'
import { getJson, workerUrl } from '../lib/http'
import { clean, makeJob, toISO } from './normalize'
import { stripHtml } from '../lib/html'

type BaSearchResponse = {
  ergebnisliste?: BaListing[]
  maxErgebnisse?: number
}

type BaListing = {
  referenznummer?: string
  stellenangebotsTitel?: string
  hauptberuf?: string
  firma?: string
  externeURL?: string
  homeofficemoeglich?: boolean
  veroeffentlichungszeitraum?: {
    von?: string
  }
  datumErsteVeroeffentlichung?: string
  stellenlokationen?: {
    adresse?: {
      ort?: string
      region?: string
      land?: string
      plz?: string
    }
    breite?: number
    laenge?: number
  }[]
}

/** Public web detail page — a reliable apply/detail link when externeURL is absent. */
function baWebUrl(refnr: string): string {
  return `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`
}

export const fetchBa: Adapter = async (q: SearchQuery, opts = {}) => {
  // Search the role broadly; Klar applies the field/market gate after fetching
  // the posting. Combining every field here can make the upstream API require
  // all terms and hide otherwise relevant account roles.
  const was = q.what.join(' ')
  const wo = q.where?.city ?? ''
  const umkreis = q.where?.radius_km ?? 25
  const page = opts.page ?? 1
  const qs =
    `/pc/v6/jobs?was=${encodeURIComponent(was)}` +
    (wo ? `&wo=${encodeURIComponent(wo)}` : '') +
    `&umkreis=${umkreis}&angebotsart=1&size=50&page=${page}`

  const data = await getJson<BaSearchResponse>(workerUrl('ba', qs), {
    signal: opts.signal,
  })
  // BA omits ergebnisliste entirely when maxErgebnisse is zero.
  const listings = data.ergebnisliste ?? []

  const jobs = listings.flatMap((listing) => {
    const refnr = clean(listing.referenznummer)
    if (!refnr) return []

    const externalUrl = clean(listing.externeURL)
    const workplace = listing.stellenlokationen?.[0]
    const address = workplace?.adresse
    const publishedAt =
      clean(listing.veroeffentlichungszeitraum?.von) ??
      clean(listing.datumErsteVeroeffentlichung)

    return [
      makeJob({
        source: 'ba',
        source_id: refnr,
        title:
          clean(listing.stellenangebotsTitel) ??
          clean(listing.hauptberuf) ??
          'Untitled role',
        company: clean(listing.firma) ?? 'Unknown company',
        location: {
          city: clean(address?.ort),
          region: clean(address?.region),
          country: clean(address?.land) ?? 'Deutschland',
          remote: listing.homeofficemoeglich ?? false,
          lat: workplace?.breite,
          lng: workplace?.laenge,
        },
        description: '', // enriched on demand — see fetchBaDetail
        url:
          externalUrl && /^https?:\/\//i.test(externalUrl)
            ? externalUrl
            : baWebUrl(refnr),
        posted_at: toISO(publishedAt),
        language: 'de',
        tags: [],
        raw: listing,
      }),
    ]
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
  // The detail endpoint remains v4 and keys on base64(refnr).
  const encoded = btoa(refnr)
  const data = await getJson<BaDetail>(
    workerUrl('ba', `/pc/v4/jobdetails/${encoded}`),
    { signal },
  )
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