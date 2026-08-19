---
title: "Test Strategy and Release Gates"
description: "Automated, packaged, human, security, and deployment evidence required to change or release Klar."
section: "Quality and Operations"
order: 320
audience: ["Engineering", "QA", "Release engineering", "Security", "Product owners"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Quality Engineering"
last_verified: "2026-08-11"
next_review: "2026-09-11"
tags: ["testing", "quality", "release", "ci", "human-gate", "deployment"]
---

# Test Strategy and Release Gates

## Purpose

Klar's release process combines deterministic automation with evidence that code alone cannot provide. A passing unit suite is necessary but does not establish source coverage, writing quality, ranking usefulness, security absence, binary trust, or production readiness.

## Quality principles

1. Test the contract at the boundary that enforces it.
2. Preserve regression coverage for every fixed defect.
3. Exercise invalid, partial, cancelled, stale, and recovery paths.
4. Keep tests deterministic; freeze time, source input, model output, and hashes where relevant.
5. Separate machine diagnostics from human release evidence.
6. Verify built and packaged artifacts, not only source.
7. Re-run temporal evidence such as dependency audits, source checks, and signatures for every release.
8. A gate with missing or ineligible evidence returns **HOLD**, never an assumed pass.

## Automated test layers

| Layer | Examples | Primary purpose |
| --- | --- | --- |
| Pure domain | normalization, deduplication, taxonomy, evidence, ranking features, hashes, migrations | Determinism and invariant correctness |
| Persistence/crypto | fake IndexedDB, vault transitions, wrong passphrase, backup round trips | Atomicity, authentication, compatibility, retention |
| Source/session | source parsers, registry, Worker allowlist, retry/deadline, partial batches, diagnostics | Isolation, safety, honest coverage |
| AI consumers | structured response recovery, invalid schemas, quota/budget, evidence, locale | Fail-closed generated-state behavior |
| Localization | dictionary parity, prohibited Resume variants, selected German code-to-message paths, locale formatting, and unit cases for ß/ss plus umlaut/digraph search | Deterministic bilingual contracts; German and pseudo-long browser review remains manual |
| Application/export | packet provenance, interruption, DOCX semantics, Word compatibility, ZIP readiness | Artifact integrity and recovery |
| Desktop | IPC validation, package installer, runtime lifecycle, recovery, security, issue redaction | Privilege and local-runtime boundaries |
| Release tooling | human-gate validators, model benchmark schemas, bundle check, notebook freshness | Evidence cannot be forged by the wrong evidence class |
| Packaged QA | Electron smoke and fuse verification | Final archive preserves runtime and security configuration |

`scripts/run-tests.mjs` sorts every `test/*.test.ts` file and executes each in a fresh Node process using `tsx`; any non-zero result stops the suite. The count is intentionally not a quality target: source-state, feedback, routing, German, scoring, and service-worker regressions added in v2.6.1 must remain even if files are reorganized.

## Complete automated gate

`npm run qa` executes:

1. repository-wide terminology check, including untracked non-ignored files;
2. service-worker syntax check;
3. theme-bootstrap syntax check;
4. generated Kaggle notebook freshness check;
5. application TypeScript check;
6. generated Worker binding type check;
7. Worker TypeScript check;
8. all repository tests;
9. production web build;
10. bundle-size check;
11. deterministic Playwright browser E2E against the production preview;
12. desktop-relative renderer build;
13. bundle-size check again; and
14. Cloudflare Worker dry-run deployment.

The command creates or replaces generated build output. Run it from a worktree where that write is expected.

## Bundle ceilings

The generated `dist/assets` gate fails when any uncompressed output exceeds:

| Measurement | Ceiling |
| --- | ---: |
| Largest application JavaScript file, excluding PDF worker | 1,000,000 bytes |
| Total application JavaScript, excluding PDF worker | 2,300,000 bytes |
| Largest stylesheet | 100,000 bytes |
| PDF worker | 1,500,000 bytes |

These are byte budgets, not Core Web Vitals, memory, accessibility, or runtime-interaction proof.

## Web CI and deployment

The “Verify and deploy Klar” workflow runs on pull requests and pushes to `main` using Node 22, Python 3.12.13, lockfile installs, and an explicitly installed Playwright Chromium. It performs the complete root gate, dependency audits, a reproducible two-build PDF comparison followed by PDF verification, and the KB content/type/lint/static-build and artifact tests. `VITE_WORKER_URL` is injected from repository configuration.

Pull requests verify but do not deploy. A non-pull-request run assembles the application at `/klar/` and the KB at `/klar/kb/` into one artifact and publishes it to GitHub Pages. Concurrency cancels an older run for the same reference. A failed verify job must never be bypassed by manually publishing a different local build.

## Knowledge-base QA gate

The v2.6.1 KB gate verifies:

- fresh-checkout dependency installation, content build, TypeScript, lint, static export, tests, and dependency audit;
- every public route, asset, canonical, sitemap entry, document fragment, download, and lazy search-index path under `/klar/kb/`;
- no ChatGPT Sites canonical, hosting manifest, missing ignored build plugin, or per-page embedded search corpus;
- no horizontal overflow at 320, 360, 390, 768, 860, 861, 1024, 1180, 1181, and 1440 pixels;
- accessible mobile navigation and in-article contents, visible active document section, 44-pixel targets, keyboard combobox behavior, high-density display, dark mode, and reduced motion; real 200% browser zoom remains a manual acceptance check;
- exact status labels, readable contrast, stable sitemap dates, 404 no-index behavior, and application service-worker pass-through;
- bounded HTML/search-index byte budgets. No Lighthouse/Core Web Vitals CI gate exists yet, so browser performance remains an explicit open evidence gap rather than an inferred pass; and
- PDF output/public hash identity, expected page counts, no blank or clipped pages, absolute published links, language/display-title metadata, and visual render review.

The handbooks remain untagged and have no structure tree. That is an explicit accessibility **HOLD**; the HTML site is the authoritative accessible surface.

The Worker is deployed/configured separately. A passing Worker dry run does not prove live secrets, origins, routes, or third-party sources.

## Desktop preview CI

Desktop-relevant pull requests and manual dispatch run a matrix for macOS 15 arm64 and Windows 2025 x64. Each job:

1. installs with `npm ci`;
2. runs `npm run qa`;
3. runs the production dependency audit;
4. installs the pinned platform runtime;
5. creates an ephemeral CI model-trust identity;
6. builds the unsigned/ad-hoc preview archive;
7. smoke-tests the unpacked application and verifies fuses; and
8. hashes the exact archive.

The workflow deliberately does not publish the unsigned binaries. Its ephemeral key proves mechanics, not production model trust.

Production desktop distribution additionally requires the full build-tool audit, real trust/signing material, macOS notarization, Windows signing, final artifact hashes, packaged smoke/fuse evidence, provenance, and explicit release approval. Current public desktop distribution remains **HOLD**.

## Dependency security gates

- `npm run audit:production` checks production dependencies at high severity.
- `npm run audit:build-tools` checks the complete lockfile at high severity.

Audit results are temporal. The repository records a green result for the lockfile on 10 August 2026, but every release must run both again against the current advisory database. A non-zero result returns distribution to **HOLD** until fixed or explicitly risk-reviewed; a dated prior result cannot be reused.

## Ranking human gate

Automated ranking tests prove mechanics, not usefulness. Eligible release evidence requires:

- at least six scenarios and six job families;
- English and German coverage;
- at least three candidate seniority bands;
- at least 50 frozen jobs and one comparison pair per scenario;
- a final held-out corpus with requirements and hashes;
- exactly two distinct professionally bilingual human reviewers working independently, blind to model scores/order and to each other; and
- human adjudication of every disagreement and required comparator analysis.

The frozen decision gates are:

| Gate | Threshold |
| --- | --- |
| NDCG@10 improvement | At least 20% relative to frozen 2.5.5 |
| Human pairwise agreement | At least 80% with a decisive pair |
| Known hard-constraint violations in top 10 | At most 2% |
| Precision | Current P@5 and P@10 no worse than 2.5.5 |
| Severe seniority mismatch | Current top-10 rate no worse than 2.5.5 |
| Determinism | Repeat, hash, and reversed-input order stable |
| Slices | No language, family, or seniority slice failure hidden by an average |

Synthetic, test, non-human, non-blind, incomplete, or unadjudicated evidence is development-only and returns **HOLD**. The current human ranking release gate is **HOLD**.

## Writing human gate

Eligible writing evidence requires at least 10 samples in each combination of recruiter message/cover letter and English/German: at least 40 outputs total. It uses a held-out, separation-audited corpus, two distinct professionally bilingual independent human reviewers blind to generator/variant and each other, complete claim inventories, and human adjudication.

Frozen gates are:

- recruiter messages rated send-as-is or light-edit at least 90% overall;
- at least 90% separately in English and German;
- exactly zero adjudicated unsupported claims;
- exactly zero unresolved/unclear claims; and
- 100% complete final claim inventory.

The schema also collects human-likeness, reason clarity, request/channel fit, and German formality for analysis, but these are not separate pass thresholds in the current gate implementation. The current human writing release gate is **HOLD**.

## Model benchmark evidence

The local-model benchmark validates package compatibility, base/precision/writer capabilities, strict structure, evidence behavior, latency/token/memory measurements, cancellation, crash recovery, and artifact provenance. Synthetic bilingual fixtures are diagnostics only and do not replace writing/ranking human evidence.

Benchmark runner exit semantics are:

- `0`: all required evidence passed;
- `1`: a required check failed;
- `2`: required evidence is on hold or was not run; and
- `64`: invalid command or configuration.

Missing precision/writer adapter artifacts therefore produce **HOLD**, not an inferred quality pass.

## Manual and external gates

Before a public release, owners must also confirm:

- current supported browser and device journeys;
- English and German critical flows;
- restore and destructive wipe warnings;
- live Worker origin/secrets and health;
- source verification and fallbacks using permitted evidence;
- accessibility and keyboard behavior proportionate to the changed surfaces;
- actual generated-document inspection in supported office/PDF readers;
- privacy/security disclosure accuracy;
- signing/notarization where applicable; and
- all high-priority open risks have an accepted disposition.

## Dated v2.6.1 evidence boundary

On 11 August 2026, the unchanged v2.6.0.1 repository baseline passed the complete root `npm run qa` gate and both dependency audits before v2.6.1 work began. The KB audit also exposed a fresh-checkout build dependency on an ignored Sites plugin, two standalone type errors, mobile layout/search/accessibility defects, oversized per-page search payloads, blank handbook pages, relative PDF links, and untagged PDFs. Those findings define regression tests; the old green baseline cannot approve the changed release.

The 100 new ATS boards and 100 official Flexible Work routes carry dated HTTP evidence from 11 August 2026. This proves reachability and the recorded response class on that date, not future inventory or contractual support. Human ranking and writing, public desktop signing/distribution, comprehensive assistive-technology certification, and tagged PDF remain **HOLD** until their independent evidence is complete.

Operational response and rollback are in [Operations Runbooks](/docs/operations-runbooks). Open qualifications are in [Known Gaps and Risk Register](/docs/known-gaps-and-risk-register).
