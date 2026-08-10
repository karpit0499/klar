---
title: "Flexible Work and Source Fabric"
description: "Resume-free discovery architecture, connector registry, bounded search sessions, taxonomy, provenance, fallback, cache, and health behavior."
section: "Discovery"
order: 240
audience: ["Engineering", "Product", "Source operations", "Security", "Support"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Engineering"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["flexible-work", "source-fabric", "connectors", "sessions", "taxonomy", "provenance"]
---

# Flexible Work and Source Fabric

## Purpose

Flexible Work gives students and other users a first-class discovery path for schedule-compatible work without requiring a Resume. Source Fabric exists because no single durable API covers the required employer and job landscape. It combines bounded, source-specific retrieval contracts behind one normalized opportunity model.

This page describes the executable 2.6.0.1 baseline. The July 2026 Source Fabric roadmap supplied the design intent, but code, configuration, and tests determine current behavior.

## Product separation

Flexible Work owns its own:

- cities and radius;
- employment arrangements;
- role families;
- workplace preferences;
- optional keywords;
- saved searches and seen identities; and
- lightweight preparation path.

The canonical Resume and its location are not required inputs. A person with a Resume can still switch modes; one mode does not hide or replace the other.

## Opportunity contract

Source Fabric extends the shared normalized job shape with:

- `kind`: vacancy or open-entry route;
- source identities and canonical ID;
- employer family, brand, and connector identity;
- locations and optional coordinates;
- employment arrangements, weekly hours, and schedule signals;
- role families and workplaces;
- description, salary, posted/expiry/first-seen/last-seen/last-verified dates;
- application URL;
- source and extraction confidence; and
- per-field provenance.

An open-entry program is not represented as a fabricated vacancy. It must remain labelled as an open application or candidate-pool route. Unknown published facts remain unknown; inferred classifications are distinguishable from published facts.

## Connector types

| Type | Intended retrieval | Example role |
| --- | --- | --- |
| API | Supported public JSON API or ATS response | BA, Adzuna, Arbeitnow, supported ATS |
| Feed | Employer-provided RSS or Atom | Durable employer publication feed |
| Sitemap | Canonical URL discovery plus structured job detail | Sitemap and `JobPosting` JSON-LD |
| Portal | Bounded public listing/search manifest | Structured employer career portal |
| Open entry | Official program/city verification and route | Courier, restaurant, or general application path |
| Federated | Parent, regional, franchise, and fallback composition | Employer groups with distributed hiring |

The registry contains allowlisted hosts and paths, parser version, query capability, pagination, attempt timeout, retry/cache/response bounds, content types, field coverage, workplaces, fallback, health, and verification metadata. HTML layout parsing is not a general-purpose connector contract.

## Current registry baseline

The runtime registry contains 36 enabled connector definitions: 24 top-level connectors and 12 member connectors. It represents 21 employer families, including major grocery, retail, drugstore, logistics, delivery, restaurant, café, and hotel groups.

Connector-type distribution is currently 11 API, 2 feed, 2 sitemap, 12 portal, 4 federated, and 5 open-entry definitions. Three baseline connectors are marked verified; 33 definitions are marked candidate.

The code currently enables and runs candidate connectors; `buildFabric` does not exclude a connector because its verification field is `candidate`. Registry comments and the original roadmap require verification before production support claims, so current execution is broader than verified-support evidence. Do not describe the registry count as 36 verified direct integrations.

## Search-session contract

Each search creates one local session with a stable ID, normalized input snapshot, root cancellation signal, start/deadline, source-attempt states, canonical opportunity map, ordered results, pages, and diagnostics.

Current timing policy:

| Control | Value |
| --- | ---: |
| Connector attempt timeout | Clamped to 10–15 seconds |
| Maximum retry count | 2 after the initial attempt |
| Hard logical deadline | 60 seconds |
| Page size | 20 unique opportunities |
| First publish threshold | 10 unique opportunities |
| Low-supply publish deadline | 8 seconds |
| Default connector concurrency | 6 |

Retries are for idempotent transient failures only. Invalid request, authentication, schema, content-type, blocked/CAPTCHA, and removed-job responses are terminal for that attempt. A 429 is retryable only when its delay fits the remaining search budget.

Connectors produce independent batches. Klar does not wait for every source before publishing. The session ends in `complete`, `partial`, or `limited`; cancellation and the deadline must stop loading indicators and unfinished work.

## Ordering and pagination

The session preserves stable append order after first publication. Later evidence may enrich a duplicate card in place, and a direct employer application URL can replace an aggregator link. Vacancies are placed before route cards during initial ordering.

The roadmap calls visible page assignments “frozen.” The current implementation chunks the evolving ordered array and permits in-place duplicate enrichment. Membership is intended to remain stable after append, but the code does not persist a separate immutable page-assignment ledger. Treat strict frozen-pagination behavior as partially implemented and verify it whenever session ordering changes.

## Taxonomy

Classification is deterministic and multilingual across independent dimensions:

- employment: minijob, part-time, working student, temporary, seasonal, weekend, evening, night;
- role: shelf stocking, cashier, sales, picking/packing, warehouse, parcel sorting, delivery, kitchen, counter service, service, cleaning, housekeeping, reception, event work, customer service; and
- workplace: supermarket, retail store, drugstore, warehouse, parcel hub, restaurant, café, hotel, delivery, event venue.

Evidence weights are title 3, employer 2, and description 1; the normal acceptance threshold is 2. Career-like role and employment signals are damped to 0.2 so an isolated broad keyword does not dominate. Workplace evidence is not damped. Explicit published employment terms win over inference.

Each inferred value records evidence, method, confidence, and provenance. The optional local neural suggestion is off by default and may only add a low-confidence suggestion below 0.6; it cannot override explicit published terms.

## Relevance gate

The flexible gate rejects a row when positive evidence shows:

- the wrong location;
- a clearly Career-oriented title outside the flexible intent;
- salary above the flexible thresholds (more than 45,000 yearly, 3,750 monthly, or 45 hourly in the configured interpretation);
- no flexible-work signal; or
- explicitly incompatible employment.

Unknown values remain eligible for review. Open-entry routes face the location gate but are not judged as if they were fully described vacancies.

## Deduplication and provenance

Every batch is validated and merged into a canonical map. Duplicate resolution must preserve all source observations, field-level provenance, first-seen time, and last-verification time. A later source can improve fields without changing the historical fact that earlier sources observed the opportunity.

Application destination priority favors a direct employer route over an aggregator when both describe the same opportunity. A route card must never silently replace a concrete vacancy.

## Cache and freshness

Flexible cache has a normal 30-minute lifetime. Only normalized valid records are cached. Cache reads validate minimum required fields and respect `validThrough` for vacancies. Open-entry routes use separate freshness semantics. Revalidation preserves the original `firstSeenAt` and updates verification metadata; cached content must not be relabelled as newly posted.

If no Worker URL is configured, the current hook can supply deterministic fixtures as the live UI input and sets `usingFixtures=true`. This supports offline development and QA, but a production deployment without the Worker could display synthetic opportunities unless the deployment and UI make that state unmistakable. This is a high-priority honesty/configuration gap.

## Resilience, health, and fallback

The fallback ladder is:

1. valid local/session cache;
2. baseline source inventory;
3. direct employer connector;
4. employer-filtered BA results plus the official route;
5. an official open-entry route; or
6. an official employer search destination.

Connector health stores content-free counts, latency, timestamps, schema failures, breaker state, and a manual kill switch. The breaker opens after four consecutive failures and uses a five-minute cooldown. Search skips killed connectors and open circuits. The design calls for a low-frequency canary; current persistence does not model a distinct canary state, and a connector is simply eligible again after cooldown.

Fallback success contributes to the connector observation. Operations must distinguish “direct integration healthy” from “a usable fallback was returned.”

## Source security

Fabric retrieval is delegated to the Worker for allowlisted remote hosts. It rebuilds HTTPS URLs, validates paths and redirects, limits body size and accepted content types, rejects listed private IPv4 ranges, and does not execute source JavaScript. Parsing and sanitization remain untrusted-input boundaries. See [Worker API and Network Security](/docs/worker-api-and-network-security).

## Operational interpretation

- A registry entry is a configured capability, not proof of current inventory or contractual support.
- A successful fallback is usable coverage, not proof that the direct parser works.
- A cached opportunity is a last-verified observation, not a guarantee that an employer still accepts applications.
- A search with required source failures must say partial or limited, not “no jobs found.”
- Source health and operational events must remain content-free.

Runbooks are in [Operations Runbooks](/docs/operations-runbooks). Verification and deployment gates are in [Test Strategy and Release Gates](/docs/test-strategy-and-release-gates). Open gaps are consolidated in [Known Gaps and Risk Register](/docs/known-gaps-and-risk-register).
