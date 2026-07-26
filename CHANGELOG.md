# Changelog

This file records Klar’s product history from the newest release to the original v1 release.

---

## v2.5.1 — Groq integration hotfix

### Fixed

- Groq AI actions work across desktop and mobile browsers again. Klar now sends
  default Groq requests through its existing fixed Worker relay, avoiding
  browser cross-origin failures.
- The relay accepts only Groq model-listing and chat-completion routes, carries
  each person’s own key only in the request authorization header, never stores
  or echoes it, rejects malformed and oversized requests, and disables response
  caching.
- Custom OpenAI-compatible engines remain direct and are never silently routed
  through Klar.

### Unchanged

No data-schema change, migration, or new dependency. Local search, matching,
tailoring validation, application packets, and existing saved credentials are
unchanged.

---

## v2.5 — Application Quality

Klar could already find the right roles. What it produced for them was still generic: one hidden coverage number, a résumé rewrite you had to accept whole or not at all, an Anglo cover letter with no register control, and nothing kept once the drawer closed. Flexible Work could find a minijob but gave you no way to reach out. This release makes what Klar produces materially better than what you started with — and shows you exactly what it changed and why.

### Added

- **Review every change before you download it.** Tailoring no longer hands back a finished document. Each edit is listed on its own with your wording, Klar's wording, the reason, the evidence it rests on, the posting terms it gained, and its factual status. Accept, reject, edit or restore each one. Rejecting always brings your own sentence back.
- **Four honest factual statuses.** Supported, Rephrased, Needs your confirmation, and Blocked. A change that states a number your résumé does not contain is Blocked — it cannot be accepted and cannot reach an export. Unsupported figures are refused, never suggested.
- **A visible coverage loop.** The posting's key terms, what your résumé already evidences, and what it does not, with a progress bar and a plain note that "not evidenced" is not an instruction to add it. One button re-runs tailoring focused on the gaps.
- **Requirements read from the posting itself.** Beyond the built-in technology dictionary, Klar can now read the concrete requirements a posting states — including non-technical ones like stakeholder communication — so coverage and tailoring work for marketing, logistics, lab and admin roles, not only engineering. Anything the posting does not actually contain is discarded, and results are cached so re-opening a job costs nothing.
- **Cover-letter tone.** Concise, Balanced (the default) or Formal, in English or German, with the German letter written throughout in the Sie-form. The letter now mirrors the posting's vocabulary only where your evidence supports it.
- **A short message** of four to six lines for an email or a LinkedIn note, alongside the full letter.
- **Application packets.** Everything Klar produced for one job — the job snapshot, the tailored résumé and your review decisions, the letter, the short message, your notes, readiness, export history and a bounded version history — is saved as you work and is still there after a reload. English and German are prepared and reviewed independently. If a run is interrupted, Klar says so instead of losing it quietly.
- **Flexible Work: prepare and reach out, with no résumé.** A short, truthful employer message built entirely from the details you chose to enter, an availability summary, and an optional one-page profile card you can print to PDF. You copy the message into the employer's own official route. Klar never fills in a form, never submits, and never applies on your behalf.
- **Choose your AI engine.** Settings now holds the endpoint and the two model ids, so Klar can talk to any OpenAI-compatible service instead of only the built-in default. It can list the models an endpoint really serves, so a retired model id is a clear message instead of an opaque failure. Klar is honest about the limit: a local model on your own machine speaks plain http, which the hosted https site will block — the full local experience is v2.6 work.
- **A cost switch for matching.** Matching is the step that makes the most AI requests. You can send just that step to the smaller, faster model and keep the full model for tailoring and letters.
- **Per-feature switches.** Each part of this release can be turned off on its own in Settings, and each one falls back to a working, honest path.

### Changed

- A tailored résumé's summary now names the exact role you are applying for, phrased as an application rather than a title you hold.
- A role's bullets are ordered by how much of the posting they genuinely evidence, instead of a simple two-way split.
- Past job titles can be tidied but never promoted: a seniority word that is not in your own title is refused.
- No term is repeated more than twice — modern applicant tracking systems penalise keyword stuffing.
- DOCX is stated as the default download, with PDF alongside it.
- Tailoring retries once, and only once, with the exact failure pointed out. After that Klar stops and explains what it could not improve safely instead of trying again endlessly.

### Fixed

- Corrected a comment in the configuration that described the AI model as 70B while the value was the 120B model.

### Carried forward from v2.4.3

The AI-budget work shipped in v2.4.3 is part of this release too, and is not undone by it: the projected prompt payload, the computed output reservation, the honest "too large" refusal, the learned provider limit, and **Tailor without AI**. In v2.5 the no-AI path also stores its own packet, is labelled as a reorder rather than a rewrite, and correctly shows no change review — because a reorder changes no sentence and there is nothing to review.

### Data

Local database schema 6 → 7, adding one new store for application packets. Nothing existing is read, moved or rewritten, so the upgrade cannot fail on your data. When the vault is enabled, packets live inside the encrypted content and never touch a plaintext store. The résumé schema itself is unchanged.

---

