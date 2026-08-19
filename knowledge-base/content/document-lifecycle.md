---
title: "Document Lifecycle"
description: "Status model, review stages, triggers, and archival rules for Klar knowledge-base content."
section: "Governance"
order: 30
audience: ["Documentation contributors", "Page owners", "Reviewers"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Documentation"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["governance", "lifecycle", "review"]
---

# Document Lifecycle

## Status model

| Status | Use when | Publication rule |
| --- | --- | --- |
| `draft` | Content is incomplete, unverified, or awaiting approval | Exclude from public navigation, search, and generated artifacts; not authoritative |
| `approved` | A policy, decision, or controlled document completed approval but is not being used as a release-specific current-behavior claim | Publish only when classification is `public`; retain approval evidence |
| `current` | Content is verified and applies to the named release | Publish only when classification is `public` |
| `target` | Content describes future intent not present in the current release | Publish only when classification is `public` and an explicit target notice is present |
| `planned` | Content records planning intent that is not yet an approved current-product contract | Publish only when classification is `public` and the page is clearly marked as planning or roadmap context |
| `deprecated` | A current capability or procedure is being withdrawn | When public, keep visible with replacement and end date |
| `historical` | Content is accurate for a named prior release, event, or decision period | When public, keep version context and prevent use as a current procedure |
| `archived` | Content is retained only as historical evidence | Exclude from public navigation, search, and generated artifacts; preserve version context in controlled storage |

“Current” means evidence-backed for the page's `applicable_version`; it does not mean timeless.

Classification and status are independent gates. Public distribution requires `classification: public` and an eligible reviewed status. Draft, archived, internal, confidential, and restricted pages must never appear in public navigation or public artifacts.

## Lifecycle stages

### 1. Propose

Define the audience, user or business question, canonical location, owner, classification, and evidence required. Check for an existing page before creating another source of truth.

### 2. Draft

Inspect the current repository and, where relevant, the running product. Explain purpose, responsibilities, boundaries, failure behavior, and safe next actions. Use synthetic examples only.

### 3. Review

Obtain reviews proportionate to risk:

- product review for behavior and terminology;
- engineering review for implementation and contracts;
- security/privacy review for sensitive data, secrets, threat boundaries, or reporting;
- operations review for runbooks, recovery, deployment, and rollback;
- language review for public English or German user content.

The author must not be the sole approver of a high-risk policy or runbook.

### 4. Verify and publish

Resolve review findings, validate links and metadata, confirm the applicable release, and record `last_verified`. Change status to `current` only after the described behavior and required controls are present.

### 5. Maintain

Review on the scheduled date and whenever a trigger occurs. Small wording corrections do not reset technical verification unless they change meaning.

### 6. Deprecate or archive

When behavior changes, either update the canonical page or preserve a versioned historical record. Deprecated pages must identify the supported replacement. Archived pages must retain their version, owner at archival, and reason.

## Review triggers

Review a page immediately when any of the following changes:

- a user-visible workflow, label, default, limit, or supported platform;
- a data schema, backup format, migration, or retention rule;
- a connector route, third-party contract, credential flow, or provider model;
- an encryption, origin, allowlist, redaction, or secret-handling control;
- a release gate, deployment path, signing state, or recovery procedure;
- the KB host, base path, search-index format, mobile navigation, sitemap/canonical policy, or PDF generator/verifier;
- an owner, classification, legal basis, or support boundary;
- a test reveals the documented statement is false or incomplete.

## Review cadence

Default maximum review intervals are:

- 90 days for security, privacy, connectors, AI providers, releases, and recovery;
- 180 days for product behavior, user guides, and operational procedures;
- 365 days for stable concepts, glossary entries, and historical decisions.

A page may specify a shorter interval. An expired review date makes the page stale; it does not automatically make the content false.

## Emergency corrections

For a safety-critical documentation defect, publish a narrowly scoped correction immediately, label any unverified remainder, and complete normal review as soon as practical. Never delay a warning about possible data loss, credential exposure, or unsafe recovery merely to preserve the ordinary review sequence.

See [Contributing documentation](/docs/contributing-docs) for the working procedure.
