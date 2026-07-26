// Run with: npx tsx test/v25-ui.test.ts
//
// v2.5 UI gates. Three kinds of check, all offline:
//   1. RENDER — every new surface renders without throwing and carries the
//      accessibility attributes the project mandates (labelled regions,
//      radiogroups, progressbar, real <label> for every field).
//   2. SOURCE — the wiring the release depends on is actually present.
//   3. DE/EN PARITY — every new key exists in both languages, is non-empty, and
//      is genuinely translated rather than copied.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleProvider } from '../src/i18n/LocaleProvider'
import { CoveragePanel } from '../src/ui/CoveragePanel'
import { TailoringReview } from '../src/ui/TailoringReview'
import { FlexiblePrepare } from '../src/ui/FlexiblePrepare'
import { EngineSettingsCard, FeatureFlagsCard } from '../src/ui/EngineSettings'
import { OpportunityCard } from '../src/ui/OpportunityCard'
import { translations, type TranslationKey } from '../src/i18n/translations'
import { makeOpportunity } from '../src/flexible/opportunity'
import {
  buildAvailabilitySummary, buildEmployerMessage, buildLanguageLine, buildTransportLine,
  profileCardHtml,
} from '../src/flexible/prepare'
import type { ChangeRecord } from '../src/resume/changeSet'
import type { FlexibleWorkPreferences } from '../src/types'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = (path: string) => readFileSync(root + path, 'utf8')

/**
 * The same file with comments stripped. Needed for the apply-automation guard:
 * the files legitimately SAY "no autofill, no auto-submit" in their headers, and
 * we only want to catch it appearing in real code or user-facing copy.
 */
const codeOnly = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(h(LocaleProvider, null, node))
}

// ===========================================================================
// 1. RENDER
// ===========================================================================

// --- Coverage panel ---------------------------------------------------------
{
  const html = render(h(CoveragePanel, {
    coverage: { summary: '2/4 covered — missing: Tableau, Python', covered: ['SQL', 'Excel'], missing: ['Tableau', 'Python'], ratio: 0.5 },
    extraTermCount: 2,
    onImprove: () => {},
    improving: false,
  }))
  assert.match(html, /aria-labelledby="coverage-heading"/, 'coverage: the section is labelled')
  assert.match(html, /role="progressbar"/, 'coverage: the ratio has a progressbar role')
  assert.match(html, /aria-valuenow="50"/, 'coverage: the progressbar reports the real value')
  assert.match(html, /Tableau/, 'coverage: missing terms are listed')
  assert.match(html, /not that you should add it/, 'coverage: the honesty note is shown')
  assert.match(html, /focusing on the gaps/, 'coverage: the targeted re-run is offered')
}

// --- Change review ----------------------------------------------------------
const safeChange: ChangeRecord = {
  id: 'bullet-0-0',
  target: { kind: 'bullet', roleIndex: 0, bulletIndex: 0 },
  location: 'Email Marketing Specialist · Nordlicht GmbH',
  before: 'Segmented audiences and scheduled campaigns each week.',
  after: 'Built weekly audience segmentation and campaign scheduling.',
  reason: 'keywords',
  evidence: ['Segmented audiences and scheduled campaigns each week.'],
  keywordEffect: ['segmentation'],
  finding: { status: 'rephrased', reasons: ['reworded'], addedNumbers: [], addedTerms: [], repeatedTerms: [] },
  decision: 'accepted',
}
const blockedChange: ChangeRecord = {
  ...safeChange,
  id: 'bullet-0-1',
  before: 'Ran A/B tests on subject lines.',
  after: 'Ran A/B tests, lifting opens 40%.',
  finding: { status: 'blocked', reasons: ['unsupported_number'], addedNumbers: ['40%'], addedTerms: [], repeatedTerms: [] },
  decision: 'rejected',
}
{
  const html = render(h(TailoringReview, {
    changes: [safeChange, blockedChange],
    onDecision: () => {}, onEdit: () => {}, onRestore: () => {}, onAcceptAll: () => {},
  }))
  assert.match(html, /aria-labelledby="review-heading"/, 'review: the section is labelled')
  assert.match(html, /role="radiogroup"/, 'review: accept/reject is a radiogroup')
  assert.match(html, /aria-labelledby="change-bullet-0-0-heading"/, 'review: the radiogroup points at its change heading')
  assert.match(html, /aria-checked="true"/, 'review: the current decision is exposed')
  assert.match(html, /Blocked/, 'review: status is carried by text, not colour alone')
  assert.match(html, /Rephrased/, 'review: the safe status is named too')
  assert.match(html, /disabled=""/, 'review: a blocked change cannot be accepted')
  assert.match(html, /1 of 2 accepted/, 'review: the running count is shown')
  assert.match(html, /Accept all/, 'review: bulk accept exists')
  assert.match(html, /need your decision first/, 'review: bulk accept explains why it is off')
  assert.match(html, /Adds posting terms: segmentation/, 'review: the keyword effect is shown')
  assert.match(html, /40%/, 'review: the blocked detail is named')
  assert.match(html, /Show the evidence/, 'review: evidence is reachable')

  const empty = render(h(TailoringReview, {
    changes: [], onDecision: () => {}, onEdit: () => {}, onRestore: () => {}, onAcceptAll: () => {},
  }))
  assert.match(empty, /Nothing changed/, 'review: the empty state is honest, not blank')
}

