---
title: "Resume and Application Generation"
description: "Canonical Resume model, import and review, evidence-bound tailoring, packet state, provenance, document contracts, and export gates."
section: "Application Preparation"
order: 250
audience: ["Engineering", "Product", "Writing reviewers", "Security", "Support"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Engineering"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["resume", "tailoring", "evidence", "application", "packets", "export"]
---

# Resume and Application Generation

## Purpose

Klar prepares application material from user-reviewed career facts while preventing generated prose from silently becoming asserted truth. The canonical Resume is the source of facts; AI and deterministic transforms may propose presentation changes, but the person remains the approver.

## Canonical Resume contract

`ResumeData` schema version 2 is the sole authoritative career-fact model. It includes:

- contact details and links;
- summary;
- experience entries with stable IDs, bullets, and evidence references;
- education;
- grouped skills;
- languages;
- projects;
- certifications;
- evidence records; and
- optional review time.

`normalizeResume` trims and regularizes input, supplies stable internal identifiers where needed, and links evidence without creating unsupported career facts. A thin `Profile` is derived at runtime for matching and compatibility. It must not be independently edited or persisted as a competing source of truth.

Completeness is structural: it can identify missing sections or fields, but it cannot judge whether experience is impressive, accurate, or sufficient for a role.

## Import and extraction

Supported input paths are PDF, DOCX, and plain text. PDF text is extracted in the browser through a dynamically loaded PDF.js worker; DOCX text is extracted with Mammoth; text files are read directly. The normal workflow does not upload or retain the original document.

AI-assisted Resume extraction:

- sends at most 14,000 characters of extracted text;
- requests a strict structured schema where the provider supports it;
- instructs the model to copy facts and not invent them;
- sanitizes and normalizes partial nested rows; and
- presents the result for review before it becomes canonical.

The legacy thin-profile extraction path is separately bounded at 12,000 characters. New work should target the canonical Resume path.

## Persistence and history

The current Resume ID is `current`; the onboarding draft ID is `onboarding`. An accepted edit or replacement creates bounded history. Klar keeps at most 10 snapshots and removes snapshots older than 90 days. Snapshot reasons distinguish edit, reupload, migration, manual, and restart recovery.

While the vault is enabled, current Resume, draft, and history live inside authenticated content ciphertext. See [Data Architecture, Vault, and Backup](/docs/data-architecture-vault-and-backup).

## Application packet

Each selected job has a packet ID of the form `{career|flexible}:{jobId}`. A packet contains:

- an immutable-enough job snapshot for application context;
- independent English and German workspaces;
- Resume tailoring decisions and evidence findings;
- cover-letter and recruiter-message content;
- notes, readiness, and generation-stage recovery state;
- per-artifact format and generator provenance;
- bounded packet versions; and
- bounded export history.

The job snapshot protects the preparation workspace from later source-cache changes. Language states are independent: generating German content must not silently relabel or overwrite English content.

Packet versions are capped at five and export history at 20. On startup, any generation stage left in flight is marked interrupted so the user sees recoverable state rather than an endless spinner.

## Tailoring model

### Deterministic baseline

The baseline preserves original Resume facts and reorders or selects existing content to emphasize job-relevant evidence. It does not manufacture achievements, employers, dates, qualifications, or metrics.

### AI proposal

AI tailoring returns a structured edit proposal, not a replacement Resume. Each proposed change is associated with original content and evidence. The consumer validates the schema, indices, evidence references, and audit record. A malformed result receives at most one targeted regeneration attempt; `maxTailoringAttempts` is 2 total.

When an input is permanently too large and the relevant feature is enabled, Klar can split role work into bounded chunks. Prompt projection uses the minimum Resume/job fields needed and a bounded job-description excerpt.

### Decision boundary

Every change remains pending until the person accepts, rejects, or edits it. Evidence-blocked changes are rejected at:

- proposal normalization/audit;
- accept/edit decision;
- readiness calculation; and
- export assembly.

This repeated enforcement is deliberate defense in depth. A UI shortcut must not bypass it.

## Writing artifacts

Recruiter messages and cover letters use explicit language, tone, evidence, request, and formality contracts. Generated output must remain grounded in the canonical Resume and selected job snapshot. Deterministic checks catch structural and evidence-contract failures but do not prove every sentence is factually correct or professionally effective.

The recruiter message remains a workspace artifact and is not included in the current application ZIP. The ZIP includes a Resume DOCX and semantic cover-letter DOCX only when current cover-letter provenance and readiness are valid.

## Format and provenance contracts

Current identifiers include:

| Artifact | Contract |
| --- | --- |
| Packet | `klar-packet-v1` |
| Application content | `klar-application-content-v1` |
| Writing prompt | `klar-writing-v2.6.0` |
| Resume DOCX generator | `klar-resume-docx-v2.6.0.1` |
| Cover-letter DOCX | `klar-cover-letter-docx-v1` |
| Application ZIP | `klar-application-packet-zip-v1` |

Historical artifacts without provenance remain explicitly `historical:unversioned`. Packet-level labels must not make mixed old/new artifacts appear to have one generator version. Each artifact carries its own format, generator, prompt/model, language, time, and source-state provenance where applicable.

## Document generation

The current Resume DOCX and browser-print PDF share a cross-compatible A4 template using Arial and normalized margins/spacing. The 2.6.0.1 hotfix aligns the Resume export contract across supported formats. Cover letters use a semantic DOCX structure rather than a visual screenshot or canvas representation.

The Resume design lab under `src/resume/designLab.ts` is an experimental evaluation surface, disabled by default and not exposed in the publicly distributed product. Its variants do not change the production exporter unless a separately reviewed change promotes them.

Exports are assembled locally. A one-download ZIP supports mobile workflows, but the downloaded file leaves Klar's local protection boundary.

## Human review and release truth

No generated application is auto-sent. Users must review facts, dates, company and role names, language, salutation, claims, and destination requirements before use.

The repository's human writing gate remains **HOLD** until the required real, independent, professionally bilingual evaluations exist. Machine checks, model self-evaluation, synthetic fixtures, or attractive rendering cannot substitute for that evidence. Thresholds and reviewer design are documented in [Test Strategy and Release Gates](/docs/test-strategy-and-release-gates).

## Change checklist

A change to Resume or application generation must review:

- canonical schema and migration impact;
- input extraction bounds and data minimization;
- consumer-side structured validation;
- evidence linking and blocked-claim behavior;
- retry/token/deadline bounds;
- English and German independence;
- packet/history/provenance compatibility;
- DOCX, print/PDF, and ZIP behavior;
- interruption recovery;
- accessibility and mobile download behavior; and
- automated plus applicable human gates.

Provider architecture is documented in [AI, Provider, Prompt, and Evidence Architecture](/docs/ai-provider-prompt-and-evidence-architecture). Operational recovery is in [Operations Runbooks](/docs/operations-runbooks).
