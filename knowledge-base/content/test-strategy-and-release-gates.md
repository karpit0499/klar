---
title: "Test Strategy and Release Gates"
description: "Automated, packaged, human, security, and deployment evidence required to change or release Klar."
section: "Quality and Operations"
order: 320
audience: ["Engineering", "QA", "Release engineering", "Security", "Product owners"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Quality Engineering"
last_verified: "2026-08-10"
next_review: "2026-11-10"
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
| Application/export | packet provenance, interruption, DOCX semantics, Word compatibility, ZIP readiness | Artifact integrity and recovery |
| Desktop | IPC validation, package installer, runtime lifecycle, recovery, security, issue redaction | Privilege and local-runtime boundaries |
| Release tooling | human-gate validators, model benchmark schemas, bundle check, notebook freshness | Evidence cannot be forged by the wrong evidence class |
| Packaged QA | Electron smoke and fuse verification | Final archive preserves runtime and security configuration |

The repository currently has 66 `test/*.test.ts` files. `scripts/run-tests.mjs` sorts filenames and executes each in a fresh Node process using `tsx`; any non-zero result stops the suite.

## Complete automated gate

`npm run qa` executes:

1. service-worker syntax check;
2. theme-bootstrap syntax check;
3. generated Kaggle notebook freshness check;
4. application TypeScript check;
5. generated Worker binding type check;
6. Worker TypeScript check;
7. all repository tests;
8. production web build;
9. bundle-size check;
10. desktop-relative renderer build;
11. bundle-size check again; and
12. Cloudflare Worker dry-run deployment.

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

The “Verify and deploy Klar” workflow runs on pull requests and pushes to `main` using Node 22 and `npm ci`. It performs syntax, notebook, app/Worker type, full test, production build, bundle, and Worker dry-run checks. `VITE_WORKER_URL` is injected from repository configuration.

Pull requests verify but do not deploy. A non-pull-request run uploads the exact verified `dist` and the dependent deploy job publishes it to GitHub Pages. Concurrency cancels an older run for the same reference. A failed verify job must never be bypassed by manually publishing a different local build.

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

## Dated authoring verification

During this KB baseline review on 10 August 2026, application type-check, Worker type-check, and the full 66-file regression suite completed successfully against the then-current workspace. The production build, bundle gate, Worker dry run, dependency audits, packaged desktop checks, live sources, and human gates were not rerun as part of the documentation-only task. This is supporting authoring evidence, not release approval.

Operational response and rollback are in [Operations Runbooks](/docs/operations-runbooks). Open qualifications are in [Known Gaps and Risk Register](/docs/known-gaps-and-risk-register).
