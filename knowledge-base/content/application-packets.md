---
title: "Application Packets"
description: "Prepare, review, autosave, validate, and export job-specific application material in Klar."
section: "User Guide"
order: 240
audience: ["Klar users", "Product support"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Product Support"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["user-guide", "application-packet", "resume", "cover-letter", "provenance"]
---

# Application Packets

## Purpose

An Application Packet is the persistent, job-specific place to prepare an evidence-controlled Resume, cover letter, recruiter message, notes, and downloads. It snapshots the job so preparation can continue even if the original source later changes.

Open a career job and choose **Build Application Packet**. Klar creates or reopens the packet for that job and autosaves work locally or inside the unlocked vault.

## Language ownership

Choose English or German at the top of the packet. Each language has independent Resume content, review decisions, letter, message, provenance, usage, and readiness. Completing one language does not approve the other.

Klar suggests the posting language where it can, but the user makes the final selection.

## Choose the Resume path

### Generate tailored Resume

This path uses the configured AI provider. Klar estimates the token reservation before starting, schedules a request when rolling-minute headroom is temporarily unavailable, and may split only a permanently oversized Resume into bounded evidence-checked role requests.

The result includes posting-term coverage, proposed changes, factual status, evidence, unresolved findings, and generation metadata.

### Tailor without AI

This zero-token path reorders the person's existing Resume bullets and skills toward the posting. It does not rewrite sentences and therefore has no rewrite decisions to review. It remains grounded in the same canonical evidence.

## Review AI Resume changes

For every proposed change, inspect:

- location in the Resume;
- before and after text;
- reason and keyword effect;
- factual status;
- supporting evidence; and
- any added number, term, repetition, or title concern.

Choose Accept or Reject. Eligible changes can be edited and restored. A blocked change cannot be accepted or edited into the output. **Accept all** is unavailable while any item requires individual human judgment.

Blocked changes start rejected. Other eligible changes start accepted, including confirmation-required changes. Review and deliberately accept, reject, or edit every eligible change before relying on the document.

The current readiness indicator becomes ready when a tailored Resume baseline exists and no blocked change is accepted. It does not require a review timestamp or prove that every confirmation-required change was individually examined. Marking the packet reviewed records a timestamp; it does not change this mechanical gate or replace factual checking.

## Salary context

When valid Adzuna credentials and a supported country are available, the packet may show a salary benchmark for the role and city. It is market context, not tax, financial, or compensation advice. No benchmark is fabricated when the provider has no usable result.

## Draft the cover letter

1. Select Concise, Balanced, or Formal tone.
2. Add or review recipient name, place, recipient address, and date.
3. Draft with the configured AI provider.
4. Edit the body directly.
5. Review provenance and every document check.

DOCX and ZIP export remain paused when a historical letter needs migration or a fatal document check fails. Historical body text may be reviewed and explicitly confirmed after removing duplicated wrapper elements, or regenerated under the current contract.

Passing checks does not prove the letter contains no subtle unsupported claim. Read it against the canonical Resume and job posting before submission.

## Draft the recruiter message

Select:

- style: Conversational, Formal, or Concise;
- application state: not yet applied, applied, or referred/introduced;
- channel: LinkedIn, email, or other;
- optional recruiter name and discovery context.

A referred/introduced message requires the actual referrer or introducer name. Klar blocks generation without it so the model cannot invent that relationship. Edit the result and inspect deterministic checks before copying or sending it yourself.

## Autosave, staleness, and interruption

Packet notes and artifact edits save on the device as you work. A content fingerprint identifies whether saved output still matches the current Resume, posting, language, engine, requirements, tone, and message context.

- **Saved result reused** means the stored artifact is current and costs no new AI tokens.
- **Stale** means a relevant input changed; regenerate before treating the artifact as current.
- **Interrupted** means a prior generation did not complete; Klar clears the in-progress marker and does not save the incomplete result as real content.

Packet version history is bounded, and export history records artifact, language, format, time, and filename.

## Downloads

Available outputs are:

- tailored Resume DOCX;
- browser print/save Resume PDF;
- cover-letter DOCX; and
- one ZIP packet containing the governed Resume DOCX and cover-letter DOCX.

The ZIP is the mobile-safe combined download. Filenames use candidate, company, role, and language while avoiding internal job IDs and URL queries.

Before submitting, open the original posting and personally verify facts, names, dates, address, language, role, and file rendering. Klar never submits or sends the packet.

## Current exclusions

The reachable v2.6.0.1 packet does not expose a complete interview-preparation workflow. Do not treat unexposed interview-support code as a current user capability.
