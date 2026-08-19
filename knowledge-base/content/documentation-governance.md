---
title: "Documentation Governance"
description: "Ownership, approval, classification, review, and control model for the Klar knowledge base."
section: "Governance"
order: 50
audience: ["Documentation owners", "Approvers", "Leadership", "Release owners"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Documentation"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["governance", "ownership", "classification", "controls"]
---

# Documentation Governance

## Governance objective

Documentation is part of Klar's product and control surface. Governance ensures that pages have accountable owners, appropriate access, evidence-backed claims, and predictable review rather than becoming an unmanaged collection of notes.

## Public-by-default policy

Klar documentation is intended for public, unauthenticated access after review. Product, user, architecture, engineering, data, quality, operations, and governance detail should be classified `public` when it can be published safely. Technical depth, implementation detail, or an audience of developers is not by itself a reason to restrict a page.

Before a page becomes public, its owner and reviewer must confirm that it contains none of the following:

- personally identifiable information or real Resume, application, contact, employer-private, or support-case data;
- passwords, API keys, tokens, recovery material, or any other secret;
- private infrastructure identifiers, private endpoints, non-public environment details, or access instructions;
- active incident evidence, unredacted logs, investigation records, or affected-party information;
- signing keys, signing certificates not already intentionally public, release credentials, or equivalent signing material; or
- actionable detail for an unfixed vulnerability or exploit when publication would increase risk.

Use synthetic examples and bounded public explanations. When an accurate repair record requires excluded detail, keep that record in an appropriately protected system and publish only the safe limitation, impact boundary, remediation status, and responsible reporting route.

Only pages with `classification: public` may enter the public website, navigation, search index, downloadable handbooks, or other public generated artifacts. Drafts, archived pages, and every non-public classification are excluded even if their source files are present beside public content.

## Roles

| Role | Accountability |
| --- | --- |
| Documentation owner | Maintains taxonomy, standards, tooling, and stale-page reporting |
| Page owner | Keeps a page correct, classified, reviewed, and linked to evidence |
| Subject-matter reviewer | Verifies product, engineering, security, privacy, legal, or operational meaning |
| Approver | Accepts the page for its intended audience and risk level |
| Release owner | Ensures release changes and evidence are reflected before publication |
| Contributor | Proposes accurate, scoped changes and resolves review findings |

One person may hold several roles for low-risk pages. High-risk policy, security, privacy, credential, encryption, deployment, or recovery content requires independent review.

## Required metadata

Every page must include:

- `title`
- `description`
- `section`
- `order`
- `audience`
- `status`
- `classification`
- `applicable_version`
- `owner`
- `last_verified`
- `next_review`
- `tags`

A page without an accountable owner or applicable version cannot be `current`.

## Classification

| Classification | Intended handling |
| --- | --- |
| `public` | Reviewed and safe for unauthenticated publication, including public-safe implementation and control detail |
| `internal` | Non-public working or operational context available only to authorized contributors |
| `confidential` | Limited business, security, incident, personal, or legal detail; access granted by need |
| `restricted` | Secrets, signing material, active incident evidence, private infrastructure access detail, or similarly high-impact content; never stored in the public KB |

Classification is determined by content, not by the hosting location. Public is the default outcome only after review; removing obvious secrets is not sufficient when personal data, private infrastructure, active incident material, signing material, or actionable unfixed exploit detail remains.

## Approval matrix

| Page type | Minimum approval |
| --- | --- |
| Public user guide | Product owner and documentation owner |
| Technical reference | Engineering owner |
| Security or privacy page | Security/privacy owner and technical owner |
| Runbook or recovery procedure | Operations owner and a successful procedure test |
| Architecture or product decision | Named decision authority |
| Target or roadmap page | Product owner; status remains `target` or `planned` according to decision state |
| Release evidence | Release owner |

## Change controls

Documentation changes should be reviewed with the implementation change that makes them necessary. A release should not be declared documented while material user behavior, configuration, migrations, controls, or limitations remain inconsistent with the KB.

Automated checks should reject:

- missing or invalid metadata;
- duplicate canonical slugs;
- broken internal links;
- a past `next_review` date without an explicit exception;
- prohibited secret patterns or personal-data fixtures;
- the prohibited accented English spelling of Resume;
- `status: current` pages that describe an unreleased target as present;
- public pages that expose or depend on non-public evidence as if readers can access it.

The publication pipeline must additionally reject a fresh-checkout build dependency on ignored files, a ChatGPT Sites canonical, broken `/klar/kb/` paths or fragments, embedded full-corpus search data on every page, unstable sitemap dates, stale PDF copies, blank handbook pages, relative published PDF links, and missing PDF language/display-title metadata.

## Exceptions

An exception must name the requirement, owner, justification, risk, compensating control, approval, and expiry date. An exception does not silently change the standard. Expired exceptions must be removed, renewed through review, or treated as a documentation defect.

## Reporting

The documentation owner should publish a periodic view of coverage, stale pages, unresolved gaps, review debt, and release alignment. See [Document lifecycle](/docs/document-lifecycle) and [Contributing documentation](/docs/contributing-docs).
