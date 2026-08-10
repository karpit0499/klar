---
title: "Career Discovery and Ranking"
description: "Career-source acquisition, normalization, filtering, deterministic ranking, optional AI attention, and diagnostic contracts."
section: "Discovery"
order: 230
audience: ["Engineering", "Product", "Data quality reviewers", "Support"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Engineering"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["career", "discovery", "sources", "ranking", "matching", "diagnostics"]
---

# Career Discovery and Ranking

## Purpose

Career discovery turns public job-source responses and reviewed Resume facts into a deterministic, explainable candidate list. Its purpose is to focus attention without claiming to decide employability, suitability, or hiring outcome.

The ranking pipeline is local-first. AI is optional, bounded, and subordinate to deterministic eligibility, rank, and posting-confidence results.

## Preconditions and inputs

Career mode requires:

- a canonical Resume from which Klar derives a matching `Profile`;
- current career preferences and a search query;
- a selected supported region; and
- at least one enabled source path.

The Resume location informs Career behavior only. It is not imposed on Flexible Work. Completeness checks are structural; they do not certify career quality or truth.

## Acquisition pipeline

The current sequence is:

1. build the regional source plan;
2. run active source adapters in parallel with failure isolation;
3. normalize every source row to `NormalizedJob`;
4. deduplicate exact, identity, content, and fuzzy matches while retaining `also_on` provenance;
5. apply local employment, hidden-employer, recency, and distance filters;
6. apply Career role, market, and seniority relevance gates;
7. lazily enrich BA rows whose description is empty;
8. repeat relevance evaluation after enrichment;
9. compute deterministic requirements, ranking, explanations, and posting confidence;
10. publish all deterministic candidates; and
11. optionally allocate AI attention without changing the deterministic order.

Explicit mismatches are separated with reasons. Unknown data is generally retained rather than converted into a negative fact.

## Career source catalog

| Source | Identifier | Transport | Search behavior | Important constraints |
| --- | --- | --- | --- | --- |
| Bundesagentur für Arbeit (BA) | `ba` | Cloudflare Worker | Server-side search, 50 rows per page | Search and detail enrichment use separate upstream contracts without a public compatibility guarantee |
| Arbeitnow | `arbeitnow` | Direct browser CORS | Fetches first two public pages and narrows locally | Not a true query API; practical acquisition is roughly bounded by those pages |
| Adzuna | `adzuna` | Cloudflare Worker | Region-specific API, 50 rows per page | Needs a complete user credential pair or complete Worker credentials |
| Greenhouse | `greenhouse` | Direct public ATS | Per-company board retrieval | Company registry controls fan-out; failure isolated per company |
| Lever | `lever` | Direct public ATS | Per-company board retrieval | Same registry and isolation contract |
| Ashby | `ashby` | Direct public ATS | Per-company board retrieval | Same registry and isolation contract |

ATS retrieval uses bounded concurrency of six companies. The current registry exports 47 verified German entries and 162 DACH candidate entries, combined as 209 entries. The current fetch path includes both verified and candidate entries. This is implementation truth, but it is also a data-quality and load-control gap because candidate status does not currently prevent production retrieval.

## Region and source planning

Supported regions are Germany, Austria, Switzerland, the Netherlands, Luxembourg, and Liechtenstein. Region configuration determines currency and source availability:

- Germany: BA, Adzuna, and direct sources;
- Austria, Switzerland, and the Netherlands: Adzuna and direct sources;
- Luxembourg and Liechtenstein: direct sources only.

The normal plan starts with BA, Arbeitnow, and ATS sources. Adzuna becomes a default source only when a Worker URL is configured. Users can still control supported source choices through product settings. A source being configured does not prove it is healthy or complete.

## Normalization and identity

Every adapter maps source-specific data into the same job contract before filtering. At minimum, downstream behavior depends on stable source identity, title, company, location, dates, description, application URL, employment information, and source provenance where published.

Deduplication combines:

- native stable IDs;
- canonical application/source identities;
- normalized content fingerprints; and
- fuzzy job identity when exact identifiers differ.

When rows merge, provenance is preserved and all known sources appear in `also_on`. A direct or higher-quality representation may improve the canonical row, but the merged row must not pretend the other observation never existed.

Saved-search “new since last check” uses durable identities, not the transient display rank. The first run creates the baseline and does not label every existing job as new. Seen identity history is bounded to 5,000 values with a 180-day retention horizon.

## Deterministic eligibility

The requirements evaluator records facts for:

- work authorization;
- location;
- language;
- employment arrangement;
- working hours;
- start date;
- certification; and
- user-defined dealbreakers.

Facts carry known, unknown, satisfied, or mismatch meaning rather than forcing missing listing data into a negative conclusion. A known hard mismatch can exclude a job. An unknown requirement remains visible for review.

Local relevance gates protect the candidate set from unrelated markets, roles, and seniority levels. A hard-filtered row cannot re-enter through AI enrichment or reranking.

## Ranking version 2

Current contracts are:

- ranking: `ranking-v2.6.0`;
- requirements: `requirements-v2.6.0`; and
- explanation: `ranking-explanation-v2.6.0`.

The core-fit weighted dimensions are:

| Dimension | Weight | Meaning |
| --- | ---: | --- |
| Role fit | 30% | Alignment between requested/Resume role and the vacancy |
| Seniority fit | 15% | Compatibility of demonstrated and requested level |
| Required-skill coverage | 25% | Evidence-backed coverage of explicit requirements |
| Preferred-skill coverage | 5% | Evidence-backed coverage of non-mandatory preferences |
| Domain transfer | 15% | Transferability of demonstrated experience into the vacancy context |
| Evidence depth | 10% | Strength and specificity of supporting Resume evidence |

Caps constrain scores when there is inadequate relevance, domain transfer, seniority alignment, missing requirements, or a known mismatch. This prevents a strong soft signal from compensating for a material constraint.

Preference fit is separate from core fit. Salary, location, work mode, and contract preferences use relative weights of 20, 35, 25, and 20 and can adjust the score by no more than eight points. Posting confidence is also separate: source quality 30%, completeness 30%, freshness 30%, duplicate corroboration 10%. The final ranking applies a penalty equal to 20% of the posting-confidence deficit.

The outer legacy `modelVersion` remains `local-v2.3` for cache/backward compatibility, while the embedded snapshot names `ranking-v2.6.0`. Consumers must use the ranking snapshot version when interpreting current features and explanations.

## Reproducibility contract

Each deterministic snapshot uses schema version 1 and records:

- an input hash;
- a candidate-set hash;
- evaluation time;
- deterministic rank and score;
- features and requirement facts;
- human-readable explanations;
- algorithm contract versions; and
- historical/unversioned markers when old data lacks current provenance.

For identical normalized inputs and configuration, feature evaluation and rank must be deterministic. Time-dependent source freshness is part of the input context and can legitimately change results between runs.

## Optional AI attention

The full deterministic result set is not capped. The `candidateLimit` value of 40 limits automatic AI priority, not visible results. AI batching is five jobs per request; the legacy shortlist size is eight; default LLM reranking is off.

There are two supported attention patterns:

- enrich one job the person opens, then cache that explanation; or
- in compatibility mode, automatically enrich a bounded top set.

If AI is unavailable, malformed, over budget, or missing a row, the deterministic local result remains. Only valid provider results are cached. Provider scores and prose cannot overwrite deterministic eligibility, posting confidence, or order.

## Diagnostics and honest empty states

Search diagnostics reconcile:

- sources requested, succeeded, failed, or skipped;
- raw rows;
- duplicate merges;
- local filter and relevance reasons;
- candidate count;
- local and AI analysis counts;
- provider failures; and
- final visible count.

The zero-result reason must distinguish “healthy sources returned no matching jobs” from “coverage was insufficient to conclude that.” Errors and reports use content-free safe fields. Source health is local operational metadata, not proof of complete source inventory.

## Quality gates

Ranking release claims require both automated invariants and the independent human evaluation defined in [Test Strategy and Release Gates](/docs/test-strategy-and-release-gates). The current repository records the human ranking gate as **HOLD** until real, independent, professionally bilingual review evidence is complete. Synthetic and machine-generated fixtures cannot satisfy that gate.

Known source-verification, version-label, and gate gaps are tracked in [Known Gaps and Risk Register](/docs/known-gaps-and-risk-register).
