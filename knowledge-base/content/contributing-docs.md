---
title: "Contributing Documentation"
description: "Repository-based workflow and review checklist for creating or changing Klar KB pages."
section: "Governance"
order: 60
audience: ["Documentation contributors", "Engineering", "Product", "Reviewers"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Documentation"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["governance", "contribution", "workflow"]
---

# Contributing Documentation

## Before writing

1. Identify the reader's question and the outcome the page must enable.
2. Search the KB for an existing canonical page. Extend it instead of creating a duplicate source of truth.
3. Inspect the current Klar repository directly. Do not reconstruct current behavior from an earlier build guide or roadmap.
4. Confirm the release, relevant code, configuration, tests, UI behavior, decisions, and known limitations.
5. Identify the page owner, reviewers, classification, and review interval.

## Create or change the page

Use modular Markdown under `knowledge-base/content`. The filename becomes the documentation slug, so choose a stable, descriptive lowercase name with hyphens. Internal links use `/docs/<slug>`.

Start with this metadata shape:

```yaml
---
title: "Page title"
description: "One-sentence purpose."
section: "Product"
order: 100
audience: ["Named audience"]
status: "draft"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Accountable team or role"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["topic"]
---
```

Write the smallest complete page that owns the subject. Link to deeper reference rather than copying it. Explain purpose, boundaries, prerequisites, procedure or contract, failure behavior, limitations, and ownership where those dimensions apply.

## Evidence and claims

- Verify current behavior in code and the supported interface.
- Run the tests proportionate to the changed claim.
- Use only primary sources for unstable third-party contracts.
- Label approved future content `target` and planning intent `planned`; keep both out of current user procedures.
- Record uncertainty as an explicit gap instead of choosing a convenient interpretation.
- Use synthetic examples and the required Resume terminology from the [style guide](/docs/style-guide).

## Validate locally

Before review, confirm:

- required metadata is present and correctly typed;
- links resolve and headings are unique and ordered;
- Markdown renders without broken tables, code fences, or inaccessible link text;
- the page contains no credentials, real career data, private paths, or unredacted diagnostics;
- English uses Resume/resume without accent marks;
- current and target statements are visibly distinct;
- procedures match the current interface and preserve safety warnings;
- code or commands have been tested for the applicable version.

## Review and publication

Request the reviewers defined in [Documentation governance](/docs/documentation-governance). Resolve substantive findings in the page or the product; do not weaken wording merely to hide a mismatch. Set `status: current` only when evidence and approvals are complete.

The KB source is publicly readable in the Klar repository, but repository access does not grant rights to copy, modify, redistribute, translate, or independently deploy Klar. Review the current [Klar LICENSE](https://github.com/karpit0499/klar/blob/main/LICENSE) before proposing code or documentation reuse. Public documentation contributions and software-use rights are separate questions.

For a release change, the pull request should identify:

- the changed behavior or control;
- affected KB slugs;
- tests or evidence used for verification;
- migration, rollback, and support implications;
- pages intentionally unchanged and why.

## Maintenance

The page owner reviews the page by `next_review` and when a lifecycle trigger occurs. If ownership is lost or verification cannot be completed, change the page to `draft`, mark the uncertain section, or archive it. Stale authoritative-looking content is worse than a visible gap.

Related guidance: [KB charter](/docs/kb-charter), [Source of truth](/docs/source-of-truth), and [Document lifecycle](/docs/document-lifecycle).