## v2.4.3 — Building a résumé no longer runs out of AI

A student ran three searches, found the job she wanted, opened the application packet, clicked the English résumé button, and was told the request exceeded the AI plan's limit. She waited a minute and tried again. Same error. She tried German. Same error. She could not produce a document at all.

Retrying could never have worked. A single résumé request was larger than everything the free AI plan allows in one go — measured at 8,203 to 10,297 tokens against a limit of 8,000 — so the feature had been impossible on the free plan for anyone with an ordinary résumé. Two thirds of every request was information the AI never reads.

This release makes the request small enough to succeed, tells you what it will cost before you spend it, stops pretending that waiting will help when it will not, and adds a way to build a tailored résumé with no AI at all.

### Fixed

- **Tailoring works on a free AI plan.** The request now carries only what the AI actually needs. Internal identifiers, evidence references, your contact details, your languages and certifications, and the padding at the end of long job descriptions are no longer sent — none of it was ever read. A typical request dropped from about 9,200 tokens to about 2,900.
- **Klar no longer reserves room it does not use.** Every AI request has to book space for the answer in advance, and that booking counts against your limit whether it is used or not. Klar was booking 4,096 tokens for an answer that needs about 1,300. The booking is now calculated from the size of your own résumé.
- **"Try again" is gone where it was a lie.** When a request is too large on its own, waiting cannot help. Klar now says exactly that, shows the numbers, and points at the option that does work.
- **Cover letters and job matching got the same treatment.** The letter request is roughly half its former size. Job scoring no longer sends map coordinates and empty fields it never reads, and books a smaller answer.
- **A rate-limited search stops instead of hammering.** A token limit does not clear in the middle of a search, so Klar now stops after two failed batches rather than spending the rest of your requests on calls that cannot succeed. The honest "some jobs were not scored" notice was already there and still appears.
- Corrected a comment in the configuration that described the AI model as 70B while the value was the 120B model.

### Added

- **Tailor without AI.** A résumé built instantly, with no API key and no AI usage at all. Klar reorders your own bullet points and skills so the experience this posting asks for comes first, and writes a summary from your own facts. Your sentences are never changed. It downloads as DOCX and PDF exactly like the AI version, and the packet always says which of the two produced the document — a reordering is never presented as a rewrite.
- **The cost, before you spend it.** The résumé button now shows roughly how much of your AI allowance the request will use.
- **Klar learns your real limit.** AI providers state their actual numbers when they refuse a request. Klar reads and remembers them, so its warnings match your plan instead of a guess.

### Unchanged

No data-schema change, no migration, no new dependencies. Nothing about how the AI is instructed changed — the no-fabrication rules, the evidence binding and the validator are byte-for-byte the same. Only the size of what Klar sends changed.

---

## v2.4.2 — Flexible Work result correctness

Flexible Work was showing jobs it should never have shown: senior professional roles, in cities nobody searched for, labelled with working arrangements the postings never mentioned. A Berlin minijob search could return a €90,000 tax-adviser vacancy in Kaiserslautern tagged "evening" and "kitchen". This release makes the results mean what they say.

### Fixed

- Flexible Work now filters its results. Until now every opportunity a source returned was shown, because the filtering the career search performs was never built for the flexible path. Results are now checked against the requested cities, the requested arrangements, and whether the role is flexible work at all.
- Jobs outside the requested cities no longer appear. One always-on source is a plain "most recent jobs in Germany" feed with no server-side search, and its results were previously published unfiltered.
- Career and qualified-professional roles are excluded. Titles such as tax adviser, lawyer, physician, engineer, developer, consultant and any management or senior title are no longer offered as flexible work, and pay far above any flexible arrangement is treated as evidence on its own.
- Working arrangements are no longer invented from employer perks. "Feierabend" (the end of the working day) was being read as evening work and an office kitchen as kitchen work, because a single incidental word in a description was enough to assert a tag.
- Negated statements are no longer read as their opposite. A posting advertising "no night shift" or "weekends off" was being tagged as night and weekend work.
- Real vacancies now appear before official-route cards. Because a failing source fails quickly, its fallback card used to arrive first and fill the first page with links to search elsewhere.
- Remote roles now show "Remote" instead of the employer's registered city, which previously looked like a location error.
- Fixed a matching fault where any internal keyword containing "ae", "oe" or "ue" could never match, because the text was folded to strip umlauts but the keywords were not.

### Changed

- The source-status panel now states how many results were hidden as not flexible work, so a filtered result set is never silently smaller.
- One source's capability record incorrectly claimed it supported keyword search. It is now recorded honestly as having no server-side query.

### Unchanged

No data-schema change, no migration, no new dependencies. Career discovery, résumé matching and application tooling are untouched.

---

## v2.4.1 — Flexible Work for everyone, and accessibility repairs

Flexible Work was reachable only by people who had never added a résumé. Adding one removed the entire feature from the workspace and stranded any saved flexible searches. Flexible Work is for everyone, so it is now always available, and this release also repairs the colour and labelling defects found in a full accessibility pass over v2.4.

### Fixed

