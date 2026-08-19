---
title: "Tracker Guide"
description: "Manage saved career opportunities, application status, notes, contacts, reminders, scores, and exports."
section: "User Guide"
order: 250
audience: ["Klar users", "Product support"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Product Support"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["user-guide", "tracker", "applications", "reminders"]
---

# Tracker Guide

## Purpose

The Tracker is a browser-local record of opportunities a person deliberately saves from Career Roles. It keeps the job snapshot, ranking at save time, status history, notes, contacts, and reminders together without sending anything to an employer.

The current Flexible Work result card does not expose a save-to-Tracker action. Flexible Work saved searches and prepared-message packets remain separate current workflows.

## Add an opportunity

From a career result card or job detail drawer, choose **Save** or **Save to Tracker**. A new record starts in **Interested** and retains the current job and match snapshot. Saving the same job again does not create a duplicate Tracker row.

## Choose board or list view

- **Board** shows Interested, Applied, Interviewing, Offer, and Rejected columns. Drag a card to change its status.
- **List** shows role, status, saved fit, posting age, and original link in a table.

The detail drawer also supports **New** and **Archived**, which are not board columns. Use the status selector when either state is required.

Every status change is timestamped in the local history. The first change to Applied records the application date used by follow-up logic.

## Add notes, contacts, and reminders

Open a Tracker row.

- **Notes** save when the field loses focus.
- **Contacts** require a name and may include an email address.
- **Reminders** require a date and may include follow-up text; they are sorted by date and can be removed.

Due reminders appear at the top of the Tracker when their date is today or earlier. Applied records also receive a follow-up nudge seven days after they were first marked Applied, ordered by the longest time since that date. Editing notes, contacts, or reminders does not reset the date; moving the record out of Applied hides the nudge.

Klar does not send a notification, email, or follow-up. The nudge is an in-app prompt to act.

## Interpret posting age

Klar flags a record as **may be expired** when the posting date, or save date when no posting date exists, is at least 45 days old. Cross-origin browser restrictions prevent Klar from reliably checking every original link's live HTTP status.

The badge means “verify the original posting,” not “this job is closed.” An unknown posting date also requires manual verification.

## Preserve or replace a score

A saved match retains the deterministic Klar score, ranking contract, and any independently validated nested AI assessment that existed when it was stored. Historical v2.6.0 rows that only carry an AI model label or rationale do not gain a fabricated AI score. Klar does not silently apply a new Resume, preferences, provider, prompt, or ranking model to historical records.

Choose **Rescore with current profile** only when you want to replace the stored match using the current derived profile, current preferences, and ranking v2. This action requires a canonical Resume and is explicit and irreversible except through a broader workspace backup.

## Export

Export the current Tracker as:

- CSV;
- XLSX with an Applications sheet; or
- a printable PDF view.

Exports contain application and contact context in readable form. Store them according to their sensitivity; they are not protected by the Klar vault after download.

## Remove a record

Choose **Remove from Tracker** in the detail drawer. The current interface performs the removal immediately and does not show a confirmation prompt or per-row restore action. Create a backup before deleting material records.

Removing a Tracker row does not withdraw an external application, delete the employer's data, or delete an Application Packet for the same job.

See [Application Packets](/docs/application-packets) and [Backups and recovery](/docs/backups-and-recovery).
