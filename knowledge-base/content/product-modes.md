---
title: "Product Modes"
description: "How Career Roles and Flexible Work differ, coexist, and determine available Klar workflows."
section: "Product"
order: 140
audience: ["Users", "Product", "Support", "Design"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Product"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["product", "career-roles", "flexible-work", "routing"]
---

# Product Modes

Klar has two discovery modes. They share one local workspace and top-level navigation, but they solve different jobs and have different prerequisites. In the current interface, only Career Roles results can be saved to the Tracker.

## Mode comparison

| Dimension | Career Roles | Flexible Work |
| --- | --- | --- |
| Primary purpose | Find career jobs and assess fit against experience and preferences | Find practical, location- and schedule-oriented work |
| Resume required | Yes | No |
| Discovery inputs | Target titles, job market/field, seniority, location, radius, salary, language, work authorization, must-haves, dealbreakers | Locations, radius, employment arrangements, workplaces, optional role families, schedule, language comfort, physical-work preference, transport, start date |
| Matching | Relevance gates plus local deterministic Klar score; optional separate per-job AI opinion | Deterministic query and relevance classification; no Resume ranking |
| Results | Ranked job cards with evidence, score, diagnostics, and application tools | Progressive vacancy or open-entry cards with source status and official routes |
| Preparation | Per-language Application Packet with tailored Resume, cover letter, and recruiter message | Deterministic employer message, availability summary, and printable profile card |
| External action | Opens original posting or application route | Opens official vacancy or employer route |

## How mode selection works

On first use, Klar offers Career Roles, Flexible Work, backup restore, or a temporary sample workspace.

- Choosing Career Roles starts Resume creation and career-preference setup.
- Choosing Flexible Work starts location and work-type setup without a Resume.
- Restoring a backup validates the file before changing active data.
- Exploring Klar keeps its synthetic career sample in memory and does not save that sample as Resume or workspace data. Language, appearance, and region choices may remain in browser storage.

When a canonical Resume exists, the Career Roles/Flexible Work switch appears on discovery surfaces. The last selected view is saved locally. Switching modes does not delete either mode's saved preferences, saved-search definitions and baselines, packets, or Tracker records.

When no Resume exists, Flexible Work is the active mode by definition. The user can add a Resume later from Flexible Work or the Dashboard-linked Resume page to enable Career Roles.

## Shared surfaces

Both modes use the same top-level Dashboard, Search, Tracker, and Settings navigation.

- **Dashboard:** Career Roles shows the personal dashboard and career context; Flexible Work shows its search launcher and saved Flexible Work searches. It also links to the secondary Resume and Support workspaces.
- **Search:** renders the active mode's discovery workflow and preserves a visited search while navigating elsewhere.
- **Tracker:** stores Career Roles opportunities saved to the local application workflow. Flexible Work supports saved searches and preparation tools, but its current result cards do not provide a save-to-Tracker action.
- **Settings:** manages language, appearance, region, data, security, connections, mode setup, and optional AI configuration.

## Capability rule

The selected mode is a view choice, not an irreversible account type. A Resume enables career discovery and Resume-based application preparation; valid Flexible Work preferences enable Flexible Work discovery. A person may maintain both capabilities in the same workspace.

Continue with [Career Roles guide](/docs/career-roles), [Flexible Work guide](/docs/flexible-work), or [Getting started](/docs/getting-started).
