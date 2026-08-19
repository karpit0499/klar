---
title: "Klar Knowledge Base Charter"
description: "Mandate, audiences, boundaries, and quality standard for Klar's governed documentation system."
section: "Governance"
order: 10
audience: ["Students and job seekers", "Schools, universities, and career services", "Developers and technical reviewers", "Privacy and security reviewers", "Klar contributors", "Product and operations teams"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Documentation"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["governance", "charter", "knowledge-base"]
---

# Klar Knowledge Base Charter

## Mandate

The Klar Knowledge Base (KB) is the governed explanation layer for the product. It connects what Klar does, why it does it, how people use it, how it is implemented, how it is operated, and what evidence supports each claim.

The KB exists to reduce operational ambiguity. A reader should be able to identify the current product behavior, the responsible owner, the applicable release, the relevant controls, and the safe next action without reconstructing the answer from source code or old planning material.

## Intended outcomes

The KB must enable:

- a new user to complete a safe first session and create a backup;
- support staff to diagnose a problem without requesting sensitive career data;
- product and engineering teams to understand the purpose and boundaries of a capability;
- reviewers to trace a statement to current implementation or approved policy;
- release owners to identify stale, target, deprecated, or blocked documentation;
- auditors and decision-makers to distinguish current evidence from future intent.

## Audiences

The public KB serves people who use Klar, help others use it, evaluate it, build it, or review its safeguards. No prior relationship with the project is required to read the published material.

| Audience | Primary need | Default reading path |
| --- | --- | --- |
| Students and job seekers | Complete a job-search task safely and understand what happens to their data | [Getting started](/docs/getting-started) and user guides |
| Schools, universities, and career services | Facilitate safe learning or advising sessions without collecting participant career data | [For schools and career services](/docs/for-schools-and-career-services) |
| Developers and technical reviewers | Understand contracts, invariants, architecture, and verification evidence | Architecture, code, data, engineering, and quality sections |
| Privacy and security reviewers | Evaluate data flows, trust boundaries, controls, limitations, and reporting routes | Security, privacy, data, platform, and governance sections |
| Product, design, support, and operations | Understand purpose, journeys, operating boundaries, and recovery procedures | [Klar overview](/docs/klar-overview), user journeys, and runbooks |
| Contributors, leadership, and independent reviewers | Assess source authority, status, ownership, decisions, and risk | Governance, decisions, and release evidence |

## Documentation families

The KB contains distinct document families. They must not be blended in a way that obscures authority.

1. **Concepts** explain purpose, principles, and domain language.
2. **User guides** provide outcome-oriented instructions for current product behavior.
3. **Technical reference** records exact contracts, schemas, configuration, and component responsibilities.
4. **How-to guides** describe a bounded operational or engineering task.
5. **Policies and controls** state mandatory organizational requirements.
6. **Runbooks** provide tested response and recovery procedures.
7. **Decisions** preserve the context and rationale for consequential choices.
8. **Release evidence** records dated proof for a specific build or deployment.
9. **Target documents** describe approved future intent and are never presented as current behavior.

## Scope and boundaries

The KB documents the authoritative repository state for Klar v2.6.1, including the browser/PWA application, Cloudflare Worker boundary, experimental Electron desktop build that is not publicly distributed, local persistence, source connectors, matching, application documents, and release controls.

## Publication and access

The canonical public site is [https://karpit0499.github.io/klar/kb/](https://karpit0499.github.io/klar/kb/), the static GitHub Pages export at `/klar/kb/`. It is built from the same reviewed commit as the application and uploaded in one Pages artifact. The earlier ChatGPT Sites address is retired and must not appear in canonical links, metadata, handbooks, or release output. Markdown remains authoritative; the generated site and PDFs are derived artifacts.

The application service worker excludes `/klar/kb/` requests and removes only Klar application caches that it owns. This prevents an installed application shell from intercepting documentation routes or deleting unrelated origin caches.

The site must remain usable at 320 CSS pixels, 200% zoom, keyboard-only operation, dark mode, and reduced motion. Mobile navigation, an in-article contents disclosure, the active document section, and the search interface remain available instead of disappearing at desktop breakpoints.

The KB does not replace:

- executable code, schemas, tests, or configuration;
- legal advice, tax advice, or a formal compliance certification;
- source-provider terms and policies;
- a release decision or security risk acceptance;
- issue tracking or roadmap prioritization.

See [Source of truth](/docs/source-of-truth) for conflict resolution and [Scope and non-goals](/docs/scope-and-non-goals) for product boundaries.

## Quality standard

A publishable page must be:

- **accurate:** verified against the applicable implementation and tests;
- **purposeful:** it explains why the subject exists, not only what it is called;
- **bounded:** current, target, historical, and deprecated material are visibly distinct;
- **actionable:** a reader can identify the safe next step;
- **traceable:** ownership, version, verification date, and related evidence are present;
- **privacy-safe:** examples are synthetic and contain no credentials or personal career data;
- **maintainable:** one concept has one canonical page, with links instead of copied passages;
- **accessible:** headings, link text, tables, and language remain usable without visual cues alone.

PDF handbooks are offline public snapshots, not the accessibility authority. v2.6.1 removes audited blank pages and broken root-relative links and adds document language/display-title metadata. The PDFs are still untagged; accessible HTML remains the authoritative reading surface until a reliable tagged-PDF generator and assistive-technology verification are complete.

## Success measures

The documentation owner should monitor:

- pages past their review date;
- pages without an active owner;
- broken internal and external links;
- unsuccessful KB searches and repeated support questions;
- release changes without matching documentation changes;
- user procedures that no longer match the interface;
- controls or runbooks without recent test evidence.

## Governing documents

- [Source of truth](/docs/source-of-truth)
- [Document lifecycle](/docs/document-lifecycle)
- [Documentation style guide](/docs/style-guide)
- [Documentation governance](/docs/documentation-governance)
- [Contributing documentation](/docs/contributing-docs)
