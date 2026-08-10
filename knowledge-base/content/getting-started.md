---
title: "Getting Started"
description: "Safe first-session setup for Career Roles, Flexible Work, sample exploration, or backup restoration."
section: "User Guide"
order: 200
audience: ["Klar users"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Product Support"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["user-guide", "onboarding", "setup", "backup"]
---

# Getting Started

## Before you begin

Use a current desktop or mobile browser. Klar stores your workspace in that browser, so browser data removal or a different browser profile will not contain the same workspace unless you restore a backup.

You do not need credentials for local setup, Flexible Work, local matching, tracking, backups, or no-AI Resume tailoring.

- A Groq or compatible-provider key is requested only when you start an AI action.
- An Adzuna App ID and App key are optional and add Adzuna jobs and salary benchmarks where the selected region supports them.

## Choose the right starting path

| Choose | Best when | What happens next |
| --- | --- | --- |
| Career Roles | You want Resume-based job matching and application documents | Import or create a Resume, review it, and set career preferences |
| Flexible Work | You want location-, schedule-, or work-type discovery without a Resume | Set locations and flexible-work preferences |
| Restore backup | You already have a Klar JSON backup | Klar validates the file before replacing active data |
| Explore Klar | You want to inspect the product without saving sample career data or entering a key | Klar opens a temporary synthetic sample workspace; language, appearance, and region choices may remain locally |

## Career Roles setup

1. Select **Career Roles**.
2. Choose a PDF, DOCX, TXT, or Markdown file; paste text; or choose **Create manually**.
3. Selecting a file reads it locally and then starts the AI structuring flow, requesting a provider key when needed. For pasted text, choose **Structure pasted text**. Klar sends only extracted text to the configured provider and does not retain the original file.
4. Review every section. Correct contact details, summary, roles, dates, achievements, education, skills, projects, certifications, and languages.
5. Confirm the Resume.
6. Enter target titles and job market/field separately. Add seniority, salary preference, city, radius, remote preference, must-haves, dealbreakers, German level, and visa-related settings.
7. Add both Adzuna values or skip the optional connection.
8. On the Dashboard, complete the contextual checklist and create a standard backup.

Continue with [Resume and profile](/docs/resume-and-profile) and [Career Roles guide](/docs/career-roles).

## Flexible Work setup

1. Select **Flexible Work**.
2. Add at least one city or place and a radius.
3. Select at least one employment arrangement or workplace type.
4. Optionally add role interests, availability, weekly hours, language comfort, physical-work preference, driving licence, bike, and earliest start.
5. Choose **Explore flexible work**.
6. On the Flexible Work home, choose **Search flexible work**.
7. Review the progressive results and source-status panel.
8. Save the search if you want later runs to identify genuinely new opportunities.

Continue with [Flexible Work guide](/docs/flexible-work).

## If an incomplete setup is found

Klar offers three choices:

- **Continue setup** returns to the last recorded step.
- **Restore backup** validates and restores a Klar file.
- **Start over** restarts the chosen setup route after preserving a meaningful structured Resume draft in recoverable history when one exists.

Starting over is not the same as **Delete all local data** in Settings. The latter is destructive.

## First-session safety checklist

- Verify imported Resume content before saving or generating documents.
- Open at least one job's original posting before relying on its details.
- Review Search diagnostics when coverage is partial or zero.
- Create a standard backup and store it outside the browser profile.
- Read [Backups and recovery](/docs/backups-and-recovery) before enabling the vault.
- Never paste a Resume, application document, API key, or personal diagnostic into a public issue.

## Navigation

- **Dashboard:** local profile view or Flexible Work launcher, depending on the active mode.
- **Search:** current Career Roles or Flexible Work search.
- **Tracker:** saved opportunities and application follow-up.
- **Settings:** data, encryption, reports, connections, Resume, engine, region, language, and appearance.

Klar can be installed from a supporting browser for an app-like window. The public browser/PWA is the supported user surface for this developer preview; desktop packages remain unsigned experimental builds that are not publicly distributed.
