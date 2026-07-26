import { strict as assert } from 'node:assert'
import {
  auditBullet,
  auditRoleTitle,
  extractNumbers,
  extractTechTerms,
} from '../src/llm/evidenceStatus'

assert.deepEqual(
  extractNumbers('Managed 1,234 accounts and improved conversion by 12.5%.'),
  ['1234', '12.5%'],
)
assert.deepEqual(
  extractNumbers('Betreute 1.234 Konten und steigerte die Conversion um 12,5 %.'),
  ['1234', '12.5%'],
)
assert.equal(
  auditBullet({
    sources: ['Managed 1,234 accounts.'],
    after: 'Betreute 1.234 Konten.',
  }).addedNumbers.length,
  0,
  'localised thousands punctuation must remain the same sourced metric',
)

for (const inflated of [
  'Email Marketing Director',
  'Email-Marketing-Direktorin',
  'Bereichsleitung E-Mail-Marketing',
  'Vice President, Lifecycle Marketing',
  'Geschäftsführerin Marketing',
]) {
  assert.equal(
    auditRoleTitle('Email Marketing Specialist', inflated).status,
    'blocked',
    `${inflated} must be recognised as title inflation`,
  )
}

const marketingTools = extractTechTerms(
  'Built lifecycle campaigns with HubSpot, Salesforce, Klaviyo, Mailchimp, Braze, Marketo and GA4.',
)
for (const tool of [
  'HubSpot',
  'Salesforce',
  'Klaviyo',
  'Mailchimp',
  'Braze',
  'Marketo',
  'Google Analytics',
]) {
  assert.ok(marketingTools.includes(tool), `${tool} must participate in evidence checks`)
}

console.log('v2532-evidence-locale.test.ts: all tests passed')
