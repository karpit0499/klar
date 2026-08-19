---
title: "Source of Truth"
description: "Authority hierarchy and conflict-resolution rules for current, target, and historical Klar information."
section: "Governance"
order: 20
audience: ["All Klar contributors", "Reviewers", "Release owners"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Documentation"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["governance", "source-of-truth", "evidence"]
---

# Source of Truth

## Governing rule

No single prose page defines Klar's current behavior. Current behavior is established by the released code, configuration, data contracts, and passing verification evidence for the stated release. Documentation explains that evidence and must change when the evidence changes.

## Authority hierarchy

Use this order when two sources conflict:

1. **Released code, configuration, and data schemas** define what the product can execute.
2. **Tests and release evidence** establish which behavior was verified for a release.
3. **Release metadata and the changelog** identify the shipped version and historical change.
4. **Approved architecture and product decisions** explain why a consequential choice was made.
5. **Approved policies and runbooks** define mandatory organizational handling.
6. **Current KB pages** explain the verified state for their audience.
7. **Roadmaps and target documents** describe intended future behavior only.
8. **Old build guides, discussions, and archived documents** are historical context, not current authority.

The Klar application repository that contains this knowledge base is the authoritative implementation source for the KB. Markdown under `knowledge-base/content` is canonical; the Next static export at `/klar/kb/`, lazy search index, sitemap, and PDF handbooks are derived from it. Planning material must never be used to reconstruct current behavior when the repository can be inspected directly.

## Current, target, and historical statements

Every material claim must fit one of these categories:

| Category | Meaning | Required treatment |
| --- | --- | --- |
| Current | Present in the applicable released implementation | Verify against code and proportionate tests |
| Target | Approved or proposed future behavior not yet released | Use `status: target`, or `status: planned` when it is planning intent rather than an approved product contract; state dependencies and decision state |
| Historical | True for an earlier release | Name the release and link to history |
| Deprecated | Still present but scheduled for removal or unsupported use | State replacement and end condition |
| Unknown | Evidence is absent or contradictory | Do not convert uncertainty into a claim; record a documentation gap |

Target content may explain intent but must not use present-tense product language such as “Klar supports” until implementation and verification are complete.

## Resolving a conflict

When documentation and implementation differ:

1. confirm the applicable Klar version and source commit;
2. reproduce the behavior using the supported interface where practical;
3. inspect the code, configuration, schema, and relevant tests;
4. determine whether the defect is in the product, the documentation, or both;
5. correct the responsible source through normal review;
6. mark the page as draft or add a visible limitation until the discrepancy is resolved;
7. add release evidence when the correction ships.

Do not silently rewrite a page to match an unreviewed local change. An uncommitted or unreleased implementation is not a released product claim.

## Evidence expectations

The strength of evidence should match the claim:

- A UI instruction should be verified against the current rendered workflow.
- A data-retention or encryption statement should be verified against storage and cryptographic code plus tests.
- A connector capability should be verified against its registry contract, current route, and contract tests.
- A release-readiness statement should cite the complete release gate and dated results.
- A third-party fact should cite the provider's current primary documentation and carry a verification date.

Absence of a failing test is not proof of a broad guarantee. Use bounded language, especially for generated writing, third-party source coverage, security, accessibility, and compatibility.

## Page-level traceability

Every KB page must declare the applicable version, owner, status, classification, verification date, next review date, audience, and tags. Technical pages should also link to relevant components, tests, schemas, controls, decisions, and runbooks.

See [Document lifecycle](/docs/document-lifecycle) for status changes and [Documentation governance](/docs/documentation-governance) for ownership and review.
