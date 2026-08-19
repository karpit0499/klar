// ============================================================================
// Greenhouse public job board. Direct browser call (CORS: *). No auth.
//   GET https://boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true
// GOTCHA: `content` is HTML-ENTITY-ENCODED ("&lt;p&gt;"), so stripHtml() must
// decode entities before removing tags (it does — see lib/html.ts).
// ============================================================================
import type { NormalizedJob } from '../../types'
import { getJson } from '../../lib/http'
import { clean, looksRemote, makeJob, toISO } from '../normalize'
import { stripHtml } from '../../lib/html'
import { isAtsLocationAdmitted, parseAtsLocation, type AtsMarketCode } from './location'

type GhResponse = { jobs?: GhJob[] }
type GhJob = {
  id: number
  title: string
  company_name?: string
  absolute_url: string
  content?: string
  updated_at?: string
  first_published?: string
  language?: string
  location?: { name?: string }
  offices?: { location?: string }[]
  departments?: { name?: string }[]
}

export async function fetchGreenhouse(
  company: string,
  slug: string,
  signal?: AbortSignal,
  market: AtsMarketCode | 'dach' = 'dach',
): Promise<NormalizedJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
  const data = await getJson<GhResponse>(url, { signal })
  return (data.jobs ?? []).flatMap((j) => {
      if (!j.id) return []
      const office = j.offices?.[0]?.location // e.g. "München, Germany"
      const parsed = parseAtsLocation({
        locationText: clean(j.location?.name),
        region: clean(office),
        remote: looksRemote(j.location?.name, office),
      })
      if (!isAtsLocationAdmitted(parsed, market)) return []
      return [makeJob({
        source: 'greenhouse',
        source_id: String(j.id),
        title: j.title,
        company: clean(j.company_name) ?? company,
        location: parsed.location,
        description: stripHtml(j.content ?? ''),
        url: j.absolute_url,
        posted_at: toISO(j.first_published ?? j.updated_at),
        language: clean(j.language),
        tags: (j.departments ?? []).map((d) => d.name).filter((x): x is string => !!x),
        raw: j,
      })]
    })
}
