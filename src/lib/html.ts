// ============================================================================
// HTML helpers. Some sources (Greenhouse) return HTML-entity-ENCODED markup
// (e.g. "&lt;p&gt;"), so we must decode entities BEFORE stripping tags.
// Runs in the browser (uses the DOM) with a regex fallback for non-DOM envs.
// ============================================================================

/** Decode HTML entities like &lt; &amp; &#39; &nbsp; into real characters. */
export function decodeEntities(input: string): string {
  if (!input) return ''
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea')
    ta.innerHTML = input
    return ta.value
  }
  // Fallback for non-browser (tests): handle the common named + numeric entities.
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&')
}

/** Strip HTML tags to readable plaintext, collapsing whitespace. */
export function stripHtml(input: string): string {
  if (!input) return ''
  // If the markup is entity-encoded, decode first so tags become real tags.
  const looksEncoded = input.includes('&lt;') || input.includes('&gt;')
  const html = looksEncoded ? decodeEntities(input) : input
  let text: string
  if (typeof document !== 'undefined') {
    const div = document.createElement('div')
    div.innerHTML = html
    text = div.textContent || div.innerText || ''
  } else {
    text = html
      .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
    text = decodeEntities(text)
  }
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}