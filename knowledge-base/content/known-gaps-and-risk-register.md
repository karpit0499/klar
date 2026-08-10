---
title: "Known Gaps and Risk Register"
description: "Verified current limitations, control gaps, evidence holds, accepted boundaries, and closure criteria for Klar 2.6.0.1."
section: "Quality and Operations"
order: 340
audience: ["Leadership", "Engineering", "Security", "Product", "Release owners", "Operations"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Engineering"
last_verified: "2026-08-10"
next_review: "2026-09-10"
tags: ["risk", "known-gaps", "limitations", "hold", "technical-debt"]
---

# Known Gaps and Risk Register

## Purpose

This register prevents implemented foundations, roadmap intent, or passing machine tests from being mistaken for completed product or release claims. It records gaps verified during the 2.6.0.1 code review. Priority describes potential product impact, not a formal vulnerability score.

| Priority | Meaning |
| --- | --- |
| Critical | Immediate credible risk of severe exposure, irreversible loss, or unsafe distribution; stop affected operation |
| High | Material integrity, privacy, availability, or release-claim risk requiring explicit disposition before broad release |
| Medium | Bounded control or reliability gap requiring planned correction or documented acceptance |
| Low | Maintainability, terminology, or evidence clarity issue with limited immediate user impact |

No item is closed by prose alone. Closure requires the named implementation/control change, tests, relevant human or live evidence, documentation update, and owner approval.

## Open and held items

| ID | Priority | Area | Current state and impact | Current control | Closure evidence | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| KG-001 | High | Source verification | Career acquisition fans out across 47 verified and 162 candidate ATS entries. Source Fabric marks only 3 of 36 enabled definitions verified; candidate status is not an execution gate. Configured coverage can be mistaken for verified support and can add load/failures. | Per-source isolation, bounded concurrency/session, fallbacks, provenance, health | Verification field enforced for production plans or a separately approved candidate channel; full connector release evidence and honest UI counts | Source Engineering | Open |
| KG-002 | High | Flexible Work integrity | When no Worker URL exists, the live Flexible Work hook can return deterministic synthetic fixtures with `usingFixtures=true`. A misconfigured production build could present test opportunities as live. | Runtime marker and deterministic provenance available to UI/tests | Production build/deployment assertion prevents silent fixture mode; visible non-live label in permitted development/offline mode; deployment test | Platform Engineering | Open |
| KG-003 | High | Human quality evidence | Human ranking and bilingual writing release gates are **HOLD**. Automated/synthetic tests cannot prove usefulness, sendability, or absence of every unsupported claim. | Strict evidence schemas and fail-closed gate tools | Eligible held-out corpora, two independent bilingual human reviews, adjudication, all frozen thresholds passed | Product Quality | Evidence hold |
| KG-004 | High | Desktop distribution | Experimental artifacts are unsigned/ad hoc and are not publicly distributed; production signing/notarization is not complete. Precision/writer adapter packages and evidence remain **HOLD**. | CI does not publish experimental binaries; explicit fuses, trust package checks, smoke/hashes | Production keys and provenance, audits, signed/notarized exact artifacts, smoke/fuse/hash evidence, adapter evidence or scope exclusion, approval | Release Engineering | Evidence hold |
| KG-005 | High | BA continuity | BA integration depends on separate undocumented public-web search and detail contracts that can change without a public compatibility guarantee. | Contract regressions, source isolation, source status, other sources/fallback | Supported durable interface or monitored contract with prompt kill/fallback and current live evidence | Source Engineering | Open/external dependency |
| KG-006 | Medium | Local-model product path | Provider-neutral cloud/local registry and desktop runtime work in tests/panel, but normal Resume and application-generation call sites still use the existing cloud-compatible client. On-device generation is not a complete user workflow. | Documentation and explicit panel boundary; no silent provider fallback | Production capability routing through explicit provider selection, privacy disclosure, end-to-end evidence/export tests, model/human gates | AI Engineering | Open |
| KG-007 | Medium | Worker resource and abuse controls | Resource limits and identity-aware abuse controls are not yet uniform across every public relay. Browser-origin policy alone is not an abuse-control boundary. | Fixed routes/hosts, provider credentials/quotas, bounded high-risk paths, production origin allowlist | Bounded request/response/timeout policy on every route plus appropriate rate/session abuse controls and load/security tests | Platform Security | Open |
| KG-008 | Medium | Worker request-forgery defense | Destination validation needs additional defense in depth across address formats, name resolution, and redirect handling. | Fixed host/path allowlist, HTTPS reconstruction, redirect revalidation, public-network Worker setting | Reviewed destination-validation strategy with comprehensive private-network and redirect security tests | Platform Security | Open |
| KG-009 | Medium | Backup trust | SHA-256 backup integrity is not author authentication, and import validation does not deeply validate every nested row. A self-consistent edited or malicious file can remain risky. | Format/version checks, encrypted AES-GCM authentication, primary structural validation, atomic replacement | Authenticated/signed origin option where required; comprehensive bounded schema/size/depth validation and hostile-import tests | Data Engineering | Open |
| KG-010 | Medium | Flexible pagination | Roadmap promises frozen visible page assignments. Current session keeps stable append order and in-place merges but chunks the evolving ordered array rather than persisting an immutable page ledger. | No intentional re-sort after publish; duplicate enrichment in place; tests | Explicit published-page assignment state and regression tests for late high-score/duplicate batches, filters, back navigation | Discovery Engineering | Open |
| KG-011 | Medium | Connector recovery | Breaker opens after four failures for five minutes, but persisted health has no distinct low-frequency canary state; post-cooldown requests are simply eligible. Fallback success can obscure direct-path failure in aggregate observation. | Cooldown, local kill switch, health ledger, fallbacks | Explicit half-open/canary state and metrics separating direct from fallback success | Source Engineering | Open |
| KG-012 | Medium | Operational control | Connector kill switches and feature flags are client-local/static; there is no centrally managed remote operator switch that can disable a bad connector across installed clients without a new deployment or user-local state. | Per-client health/kill state and redeployable configuration | Authenticated privacy-safe remote control or an explicitly accepted static-operation model with tested emergency rollout | Operations | Open |
| KG-013 | Medium | Accessibility/performance evidence | The automated release gate enforces bundle bytes and many UI regressions, but does not run a comprehensive browser accessibility scan or Core Web Vitals/Lighthouse budget. | Semantic UI tests, render tests, manual review, byte ceilings | Defined supported-browser accessibility and performance budgets with deterministic CI and manual assistive-technology evidence | Quality Engineering | Open |
| KG-014 | Medium | Observability | Browser events are local/content-free and desktop diagnostics are bounded/in-memory. This protects privacy but limits fleet-wide source/runtime incident detection; regex redaction is not formal DLP. | Fixed event schema, safe tokens, 100/200 limits, user preview before report | Approved privacy-preserving aggregate operations design or documented acceptance; adversarial redaction tests and review | Operations and Privacy | Open/accepted tradeoff |
| KG-015 | Low | Ranking provenance | Outer match rows can still say `local-v2.3` while their deterministic snapshot says `ranking-v2.6.0`, which can confuse consumers. | Snapshot includes authoritative ranking/requirements/explanation versions and historical markers | Migrate/deprecate legacy label with cache compatibility tests and documentation | Discovery Engineering | Open |
| KG-016 | Low | Schema documentation drift | `src/db/db.ts` header says six stores hold all state; schema version 7 defines 17 stores. | Executable schema and this KB are authoritative | Correct the stale comment and add a lightweight schema-catalog consistency check | Data Engineering | Open |

## Accepted product and threat boundaries

These are not defects unless product scope changes, but every claim must preserve them:

| Boundary | Current treatment | Reconsider when |
| --- | --- | --- |
| No closed-app searching | Static web/desktop session performs work only while open | Background service, account, notification, or scheduled refresh is proposed |
| Vault is at-rest protection | Does not protect an unlocked compromised renderer/device | Sync, browser extension, privileged integration, or new active-content path is added |
| Local wipe is local | Does not delete downloads, backups, employer submissions, or provider retention | Klar introduces remote storage or managed deletion |
| Source listing is an observation | Klar cannot guarantee vacancy truth, completeness, or continued acceptance | A contractual data source with service guarantees is adopted |
| AI output is a proposal | Human review remains required; no auto-send | Any automated submission or autonomous decision feature is proposed |
| Limited telemetry | No central Resume/job/prompt analytics | Fleet operations require new measurement; privacy review must approve the minimum aggregate design |

## Review cadence and escalation

Review this register monthly during experimental development, before every release candidate, after any incident, and whenever a roadmap item is presented as current. A newly discovered credible Critical item immediately blocks the affected release or operation and follows [Operations Runbooks](/docs/operations-runbooks).

Roadmap status is reconciled in [Architecture Decisions and Roadmap](/docs/architecture-decisions-and-roadmap). Test evidence and HOLD semantics are defined in [Test Strategy and Release Gates](/docs/test-strategy-and-release-gates).