// --- Flexible prepare -------------------------------------------------------
const flexPreferences: FlexibleWorkPreferences = {
  employment: ['minijob', 'weekend'],
  roleFamilies: ['cashier'],
  workplaces: ['supermarket'],
  locations: [{ city: 'Berlin', radius_km: 15 }],
  schedule: { days: ['saturday', 'sunday'], periods: ['morning'], maxHoursPerWeek: 12 },
  languageComfort: { german: 'B1', english: 'C1' },
  hasBike: true,
  earliestStart: '01.09.2026',
  contact: { name: 'Wei Zhang', email: 'wei@example.com' },
}
const flexOpportunity = makeOpportunity({
  source: 'fabric', source_id: 'rewe:1', connectorId: 'rewe-group', employerFamily: 'REWE Group',
  title: 'Kassierer (m/w/d) Aushilfe', company: 'REWE Group',
  location: { city: 'Berlin', country: 'Deutschland', remote: false },
  url: 'https://jobs.rewe-group.com/1',
})
{
  const html = render(h(FlexiblePrepare, {
    job: flexOpportunity,
    preferences: flexPreferences,
    onSavePreferences: () => {},
    onClose: () => {},
  }))
  assert.match(html, /role="dialog"/, 'prepare: it is a dialog')
  assert.match(html, /aria-modal="true"/, 'prepare: the dialog is modal')
  assert.match(html, /aria-labelledby="flex-prepare-title"/, 'prepare: the dialog is labelled')
  assert.match(html, /for="flex-prepare-name"/, 'prepare: every field has a real label')
  assert.match(html, /for="flex-prepare-message-text"/, 'prepare: the message textarea has a label')
  assert.match(html, /Wei Zhang/, 'prepare: the message signs with the entered name')
  assert.match(html, /Kassierer/, 'prepare: the message names the role')
  assert.match(html, /REWE Group/, 'prepare: the message names the employer')
  assert.match(html, /Saturday|Samstag/, 'prepare: availability reaches the message')
  assert.match(html, /never applies on your behalf|bewirbt sich nie/, 'prepare: the no-auto-apply promise is visible')
  assert.match(html, /jobs\.rewe-group\.com/, 'prepare: the official route is a real link')
  assert.match(html, /rel="noreferrer"/, 'prepare: the external link is safe')
  assert.doesNotMatch(html, /autofill|auto-submit/i, 'prepare: no apply-automation language anywhere')
}

// --- Settings cards ---------------------------------------------------------
{
  const html = render(h(EngineSettingsCard, {}))
  assert.match(html, /for="engine-base-url"/, 'engine: the endpoint field has a label')
  assert.match(html, /for="engine-model"/, 'engine: the model field has a label')
  assert.match(html, /for="engine-fast-model"/, 'engine: the fast-model field has a label')
  assert.match(html, /api\.groq\.com/, 'engine: it starts from the shipped default')
  assert.match(html, /OLLAMA_ORIGINS/, 'engine: the local-model caveat is documented in the UI')
  assert.match(html, /aria-live="polite"/, 'engine: the save confirmation is announced')

  const flags = render(h(FeatureFlagsCard, {}))
  assert.match(flags, /type="checkbox"/, 'flags: each switch is a checkbox')
  assert.match(flags, /application packet per job|Bewerbungspaket/, 'flags: the packet switch is present')
}

