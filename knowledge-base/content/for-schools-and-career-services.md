---
title: "For Schools and Career Services"
description: "Safe, privacy-aware guidance for using Klar in workshops, advising, teaching, demonstrations, and student job-search support."
section: "User Guide"
order: 275
audience: ["Schools", "Universities", "Career services", "Educators", "Workshop facilitators", "Students and job seekers"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Product Support"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["schools", "universities", "career-services", "workshops", "shared-devices", "privacy"]
---

# For Schools and Career Services

## Purpose

Schools, universities, career services, libraries, and community programs can use Klar to demonstrate a structured job-search workflow or help an individual manage their own search. This page defines a safe facilitation model for Klar v2.6.0.1 without implying institutional accounts, central oversight, or permission to copy or redeploy the software.

The safest default is to demonstrate Klar with its synthetic **Explore Klar** workspace. A participant who wants to use real career data should use their own trusted device and browser profile, make their own provider choices, and control their own backups and deletion decisions.

## Choose a session model

| Session model | Recommended data | Device | Main boundary |
| --- | --- | --- | --- |
| Classroom demonstration | Explore Klar synthetic sample only | Presenter device | Do not replace the sample with a real person's data while projecting or recording |
| Guided workshop | Synthetic exercise first; real data is optional | Each participant's own device and browser profile | The participant controls entry, provider use, backups, downloads, and deletion |
| One-to-one advising | The job seeker's data, with informed agreement | Prefer the job seeker's own device | The adviser should not retain copies of the Resume, packets, backups, or credentials |
| Shared-device drop-in | Synthetic data only | Managed shared device or temporary browser profile | Do not import a real Resume, enter API credentials, or leave downloads behind |

Klar is a personal workspace, not an institutional case-management system. Do not require a participant to expose their Resume, application history, disability information, immigration context, credentials, or generated documents to a facilitator or group.

## Safe workshops and shared devices

### Before the session

1. Read [Getting started](/docs/getting-started), [Settings and data](/docs/settings-and-data), and [Backups and recovery](/docs/backups-and-recovery).
2. Decide whether the session is a synthetic demonstration or individual real-data use. Do not drift from a synthetic session into personal-data collection without a new, clear choice by the participant.
3. Prefer participant-owned devices for real data. If devices are shared, use separate operating-system accounts or browser profiles and keep the exercise synthetic.
4. Confirm that screen recording, classroom projection, browser autofill, download folders, clipboard history, and support procedures will not expose participant data.
5. Test the current browser, network, language, keyboard path, zoom level, and required export flow before the event.

### During the session

- Use **Explore Klar** for projected demonstrations. Its sample career workspace is synthetic and remains temporary, although language, appearance, and region choices may remain locally.
- Do not ask participants to paste real career data, API keys, provider responses, diagnostics, or application text into a shared chat, form, learning platform, or public issue.
- Do not share one Groq, Adzuna, or custom-provider credential among participants. Each credential belongs to the person or organization that controls its account and terms.
- Avoid displaying a participant's screen to the room when it contains contact details, employment history, notes, saved jobs, or application documents.
- Keep human review central. Klar does not verify that every imported field or generated sentence is correct, and a match score is not a prediction of hiring success.

### After the session

For a synthetic shared-device session, use **Delete all local data**, close the browser profile, and remove any exported files or print jobs created during the exercise. For real-data use, the participant should first create and verify a suitable backup, then decide whether the device should retain or delete the workspace.

Deleting Klar's local data does not delete files already downloaded, clipboard contents, browser or operating-system backups, data already sent to an AI provider, GitHub content, or information submitted to an employer. Those locations require their own review and deletion steps.

## Where data lives

Klar's career workspace is stored in the active browser profile. Klar does not provide a server account that stores a participant's Resume, preferences, Tracker, packets, or notes. This local-first design reduces central data collection, but it also means the school and Klar cannot remotely recover or administer a lost workspace.

| Data or action | Current location or destination | Facilitator guidance |
| --- | --- | --- |
| Resume, preferences, saved searches, Tracker, packets, and notes | Current browser profile | Use a personal profile for real data; do not rely on a shared profile |
| Vault-protected workspace | Encrypted at rest in the browser profile while locked | A vault does not protect data from someone controlling the device or page while it is unlocked |
| Standard backup | Downloaded JSON; readable when no vault protects the workspace | Treat it as personal career data and store it outside the browser profile |
| Complete encrypted backup | Downloaded encrypted file that may include credentials | Keep the password separate; Klar cannot recover it |
| Resume, cover-letter, packet, CSV, XLSX, PDF, or readable export | The user's download or print destination | Check shared download folders, print queues, cloud-sync folders, and removable media |
| Provider request | Configured AI provider, either through Klar's bounded Worker route or directly to a custom endpoint | Review provider terms and institutional policy before sending personal data |
| Public issue report | GitHub after the user reviews and submits it | Use synthetic reproduction details; never attach personal data or secrets |

See [Data Architecture, Vault, and Backup](/docs/data-architecture-vault-and-backup) for the implementation boundaries.

## AI and provider boundaries

Klar can demonstrate several useful workflows without an AI credential. Explore Klar, manual Resume creation, local filtering and deterministic ranking, Tracker use, backups, exports, and no-AI Resume tailoring do not require a Groq key.

AI processing occurs only for the actions that require it under the current configuration. Important examples include:

- choosing a Resume file reads it locally, but structuring the extracted text invokes the configured provider;
- requesting an AI explanation or generated application writing sends the bounded input needed for that action;
- the default Groq configuration uses Klar's restricted Worker relay when it is configured; and
- a custom OpenAI-compatible endpoint is contacted directly and can observe the information intentionally sent to it.

The original imported Resume file is not retained by Klar, but extracted text may be sent for AI structuring. Provider-side retention, account administration, contractual terms, regional processing, and deletion are controlled by the provider, not by Klar. An institution should complete its own privacy, procurement, and safeguarding review before directing participants to use an AI provider with real personal data.

When that review has not occurred, use synthetic data, manual Resume creation, and non-AI paths. Never treat a shared classroom key as an anonymity or consent mechanism.

## Backup, vault, and deletion responsibilities

For individual real-data use:

1. Create a standard backup after setup and before destructive changes.
2. Understand whether the backup is readable or vault-protected before choosing its storage location.
3. Use a complete encrypted backup only when credentials also need to move, and keep its password separately.
4. Test restoration in a separate safe browser profile when practical.
5. Use **Delete all local data** only after verifying the backup and understanding every location where downloads or external copies may remain.

The vault protects selected browser data at rest. It is not a substitute for device access controls, screen privacy, a locked session, secure download handling, or an institutional data-protection assessment. Lost vault and encrypted-backup passphrases cannot be recovered by Klar.

## Accessibility and languages

The current interface supports English and German and is designed for current desktop and mobile browsers. Changing the interface language does not translate participant-entered Resume content or existing Application Packet text. English and German packet content and review states remain independent.

Klar v2.6.0.1 does not carry a comprehensive accessibility certification, and the release evidence does not yet include complete assistive-technology coverage. Before relying on Klar in a required program, test the actual browser and devices with the participants' needs in mind, including keyboard navigation, zoom, screen-reader use, file selection, downloads, and print output. Provide an accessible alternative process when a required task cannot be completed reliably.

Manual Resume creation and pasted text can provide alternatives when PDF or DOCX extraction is unreliable. Facilitators should allow extra review time for scanned or OCR-dependent documents and should never infer ability, language proficiency, or employability from a parsing problem.

## Institutional capabilities Klar does not provide

Klar v2.6.0.1 has no:

- institutional or participant account system;
- single sign-on or identity-provider integration;
- tenant, cohort, roster, role, or delegated-administrator model;
- centralized policy enforcement or remote workspace deletion;
- educator view of participant activity, Resume content, applications, or outcomes;
- central content analytics or institution-level usage dashboard;
- automatic cross-device synchronization or cloud recovery; or
- contractual support response time or managed service commitment.

An institution therefore cannot use Klar as an applicant tracking system, student record system, learning-management integration, compliance archive, attendance monitor, or adviser analytics platform. Do not design a mandatory program around those absent capabilities.

## Support and security reporting

Use [Troubleshooting](/docs/troubleshooting) for safe diagnosis. Settings can prepare a report and show a privacy preview, but Klar does not submit it automatically.

- Ordinary product and documentation problems may be reported through [Klar's public GitHub Issues](https://github.com/karpit0499/klar/issues) using synthetic details.
- Suspected vulnerabilities, exposed secrets, or privacy incidents should use [GitHub private vulnerability reporting](https://github.com/karpit0499/klar/security/advisories/new), not a public issue.

Remove names, contact details, Resume text, application content, API keys, private paths, query parameters, institutional identifiers, and unredacted diagnostics before reporting. Do not ask a participant to provide sensitive evidence publicly.

## Source-available licensing limits

Klar's source is publicly visible for inspection, but Klar is **source-available, not open source**. Public access to this knowledge base does not change the software license.

The current [official Klar LICENSE](https://github.com/karpit0499/klar/blob/main/LICENSE) permits reading the source and using the official hosted application for a person's own job search. It does not grant permission to copy, modify, translate, redistribute, independently host, or incorporate the software into another project. A school or service that wants to create its own deployment, package a modified version, redistribute Klar, or integrate its code must obtain permission from the copyright holder unless applicable law independently permits the activity.

Facilitating a participant's use of the official hosted product is different from operating an institutional Klar deployment. Review the current license and obtain appropriate legal or institutional approval before planning any use beyond the rights it grants.

## Facilitator checklist

- Use synthetic data for demonstrations and shared devices.
- Let participants use their own device and make their own provider choices for real-data work.
- Explain local storage, backup responsibility, provider boundaries, and deletion limits before personal data is entered.
- Never collect or display participant credentials or application content as workshop evidence.
- Test language and accessibility needs and provide an alternative workflow.
- Do not promise institutional accounts, oversight, analytics, recovery, support levels, or deployment rights that Klar does not provide.
- Use the private security-reporting route for sensitive findings.

For product boundaries, continue with [Scope and non-goals](/docs/scope-and-non-goals) and [Product modes](/docs/product-modes).
