---
title: "Scope and Non-Goals"
description: "What Klar v2.6.0.1 includes, explicitly excludes, and does not guarantee."
section: "Product"
order: 120
audience: ["Users", "Product", "Engineering", "Support"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Product"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["product", "scope", "limitations", "non-goals"]
---

# Scope and Non-Goals

## In scope

Klar v2.6.0.1 provides:

- browser-local career and Flexible Work workspaces;
- structured Resume import, manual creation, editing, completeness checks, replacement, and history;
- career preference capture and region-specific public job discovery;
- role, market, seniority, employment, recency, company, distance, language, and visa-related filtering;
- deterministic local ranking with versioned evidence-linked snapshots;
- optional per-job AI explanation and application-writing actions;
- progressive Flexible Work search across configured public and employer routes;
- saved searches and “new since last run” detection;
- persistent English and German Application Packets;
- evidence-controlled Resume tailoring, cover letters, recruiter messages, notes, and document exports;
- an application Tracker with status, contacts, reminders, follow-up nudges, and exports;
- device-local dashboard details;
- standard, complete encrypted, and explicitly confirmed readable exports;
- optional vault encryption and privacy-reviewed issue preparation;
- an experimental unsigned desktop and managed local-model developer build that is not publicly distributed.

## Explicit non-goals

Klar does not:

- submit applications, fill employer forms, send recruiter messages, or accept legal terms on a person's behalf;
- operate as an applicant tracking system for employers or recruiters;
- provide a cloud account, server-side career-history store, or automatic cross-device sync;
- guarantee that every vacancy is found, current, complete, unique, or still open;
- turn a fit score into a probability of interview, offer, or employment;
- invent experience, credentials, work authorization, referrals, or results for application material;
- guarantee that generated text contains no subtle unsupported statement;
- provide legal, immigration, tax, payroll, financial, or employment advice;
- recover a lost vault passphrase;
- promise a support response time or paid support service;
- claim the experimental local-model or unsigned desktop build is ready for public production use;
- grant open-source rights to copy, modify, redistribute, or independently deploy the repository.

## Current user-interface exclusions

The repository contains support code for capabilities that are not exposed as complete v2.6.0.1 user workflows. In particular, a standalone interview-preparation flow and a standalone German net-salary calculator are not part of the reachable main application interface. They must not be documented as current user features until an interface, verification, and release decision exist.

Career preferences cannot currently be edited after onboarding through a dedicated Settings form, even though the setup checklist can direct users to Settings. Flexible Work result cards also do not currently provide a save-to-Tracker action.

The experimental Resume design lab is disabled by default, is not exposed in the publicly distributed product, and exists for evaluation. Its variants do not change the production Resume exporter.

## No-result and partial-result behavior

A zero-result search is not automatically a failure. Strict role, market, distance, or eligibility constraints may correctly produce no current match. Klar reports source and filter diagnostics rather than backfilling unrelated jobs.

Third-party failure can produce partial or limited coverage. A result page represents what the configured sources returned within the current session and filters; it is not a complete statement about the labor market.

## Human responsibility

The user remains responsible for:

- reviewing imported Resume structure and every generated document;
- checking the original job posting and employer route;
- confirming application facts, dates, names, addresses, and claims;
- deciding whether and where to submit an application or report;
- storing backups and protecting backup or vault passwords;
- evaluating salary, tax, visa, contract, and legal information with qualified sources.

See [Klar overview](/docs/klar-overview), [Troubleshooting](/docs/troubleshooting), and [Backups and recovery](/docs/backups-and-recovery).