// --- OpportunityCard keeps its v2.4 contract and gains Prepare --------------
{
  const withPrepare = render(h(OpportunityCard, { job: flexOpportunity, onPrepare: () => {} }))
  assert.match(withPrepare, /aria-label="Apply/, 'card: the v2.4 apply label is unchanged')
  assert.match(withPrepare, /Prepare message/, 'card: the prepare action appears when it can be saved')
  assert.match(withPrepare, /aria-label="Prepare message —/, 'card: the prepare action is labelled')

  const withoutPrepare = render(h(OpportunityCard, { job: flexOpportunity }))
  assert.doesNotMatch(withoutPrepare, /Prepare message/, 'card: no prepare action without a save path')
}

// ===========================================================================
// 2. SOURCE WIRING
// ===========================================================================
{
  const bundle = source('src/ui/ApplicationBundle.tsx')
  assert.match(bundle, /downloadResumeDocx/, 'bundle: the DOCX export is still wired (v2.3 contract)')
  assert.match(bundle, /printResumeAsPdf/, 'bundle: the PDF export is still wired (v2.3 contract)')
  assert.match(bundle, /CoveragePanel/, 'bundle: the coverage panel is mounted')
  assert.match(bundle, /TailoringReview/, 'bundle: the change review is mounted')
  assert.match(bundle, /extractJdRequirements/, 'bundle: the requirement extractor is used')
  assert.match(bundle, /openPacket/, 'bundle: a packet is opened for the job')
  assert.match(bundle, /beginGeneration/, 'bundle: an in-flight generation is recorded')
  assert.match(bundle, /recordPacketExport/, 'bundle: exports are recorded')
  assert.match(bundle, /role="dialog"/, 'bundle: still a labelled dialog')
  assert.match(bundle, /key === 'Escape'/, 'bundle: Escape closes the drawer (WCAG 2.1.2)')
  assert.match(bundle, /loadAppFlags/, 'bundle: the v2.5 kill switches are honoured')

  // v2.4.3 carried into v2.5: the zero-token path and the pre-flight must survive
  // the packet rewrite, or the hotfix would be silently reverted by this release.
  assert.match(bundle, /runDeterministicTailoring/, 'bundle: the no-AI tailoring path is present')
  assert.match(bundle, /bundle\.noAi/, 'bundle: the no-AI action is offered')
  assert.match(bundle, /estimateTailoringRequest/, 'bundle: the AI request is priced before it is sent')
  assert.match(bundle, /canAfford/, 'bundle: affordability is checked')
  assert.match(bundle, /bundle\.tooLargeAction/, 'bundle: the refusal explains that waiting is futile')
  assert.match(bundle, /disabled=\{tailoringLanguage !== null \|\| improving \|\| aiBlocked\}/, 'bundle: an unaffordable AI request cannot be clicked')
  assert.match(bundle, /bundle\.modeDeterministic/, 'bundle: a reorder is never labelled as an AI rewrite')
  assert.match(bundle, /state\.mode === 'ai' && flags\.tailoringReview/, 'bundle: the change review only appears for an AI run')

  const tailorSource = source('src/llm/tailorResume.ts')
  assert.match(tailorSource, /projectResumeForPrompt/, 'tailoring: the payload is projected, not spread')
  assert.match(tailorSource, /estimateTailoringOutputTokens/, 'tailoring: the reservation is computed')
  assert.doesNotMatch(tailorSource, /maxTokens: 4096/, 'tailoring: the flat 4096 reservation is gone')

  const letterSource = source('src/llm/coverLetter.ts')
  assert.match(letterSource, /projectEvidenceForPrompt/, 'letter: the evidence block is projected')
  assert.doesNotMatch(letterSource, /maxTokens: 1100/, 'letter: the flat reservation is gone')

  const groqSource = source('src/llm/groq.ts')
  assert.match(groqSource, /isRequestTooLarge/, 'client: a too-large request is classified honestly')
  assert.match(groqSource, /saveTpmLimit/, 'client: the real limit is learned from the provider')

  const settings = source('src/ui/SettingsStep.tsx')
  assert.match(settings, /EngineSettingsCard/, 'settings: the engine card is mounted')
  assert.match(settings, /FeatureFlagsCard/, 'settings: the flags card is mounted')

  const groq = source('src/llm/groq.ts')
  assert.match(groq, /loadEngineSettings/, 'client: every call resolves the configured engine')
  assert.doesNotMatch(groq, /GROQ\.baseUrl/, 'client: the hardcoded base URL is gone')
  assert.match(groq, /export const groqChat = chatComplete/, 'client: the old name still works')

  const rerank = source('src/match/rerank.ts')
  assert.match(rerank, /fast: engine\.fastMatching/, 'matching: the cost-control switch is honoured')

  const dbSource = source('src/db/db.ts')
  assert.match(dbSource, /this\.version\(7\)/, 'db: the v7 upgrade exists')
  assert.match(dbSource, /packets: 'id, updatedAt, jobId'/, 'db: the packets store is indexed')

  const vault = source('src/crypto/vault.ts')
  assert.match(vault, /packets: PacketRow\[\]/, 'vault: packets are typed inside the ciphertext')
  assert.match(vault, /db\.packets\.clear\(\)/, 'vault: enabling encryption clears the plaintext table')

  const search = source('src/ui/FlexibleSearch.tsx')
  assert.match(search, /FlexiblePrepare/, 'flexible: the prepare drawer is mounted')
  assert.match(search, /onPrepare=/, 'flexible: the card can open it')

  const app = source('src/App.tsx')
  assert.match(app, /onSavePreferences=/, 'app: the flexible contact block can be saved')

  const tailor = source('src/llm/tailorResume.ts')
  assert.match(tailor, /GENERATION\.maxTailoringAttempts/, 'tailoring: the retry budget comes from config')
  assert.match(tailor, /auditTailoringResponse/, 'tailoring: every response is audited')

  // The permanently excluded feature must not have crept in anywhere.
  for (const path of [
    'src/ui/ApplicationBundle.tsx', 'src/ui/FlexiblePrepare.tsx', 'src/ui/OpportunityCard.tsx',
    'src/flexible/prepare.ts', 'src/packets/store.ts',
  ]) {
    assert.doesNotMatch(codeOnly(path), /fast-?apply|autofill|auto-?submit/i, `${path}: no apply-automation`)
  }
}

// ===========================================================================
// 3. DE/EN PARITY FOR THE NEW SURFACES
// ===========================================================================
{
  const prefixes = ['coverage.', 'review.', 'letter.', 'message.', 'packet.', 'flexPrep.', 'settings.engine.', 'settings.flags.', 'bundle.noAi', 'bundle.mode', 'bundle.cost', 'bundle.tooLarge']
  const newKeys = (Object.keys(translations.en) as TranslationKey[]).filter((key) =>
    prefixes.some((prefix) => key.startsWith(prefix)),
  )
  assert.ok(newKeys.length >= 80, `v2.5 added a full string set (${newKeys.length} keys)`)
  for (const key of newKeys) {
    assert.ok(translations.de[key]?.trim(), `DE string exists for ${key}`)
    assert.ok(translations.en[key]?.trim(), `EN string exists for ${key}`)
  }
  const identical = newKeys.filter((key) => translations.de[key] === translations.en[key])
  // Only proper nouns and product terms may legitimately match.
  assert.ok(
    identical.length <= 6,
    `new DE strings are real translations (${identical.length} identical: ${identical.slice(0, 8).join(', ')})`,
  )
}

// ===========================================================================
// 4. The deterministic flexible generator, in both languages
// ===========================================================================
{
  const en = buildEmployerMessage({ preferences: flexPreferences, job: flexOpportunity, de: false })
  const de = buildEmployerMessage({ preferences: flexPreferences, job: flexOpportunity, de: true })
  assert.match(en, /Kassierer/, 'message EN: names the role')
  assert.match(en, /Saturday and Sunday/, 'message EN: lists the days naturally')
  assert.match(en, /Up to 12 hours per week/, 'message EN: states the hour limit')
  assert.match(en, /I have a bike/, 'message EN: only claims what was ticked')
  assert.doesNotMatch(en, /driving licence/, 'message EN: never claims an unticked option')
  assert.match(de, /Guten Tag/, 'message DE: German salutation')
  assert.match(de, /Samstag und Sonntag/, 'message DE: German days')
  assert.match(de, /Fahrrad/, 'message DE: German transport line')
  assert.match(de, /Freundliche Grüße/, 'message DE: German close')

  assert.equal(
    buildAvailabilitySummary({ ...flexPreferences, schedule: undefined, earliestStart: undefined }, false),
    '',
    'availability: says nothing when nothing was entered',
  )
  assert.equal(buildTransportLine({ ...flexPreferences, hasBike: false }, false), '', 'transport: silent when nothing is ticked')
  assert.match(buildLanguageLine(flexPreferences, true), /Deutsch B1/, 'languages: verbatim from the profile')

  const card = profileCardHtml(flexPreferences, false)
  assert.match(card, /<!doctype html>/, 'card: is a real document')
  assert.match(card, /Wei Zhang/, 'card: carries the name')
  assert.doesNotMatch(card, /<img/, 'card: no photo, ever')
  assert.match(card, /Berlin \(15 km\)/, 'card: lists the search area')
}

console.log('v25-ui.test.ts: all tests passed')