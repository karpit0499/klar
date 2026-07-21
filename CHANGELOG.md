# Changelog

This file records the product history of Klar from the original v1 release through the current v2.1 release.

The entries are arranged chronologically so the evolution from the original product to the current build is easy to follow.

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

## v2.1 — Current reliability and bug-fix release

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

## Current status

**v2.1 is the current production release.** Future entries should be appended below this section in chronological order.
