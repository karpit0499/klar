---
title: "Settings and Data"
description: "Guide to Klar's local data, language, appearance, connections, Resume, AI engine, release controls, region, and deletion settings."
section: "User Guide"
order: 270
audience: ["Klar users", "Product support", "Operators"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Product Support"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["user-guide", "settings", "data", "credentials", "ai-engine"]
---

# Settings and Data

## Local-data warning

Klar's workspace belongs to the current browser profile. Switching devices or browser profiles does not move it, and clearing the original browser's site data can remove it permanently. Create and test backups regularly.

Settings contains several independent controls. Changing one does not imply that related external services were changed.

## Backup, vault, and reports

Use **Backup & encryption** to download a standard or complete encrypted backup, restore a file, enable or disable the vault, lock it, or create an explicitly confirmed readable export. Read [Backups and recovery](/docs/backups-and-recovery) before changing vault state.

Use **Submit a bug or issue** to prepare a privacy-reviewed GitHub report. Ordinary reports open public Issues; privacy or security concerns open private vulnerability reporting. Klar does not submit either type automatically.

The Desktop capability panel appears only inside the experimental Electron build, which is not publicly distributed. It exposes bounded system/runtime status, verified model-package startup, stop, and redacted diagnostics through the desktop bridge; the browser page receives no general shell or filesystem access.

## Language and appearance

Select English or German and the available appearance mode. These interface preferences are stored locally and do not translate user-entered Resume or packet content.

## Flexible Work and Career Roles

Settings can create or edit Flexible Work locations, work types, and availability. If no canonical Resume exists, Settings also offers **Add Resume** to enable Career Roles.

Current limitation: v2.6.0.1 does not render a complete post-onboarding editor for career target titles, job market/field, seniority, salary, city, radius, must-haves, or dealbreakers. The setup checklist may navigate to Settings for those preferences even though the editor is absent. Preserve a backup and report the interface gap; do not use Delete all data as a routine edit path.

## Adzuna credentials

Adzuna requires an App ID and App key from the same account. Enter both, then Save and optionally Test connection. A partial pair is rejected. Removing the credentials disables Adzuna-specific results and salary benchmarks but leaves other sources and workspace data available.

Credentials are stored in the current browser or encrypted credential vault. They are sent to the Klar Worker only when an Adzuna request needs them. Standard backups exclude them; complete encrypted backups may include them.

## Resume management

When a canonical Resume exists, Settings supports:

- editing the structured Resume;
- previewing and fully replacing it from a supported file or pasted text;
- naming, renaming, restoring, and deleting Resume snapshots; and
- the disabled-by-default experimental Resume design lab when its release flag is enabled.

Replacing a Resume preserves tracked jobs and preferences and creates a restorable snapshot of the prior Resume. See [Resume and profile](/docs/resume-and-profile).

## AI engine

The default engine is Groq through Klar's fixed Worker relay when the Worker is configured. Settings can define another OpenAI-compatible endpoint, main model, fast model, key requirement, and fast-matching preference; it can also request the endpoint's model list.

Only HTTP and HTTPS endpoints are accepted. The hosted HTTPS app cannot call an HTTP local model server because the browser blocks mixed content. A local HTTP Klar build may call one when its CORS configuration allows it. The experimental desktop build provides a separate managed loopback route, but public local intelligence is not a current production claim.

The rolling-minute budget notice shows estimated use and actual use only when the provider reports it. A waiting action may start when headroom returns; a permanently oversized action requires the available fallback or bounded chunking.

## Release features

The Developer Preview exposes guarded feature switches for requirement extraction, tailoring review, custom engine, packet retention, deterministic matching, budget scheduling, oversized-Resume chunking, and the experimental Resume design lab.

These switches are evaluation and rollback controls. Use the safe defaults unless testing a specific behavior, and record any non-default state when reporting a defect. In v2.6.0.1, the custom-engine and packet-retention switches are presented in Settings but are not consumed by their corresponding runtime workflows; changing either switch does not disable custom-engine configuration or packet persistence. Treat that mismatch as a known implementation gap, not as a supported control outcome.

## Region

The active region controls career source selection and applies to the next search. Available regions are Germany, Austria, Switzerland, the Netherlands, Luxembourg, and Liechtenstein. Changing the region does not rewrite existing saved searches, Tracker snapshots, or packets.

## Delete all local data

**Delete all local data** clears every Klar browser store, including settings, Resume and history, preferences, caches, matches, Tracker, Dashboard, saved searches, connector health, packets, and vault. It then clears the Groq key from Klar's session state.

This operation cannot be undone in the interface. Download and verify a backup first. It does not delete data already sent to an AI provider, employer, GitHub, downloaded file, or other external system.
