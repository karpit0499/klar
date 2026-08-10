---
title: "Klar Overview"
description: "Purpose, capability map, supported markets, privacy boundary, and maturity of Klar v2.6.0.1."
section: "Product"
order: 100
audience: ["All Klar stakeholders", "Users", "Product", "Engineering"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Product"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["product", "overview", "developer-preview"]
---

# Klar Overview

## Purpose

Klar is a privacy-first workspace for finding work, assessing fit, preparing evidence-grounded application material, and tracking opportunities from discovery to decision. Its purpose is to make a fragmented job-search process clearer while keeping the person in control of their data and every external action.

The current release is **Klar v2.6.0.1 Developer Preview**. It is a functioning browser/PWA product with an experimental unsigned desktop build that is not publicly distributed; “Developer Preview” is a maturity boundary, not a marketing label.

## Capability map

| Capability | Purpose | Current boundary |
| --- | --- | --- |
| Career Roles | Find and rank jobs against a canonical Resume and career preferences | Requires a reviewed Resume and preferences |
| Flexible Work | Find minijobs, part-time, working-student, temporary, seasonal, weekend, evening, or night work | Does not require or use a Resume for discovery |
| Resume workspace | Maintain one structured evidence source for matching and documents | Extraction needs review; the original imported file is not retained |
| Matching and diagnostics | Filter irrelevant jobs, rank relevant jobs, and explain how the result set was formed | A score is a ranking aid, not a hiring probability |
| Application Packet | Prepare per-job, per-language Resume, cover letter, recruiter message, notes, and exports | Generated writing requires human review |
| Tracker | Manage Career Roles opportunities, status, notes, contacts, reminders, follow-up nudges, and historical scores | Flexible Work result cards do not currently offer a save-to-Tracker action; Klar does not contact an employer or change a status automatically |
| Backup and vault | Move, recover, and optionally encrypt the browser-local workspace | A lost vault passphrase cannot be recovered by Klar |
| Source and issue reporting | Expose source health and prepare privacy-reviewed GitHub reports | The user reviews and submits; Klar never submits automatically |

## Product surfaces

The main workspace has Dashboard, Search, Tracker, and Settings navigation. When a canonical Resume exists, a mode switch makes Career Roles and Flexible Work available without creating separate accounts or workspaces. Without a Resume, Flexible Work remains the active discovery mode and Career Roles can be added later.

See [Product modes](/docs/product-modes) and [User journeys](/docs/user-journeys).

## Data and AI boundary

Career history, preferences, saved jobs, packets, tracker records, and dashboard details are stored in the current browser. Klar has no application server that stores a person's career history. Optional vault protection encrypts sensitive workspace content at rest.

Local search, filtering, deterministic ranking, tracking, backups, exports, and no-AI Resume tailoring do not require a Groq key. With the default private deterministic-matching setting, content is sent to the configured provider only when a person starts an AI action. If that Developer Preview setting is turned off and a key is available, a search may automatically enrich up to 40 top-priority jobs. The default Groq route uses Klar's restricted Cloudflare Worker relay when configured; custom OpenAI-compatible engines are called directly.

Read [Settings and data](/docs/settings-and-data) and [Backups and recovery](/docs/backups-and-recovery) before moving devices or enabling the vault.

## Languages, markets, and devices

The interface supports English and German and is designed for current desktop and mobile browsers. Career search has region configurations for Germany, Austria, Switzerland, the Netherlands, Luxembourg, and Liechtenstein. Flexible Work employer coverage is focused on Germany.

Klar can be installed from a supporting browser as a PWA. The macOS ARM64 and Windows x64 desktop packages in v2.6 are unsigned experimental builds that are not publicly distributed; operating-system trust warnings are expected and public desktop distribution is not claimed.

## Maturity and limitations

Current behavior depends on third-party feeds, employer sites, provider quotas, and browser storage. A strict search may correctly return zero jobs. Generated writing can still contain a subtle unsupported claim and must be reviewed. The v2.6 human ranking and bilingual writing gates remain unpassed, and the managed local-model work remains experimental feasibility evidence rather than a public production feature.

Klar's source is visible for inspection but is not open source; modification, redistribution, and independent deployment are restricted by the repository license.

For the operating boundaries, see [Scope and non-goals](/docs/scope-and-non-goals). For a first session, use [Getting started](/docs/getting-started).