- Flexible Work is now reachable whether or not a résumé exists. A career/flexible switch appears on the dashboard and the search screen once a résumé is present, and the chosen surface is remembered between sessions.
- Saved flexible searches are no longer stranded. Adding a résumé previously hid the only screen that listed them.
- Settings now always offers a route into Flexible Work, and invites first-time setup when no flexible search exists yet, instead of showing an edit action that led nowhere.
- Editing a flexible search now re-runs it. The search session previously started only once when the screen mounted, so edited locations or work types kept returning the previous search's results.
- "New since last check" is recalculated when a different saved search is opened, instead of being computed once per session.
- Result cards no longer force the page to scroll sideways on 320-pixel screens.
- The physical-work question now offers an explicit "no preference" answer, which the data model always allowed but the form never produced.

### Accessibility

- Secondary and tertiary text now meets WCAG 2.1 AA contrast in both light and dark themes. Tertiary text previously measured 2.83:1 in light and 3.26:1 in dark against a 4.5:1 requirement.
- The destructive-action and success colours meet AA in light mode, where they previously measured 3.91:1 and 3.49:1.
- The dark-theme accent meets AA on its own tint, which is the background behind the language toggle, the appearance toggle, the active navigation item, and every accent chip. It previously measured 3.98:1.
- The three free-text fields in the résumé editor now have accessible names. A screen reader previously announced them as unlabelled edit fields.
- The new work-type switch is a standard radio group with 44-pixel targets and wraps rather than overflowing on narrow screens.

### Unchanged

No data-schema change, no new dependency, and no change to search behaviour, matching, connectors, or privacy boundaries. A v2.4 backup restores into v2.4.1 without conversion.

---

## v2.4 — Flexible Work and Source Fabric

Klar v2.4 turns Flexible Work from a preferences screen into a working, résumé-free search, and puts a resilient, honest source layer beneath it. Career discovery, résumé matching, and application tooling are unchanged.

### Added

#### Résumé-free Flexible Work search

- A complete Flexible Work search experience for minijob, part-time, working-student, temporary, seasonal, weekend, evening, and night roles, reachable without a résumé. (In v2.4 this surface was reachable *only* without a résumé; v2.4.1 makes it available to everyone.)
- A progressive search session that publishes its first page as soon as ten results exist, with an eight-second low-supply escape hatch so a thin market still shows results early instead of waiting.
- A sixty-second hard deadline on every search. When the deadline is reached the session finalizes and reports its reason rather than continuing indefinitely.
- Per-source attempt timeouts in a ten-to-fifteen-second band, a maximum of two retries, and twenty results per page.
- Stable, frozen pagination so a page already shown to the reader does not reshuffle when a later source returns.
- In-place cross-source merging that prefers a direct employer link over an aggregator link for the same opportunity.
- A Stop control, per-source status reporting, and an honest partial terminal state that names any source which did not finish.
- A live source-status panel showing each connector as pending, running, succeeded, skipped, timed out, or errored.

#### The Opportunity model and provenance

- An Opportunity model covering both vacancies and open-application routes, replacing the assumption that every result is a dated posting.
- Field-level provenance recording whether each value was published by the source or inferred by Klar, with a derived overall confidence.
- Open-application opportunities rendered with a distinct card treatment and a labelled route to the employer's own application page.
- An inferred-provenance disclosure on the card so a derived detail is never presented as a published fact.
- Expiry handling that removes vacancies past their validity window instead of leaving them in results.

#### The Source Fabric

- A connector registry for Germany covering twenty-one employer families across grocery and discount, drugstore and general retail, logistics and parcel, food service, and hotels, alongside the always-on Bundesagentur für Arbeit, Adzuna, and Arbeitnow baseline.
- Six connector engines: API, feed, sitemap, portal, open-entry, and federated.
- Federated connectors that present a single employer identity while resolving several underlying member sources, used for EDEKA, Hermes, Flink, and the hotel launch pack.
- A guaranteed fallback on every connector, so a family can never appear as a broken placeholder; a failing or unverified connector degrades to an employer-filtered public search or the employer's official careers route.
- A `verified` and `candidate` verification state on every connector, so an unconfirmed integration is labelled honestly rather than presented as validated.
- Safe parsers for JSON, RSS, Atom, sitemap, and HTML detail pages that reject malformed payloads instead of propagating them.

#### Semantic classification

- A taxonomy classifier for employment type, role family, and workplace that works in German and English, including an umlaut-digraph fold so `Küchenhilfe`, `Kuechenhilfe`, and `kitchen help` all resolve to the same role family.
- A career-seniority guard that keeps senior and management titles out of flexible-work results.
- Bilingual role and workplace labels shared by the card, the filters, and the setup screen.
- An optional local embedding suggester for ambiguous titles, off by default behind a feature flag.

#### Resilience, caching, and operations

- A per-connector circuit breaker that opens after four consecutive failures, holds a five-minute cooldown, and then allows a canary probe to test recovery.
- Persisted connector health covering consecutive failures, successes, failures, schema-validation failures, latency, and kill state.
- A thirty-minute result cache with first-seen tracking, expiry pruning, and a stale read for degraded conditions.
- Feature flags for the whole fabric and for the optional embedding classifier, plus per-connector kill switches, all changeable without a redeploy.

