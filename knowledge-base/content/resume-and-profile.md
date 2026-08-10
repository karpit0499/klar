---
title: "Resume and Profile Guide"
description: "Create, review, maintain, replace, restore, and safely use Klar's canonical Resume and derived profile."
section: "User Guide"
order: 230
audience: ["Klar users", "Product support"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Product Support"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["user-guide", "resume", "profile", "evidence"]
---

# Resume and Profile Guide

## Why Klar uses one canonical Resume

Klar maintains one structured Resume as the evidence source for career matching and application documents. A thin matching profile is derived from it automatically, so the same career facts do not need to be maintained in two places.

The Dashboard profile is separate presentation data. Changing a Dashboard headline, image, about text, or link does not change the canonical Resume or matching evidence.

## Create a Resume

You can:

- import a PDF or DOCX;
- import a TXT or Markdown file;
- paste text; or
- create every section manually.

Imported or pasted content needs at least a small usable body before structuring can begin. Selecting a file reads it locally and then starts the AI structuring flow, requesting a provider key when needed. Pasted content is sent only after you choose **Structure pasted text**. Only extracted text is sent to the configured provider; the original file is not retained.

Extraction can omit or misclassify information. Nothing becomes the canonical Resume until you review and confirm the structured draft.

## Review the structure

The editor supports:

- contact name, email, phone, location, and labelled links;
- professional summary;
- experience roles, companies, cities, dates, current-role state, and achievements;
- education degree, field, institution, city, and dates;
- grouped skills;
- projects, technologies, summary, and link;
- certifications and issuers;
- languages and levels.

Items and sections can be reordered. Removed content has an immediate undo action while the editor remains open.

The completeness report checks structural signals such as a name, contact route, summary, role basics, dates, achievements, and skills. Its percentage is a preparation aid, not a measure of candidate quality and not proof that every fact is correct.

## Edit the current Resume

Open **Settings**, then the Resume section. Edit the structured fields and choose **Review and save**. Saving updates the canonical Resume and therefore the profile derived for later matching and application work.

Previously saved search results and Tracker scores are not silently reinterpreted. Use **Rescore with current profile** on a tracked job when you deliberately want a new ranking snapshot.

## Replace the Resume

Use **Replace Resume** when the new source should replace the current structure in full.

1. Select a supported file or paste text.
2. A selected file starts structuring after local reading. For pasted content, choose **Preview pasted text** to start structuring with the configured AI provider.
3. Review the complete preview and correct every section.
4. Confirm replacement.

Klar creates a restorable snapshot of the current Resume before replacement. If reading or structuring fails, the current Resume remains unchanged.

## Use Resume history

The history section supports:

- creating a named snapshot of the current Resume;
- renaming a snapshot;
- restoring a snapshot as the current Resume; and
- deleting a snapshot after confirmation.

Automatic snapshots are kept for up to 10 entries and 90 days. Named snapshots remain until deleted. A restore changes the current canonical Resume; create a backup before high-impact changes.

## Application tailoring

For a job, choose between:

- **AI tailoring:** proposes evidence-checked rewrites, coverage, and per-change review; or
- **Tailor without AI:** reorders existing Resume sentences and skills without rewriting them.

Blocked AI wording cannot be accepted or exported. Supported or confirmation-required changes still need human review. Read [Application Packets](/docs/application-packets).

## Export format

The v2.6.0.1 production Resume DOCX and browser-print PDF use a consistent A4, single-column Arial structure with a compact identity block, unlabeled profile, ruled semantic headings, grouped role and date information, real bullets, and combined skills/languages. The newest held role is used as an evidence-backed subtitle; Klar does not present the target vacancy title as experience.

DOCX is the safer default for applicant tracking systems. PDF remains available through browser print/save and should be visually checked before submission.

## Privacy and recovery

The canonical Resume, drafts, and history live in the current browser or encrypted vault. Standard backups exclude credentials; complete encrypted backups can carry them. Never publish a real Resume in a GitHub issue or diagnostic report.

If browser data is cleared without a backup, Klar cannot recover the Resume. See [Backups and recovery](/docs/backups-and-recovery).
