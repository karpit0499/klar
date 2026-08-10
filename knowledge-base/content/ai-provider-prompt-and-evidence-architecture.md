---
title: "AI, Provider, Prompt, and Evidence Architecture"
description: "Current AI execution paths, provider configuration, structured-output controls, prompt minimization, evidence rules, budgets, and local-model foundation."
section: "AI and Models"
order: 260
audience: ["Engineering", "Security", "Product", "AI quality reviewers"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Engineering"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["ai", "provider", "prompts", "evidence", "structured-output", "local-model"]
---

# AI, Provider, Prompt, and Evidence Architecture

## Purpose

AI in Klar is an explicitly invoked assistant for extraction, explanation, and application writing. It is not the authority for career facts, source truth, eligibility, deterministic rank, or release approval. This page separates the production AI path from the provider-neutral and local-model foundation so capability is not overstated.

## Architecture layers

| Layer | Current role | Authority |
| --- | --- | --- |
| Deterministic product logic | Filtering, requirements, ranking, evidence checks, normalization, readiness, document assembly | Authoritative for executable product constraints |
| Production LLM client (`src/llm/`) | Groq-compatible chat, prompt construction, extraction, optional analysis, tailoring, and writing | Current application generation path |
| Provider-neutral foundation (`src/ai/`) | Capability contracts, request schemas, base/precision/writer adapters, cloud/local providers, registry | Verified foundation and preview integration; not yet the normal generation router |
| Cloud provider | Wraps the existing chat client | Uses configured external provider path |
| Local provider | Wraps desktop generation IPC | Desktop preview capability only |
| Consumer validator | Parses and validates each capability-specific result | Required authority before product state changes |
| Human reviewer | Accepts career facts and application claims | Final authority for user-facing application content |

## Current production provider path

The default engine is Groq using an OpenAI-compatible chat interface. The default quality and fast model choices are the GPT-OSS 120B and 20B variants configured by Klar. When the default engine and a Worker URL are configured, requests use the Worker's Groq relay. A custom OpenAI-compatible endpoint is called directly from the renderer.

Custom base URLs may use HTTP or HTTPS; the UI warns about mixed-content and security implications. A custom engine can declare that no API key is required. This flexibility is intended for user-controlled compatible endpoints and does not make an endpoint trusted.

Provider settings are stored as non-secret configuration. Credential storage follows the rules in [Data Architecture, Vault, and Backup](/docs/data-architecture-vault-and-backup).

## Explicit invocation and data minimization

Deterministic search, filtering, ranking, taxonomy, deduplication, cache, tracking, and document layout do not require AI.

When the user invokes an AI action, the capability constructs a bounded projection rather than sending the entire database. Examples include:

- extracted Resume text for initial structuring;
- selected Resume sections and a bounded job-description excerpt for tailoring;
- normalized job fields and deterministic evidence for explanation;
- selected packet language, facts, job context, and request for cover-letter or recruiter-message writing.

Prompts must not include credentials, vault envelopes, unrelated jobs, operational events, backup files, or hidden application history. Data is sent to the configured provider only for that invocation. Provider-side retention and training behavior are governed by that provider's terms and configuration, not by local Klar deletion.

## Structured output

For the default supported Groq models, the chat client requests strict JSON Schema output. Custom or other compatible models use JSON-object mode where strict schema support is not known. The transport can make one compatibility retry when the provider rejects schema generation, and it can recover a valid structured payload from supported failed-generation responses.

Transport success is never sufficient. Each consumer validates its own response shape, bounds, indices, enum values, evidence references, and semantic invariants. Invalid responses fail closed or leave the deterministic result intact.

The provider-neutral foundation adds common request limits:

- at most 32 messages;
- at most 120,000 total message characters;
- at most 32,000 schema characters;
- a timeout between 1 and 120 seconds; and
- capability-specific output limits.

These are safety ceilings, not recommended prompt sizes. Individual consumers use tighter projections.

## Budget and retry policy

The production budget controller starts with conservative client-side assumptions of 8,000 tokens per minute and 30 requests per minute. Token estimation is approximately characters divided by 3.6 and reserves the requested maximum output before dispatch. A rolling in-memory 60-second window:

- rejects a request that is permanently too large;
- waits for temporary headroom when the relevant queue flag permits; and
- learns a lower token-per-minute limit from supported provider quota errors.

The configured daily-token field is not currently enforced. Client estimates do not replace provider-authoritative quotas, multi-client coordination, or an abuse-control service. Retries are capability-specific and bounded; generation must not recurse indefinitely.

## Evidence architecture

Evidence exists to keep fluent writing subordinate to reviewed facts.

| Stage | Control |
| --- | --- |
| Resume extraction | Prompt requires copy-only behavior; response is normalized and reviewed before canonical storage |
| Job analysis | Deterministic job/Resume facts exist before optional provider explanation |
| Tailoring | Provider returns change proposals tied to original content and evidence references |
| User decision | Each change is accepted, rejected, or edited; unsupported changes remain blocked |
| Writing | Capability receives a bounded fact inventory and job snapshot, not permission to invent missing facts |
| Export | Readiness and evidence checks run again before an artifact is assembled |
| Release | Automated evidence checks plus the applicable independent human gate |

No prompt instruction can guarantee truth on its own. The decisive controls are constrained inputs, structured consumers, immutable source facts, evidence links, repeated decision/export gates, provenance, and human review.

## Production prompt responsibilities

Every prompt contract must state:

- the capability and non-goals;
- the allowed source facts;
- the required language and output schema;
- how missing or ambiguous information is represented;
- a prohibition on unsupported claims and fabricated metrics;
- evidence/reference requirements;
- size and output bounds; and
- what the consumer will do when validation fails.

Prompt and generator versions are artifact provenance. Changing wording that can alter output meaning requires a version decision, fixtures, consumer validation, regression review, and applicable human evaluation.

## Provider-neutral foundation

`src/ai/` defines capabilities for structured job extraction, evidence selection, recruiter messages, cover letters, and Resume bullet revision. It includes base, precision, and writer adapter slots and a registry that requires an explicit provider selection. It does not silently switch from local to cloud or vice versa.

The foundation is used by tests and the desktop local-runtime panel. Current application call sites for Resume extraction, tailoring, cover letters, and related generation still call the existing `chatComplete` production path. Therefore, a verified local model is not yet selectable as the provider for normal application workflows in 2.6.0.1. Treat local generation as a foundation/developer-preview capability, not a completed product privacy claim.

## Local-model path

On desktop, the local provider sends a validated request across the narrow preload bridge. Electron main owns the loopback runtime URL and bearer credential; the renderer receives neither. The pinned runtime supports JSON-object plus schema constraints, disabled thinking, one active request, cancellation, and bounded diagnostics.

The currently documented base package is Qwen3.5-9B Q4_K_M with pinned artifact provenance. It is not bundled or automatically downloaded. Precision and writer adapter slots exist in the contract but their release evidence remains **HOLD** until genuine packages and benchmarks are supplied. See [Electron Desktop and Local Runtime](/docs/electron-desktop-and-local-runtime).

## Failure behavior

- Provider unavailable: preserve deterministic results and current packet state; show an actionable retry path.
- Invalid JSON/schema: reject the response; use only the bounded compatibility retry defined by the client.
- Missing AI row in a batch: retain the local row without a fabricated AI score.
- Quota exceeded: do not cache a false result; expose a safe budget/provider error.
- Interrupted desktop generation: mark the request cancelled or interrupted and keep the prior reviewed artifact.
- Evidence failure: block the proposed change or export, regardless of provider confidence.

## Change and review requirements

Any provider, model, prompt, capability, schema, budget, or fallback change must review privacy disclosure, network path, credentials, input projection, output validation, failure isolation, evidence, locale, provenance, diagnostics redaction, automated tests, and applicable human gates.

Current limitations are consolidated in [Known Gaps and Risk Register](/docs/known-gaps-and-risk-register); runbook actions are in [Operations Runbooks](/docs/operations-runbooks).