#### Worker

- An allowlisted `/fabric` route on the Klar Worker: GET only, a fixed host and path-prefix allowlist, manual redirect handling that re-validates every hop, private and loopback network blocking, byte caps, content-type checking, and XML `DOCTYPE` and `ENTITY` stripping before any payload reaches the browser.
- The browser has no path to an employer host other than this route.

#### Saved Flexible Work searches

- Named Flexible Work searches that store their own preferences and, on each run, highlight only what is genuinely new since the last check, reusing the existing content-fingerprint model so a reposted job is not mislabelled as new.

### Changed

- Upgraded the local database to schema version 6, adding the `flexibleSearches`, `flexibleCache`, and `connectorHealth` stores. Existing data is preserved.
- Replaced the Flexible Work home placeholder with the real workspace, including saved searches and a path to add a résumé for career roles.
- Routed résumé-free users to the progressive Flexible Work search from both the dashboard and the search tab, while leaving the career `SearchStep` and its always-mounted state untouched.
- Mounted the Flexible Work search only when the search tab is active, so it no longer runs a background search from the dashboard.
- Moved the "Add résumé for career roles" label out of component source and into the translation dictionary.
- Extended the English and German dictionaries with the full `flexible.*` key block; parity between the two remains compile-time enforced.

### Fixed

- Fixed a search being able to hang indefinitely on a slow or unresponsive source.
- Fixed a single failing connector being able to empty or block an entire search.
- Fixed results reshuffling under the reader as later sources returned.
- Fixed the same opportunity appearing more than once when several sources carried it, and fixed an aggregator link being preferred over the employer's own link.
- Fixed employers without individual postings being absent from results entirely rather than shown as an open application.
- Fixed inferred details being presented with the same authority as published ones.
- Fixed expired vacancies remaining visible after their validity window had passed.

### Validation

The v2.4 release passed:

```bash
node --check public/sw.js
npm run typecheck
npm test
npm run build
npx tsc --noEmit -p worker/tsconfig.json
```

Twenty-six suites pass in total. Seven are new in this release, covering the taxonomy classifier and Opportunity model, the connector engines and full registry integrity, the progressive search session, resilience and caching and flags and saved searches, Worker allowlist and redirect and content-type and byte-cap security, the user interface wiring, and a server-side render smoke test of the new card and setup form. The registry integrity suite asserts that every employer family carries a working fallback, that attempt timeouts stay inside the ten-to-fifteen-second band, that federated members resolve, and that every registry host is present on the Worker allowlist.

Automated headless-Chromium checks passed at both 1280-pixel and 390-pixel widths with no console errors or warnings, no document-level horizontal overflow, a populated source-status panel, the distinct open-application treatment present, and an honest partial terminal state when a source deliberately fails.

---

## v2.3.1 — Onboarding and mobile polish

Klar v2.3.1 is a focused fix release on top of v2.3. It tightens the new adaptive onboarding, corrects mobile progressive-web-app chrome, and resolves theme and contrast issues, without changing any v2.3 capability.

### Added

- A **Back** control in adaptive onboarding that steps correctly through welcome, résumé, review, preferences, connections, and Flexible Work.
- `viewport-fit=cover` plus top and bottom safe-area insets so content clears the notch and home indicator on modern phones.

### Changed

- Replaced the theme toggle’s raw Unicode glyphs (`☀ ◐ ☾`) with crisp Lucide icons (Sun, Monitor, Moon) that render consistently across platforms.
- Stacked the sidebar rail’s language and appearance controls vertically so the wider appearance control never overflows the fixed 256px rail.
- Rebuilt the language and theme toggles around a nested pill so the active state and focus ring stay contained.
- Corrected the installed app manifest colours to the Klar brand (`#f5f5f3` background, `#0b0b0c` theme) so the launch and browser chrome match the app.

### Fixed

- Fixed inactive theme and language controls using a faint colour that failed the WCAG non-text and text contrast thresholds; inactive states now use the readable muted colour in both themes.
- Fixed the colour-emoji sun glyph appearing on Apple platforms and other inconsistent theme-icon rendering.
- Fixed the mobile bottom navigation’s inactive labels being too low-contrast.
- Fixed mobile header height and top and bottom padding so fixed navigation no longer overlaps page content on notched devices.

### Validation

The v2.3.1 release passed:

```bash
node --check public/sw.js
npm run typecheck
npm test
npm run build
npx tsc --noEmit -p worker/tsconfig.json
```

The v2.3 UI regression suite was extended to assert the onboarding Back control, the Lucide theme icons, and the removal of the old glyphs. Rendered mobile browser checks completed without document-level horizontal overflow or console warnings and errors.

---

## v2.3 — Résumé foundation and adaptive onboarding

Klar v2.3 rebuilds the workspace around a single canonical résumé and an onboarding that adapts to how each person searches, while adding a résumé-free Flexible Work mode and hardening exports and backups.

### Added

#### Canonical résumé foundation

