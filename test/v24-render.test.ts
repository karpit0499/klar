import { strict as assert } from 'node:assert'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleProvider } from '../src/i18n/LocaleProvider'
import { OpportunityCard } from '../src/ui/OpportunityCard'
import { FlexibleWorkSetup } from '../src/ui/FlexibleWorkSetup'
import { makeOpportunity, makeOpenEntry } from '../src/flexible/opportunity'
import { applyClassification } from '../src/flexible/taxonomy'
import type { NormalizedJob } from '../src/types'

// react-dom/server runs the component functions (initial render) with no DOM —
// a fast, reliable smoke test that the new UI renders without throwing and
// carries the accessibility attributes we require.
function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(h(LocaleProvider, null, node))
}

// --- Vacancy card ------------------------------------------------------------
{
  const vacancy: NormalizedJob = applyClassification(
    makeOpportunity({
      source: 'fabric', source_id: 'rewe:1', connectorId: 'rewe-group', employerFamily: 'REWE Group', brand: 'REWE',
      title: 'Kassierer (m/w/d) Aushilfe', company: 'REWE Group',
      location: { city: 'Berlin', country: 'Deutschland', remote: false },
      url: 'https://jobs.rewe-group.com/1', salary: { min: 13.5, currency: 'EUR', period: 'hour' },
      employment: ['temporary'], workplaces: ['supermarket'],
      fieldProvenance: { employment: { method: 'inferred', source: 'rewe-group', observedAt: '2026-07-19' } },
    }),
    { source: 'rewe-group' },
  )
  const html = render(h(OpportunityCard, { job: vacancy, isNew: true }))
  assert.match(html, /Kassierer/)
  assert.match(html, /jobs\.rewe-group\.com/)
  assert.match(html, /rel="noreferrer"/)
  assert.match(html, /Apply/, 'vacancy shows an apply action')
  assert.match(html, /13,5|13\.5/, 'published hourly pay is shown')
  assert.match(html, /aria-label="Apply/, 'apply link is labelled for screen readers')
  assert.match(html, /inferred by Klar/, 'inferred provenance is disclosed')
}

// --- Open-entry card ---------------------------------------------------------
{
  const openEntry = makeOpenEntry({
    source_id: 'amazon:berlin', connectorId: 'amazon-ops', employerFamily: 'Amazon Operations',
    title: 'Amazon hourly jobs — apply any time', company: 'Amazon Operations',
    location: { city: 'Berlin', country: 'Deutschland', remote: false },
    url: 'https://hiring.amazon.de/', programName: 'Amazon hourly jobs — apply any time',
    cityAvailability: ['Berlin', 'Hamburg'],
  })
  const html = render(h(OpportunityCard, { job: openEntry }))
  assert.match(html, /Open application/, 'open-entry is labelled distinctly, not as a vacancy')
  assert.match(html, /Official route/, 'open-entry links to the official route')
  assert.match(html, /Berlin, Hamburg/, 'city availability listed')
}

// --- Setup form renders with accessible fieldsets ---------------------------
{
  const html = render(h(FlexibleWorkSetup, { onSave: () => {} }))
  assert.match(html, /Find flexible work/)
  assert.match(html, /<fieldset/, 'grouped controls use fieldsets')
  assert.match(html, /<legend/, 'fieldsets are labelled with legends')
  assert.match(html, /Explore flexible work/)
}

console.log('v24-render.test.ts: all tests passed')