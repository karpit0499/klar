---
title: "Codebase and Domain Catalog"
description: "Ownership map for Klar source directories, runtime entry points, domain responsibilities, and governing invariants."
section: "Architecture"
order: 210
audience: ["Engineering", "Reviewers", "Security", "New contributors"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Engineering"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["codebase", "domains", "ownership", "catalog"]
---

# Codebase and Domain Catalog

## Purpose

This catalog explains why each major code area exists and which invariant it protects. It is an orientation and change-impact document, not a substitute for reading the implementation and tests. The repository, configuration, and current verification evidence remain authoritative under [Source of Truth](/docs/source-of-truth).

## Repository map

| Path | Responsibility | Governing invariant |
| --- | --- | --- |
| `src/main.tsx` | Renderer bootstrap, locale provider, service-worker registration | Service worker runs only in production web, never desktop |
| `src/App.tsx` | Top-level vault gate, onboarding, Career/Flexible mode routing, persistent mounted searches | Flexible Work never requires a Resume; Career discovery does |
| `src/types.ts` | Shared product contracts for jobs, preferences, matches, tracking, search, and Flexible Work | Shared shapes must remain compatible across storage, UI, source, and test boundaries |
| `src/db/` | Dexie schema, migrations, table contracts, database wipe | Every persisted shape has an explicit store and migration strategy |
| `src/storage/` | Vault-aware accessors for career data | Callers should not bypass the encrypted/plaintext routing decision |
| `src/crypto/` | AES-GCM envelopes, passphrase derivation, vault state transitions | Authentication precedes use; sensitive plaintext and active vault ciphertext must not coexist after a completed transition |
| `src/backup/` | Backup formats, integrity, migration, import/export modes | Credential inclusion is explicit and atomic import validates before replacement |
| `src/resume/` | Canonical Resume schema, normalization, persistence, completeness, extraction, and design evaluation | Resume schema version 2 is the sole career-fact authority |
| `src/parse/` | Client-side file text extraction and legacy parsing helpers | Files are parsed locally and untrusted content is bounded before downstream use |
| `src/sources/` | Career source adapters, active/empty/quarantined/retired tenant catalogs, normalization, acquisition, and source health | Candidate or retired tenants never run; individual source failure cannot collapse discovery; all rows normalize before use |
| `src/search/` | Career saved-search identity and diagnostics coordination | “New” is based on durable identities; the first run establishes a baseline |
| `src/match/` | Local filters, deterministic ranking, requirements, and optional independent AI assessment | Eligibility and rank are deterministic and reproducible; the nested AI opinion does not overwrite them |
| `src/regions/` | Supported market configuration and source availability | Market behavior is data-driven and explicit rather than inferred from the Resume |
| `src/flexible/` | Resume-free session orchestration, taxonomy, relevance, deduplication, cache, resilience, and connector registry | Search terminates, unknown remains unknown, and provenance survives every transformation |
| `src/flexible/connectors/` | Source Fabric connector execution and parsing | Retrieval obeys registry capabilities, bounds, validation, and fallback policy |
| `src/application/` | Evidence, writing contracts, workspace routing, generation state, and readiness | Generated content is a proposal and unsupported claims cannot pass export readiness |
| `src/packets/` | Persistent per-job application workspaces and artifact provenance | Each language and artifact retains its own provenance and history |
| `src/export/` | Resume, cover-letter, spreadsheet, PDF/print, and ZIP production | Export uses reviewed current state and stable, versioned format contracts |
| `src/ai/` | Provider-neutral request, capability, adapter, registry, and validation foundation | Providers are explicit; the registry never silently falls back |
| `src/llm/` | Current production provider client, prompt construction, extraction, matching, and tailoring | Structured responses are validated at the consumer; budgets and retry counts are bounded |
| `src/settings/` | Provider settings and credential access | Credentials use session, local setting, or credential vault according to the selected retention mode |
| `src/observability/` | Content-free product events and diagnostics | Operational records contain fixed safe fields, not Resume, job, prompt, or credential content |
| `src/support/` | Redacted issue-report preparation and protected submission client | Ordinary reports require preview and explicit submission; security/privacy reports remain private |
| `src/onboarding/` | Local setup-state and work-mode progression | Setup is recoverable and Flexible Work remains available without a Resume |
| `src/dashboard/`, `src/tracker/` | Local activity summaries, Resume/Support workspace links, and application tracking | These views use local authoritative packet/tracker data |
| `src/i18n/` | English/German interface strings and locale mechanics | Locale changes presentation, not evidence or stored career facts |
| `src/ui/` | Product surfaces and interaction orchestration | UI must preserve domain gates rather than reimplementing or weakening them |
| `worker/src/` | Cloudflare relay, scheduled ATS cache, protected feedback route, and network enforcement | Worker is finite and bounded, never a general proxy or user-content backend |
| `desktop/` | Electron main/preload, model trust, runtime lifecycle, packaging, and signing configuration | Privileged capabilities remain outside the renderer and packages execute only after trust verification |
| `model/` | Model manifests, schemas, experiments, benchmark tools, and evidence | Experimental output is not release evidence; base and adapter claims require the defined gates |
| `scripts/` | Release, registry, bundle, ranking, writing, and document QA automation | Automated gates must be deterministic and fail closed on invalid inputs |
| `qa/` | Packaged desktop smoke and fuse verification | Packaged artifacts, not just source, must preserve the security posture |
| `test/` | Repository test files executed by the custom sorted runner | New behavior needs a test at the closest contract boundary and a regression test for defects |
| `.github/workflows/` | One app-and-KB GitHub Pages deployment plus desktop-preview CI | Deployment follows the repository gates; local success alone is not release approval |
| `knowledge-base/` | Governed Markdown, Next static-export website, lazy search index, and PDF handbooks | `/klar/kb/` output distinguishes current, target, and historical statements and remains subpath-safe |

## Domain dependency direction

The intended dependency direction is:

1. contracts and pure domain rules;
2. storage, source, provider, and runtime adapters;
3. workflow orchestration;
4. UI presentation;
5. deployment and packaging.

UI components may coordinate domain functions, but they must not become the only location for ranking, evidence, encryption, trust, or network-security rules. Worker and Electron checks must remain authoritative in their privileged processes even if the renderer validates first.

## Major business objects

| Object | Authority | Purpose and lifecycle |
| --- | --- | --- |
| `ResumeData` | Canonical Resume row `current` or vault content | Reviewed career facts; normalized at import/edit and versioned through bounded snapshots |
| `Profile` | Derived from `ResumeData` | Thin compatibility/matching projection; never a second career-fact authority |
| `Preferences` | Current local row or vault content | Career and Flexible Work constraints, languages, markets, and optional contact data |
| `NormalizedJob` | Source normalization output and local caches | Common vacancy/open-entry representation, including identities and provenance |
| `RankingSnapshot` | Deterministic ranking pipeline | Reproducible score, features, constraints, explanation, hashes, and version metadata |
| `AiMatchAssessment` | Validated provider response nested in a match | Advisory score and provenance shown separately; never controls deterministic order |
| `SearchSession` | Flexible Work runtime state | One cancellable, deadline-bound query with independent connector attempt states |
| `PacketRow` | Packet store or vault content | Per-job preparation workspace with job snapshot, languages, decisions, generation, and export history |
| `CipherEnvelope` | Vault/backup boundary | Versioned AES-GCM authenticated ciphertext with salt and IV |
| Connector definition | Career/Source Fabric registry | Retrieval capabilities, allowlist, parser version, budgets, validation, fallback, health, and verification state |
| Model package manifest | Desktop package directory | Signed declaration of model files, compatibility, provenance, runtime, platform, and prompt contract |

## Entry points and execution ownership

| Entry point | Executes in | May do | Must not do |
| --- | --- | --- | --- |
| `src/main.tsx` | Browser/Electron renderer | Mount application and web service worker | Acquire Node or arbitrary device privileges |
| `worker/src/index.ts` | Cloudflare Worker | Route, bound, and relay approved requests | Store workspace content or fetch a caller-supplied URL |
| `desktop/main.mjs` | Electron main | Create trusted window, validate IPC, manage runtime | Expose generic filesystem, shell, or process access |
| `desktop/preload.mjs` | Isolated preload | Publish frozen narrow bridge and prevalidate payloads | Expose Electron IPC primitives or secrets |
| `scripts/run-tests.mjs` | Node development/CI | Execute sorted repository tests | Stand in for production build, packaged smoke, human, or signing gates |
| Vite application build | Node development/CI | Type-check and produce static application assets | Prove third-party source health or human writing quality |
| Next KB export | Node development/CI | Validate content and emit static `/klar/kb/` routes, assets, search index, and metadata | Replace dated source checks, PDF visual review, or accessibility testing |

## Change-impact rules

- A shared type change requires checking storage, backup, normalization, UI, fixtures, and historical migration behavior.
- A Resume schema change requires its own schema version, normalization, migration snapshot, vault/backup compatibility, exporter review, and evidence tests.
- A connector change requires registry, Worker allowlist, parser contract, fallback, health, cache, provenance, and failure-isolation review.
- A prompt or generated-artifact change requires input projection, schema, evidence, locale, retry, provenance, export, machine checks, and—where claims change—human gate review.
- A desktop IPC change requires preload and main validation, sender checks, CSP/navigation impact, diagnostics redaction, lifecycle tests, and packaged smoke review.
- A Worker route change requires method, CORS, allowlist, redirects, size, content type, timeout, error disclosure, log, and abuse-control review.

The procedural version of these rules is in [Engineering Setup and Change Guide](/docs/engineering-setup-and-change-guide). Release evidence is defined in [Test Strategy and Release Gates](/docs/test-strategy-and-release-gates).

## Known catalog drift

The header comment in `src/db/db.ts` still says six stores hold all state. That was true for schema version 1; schema version 7 has 17 stores. The executable schema is authoritative. This inconsistency is tracked in [Known Gaps and Risk Register](/docs/known-gaps-and-risk-register).