- A single canonical résumé (schema version 2) that is the source of truth for matching, tailoring, cover letters, and interview preparation.
- Stable identifiers on every role, bullet, and skill, plus evidence references linking derived content back to source bullets.
- A lightweight matching profile derived on demand from the canonical résumé rather than stored as a separate, independently editable record.
- Résumé readiness analysis reporting role count, missing dates, roles without achievements, and an overall structural completeness percentage.
- A structured sample résumé used by the explore workspace.

#### In-app résumé editor and history

- A full résumé editor for experience, education, skills, projects, certifications, and languages.
- Reordering of entries, remove-with-undo, and an inline completeness summary in English and German.
- Automatic versioned snapshots with restore, capturing edit, re-upload, and manual reasons.
- History pruning that keeps the ten most recent automatic snapshots within a ninety-day window while preserving named snapshots.

#### Adaptive onboarding

- A new adaptive onboarding flow that replaces the previous blocking key gate and separate profile step.
- A welcome screen offering four paths: build a career profile, find flexible work, restore a Klar backup, or explore a sample workspace.
- Local setup-state detection across absent, partial, complete, and locked workspaces.
- Saved onboarding progress with continue-setup and safe start-over behaviour.
- Restore-from-backup during onboarding with a pre-import preview and password-required detection.
- A just-in-time Groq key prompt that verifies the key at the moment an AI feature needs it.
- A setup checklist and an explicit workspace-capability model covering career discovery, flexible discovery, application preparation, and résumé matching.

#### Flexible Work mode

- A new discovery mode covering career, flexible, or both.
- A résumé-free Flexible Work setup for minijob, part-time, working-student, temporary, seasonal, weekend, evening, and night roles.
- Workplace and role-family selection, multi-city search with per-city radius, schedule and weekly-hours preferences, language comfort, physical-work level, transport, and earliest-start availability.
- A Flexible Work home surface with a path to add a résumé for career roles.
- Validation and normalisation for city, work-type, and radius selections.

#### Explore workspace

- A temporary sample workspace that demonstrates matching and completeness without saving any data, with clear paths to start with real data, restore a backup, or leave the demo.

#### Search session policy

- A shared search-session policy defining per-source attempt timeouts, a sixty-second hard deadline, a maximum retry count, page size, and progressive-publish thresholds.
- Retry rules that retry network and timeout failures, respect `Retry-After` on rate limits, skip retries on authentication and other client errors, and retry recoverable server errors.

### Changed

#### Résumé, matching, and generation

- Routed résumé re-upload, tailoring, cover letters, and interview preparation through the canonical résumé.
- Grounded cover-letter and interview prompts in specific résumé bullet evidence identifiers.
- Derived the matching profile from the canonical résumé and stamped local matches with the `local-v2.3` model version.
- Invalidated stale match caches when the canonical résumé changes.

#### Storage, backup, and vault

- Upgraded the local database and the backup envelope to schema version 5.
- Stored the canonical résumé inside the encrypted vault as sensitive content.
- Included Flexible Work preferences in the standard backup and validated them on import, rejecting invalid employment or schedule data before the active workspace is touched.
- Added migration of v2.2 standard and complete-encrypted backups into the v2.3 format.
- Preserved transactional, all-or-nothing restore behaviour and SHA-256 integrity checks.

#### Interface and setup

- Replaced the fixed key gate and standalone profile step with the adaptive onboarding frame.
- Localised the new résumé editor, Flexible Work setup, explore workspace, and onboarding copy in English and German.
- Added Settings entries to edit the Flexible Work search and reach the Backup and Encryption safety centre.

### Fixed

- Fixed derived profiles being persisted and edited independently of the résumé they came from.
- Fixed generated cover letters and interview material that were not explicitly tied to source résumé bullets.
- Fixed stale match results surviving a résumé change.
- Fixed spreadsheet and CSV exports being able to emit unescaped formula-injection payloads; leading `=`, `+`, `-`, and `@` values are now neutralised and sheet names are sanitised and length-capped.
- Fixed Flexible Work having no résumé-free path, previously forcing an empty résumé to exist.

### Validation

The v2.3 release passed:

```bash
node --check public/sw.js
npm run typecheck
npm test
npm run build
npx tsc --noEmit -p worker/tsconfig.json
```

New suites covered the canonical résumé model and history pruning, Flexible Work preferences and setup, the v5 backup and migration path, export formula-injection safety, and the updated onboarding and résumé user interface. The complete legacy suites from v1 through v2.2 continued to pass, and the production build and rendered mobile browser checks completed without document-level horizontal overflow or console warnings and errors.

---

## v2.2 — Stability & Safety

Klar v2.2 strengthens privacy, recovery, search transparency, and day-to-day reliability without changing the central v2.1 product experience.

### Added

#### Backup, restore, and recovery

