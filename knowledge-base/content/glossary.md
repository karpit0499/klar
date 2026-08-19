---
title: "Klar Glossary"
description: "Canonical product, data, matching, application, and governance terms used across Klar."
section: "Product"
order: 130
audience: ["All audiences"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Product"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["product", "glossary", "terminology", "resume"]
---

# Klar Glossary

## Product and workspace

**Application Packet**

A persistent, job-specific workspace with independent English and German Resume, cover-letter, recruiter-message, review-state, and provenance data, plus shared packet notes and export history.

**Career Roles**

The Resume-based discovery mode for career-oriented job search, relevance filtering, ranking, and grounded application preparation.

**Dashboard**

The local home surface for a display name, headline, location, image, about text, links, at-a-glance career context, and entry to Resume and Support workspaces.

**Developer Preview**

A functioning release intended for evaluation and development with explicit maturity limits. It is not a claim of production support or public desktop readiness.

**Flexible Work**

The Resume-optional mode for minijobs, part-time, working-student, temporary, seasonal, weekend, evening, or night opportunities.

**Klar**

The product name. “Klar” means “clear” in German.

**Tracker**

The local board or list used to manage saved opportunities, application status, notes, contacts, reminders, and history.

**Workspace**

The collection of Klar data stored in one browser profile or encrypted vault. It is not automatically synchronized to another browser or device.

## Resume and profile

**Canonical Resume**

The single structured Resume that acts as Klar's evidence source for career matching and application documents.

**Derived profile**

A thin matching view calculated from the canonical Resume. It is not edited separately.

**Evidence reference**

A link from a structured Resume statement or generated change back to supporting source content.

**Resume**

The canonical English spelling for the career document throughout Klar. The word has no accent marks. German user content may use “Lebenslauf.”

**Resume snapshot**

A restorable historical copy of the canonical Resume. Automatic snapshots are bounded; named snapshots remain until deleted.

## Discovery and sources

**Connector**

A configured integration that retrieves or hands off to an approved public job source or employer route.

**Duplicate family**

A content-free identifier grouping records that Klar determined represent the same vacancy across sources.

**Open entry**

An official employer application route or program that is available without a specific vacancy listing.

**Official search**

A verified route to an employer's own vacancy search. It is not itself a vacancy, API, direct connector result, or open-entry program.

**Source state**

The evidence-gated lifecycle of a source or tenant: active, healthy empty, quarantined, retired, or candidate. Only active sources run; healthy empty means the contract worked but no current regional inventory was returned.

**Source confidence**

A label describing whether information was published, structurally extracted, inferred, or unknown. It is not a guarantee that the posting remains live.

**Source Fabric**

Klar's configured set of employer-direct Flexible Work connectors and fallbacks, normalized behind a common opportunity contract.

**Source health**

Content-free operational information such as last success, fetch time, extraction confidence, errors, timeouts, fallback, circuit state, or operator disablement.

## Matching

**Candidate set**

The jobs that remain eligible for ranking after source gathering, deduplication, local filters, and relevance gates.

**Eligibility fact**

A versioned statement about a hard condition such as location, language, authorization, employment type, hours, start date, certification, or a dealbreaker. Its state may be match, known mismatch, unknown, or not applicable.

**Local vocabulary ranking**

Deterministic similarity based on Klar's local vocabulary vectors. It is private and zero-token, but it is not a neural embedding model.

**Ranking snapshot**

A stored, versioned record of requirements, evidence, eligibility facts, factors, penalties, final score, rank, and input identity for a job evaluation.

**Relevance gate**

The stage that removes clear role, market, seniority, or location mismatches before ranking.

**Klar score**

A 0–100 deterministic local ranking aid used to order relevant jobs. It is not an estimate of hiring probability.

**AI opinion**

An optional provider assessment stored with its own score, factors, rationale, model, prompt/schema, evaluation time, and cache provenance. It is advisory and does not change deterministic order.

## Application content

**Blocked change**

A proposed Resume rewrite that failed evidence checks. It cannot be accepted, edited into the output, or exported through the governed tailoring path.

**Cover-letter checks**

Deterministic document and content validations required before DOCX or packet export. Passing them is not a complete factual audit.

**Deterministic tailoring**

A zero-token Resume path that reorders existing evidence toward a posting without rewriting the person's sentences.

**Provenance**

Metadata that identifies the content contract, generator, source artifact, and exporter associated with an artifact.

**Stale packet**

A saved packet whose Resume, posting, language, engine, terms, tone, or context no longer matches the generation fingerprint.

## Privacy, recovery, and governance

**Complete encrypted backup**

The only backup mode permitted to contain Groq and Adzuna credentials. Workspace content and credentials remain encrypted.

**Readable export**

A separately confirmed JSON export of sensitive career data in readable form. Credentials remain excluded.

**Standard backup**

A routine workspace backup that never contains API credentials. If a vault is enabled, encrypted content remains ciphertext.

**Support workspace**

The Dashboard-linked surface for previewing and explicitly submitting an ordinary redacted bug or suggestion. Security and privacy concerns use the private vulnerability-reporting route.

**Target**

Approved or proposed future behavior that is not present in the current release. Target content must never be presented as current.

**Vault**

Optional authenticated encryption for sensitive local workspace content and remembered credentials. Klar cannot recover its passphrase.

See [Documentation style guide](/docs/style-guide) for mandatory language rules.
