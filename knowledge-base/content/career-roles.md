---
title: "Career Roles Guide"
description: "Set up, run, interpret, save, and export Resume-based career job searches in Klar."
section: "User Guide"
order: 210
audience: ["Klar users", "Product support"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Product Support"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["user-guide", "career-roles", "search", "ranking"]
---

# Career Roles Guide

## Purpose and prerequisites

Career Roles finds jobs that match both the intended role and its job market, then ranks the eligible results against a reviewed canonical Resume and career preferences.

Before searching, you need:

- a confirmed canonical Resume;
- career preferences with target titles and a selected region;
- a current network connection for live sources;
- Adzuna credentials only if you want Adzuna results or salary benchmarks;
- under the default private deterministic-matching setting, an AI-provider key only for an explicit AI explanation or writing action. Turning off that Developer Preview setting permits automatic AI enrichment of up to 40 top-priority jobs during a search when a key is available.

## Configure the search foundation

During Career Roles setup, keep these concepts separate:

- **Target title:** the role function, such as Account Manager.
- **Job market/field:** the context, such as CRM, healthcare, or fintech.
- **Seniority:** intern, junior, mid, senior, lead, or executive.
- **Location:** one city and radius for the active search preference.
- **Remote only:** makes worldwide remote results eligible to bypass distance.
- **Must-haves and dealbreakers:** supporting preferences and hard conflicts.
- **German and visa settings:** optionally hide jobs above the selected German level or jobs that state they do not sponsor visas.

Klar v2.6.0.1 does not expose a complete post-onboarding career-preference editor in the main Settings page. Do not delete the workspace simply to change a preference; this is a current interface gap. Preserve a backup and track the gap through the reporting workflow.

## Understand source coverage

The active region determines which source families may run:

- Germany: Bundesagentur für Arbeit, Arbeitnow, optional Adzuna, and the configured Greenhouse/Lever/Ashby registry.
- Austria, Switzerland, and the Netherlands: Arbeitnow, optional Adzuna, and the configured ATS registry.
- Luxembourg and Liechtenstein: Arbeitnow and the configured ATS registry; Adzuna is not configured for these regions.

Actual execution also depends on the Klar Worker configuration, credentials, source availability, and employer routes. The ATS registry is DACH-focused and contains both verified and candidate routes; failed companies are isolated and shown in source status rather than failing the entire search.

## Run a search

1. Open **Search** in Career Roles mode.
2. Confirm the displayed titles, location, and region.
3. Optionally enable German or visa hiding, add exact company or whole-word hide terms, and set a maximum posting age.
4. Optionally name and save the current search before or after running it.
5. Select **Search & match**.

Klar then:

1. gathers active sources in parallel;
2. normalizes jobs and merges duplicates;
3. applies employment, company, recency, and distance filters;
4. rejects clear role, market, and seniority mismatches;
5. fetches eligible BA detail descriptions when required;
6. produces a deterministic local ranking snapshot for every remaining job;
7. applies the selected German and visa hiding to the displayed set.

Every relevant ranked job remains eligible for display. The 40-job limit applies only to the optional compatibility AI-priority path, not result membership.

## Read a result

Open a job to review:

- title, employer, location, source, salary when published, and employment type;
- original description and link;
- final score and whether the explanation is local or AI-enriched;
- ranking version, rank, core fit, bounded preference effect, and posting confidence;
- evidenced or partly evidenced requirements;
- missing required items, uncertain facts, and known hard conflicts;
- source confidence, fetch date, and merged-source information.

The score is a local sorting aid. It is not a probability of interview or employment. Unknown facts remain unknown rather than being treated as confirmed matches.

## Use Search diagnostics

Expand **Search diagnostics** to see requested sources, raw results, duplicates, each filter's removals, unlocatable jobs, relevance removals, hard-filter hiding, matching progress, AI fallbacks, and the final count.

For zero results, follow the specific next step shown. Common causes are all sources failing, an over-broad company hide term, employment or age filters, radius, role/market mismatch, German or visa hiding, no raw postings, or unfinished scoring.

Do not broaden the query automatically when strict criteria correctly produced zero matches.

## Save and revisit searches

A saved search stores its query, region, selected employment types, company hide list, distance, and maximum age. The first run establishes a baseline. Later runs mark jobs as new only when their stored identities were not previously seen; the history is bounded locally.

Deleting a saved search removes that search definition and baseline, not saved Tracker jobs.

## Save, prepare, and export

- **Save to Tracker** creates an Interested record with the current job snapshot and ranking.
- **Build Application Packet** opens the persistent English/German preparation workflow.
- **Open original** hands off to the source site.
- CSV, XLSX, and printable PDF export include the currently shown result set, not roles segregated by hard filters.

Next: [Application Packets](/docs/application-packets) and [Tracker guide](/docs/tracker).