- Versioned Klar backup envelopes with a format identifier, database schema version, application version, and export timestamp.
- A credential-free standard backup for routine workspace recovery.
- A complete encrypted backup for moving workspace data together with encrypted Groq and Adzuna credentials.
- A separately confirmed readable export for sensitive career data; API credentials remain excluded.
- SHA-256 integrity checks and full structural validation before an import can write data.
- Transactional restore behaviour so an invalid, damaged, or incompatible file cannot partially replace the current workspace.
- Migration support for representative v1, v2, and v2.1 data.
- Safe detection of complete, partial, and absent local setup states.
- A Backup & Encryption safety centre in Settings.
- An explicit unrecoverable-passphrase acknowledgement before encryption can be enabled.

#### Search transparency

- Expandable diagnostics for every completed search.
- Per-source success or failure status and raw result counts.
- Counts for removed duplicates and for every applied local filter.
- Visibility into jobs that could not be checked against the distance filter.
- A final result count and categorized source errors.
- Relevant recovery guidance for zero-result searches.
- Clear warnings when an origin city cannot be resolved and the distance filter was not enforced.
- Warnings for dangerously short hidden-company terms.

#### Connections and error recovery

- An Adzuna connection test in Settings.
- Separate feedback for invalid credentials, rate limits, upstream failures, and network failures.
- A shared recoverable-error model covering credentials, sources, parsing, locked data, storage, imports, and exports.
- Error messages that explain what happened, whether data is safe, what remains available, and the best recovery action.

#### Regression protection

- Security tests for vault locking, unlocking, wrong passphrases, encrypted storage, and credential boundaries.
- Backup tests for standard, complete encrypted, readable, damaged, and legacy imports.
- Search-safety tests for source diagnostics, honest filters, deduplication, and saved-search identity.
- English/German generation and mobile-layout smoke tests.
- A real Dexie v3-to-v4 migration test.

### Changed

#### Encryption and local data

- Expanded optional encryption from résumé-only protection to the complete sensitive workspace boundary.
- Protected profiles, preferences, career and search caches, matches, vectors, saved searches, rich résumé data, dashboard data, and tracker data.
- Kept credentials in a separate encrypted vault partition.
- Removed confirmed raw résumé text from new and migrated stored profiles.
- Added locked-state gates so encrypted content cannot reach matching, résumé generation, or application tools.
- Kept the active vault key in memory for the current session only.
- Added safe lock/write coordination and queued mutation recovery.

#### Search and sources

- Made Adzuna credentials atomic: Klar now uses the complete user pair or the complete Worker pair and never mixes the two.
- Updated the Worker and browser adapter to return structured, categorized Adzuna failures.
- Made hidden-company matching normalized, exact, or word-aware instead of relying on unsafe partial matches.
- Made filter enforcement visible when location information is unavailable.
- Added source-aware deduplication details.
- Corrected saved-search first-run baselining so existing results are not all labelled new.
- Added merged source identities and content fingerprints for detecting genuinely new or changed listings.
- Capped and expired old seen-result history.
- Invalidated obsolete match caches after profile changes.

#### Storage and compatibility

- Upgraded the local database to schema v4.
- Added a typed encrypted-vault record and migration cleanup.
- Preserved existing v2.1 workspace data through the upgrade.
- Prepared backup, migration, and setup-state foundations for the later adaptive-onboarding release.

#### Layout and bilingual behaviour

- Stabilized long English and German labels, mobile drawers, button wrapping, loading layouts, small-screen dialogs, and touch targets.
- Checked the completed interface at 320px and 390px mobile widths in both languages.

### Fixed

- Fixed sensitive career records remaining outside the advertised encryption boundary.
- Fixed stored API credentials not sharing the same protected vault lifecycle as sensitive career data.
- Fixed wrong-passphrase paths that could risk unsafe state transitions.
- Fixed the possibility of ciphertext reaching builders or generators.
- Fixed standard exports having ambiguous credential and encrypted-content boundaries.
- Fixed invalid imports being able to begin before the full backup was validated.
- Fixed partial Adzuna credentials producing mixed authentication behaviour.
- Fixed zero-result searches offering too little information to understand the cause.
- Fixed unresolved distance origins silently implying that the distance filter had run.
- Fixed overly broad hidden-company substring matching.
- Fixed first-run saved searches treating every existing result as new.
- Fixed stale match caches surviving profile changes.

### Validation

The v2.2 release passed:

```bash
node --check public/sw.js
npm run typecheck
npm test
npm run build
npx tsc --noEmit -p worker/tsconfig.json
```

The complete legacy and v2.2 automated suites passed, including security, backup, search-safety, localization, résumé generation, source behaviour, and database migration coverage. The production build and rendered mobile browser checks completed without document-level horizontal overflow or console warnings and errors.

---

## v2.1 — Reliability and bug-fix release

Klar v2.1 keeps the v2 feature set and focuses on trustworthy deliverables, responsive behaviour, consistent state, honest failure handling, parsing accuracy, and safe production updates.

### Added

#### Onboarding and preferences

- Groq credentials, optional Adzuna credentials, Language, and Appearance on the first setup screen.
- Separate, stacked Language and Appearance controls with Language shown first.
- English as the default locale for a new browser while preserving an existing saved preference.
- Reusable preference-row controls.
- Complete English and German copy for the affected setup and Settings flows.

#### Résumé deliverables

