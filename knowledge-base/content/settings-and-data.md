---
title: "Settings and Data"
description: "Guide to Klar's local data, language, appearance, connections, AI engine, release controls, region, and deletion settings."
section: "User Guide"
order: 270
audience: ["Klar users", "Product support", "Operators"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Product Support"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["user-guide", "settings", "data", "credentials", "ai-engine"]
---

# Settings and Data

## Local-data warning

Klar's workspace belongs to the current browser profile. Switching devices or browser profiles does not move it, and clearing the original browser's site data can remove it permanently. Create and test backups regularly.

Settings contains several independent controls. Changing one does not imply that related external services were changed.

## Backup and vault

Use **Backup & encryption** to download a standard or complete encrypted backup, restore a file, enable or disable the vault, lock it, or create an explicitly confirmed readable export. Read [Backups and recovery](/docs/backups-and-recovery) before changing vault state.

The Desktop capability panel appears only inside the experimental Electron build, which is not publicly distributed. It exposes bounded system/runtime status, verified model-package startup, stop, and redacted diagnostics through the desktop bridge; the browser page receives no general shell or filesystem access.

## Language and appearance

Select English or German and the available appearance mode. Klar v2.6.1 localizes navigation, scoring, source states, validation and recovery messages, dates, numbers, and currency formatting more consistently. These interface preferences are stored locally and do not translate user-entered Resume or packet content. In German UI, Klar uses **Lebenslauf**; in English UI and code-facing documentation it uses **Resume**.

If no language preference has been saved, Klar uses the browser's German locale when it begins with `de`; otherwise it starts in English. User-visible failures are stored as stable codes and translated when rendered, so changing language does not leave a cached English error behind. Job-card dates, score numbers, and salary currency values use locale-aware formatters; broader relative-time and plural-format coverage remains part of the localization follow-up.

German search normalization treats `ß` and `ss` as equivalent and supports umlaut/digraph forms such as `München`/`Muenchen`, without rewriting the displayed employer text. This improves matching and search lookup; it is not a translation or spelling correction of user data.

## Flexible Work and Career Roles

Settings can create or edit Flexible Work locations, work types, and availability.

Career target titles, job market/field, seniority, salary, city, radius, must-haves, and dealbreakers remain onboarding-owned in v2.6.1; Settings does not expose a complete post-onboarding editor for them. The setup checklist links Resume maintenance to the dedicated Resume page rather than implying that Settings owns career facts. Preserve a backup and use Support to report the remaining preference-editor gap; do not use Delete all data as a routine edit path.

## Adzuna credentials

Adzuna requires an App ID and App key from the same account. Enter both, then Save and optionally Test connection. A partial pair is rejected. Removing the credentials disables Adzuna-specific results and salary benchmarks but leaves other sources and workspace data available.

Credentials are stored in the current browser or encrypted credential vault. They are sent to the Klar Worker only when an Adzuna request needs them. Standard backups exclude them; complete encrypted backups may include them.

## What moved out of Settings

Resume creation, editing, replacement, history, and the disabled-by-default design lab now live on the dedicated **Resume** page linked from the Dashboard. Bug and suggestion reporting now lives on the dedicated **Support** page. Moving both workspaces removes unrelated, high-density controls from Settings without changing their local-data or security boundaries.

## AI engine

The default engine is Groq through Klar's fixed Worker relay when the Worker is configured. Settings can define another OpenAI-compatible endpoint, main model, fast model, key requirement, and fast-matching preference; it can also request the endpoint's model list.

Only HTTP and HTTPS endpoints are accepted. The hosted HTTPS app cannot call an HTTP local model server because the browser blocks mixed content. A local HTTP Klar build may call one when its CORS configuration allows it. The experimental desktop build provides a separate managed loopback route, but public local intelligence is not a current production claim.

The rolling-minute budget notice shows estimated use and actual use only when the provider reports it. A waiting action may start when headroom returns; a permanently oversized action requires the available fallback or bounded chunking.

## Release features

The Developer Preview exposes guarded feature switches for requirement extraction, tailoring review, custom engine, packet retention, deterministic matching, budget scheduling, oversized-Resume chunking, and the experimental Resume design lab.

These switches are evaluation and rollback controls. Use the safe defaults unless testing a specific behavior, and record any non-default state when reporting a defect. In v2.6.1, the custom-engine and packet-retention switches are presented in Settings but are not consumed by their corresponding runtime workflows; changing either switch does not disable custom-engine configuration or packet persistence. Treat that mismatch as a known implementation gap, not as a supported control outcome.

## Region

The active region controls career source selection and applies to the next search. Available regions are Germany, Austria, Switzerland, the Netherlands, Luxembourg, and Liechtenstein. Changing the region does not rewrite existing saved searches, Tracker snapshots, or packets.

## Delete all local data

**Delete all local data** clears every Klar browser store, including settings, Resume and history, preferences, caches, matches, Tracker, Dashboard, saved searches, connector health, packets, and vault. It then clears the Groq key from Klar's session state.

This operation cannot be undone in the interface. Download and verify a backup first. It does not delete data already sent to an AI provider, employer, GitHub, downloaded file, or other external system.
