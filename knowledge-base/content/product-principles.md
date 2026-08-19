---
title: "Product Principles"
description: "Purpose-led principles that govern Klar's current product behavior and design decisions."
section: "Product"
order: 110
audience: ["Product", "Design", "Engineering", "Reviewers"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Product"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["product", "principles", "trust"]
---

# Product Principles

These principles explain the intent behind the behavior present in Klar v2.6.1. They guide product choices but do not override executable contracts or release evidence.

## The person owns the workspace

Career data belongs to the person using Klar. The browser is the primary storage boundary; backups, readable exports, credential handling, deletion, and optional encryption are visible user choices.

**Product consequence:** no Klar application server stores the person's career history, and moving browsers or devices requires a backup.

## Evidence before persuasion

Klar should help present verified experience, not manufacture it. The canonical Resume is the evidence base for matching and application content. AI Resume changes carry evidence status and blocked wording cannot be accepted or exported.

**Product consequence:** generated letters and messages still require human review because deterministic checks are not a complete factual audit.

## Relevance before ranking

A score is meaningful only after the job fits the requested role, market, seniority, and location boundary. Supporting skills cannot convert an unrelated job into a career match.

**Product consequence:** Klar removes clear mismatches before ranking, keeps the deterministic Klar score in control of order, and presents any AI opinion as a separate advisory value.

## The user controls consequential actions

Klar prepares, explains, and hands off. It does not submit an application, fill an employer form, send a message, file a public issue, rescore a saved historical result, or replace a Resume without an explicit user action and confirmation appropriate to that action.

**Product consequence:** external routes open in the original provider or employer site; the Support page shows the exact redacted preview before a protected public issue submission; final review remains with the person.

## Degraded operation must remain honest

Third-party sources and AI providers fail. Klar should keep safe local work available, identify partial results, and distinguish unknown information from a proven mismatch.

**Product consequence:** source status, zero-result reasons, local fallbacks, stale packet notices, interrupted-generation notices, and recovery actions are visible.

## Provenance travels with the artifact

Knowing how an output was created is part of trusting it. Jobs retain source and duplicate information; rankings retain their versioned snapshot; packet artifacts and exports retain generator and exporter provenance.

**Product consequence:** old content is labelled historical rather than silently promoted to a newer contract.

## Progress should not destroy context

Long searches and document work should survive ordinary navigation, retries, and interruption where the current architecture can safely preserve them.

**Product consequence:** search surfaces remain mounted while hidden, packets autosave, Resume history supports restoration, and failed imports do not partially replace the workspace.

## Privacy and usability are joint constraints

A private feature that is too opaque to use safely is not complete. Klar explains when data is local, when an AI provider receives content, which backup includes credentials, and what a lost passphrase means.

**Product consequence:** privacy previews, backup modes, vault state, source health, and AI-use estimates are presented in the interface.

## Accessibility is part of behavior

Status and control must remain understandable without color alone, and keyboard users must be able to navigate and close modal surfaces.

**Product consequence:** dialogs use focus and Escape handling, controls carry text labels, navigation provides a skip link, and score bars expose numeric values.

## English and German are independent review contexts

A generated or translated artifact in one language does not prove quality in the other.

**Product consequence:** Application Packet content is created, stored, reviewed, and exported separately for English and German.
