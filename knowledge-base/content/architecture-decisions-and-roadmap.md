---
title: "Architecture Decisions and Roadmap"
description: "Retrospective decision index, current-versus-target rules, and implementation reconciliation for the Klar v2.4-to-v3 roadmap."
section: "Decisions and Roadmap"
order: 350
audience: ["Leadership", "Architecture", "Engineering", "Product", "Documentation owners"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Architecture"
last_verified: "2026-08-10"
next_review: "2026-09-10"
tags: ["adr", "decisions", "roadmap", "current", "target", "v3"]
---

# Architecture Decisions and Roadmap

## Purpose

This page records consequential choices that shape Klar and reconciles planning intent with verified implementation. Most entries are retrospective summaries derived from code, tests, configuration, and the 23 July 2026 “Klar Revised Roadmap — v2.4 to v3.” They are an index for governance, not a claim that separately approved ADR documents already exist.

## Decision status model

| Status | Meaning |
| --- | --- |
| Accepted/current | Decision is embodied in 2.6.0.1 code and remains governing |
| Accepted/partial | Direction is accepted; some required controls or integrations are incomplete |
| Target | Planned direction not yet authoritative product behavior |
| Historical | Describes a superseded implementation or baseline |
| Superseded | Replaced by a later named decision |

## Decision index

| ID | Decision | Why | Consequence | Status | Primary evidence |
| --- | --- | --- | --- | --- | --- |
| ADR-001 | Local-first workspace with no Klar account backend | Minimize centralized personal-data custody and keep the tool usable without an account | IndexedDB is authoritative; backup/export provide portability; no remote sync or closed-app work | Accepted/current | `src/db`, `src/storage`, application topology |
| ADR-002 | Optional authenticated vault with separate content and credential envelopes | Protect selected at-rest data while allowing standard backups to exclude credentials | Passphrase is unrecoverable; settings and operational caches remain outside content ciphertext | Accepted/current | `src/crypto`, `src/backup` |
| ADR-003 | Canonical Resume is the sole career-fact authority | Prevent drift between rich Resume and thin Profile models | Profile is derived; schema change requires coordinated migration and snapshot | Accepted/current | `src/resume`, Dexie v5 migration |
| ADR-004 | One product, two first-class discovery modes | Career and Flexible Work share a workspace but have materially different inputs | Career is Resume-aware; Flexible Work is Resume-free and owns location/preferences | Accepted/current | `src/App.tsx`, onboarding and mode routing |
| ADR-005 | Source Fabric, not a universal scraper | Source durability and permission vary by employer and platform | Finite connector contracts, allowlists, provenance, fallbacks, health, and kill switches | Accepted/partial | `src/flexible/connectors`, Worker Fabric route; verification gaps remain |
| ADR-006 | Bounded progressive Flexible Work sessions | One slow or broken source must not block useful results | 10–15-second attempts, two retries, 60-second hard deadline, independent batches, terminal states | Accepted/partial | Flexible session policy and tests; immutable page ledger/canary incomplete |
| ADR-007 | Deterministic-first Career ranking | Ranking must be reproducible, explainable, and usable without provider tokens | AI attention cannot overwrite eligibility, posting confidence, or deterministic order | Accepted/current | `src/match`, ranking snapshots and tests |
| ADR-008 | AI returns evidence-bound proposals, never automatic facts | Fluent generation can fabricate or overstate | Consumer schemas, evidence links, accept/reject/edit, repeated export gates, human review | Accepted/current | `src/llm`, `src/application`, packets/export |
| ADR-009 | Worker is a finite allowlisted relay, not an application backend | Browser CORS/secrets require mediation without accepting arbitrary proxy risk | Fixed routes/hosts, bounded Fabric/Groq, no workspace persistence; abuse/SSRF residuals remain | Accepted/partial | `worker/src`, Wrangler config |
| ADR-010 | Desktop privilege separation and signed model-package trust | Local inference needs process/file authority that the renderer must not inherit | Narrow IPC, main validation, sandbox/CSP, ephemeral loopback, Ed25519 manifests, explicit fuses | Accepted/partial | `desktop/`, package and lifecycle tests; production signing remains HOLD |
| ADR-011 | Explicit provider selection with no silent cloud/local fallback | Privacy and reproducibility require knowing where generation occurs | Provider-neutral registry fails rather than switching provider | Accepted/partial | `src/ai`; normal workflows still use production cloud-compatible client |
| ADR-012 | Artifact-level version and provenance | Packets can contain artifacts generated at different times and contracts | Each Resume/letter/export retains its own format/generator provenance; old data remains historical | Accepted/current | `src/packets`, `src/export`, document contracts |
| ADR-013 | Human evidence is a separate release class | Synthetic/model tests cannot establish human usefulness or truthfulness | Ranking/writing gates require independent bilingual humans and adjudication; missing evidence is HOLD | Accepted/current | `qa/ranking`, `qa/writing` |
| ADR-014 | Current, target, and historical documentation never collapse | Roadmap prose must not be mistaken for executable reality | Code/config/tests lead; target language is explicit; old build guides are context only | Accepted/current | [Source of Truth](/docs/source-of-truth) |
| ADR-015 | Canonical product term is Resume | One spelling reduces search, UI, schema, and documentation inconsistency | All Klar code-facing and documentation language uses Resume/resume; older source wording is not copied | Accepted/current documentation; target v2.7 plan entry | Product direction and [Documentation Style Guide](/docs/style-guide) |

## Formal ADR template and workflow

For a new consequential decision, create a record with:

1. ID, title, owner, date, and status;
2. context and decision pressure;
3. options considered, including “do nothing” where meaningful;
4. decision and scope;
5. security, privacy, data, accessibility, operational, migration, and cost consequences;
6. compatibility and rollback;
7. measurable acceptance evidence;
8. rejected alternatives and why;
9. links to implementation, tests, runbooks, risks, and roadmap; and
10. supersession rule.

A roadmap item is not an ADR. A shipped implementation can require a retrospective ADR when the choice has long-lived consequences. Updating an ADR does not itself change the product; implementation and verification must follow normal review.

## Roadmap source qualification

The available planning source is dated 23 July 2026 and was written against a 2.2 baseline with a revised 2.3 foundation. It is valuable for intent but predates the verified 2.6.0.1 repository. It also predates the canonical Resume terminology rule. Therefore:

- use it to explain target direction and original exit criteria;
- use current code/configuration/tests to say what exists;
- do not mark a release complete merely because the current version number is later; and
- preserve unmet exit gates as partial or target.

## Roadmap reconciliation

| Roadmap milestone | Original intent | Verified 2.6.0.1 position | Classification |
| --- | --- | --- | --- |
| 2.4 — Flexible Work and Source Fabric | Resume-free mode, opportunity/provenance model, connector catalog, progressive 60-second sessions, taxonomy, cache/health/fallback, saved searches | Core mode, registry, connectors, session, taxonomy, provenance, cache/health, fallback, and saved searches are implemented. Candidate connectors execute without full release verification; strict frozen-page ledger, canary, and central operator switch are incomplete. | Partially current; unmet gates remain open |
| 2.5 — Application Quality | Evidence-bound Resume tailoring, bilingual artifacts, DOCX/PDF, persistent packets, recovery, Flexible Work lightweight preparation | Canonical evidence proposals, packets, bilingual workspaces, document/ZIP export, provenance, and recovery are current. Human writing evidence remains HOLD, so application quality is not graduated. | Core current; quality graduation HOLD |
| 2.6 — Trust, Reliability, Validation | Explainable ranking, source health/provenance, advanced dedup, backup, budgets, contract/canary tests, student testing without content analytics | Deterministic ranking, source health/provenance, dedup, backup, byte budgets, and extensive contracts exist. Human ranking/writing, full connector verification, live canary model, comprehensive accessibility/performance evidence, broad student testing, and public desktop distribution are incomplete or not evidenced. | Substantially current; graduation incomplete |
| 2.7 — Daily Workspace | Saved Searches 2.0, progressive refresh, inbox, compare, history, pipeline/follow-ups, daily/weekly views, focus mode; no closed-app search claim | Existing saved searches, tracker, dashboard, and mounted active sessions are precursors. The named 2.7 workspace is not current. Canonical Resume terminology is effective in the KB now and is intended for the 2.7 plan. | Target |
| 2.8 — Job Intelligence | Posting confidence, company/compensation/schedule/commute/application-effort research, skill gaps, scorecard | Posting confidence and some deterministic requirement/suitability primitives exist, but the milestone as a whole is not implemented. | Target with current precursors |
| 2.9 — Personalization and Release Candidate | Approved learning, semantic clusters, expanded packets, interviews, reviewed local KB, command/undo, scale/resilience verification | Some packet, interview, local embedding, history, and KB foundations exist. The integrated release-candidate scope and gates are not current. | Target with current precursors |
| 3 — Career and Flexible Work Operating System | Coherent Discover/Decide/Prepare/Interview/Progress operating system with graduation gates | Product modes and several workflow foundations exist. The v3 system and graduation gates are not achieved. | Target |

## Current-versus-target writing rules

Use these rules in every plan, release note, KB page, UI claim, and issue:

| If evidence shows… | Write… | Do not write… |
| --- | --- | --- |
| Code/config and proportionate tests implement behavior | “Klar 2.6.0.1 does…” with the applicable limitation | A stronger guarantee than the test or boundary supports |
| Foundation exists but normal workflow does not use it | “Foundation/preview capability exists; integration is incomplete” | “Klar runs this workflow locally” |
| Machine tests pass but human gate is absent | “Automated gate passed; human release gate is HOLD” | “Quality is validated” |
| Registry entry is candidate or fallback-only | “Configured candidate/fallback” | “Verified direct integration” |
| Roadmap names a future release | “Target for 2.7/2.8/…” | Present-tense support language |
| Behavior belonged to an earlier release | “Historical in version X” | An undated current instruction |
| Evidence conflicts or is absent | “Unknown/open gap” and log it | A convenient assumption |

## Roadmap change control

A milestone can move from target to current only when:

- implementation and migration are merged;
- relevant automated, human, live, security, and packaged gates pass;
- current limitations and external dependencies are disclosed;
- operations and rollback are documented;
- release metadata and user-facing claims match; and
- the risk register has an explicit disposition for remaining High items.

The consolidated current risks are in [Known Gaps and Risk Register](/docs/known-gaps-and-risk-register), and evidence requirements are in [Test Strategy and Release Gates](/docs/test-strategy-and-release-gates).
