# Changelog

This file records Klar’s product history from the newest release to the original v1 release.

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
