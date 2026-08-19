---
title: "Engineering Setup and Change Guide"
description: "Authoritative development setup, local workflows, verification commands, and safe change procedures for each Klar subsystem."
section: "Engineering"
order: 310
audience: ["Engineering", "New contributors", "Reviewers", "Release engineering"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Engineering"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["engineering", "setup", "development", "change-control", "contribution"]
---

# Engineering Setup and Change Guide

## Purpose

This guide provides the minimum reproducible setup and the review path for changes that can affect data, source integrity, generated claims, network trust, or desktop privilege. It does not authorize a release; release gates are defined in [Test Strategy and Release Gates](/docs/test-strategy-and-release-gates).

## Authoritative baseline

Always inspect the Klar repository root directly before designing a release or build guide. Do not reconstruct current behavior from older guides or roadmap prose. Record the current commit, `package.json` release values, worktree state, and the exact evidence used.

Current release metadata is aligned:

- npm/electron package version: `2.6.1`;
- product release: `2.6.1`.

Use `klarRelease` for product documentation and emitted `version.json`; keep every visible version, package manifest, desktop compatibility decision, KB page, and generated handbook deliberate and testable.

## Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`; CI uses Node 22.
- npm and the committed lockfile.
- A modern browser with IndexedDB and Web Crypto.
- A deployed/configured Klar Worker for live proxied sources and reliable hosted Groq access.
- Platform-specific desktop runtime and trust material only when doing desktop package work.

Use `npm ci` for a clean, lockfile-reproducible install. Do not regenerate the lockfile or upgrade pinned desktop tools as a side effect of unrelated work.

## Local startup

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to the ignored `.env.local` only if it does not already exist.
3. Set `VITE_WORKER_URL` to the intended deployed Worker URL without a trailing slash.
4. Start the web renderer with `npm run dev`.
5. For the Electron development shell, use `npm run desktop:dev`.

Never commit real provider credentials, vault/backup passwords, private signing keys, `.env.local`, runtime binaries, model files, or personal test documents. Use synthetic fixtures unless controlled human-evidence procedures explicitly permit anonymized/consented material.

## Fast feedback commands

| Command | Purpose | What it does not prove |
| --- | --- | --- |
| `npm run typecheck` | App TypeScript consistency | Worker, runtime behavior, build output, source health |
| `npm run worker:types:check` | Wrangler-generated binding type freshness | Worker TypeScript semantics or deployment health |
| `npm run worker:check` | Worker TypeScript consistency | Network policy in a deployed zone |
| `npm test` | All sorted `test/*.test.ts` regressions | Production bundle, audits, human gates, packaged binaries |
| `npm run build` | Production web renderer and `version.json` | Desktop-relative asset loading or deployment |
| `npm run build:desktop` | Relative-base renderer for Electron | Signed/package runtime correctness |
| `npm run bundle:check` | Enforce generated bundle byte ceilings | Runtime performance or accessibility |
| `npm run worker:dry-run` | Validate Worker packaging/configuration without deploying | Live Worker/source correctness |
| `npm run qa` | Complete repository automated release gate | Dependency audits, real source verification, human review, signing |

`npm run qa` writes build artifacts under `dist`; use focused non-writing checks during documentation-only or read-only reviews.

## Change procedure

For every change:

1. identify the authoritative domain and invariant in [Codebase and Domain Catalog](/docs/codebase-and-domain-catalog);
2. inspect current implementation, configuration, fixtures, and tests;
3. state current behavior, intended behavior, non-goals, and migration/compatibility impact;
4. add the narrowest domain change and regression tests;
5. verify failure, cancellation, retry, and recovery paths—not only the happy path;
6. update format, prompt, model, parser, schema, or decision versions when meaning changes;
7. update current KB pages and known gaps in the same release change; and
8. run proportionate checks locally, followed by the full CI/release sequence before merge or distribution.

Preserve unrelated worktree changes. Do not use destructive reset/checkout commands to make a review appear clean.

## Data or schema change

- Assign one authority and classify the data as sensitive, credential, operational, or cache.
- Add a new Dexie version; do not rewrite a shipped migration.
- Keep unrelated content migrations out of additive store changes.
- Authenticate/decrypt before mutation and use one transaction for authority changes.
- Update vault content/credential schema, backup modes, historical import, wipe, retention, and locked-state behavior.
- Invalidate derived caches when semantics change.
- Test empty database, upgrade fixtures, vault on/off, wrong passphrase, corrupt data, interruption, backup round trip, and rollback behavior.

See [Data Architecture, Vault, and Backup](/docs/data-architecture-vault-and-backup).

## Resume, packet, or export change

- Preserve Resume schema version 2 unless a coordinated migration is approved.
- Ensure import normalization never invents facts.
- Keep Profile derived.
- Maintain per-language packet independence and per-artifact provenance.
- Enforce evidence at proposal, decision, readiness, and export boundaries.
- Render and inspect DOCX/PDF output; run semantic text and cross-compatibility checks.
- Version the affected generator/format contract and keep historical rows visibly historical.
- Re-run applicable writing human evidence before making new quality claims.

See [Resume and Application Generation](/docs/resume-and-application-generation).

## Career ranking change

- Freeze normalized input and an `asOf` time.
- Keep hard filters, eligibility facts, deterministic rank, preference fit, and posting confidence separate.
- Preserve unknown rather than inferring mismatch.
- Update ranking/requirements/explanation versions when feature meaning or weighting changes.
- Test input-order invariance, stable hashes, source failure, missing fields, hard mismatches, and unbounded visible results.
- Compare against the frozen 2.5.5 baseline and use only eligible bilingual human evidence for release claims.
- Keep the top-level deterministic result and nested `aiAssessment` separate. Test the v2.6.0 merge regression explicitly: provider score/verdict/factors must survive unchanged inside the nested object while the outer Klar score remains authoritative.
- Include provider, normalized endpoint, selected model/fast choice, prompt/schema, scorer, locale, and inputs in assessment cache identity; reject partial or invented AI provenance.

See [Career Discovery and Ranking](/docs/career-discovery-and-ranking).

## Connector or source change

- Verify official ownership and permitted public retrieval behavior.
- Set a finite host/path allowlist, parser version, query/pagination contract, timeout, retry eligibility, content type, byte cap, cache/freshness, fallback, and kill switch.
- Capture licensed or safe fixtures for inventory, zero inventory, malformed, timeout, blocked, removal, redirect, and duplicate cases.
- Preserve per-field provenance and distinguish active, healthy empty, quarantined, retired, candidate, official search, and open entry.
- Never default a missing ATS country to Germany or store a free-form location as a normalized city. Test remote, unknown, multi-city, DACH, and non-DACH rows before regional publication.
- Generate exact client/Worker allowlist parity from one reviewed manifest.
- For ATS expansion, refresh through scheduled Worker ingestion and a bounded cache; a browser request must never fan out across all tenants.
- Prove one connector cannot delay the session past its deadline or erase earlier valid batches.

See [Flexible Work and Source Fabric](/docs/flexible-work-and-source-fabric) and [Worker API and Network Security](/docs/worker-api-and-network-security).

## Provider, model, or prompt change

- Make provider selection explicit; never add a silent cloud/local fallback.
- Minimize the input projection and document which data leaves the device.
- Bound request, output, time, retry, and budget behavior.
- Add consumer-side validation; transport schema mode is not enough.
- Tie generated edits and claims to evidence and preserve human review.
- Update prompt/model/generator provenance and invalid-response fixtures.
- Test quota, empty body, malformed structured output, cancellation, and partial batch results.
- Run machine benchmarks as diagnostics and the applicable held-out human gate for release claims.

See [AI, Provider, Prompt, and Evidence Architecture](/docs/ai-provider-prompt-and-evidence-architecture).

## Worker change

- Add only a finite product route; never accept a caller-supplied upstream URL.
- Define method, origin behavior, host/path, credentials, request/response bounds, redirects, content types, timeout, errors, logs, and abuse controls.
- Revalidate every redirect and keep untrusted upstream content out of logs.
- Run Worker type, allowlist/security tests, generated-types check, and dry run.
- Deploy Worker configuration separately from static Pages and verify the production origin list.
- For public feedback, keep the repository and labels fixed; verify strict shape/size/origin, server-side redaction, Turnstile action/hostname, rate limit, honeypot, stable report ID, no automatic retry, no-store responses, and the private security-report escape route.

## Knowledge-base or Pages change

- Use the Next static export under `/klar/kb/`; do not restore the retired Sites/Vinext/Vite hosting layer or ChatGPT Sites canonical.
- Build the application and KB from the same commit into one GitHub Pages artifact. Prefix logical document, asset, download, canonical, sitemap, and Open Graph paths exactly once.
- Keep application service-worker scope from intercepting `/klar/kb/`, and delete only caches owned by Klar.
- Test a fresh checkout so ignored or untracked build plugins cannot be dependencies.
- Crawl exported routes and fragments; test 320, 360, 390, 768, 860, 861, 1024, 1180, 1181, and 1440 CSS-pixel viewports; test keyboard search, 200% zoom, dark mode, and reduced motion.
- Render every generated PDF page, reject blank or clipped pages and relative production links, compare output/public hashes, and retain the explicit untagged-PDF accessibility HOLD.

## Electron or model-package change

- Keep renderer code free of Electron/Node imports.
- Add only narrow IPC and duplicate validation in preload/main, with main authoritative.
- Review CSP, navigation, permissions, fuses, secret ownership, process cleanup, and diagnostics.
- Preserve signed canonical manifest/checksum verification, path/symlink rejection, compatible trust root, staging, and atomic install.
- Revalidate the pinned runtime before changing version or flags.
- Run packaged smoke and fuse checks on the exact archive; source tests are insufficient.
- Never treat CI's ephemeral trust key or ad-hoc signature as production trust.

See [Electron Desktop and Local Runtime](/docs/electron-desktop-and-local-runtime).

## Documentation change

Use all required frontmatter fields, the canonical term Resume, and `/docs/<slug>` internal links. Distinguish current, target, historical, draft, and deprecated statements. Follow [Contributing Documentation](/docs/contributing-docs), [Documentation Style Guide](/docs/style-guide), and [Source of Truth](/docs/source-of-truth).
