// ============================================================================
// Safe, dependency-free parsers for the fabric (feeds, sitemaps, JSON-LD).
//
// Regex-based on purpose: identical behaviour in the browser and in Node tests,
// no DOMParser/XML library, and no entity expansion. The Worker has already
// validated the host, capped the byte size, and stripped DOCTYPE/ENTITY
// declarations; we strip them again here as defense in depth before reading.
// ============================================================================
import { decodeEntities, stripHtml } from '../../lib/html'

/** Remove DOCTYPE, ENTITY declarations and processing instructions (anti-XXE). */
export function hardenXml(xml: string): string {
  return xml
    .replace(/<!DOCTYPE[^>]*(\[[^\]]*\])?[^>]*>/gi, '')
    .replace(/<!ENTITY[^>]*>/gi, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
}

function firstTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  if (!match) return undefined
  return unwrapCdata(match[1]).trim() || undefined
}

function unwrapCdata(value: string): string {
  const cdata = value.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  return decodeEntities(cdata ? cdata[1] : value)
}

export type FeedItem = {
  guid?: string
  title?: string
  link?: string
  description?: string
  pubDate?: string
}

/** Parse an RSS or Atom feed into normalized items. */
export function parseFeedItems(xml: string): FeedItem[] {
  const safe = hardenXml(xml)
  const items: FeedItem[] = []

  // RSS <item>…</item>
  for (const match of safe.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = match[0]
    items.push({
      guid: firstTag(block, 'guid'),
      title: firstTag(block, 'title'),
      link: firstTag(block, 'link'),
      description: firstTag(block, 'description'),
      pubDate: firstTag(block, 'pubDate'),
    })
  }
  if (items.length) return items

  // Atom <entry>…</entry>
  for (const match of safe.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) {
    const block = match[0]
    const linkMatch =
      block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
      block.match(/<link[^>]*href=["']([^"']+)["']/i)
    items.push({
      guid: firstTag(block, 'id'),
      title: firstTag(block, 'title'),
      link: linkMatch ? decodeEntities(linkMatch[1]) : undefined,
      description: firstTag(block, 'summary') ?? firstTag(block, 'content'),
      pubDate: firstTag(block, 'updated') ?? firstTag(block, 'published'),
    })
  }
  return items
}

/** Extract <loc> URLs from a sitemap, optionally filtered by substrings. */
export function extractSitemapUrls(xml: string, includes: string[] = []): string[] {
  const urls: string[] = []
  for (const match of hardenXml(xml).matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
    const url = decodeEntities(unwrapCdata(match[1]).trim())
    if (!url) continue
    if (includes.length === 0 || includes.some((needle) => url.includes(needle))) urls.push(url)
  }
  return urls
}

/** Depth-limited JSON parse — rejects pathologically nested payloads (§7). */
export function safeJsonParse(text: string, maxDepth = 20): unknown {
  let depth = 0
  let max = 0
  for (const char of text) {
    if (char === '{' || char === '[') max = Math.max(max, ++depth)
    else if (char === '}' || char === ']') depth--
    if (max > maxDepth) throw new Error(`JSON nesting exceeds ${maxDepth}`)
  }
  return JSON.parse(text)
}

export type JobPostingLd = {
  title?: string
  description?: string
  datePosted?: string
  validThrough?: string
  hiringOrganization?: { name?: string } | string
  jobLocation?: unknown
  baseSalary?: unknown
  employmentType?: string | string[]
  url?: string
  identifier?: unknown
}

function collectJobPostings(node: unknown, out: JobPostingLd[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJobPostings(item, out)
    return
  }
  if (!node || typeof node !== 'object') return
  const record = node as Record<string, unknown>
  const type = record['@type']
  const isJobPosting = type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))
  if (isJobPosting) out.push(record as JobPostingLd)
  if (Array.isArray(record['@graph'])) collectJobPostings(record['@graph'], out)
}

/** Pull every JobPosting JSON-LD block out of an HTML detail page. */
export function extractJsonLdJobPostings(html: string): JobPostingLd[] {
  const out: JobPostingLd[] = []
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  for (const block of blocks) {
    const raw = block[1].trim()
    if (!raw) continue
    try {
      collectJobPostings(safeJsonParse(raw), out)
    } catch {
      // A single malformed block never fails the page — skip and continue.
    }
  }
  return out
}

/** Resolve `hiringOrganization` (object or bare string) to a company name. */
export function ldOrganization(value: JobPostingLd['hiringOrganization']): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  return value.name?.trim() || undefined
}

/** Resolve the first city from a JobPosting `jobLocation` (best-effort). */
export function ldCity(location: unknown): string | undefined {
  const first = Array.isArray(location) ? location[0] : location
  if (!first || typeof first !== 'object') return undefined
  const address = (first as Record<string, unknown>).address
  if (!address || typeof address !== 'object') return undefined
  const locality = (address as Record<string, unknown>).addressLocality
  return typeof locality === 'string' ? locality.trim() || undefined : undefined
}

/** Turn description HTML into safe plaintext (reuses the shared sanitizer). */
export function ldDescription(value: string | undefined): string {
  return value ? stripHtml(value) : ''
}