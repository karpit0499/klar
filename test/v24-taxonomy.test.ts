import { strict as assert } from 'node:assert'
import { classifyFlexible, applyClassification } from '../src/flexible/taxonomy'
import { makeOpportunity, makeOpenEntry, isInferredField, overallConfidence } from '../src/flexible/opportunity'
import { employmentLabel, roleLabel, workplaceLabel } from '../src/flexible/labels'
import type { NormalizedJob } from '../src/types'

// --- Deterministic classification across the three dimensions ---------------
{
  const r = classifyFlexible({ title: 'Aushilfe (m/w/d) Kasse in Teilzeit', employer: 'REWE' })
  assert.ok(r.employment.includes('part_time'), 'Teilzeit → part_time')
  assert.ok(r.employment.includes('temporary'), 'Aushilfe → temporary')
  assert.ok(r.roleFamilies.includes('cashier'), 'Kasse → cashier')
  assert.ok(r.workplaces.includes('supermarket'), 'REWE → supermarket')
}
{
  const r = classifyFlexible({ title: 'Werkstudent Lager (m/w/d)', employer: 'Amazon' })
  assert.ok(r.employment.includes('working_student'))
  assert.ok(r.roleFamilies.includes('warehouse'), 'Lager → warehouse role')
}
{
  // The umlaut ASCII digraph "Kuechenhilfe" must classify like "Küchenhilfe".
  const a = classifyFlexible({ title: 'Kuechenhilfe / Spuelkraft', description: 'Restaurant' })
  const b = classifyFlexible({ title: 'Küchenhilfe / Spülkraft', description: 'Restaurant' })
  assert.ok(a.roleFamilies.includes('kitchen') && b.roleFamilies.includes('kitchen'))
}
{
  // Career/management titles must NOT be classified as flexible roles.
  const r = classifyFlexible({ title: 'Marktleiter (m/w/d)', employer: 'Lidl' })
  assert.equal(r.roleFamilies.length, 0, 'Marktleiter is a management role, not shelf/cashier')
  assert.ok(r.workplaces.includes('supermarket'), 'workplace context still detected')
}
{
  // Unknown stays unknown.
  const r = classifyFlexible({ title: 'Data Scientist', description: 'Python, ML' })
  assert.equal(r.employment.length, 0)
  assert.equal(r.roleFamilies.length, 0)
}

// --- applyClassification never overrides published employment ---------------
{
  const job: NormalizedJob = makeOpportunity({
    source: 'fabric', source_id: 'x:1', title: 'Verkäufer (m/w/d)', company: 'REWE',
    location: { country: 'DE', remote: false }, url: 'https://x/1',
    employment: ['part_time'],
    fieldProvenance: { employment: { method: 'feed', source: 'x', observedAt: '2026-01-01' } },
  })
  const classified = applyClassification(job)
  assert.ok(classified.employment?.includes('part_time'), 'published employment preserved and first')
  assert.equal(classified.employment?.[0], 'part_time')
  assert.equal(isInferredField(classified, 'employment'), false, 'published employment stays published')
}

// --- Opportunity model + provenance -----------------------------------------
{
  const open = makeOpenEntry({
    source_id: 'amazon:berlin', connectorId: 'amazon-ops', employerFamily: 'Amazon Operations',
    title: 'Apply any time', company: 'Amazon', location: { city: 'Berlin', country: 'DE', remote: false },
    url: 'https://hiring.amazon.de/', programName: 'Amazon hourly', cityAvailability: ['Berlin'],
  })
  assert.equal(open.kind, 'open_entry')
  assert.equal(open.posted_at, undefined, 'open-entry has no posted date')
  assert.equal(open.programName, 'Amazon hourly')
}
assert.equal(overallConfidence(['api', 'inferred']), 'inferred', 'worst-of confidence')
assert.equal(overallConfidence(['api', 'feed']), 'published')

// --- Bilingual labels --------------------------------------------------------
assert.equal(employmentLabel('minijob', false), 'Minijob')
assert.equal(roleLabel('cashier', true), 'Kasse')
assert.equal(workplaceLabel('hotel', false), 'Hotel')

console.log('v24-taxonomy.test.ts: all tests passed')