- User-selectable English and German résumé generation for every supported job.
- Guarded AI résumé tailoring designed to make materially stronger job-specific rewrites.
- Evidence mapping from generated bullets back to source résumé bullets.
- Protection for employers, dates, schools, certifications, metrics, tools, and other résumé facts.
- Language-specific DOCX and PDF filenames.
- Explicit failure handling so an unchanged or stale result is never presented as successfully tailored.

#### Regression coverage

- Automated regression tests for bilingual résumé output.
- Tests for protected facts and evidence guards.
- Tests for partial scoring failure behaviour.
- Tests for Go keyword false positives.
- Tests for present/current-role date parsing.

### Changed

#### UI foundation

- Replaced fixed-height assumptions with dynamic viewport rules.
- Added mobile safe-area and bottom-navigation clearance.
- Standardised bounded page widths and reading widths.
- Reduced mobile page gutters to a consistent 16px.
- Improved readable type sizes and wrapping behaviour.
- Increased Klar wordmark and navigation readability.
- Standardised navigation on Lucide icons.
- Increased shared input and button readability while maintaining touch targets.

#### Settings and first-run experience

- Added editable Adzuna App ID and App Key fields to Settings.
- Added save and remove actions for Adzuna credentials.
- Localized Settings and résumé re-upload controls completely in English and German.
- Distinguished missing credentials from a temporarily unavailable salary benchmark.
- Preserved credential exclusion from exported backups.

#### Search and application state

- Kept completed search results mounted when navigating to Dashboard, Tracker, or Settings.
- Reset each top-level destination to the top instead of inheriting another page's scroll position.
- Synchronised saved state between Job Card, Job Drawer, and Tracker.
- Standardised weighted-score calculation across Search, Tracker board, Tracker list, and Tracked Drawer.
- Persisted custom score weights consistently.

#### Deployment behaviour

- Changed service-worker navigation handling to favour current deployment HTML.
- Added safer worker activation and update behaviour.
- Reduced the risk of an older cached HTML shell requesting deleted hashed JavaScript or CSS assets.

### Fixed

#### Responsive layout and text overlap

- Prevented document-level horizontal scrolling.
- Fixed non-shrinking flex children.
- Fixed fixed-width labels that collided with translated content.
- Fixed long job titles, company names, URLs, score rows, action rows, and gap-summary labels.
- Made mobile Dashboard identity and link fields full width.
- Ensured destructive and remove controls meet the 44px touch-target requirement.
- Kept drawer content above mobile navigation and device safe areas.
- Prevented drawers from scrolling the page behind them.
- Improved layout at 320px through large desktop widths and at browser zoom levels up to 200%.

#### Résumé generation quality

- Fixed the earlier deterministic output being too similar to the uploaded résumé.
- Added aggressive rewording, reordering, and job-specific emphasis while retaining source truth.
- Fixed output language being implicitly chosen instead of explicitly user-selectable.
- Prevented generation failures from exposing old output as a new result.

#### Search and scoring reliability

- Fixed search results disappearing after a round trip through another section.
- Fixed failed scoring batches becoming fake `0/100` cards.
- Added a partial-results notice when a scoring batch fails.
- Omitted failed jobs from the current result set.
- Allowed omitted batches to be retried on a later search.
- Fixed score and saved-state disagreements between discovery and tracking views.

#### Parsing and keyword accuracy

- Prevented product phrases such as `go-live` and `go-to-market` from being interpreted as the Go programming language.
- Calculated present/current role duration against today's date.
- Kept each title's duration tied to its own date range instead of conflating it with total experience.

#### Production updates

- Fixed returning users being stranded on stale cached HTML that referenced bundles removed by a new deployment.
- Preserved offline app-shell fallback while making online navigations network-first.

### Validation and release requirements

The v2.1 guide requires all of the following before release:

```bash
node --check public/sw.js
npm run typecheck
npm test
npm run build
```

The manual release checklist also covers:

- Fresh-browser onboarding.
- Complete Settings localization.
- Adzuna save/remove and secret-free exports.
- Dashboard editing at 320px.
- Search persistence across every top-level destination.
- Score and saved-state consistency across every view.
- English and German résumé generation for English and German postings.
- Fact preservation and evidence grounding.
- Drawer and overflow behaviour at eight target viewport sizes.
- Light/dark themes, English/German copy, and browser zoom.
- Offline fallback and service-worker update behaviour after deployment.

---

## v2 — Major product and UI release

Klar v2 transformed the v1 application into a polished, accessible, bilingual, multi-country job-search and application workspace.

### Added

#### Design, responsiveness, and accessibility

- Complete visual redesign using the Klar brand system.
- Semantic design tokens shared by light and dark themes.
- Light, dark, and system appearance modes with no flash of the wrong theme.
- Responsive desktop navigation rail and mobile bottom navigation.
- Accessible skip link, dialog semantics, keyboard focus treatment, reduced-motion support, and 44px touch targets.
- Consistent score, salary, badge, chip, and typography treatments.
- Initial card overflow protection for long titles and company names.
- Lucide icon system and updated Klar wordmark treatment.

