---
title: "User Journeys"
description: "End-to-end current-state journeys across onboarding, discovery, preparation, tracking, recovery, and reporting."
section: "Product"
order: 150
audience: ["Product", "Design", "Support", "Engineering", "Users"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Product"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["product", "journeys", "onboarding", "recovery"]
---

# User Journeys

## 1. First arrival

**Goal:** enter Klar without committing data prematurely.

1. Choose English or German, appearance, and region.
2. Select Career Roles, Flexible Work, Restore backup, or Explore Klar.
3. If Explore Klar is selected, inspect synthetic sample career data in a temporary workspace. The sample is not saved, although language, appearance, and region choices may remain locally.
4. If Klar detects an incomplete local setup, choose to continue, restore, or start over. Starting over preserves a meaningful structured Resume draft as recoverable history when one exists, then resets the route.

**Trust boundary:** interface choices and progress for a real setup path are stored in the current browser. The Explore sample remains in memory. No external application is submitted.

## 2. Set up Career Roles

**Goal:** create a reviewed evidence base and search preferences.

1. Choose a PDF, DOCX, TXT, or Markdown file, paste Resume text, or create a Resume manually.
2. Selecting a file reads it locally and then starts the AI structuring flow, requesting a provider key when needed. Pasted text is sent only after the user chooses **Structure pasted text**. Only extracted text is sent; the original file is not retained.
3. Review and edit every structured section before confirmation.
4. Set target titles and job market/field separately, then seniority, salary preference, city, radius, remote preference, must-haves, dealbreakers, German level, and visa-related filters.
5. Optionally add an Adzuna App ID and App key or skip the connection.
6. Complete or dismiss the contextual setup checklist; create the first backup as early as practical.

Detailed procedures: [Resume and profile](/docs/resume-and-profile) and [Career Roles guide](/docs/career-roles).

## 3. Discover and assess career jobs

**Goal:** find relevant jobs without hiding how the result set was formed.

1. Review the active titles, location, region, language and visa filters, hidden companies, maximum age, and optional saved search.
2. Start Search & match.
3. Klar gathers configured sources, removes duplicates, applies local filters, rejects clear role/market/seniority mismatches, enriches eligible BA records, and ranks the remaining jobs locally.
4. Inspect source badges and Search diagnostics, especially when results are partial or empty.
5. Open a job to view the posting, versioned ranking evidence, missing must-haves, uncertain facts, and original source.
6. Optionally request an AI explanation for that one job.
7. Save the job to the Tracker or open its Application Packet.

**Decision rule:** the score orders relevant jobs; it does not predict hiring.

## 4. Prepare a career application

**Goal:** produce editable, evidence-controlled material without submitting it.

1. Open a job and choose Build Application Packet.
2. Select English or German. Each language has independent content and review state.
3. Generate an AI-tailored Resume or choose no-AI tailoring, which reorders existing sentences without rewriting them.
4. Inspect coverage, unresolved findings, and every proposed change. Accept, reject, or edit eligible changes; blocked changes cannot enter export.
5. Draft and edit the cover letter, select its tone, and complete place, date, recipient, and optional address fields.
6. Draft and edit a recruiter message with the correct application state, channel, contact context, and named referrer when claiming a referral.
7. Add packet notes and review readiness, provenance, staleness, usage, and document checks.
8. Download the Resume DOCX or print PDF, cover-letter DOCX, or the ZIP packet containing the governed Resume and cover letter.
9. Open the original employer route and submit only after personal review.

Detailed procedure: [Application Packets](/docs/application-packets).

## 5. Set up and search Flexible Work

**Goal:** discover practical work without creating a Resume.

1. Enter at least one city or place and radius.
2. Select at least one employment arrangement or workplace type; optionally add role families, days, periods, weekly hours, language comfort, physical-work preference, transport, and start date.
3. Start the search. Results appear progressively while sources continue within the bounded session.
4. Stop early if desired, inspect source status, retry failed coverage, and page through the stable published result set.
5. Distinguish a vacancy from an open-entry employer route and review inferred-field notices.
6. Save the search to identify new opportunities on later runs.
7. Open the official route directly, or prepare a deterministic message, availability summary, and printable profile card first.

**Decision rule:** Klar never fills or submits the employer form.

Detailed procedure: [Flexible Work guide](/docs/flexible-work).

## 6. Track follow-up and decisions

**Goal:** keep a local, explicit application record.

1. Save a Career Roles opportunity to the Tracker.
2. Use board or list view; move a career job through Interested, Applied, Interviewing, Offer, or Rejected, or choose New/Archived in its detail view.
3. Add notes, recruiter or hiring-manager contacts, and dated reminders.
4. Review due reminders and follow-up nudges that appear seven days after a record was first marked Applied.
5. Treat the 45-day posting badge as a prompt to verify the original route, not proof that the job is closed.
6. Preserve historical scores or explicitly choose Rescore with current profile.
7. Export the Tracker as CSV, XLSX, or printable PDF when needed.

Detailed procedure: [Tracker guide](/docs/tracker).

## 7. Return to an encrypted workspace

**Goal:** regain local access without weakening encryption.

1. Enter the vault passphrase at the lock screen.
2. If the passphrase is wrong, the workspace remains locked and unchanged.
3. Once unlocked, continue the saved setup or normal workspace.
4. Lock the vault manually from Settings when leaving the device.

There is no Klar recovery path for a forgotten passphrase. Use a tested encrypted backup strategy before enabling the vault.

## 8. Back up, move, or recover

**Goal:** protect the browser-owned workspace.

1. Download a standard backup for routine recovery; credentials are excluded.
2. Use a complete encrypted backup when credentials must move too.
3. On restore, select the JSON file and enter its backup password if required.
4. Klar validates format, schema, integrity, content, and encrypted payload before one transaction replaces active data.
5. Reload and test connections separately after restore.

Detailed procedure: [Backups and recovery](/docs/backups-and-recovery).

## 9. Report a problem safely

**Goal:** prepare a useful report without publishing career data or secrets.

1. Open Settings and prepare a bug, incorrect-result, source, accessibility, privacy/security, or feature report.
2. Use synthetic or redacted examples; never paste a Resume or application document.
3. Optionally include the reduced diagnostic summary.
4. Review the exact privacy preview and automatic redactions.
5. Open a public GitHub issue for ordinary reports or private vulnerability reporting for privacy/security concerns.
6. Decide whether to submit. Klar does not submit automatically, and screenshots require a separate manual attachment and second review.

Use [Troubleshooting](/docs/troubleshooting) before reporting a recoverable local issue.