#### Sources and market expansion

- User-supplied Adzuna App ID and App Key stored locally.
- Per-request Adzuna credentials relayed through the Worker without query-string leakage.
- Country-aware Adzuna routing.
- Expansion to Germany, Austria, Switzerland, the Netherlands, Luxembourg, and Liechtenstein.
- Registry expansion to more than 200 verified and candidate ATS company boards.
- Registry verification and structural test scripts.

#### Discovery controls

- Employment-type filters.
- Student and Werkstudent mode.
- Hide list for unwanted jobs.
- Distance and posting-recency filters.
- Saved searches.
- New-since-last-check result detection.

#### Résumé and application suite

- Résumé re-upload and replacement without resetting tracked jobs or preferences.
- Rich résumé data model for contact details, roles, dated experience, skills, education, languages, projects, and certifications.
- Per-job tailored résumé generation.
- ATS-safe, table-free DOCX output.
- Text-based, selectable PDF output.
- Résumé-to-job-description keyword coverage report.
- Missing-skill badges and coverage summary.
- Adzuna salary histogram insights.
- One-click application workspace combining tailored résumé, coverage, cover letter, and salary guidance.

#### LLM and matching depth

- Job-description translation.
- Per-job interview preparation.
- Behavioural and role-specific questions.
- Profile-grounded answer scaffolds, talking points, and gap strategies.
- Reusable ranking metrics.
- Hashing-versus-neural embedder evaluation and ship gate.
- Optional neural embedding implementation.

#### Localization, salary, and trust

- Full English/German interface.
- Type-safe translation dictionary whose German completeness is checked by TypeScript.
- German Brutto-to-Netto salary estimator using the 2025 tax formula and major social-insurance deductions.
- Optional client-side résumé encryption using AES-GCM and PBKDF2.
- Passphrase kept out of storage.

### Changed

- Rebuilt the application shell, screens, atoms, theme engine, and global CSS around shared semantic tokens.
- Threaded country, region, and Adzuna credential data through job gathering.
- Added a new Dexie saved-search store and migration.
- Expanded the application bundle around a richer persisted résumé.
- Restyled and localized onboarding, dashboard, search, job drawer, tracker, résumé workflow, and Settings.
- Added richer test coverage across regions, sources, discovery, résumés, embedding evaluation, localization, salary, and encryption.

### Fixed during the v2 QA pass

- Fixed a first-time-user blank screen caused by treating a missing preferences row as the loading state.
- Fixed résumé re-upload previews rendering title objects as `[object Object]`.
- Fixed Swiss Adzuna jobs being labelled as EUR instead of CHF.
- Fixed salary benchmark formatting being hard-coded to the euro symbol.
- Fixed German tax class VI incorrectly producing the same estimate as tax class I.

### Validation

- TypeScript compilation and production build were validated.
- Fourteen test suites completed with 246 passing checks at the end of the v2 guide.
- DOCX parse safety, localization completeness, salary logic, ranking utilities, saved-search behaviour, and encryption were explicitly tested.

---

## v1 — Original release

Klar v1 established the privacy-first architecture and the complete original job-search workflow.

### Added

#### Job discovery

- Live job gathering from Arbeitnow, Greenhouse, Lever, Ashby, Bundesagentur für Arbeit, and optional Adzuna.
- Source normalization and cross-source deduplication.
- Region-aware discovery for the original German-market focus, with early Netherlands support.
- A configurable employer ATS registry.
- German-language and visa-sponsorship hard filters.

#### Résumé and profile

- Browser-side PDF and DOCX text extraction.
- Groq-assisted résumé parsing into a structured profile.
- Intake preferences for target roles, location, language level, remote work, and market constraints.
- Local dashboard with profile details and an optional photo.

#### Matching and explainability

- Two-stage matching: deterministic pre-filter followed by LLM re-ranking.
- Explainable factor breakdown for each fit score.
- User-adjustable score weights without another LLM request.
- Aggregated skill-gap analysis across matched jobs.
- Optional local cosine-similarity semantic pre-filter.
- Offline ranking evaluation using precision-at-k and rank-correlation metrics.

#### Application tracking

- Job saving and a drag-and-drop Kanban tracker.
- Flat list view for saved applications.
- Notes, contacts, reminders, and follow-up nudges.
- Age-based staleness flags for older saved postings.
- Cover-letter drafting for individual jobs.

#### Data ownership and portability

- IndexedDB persistence through Dexie.
- CSV, XLSX, and PDF exports.
- JSON backup and restore.
- Delete-all-data control and data-loss warnings.
- Secrets excluded from backup exports.
- Installable Progressive Web App and GitHub Pages deployment.

### Architecture and privacy decisions

- Kept the main application static and browser-based.
- Called CORS-compatible sources directly from the browser.
- Used a small allow-listed Cloudflare Worker only for Bundesagentur and Adzuna requests.
- Sent Groq requests directly from the browser using the user's key rather than routing them through Klar infrastructure.
- Used versioned IndexedDB migrations for returning users.
- Used deterministic shortlisting before LLM scoring to reduce latency and API use.
