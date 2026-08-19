---
title: "Troubleshooting"
description: "Safe diagnosis and recovery for setup, search, sources, AI, packets, exports, vault, backups, and browser-local data."
section: "User Guide"
order: 290
audience: ["Klar users", "Product support"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Product Support"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["user-guide", "troubleshooting", "recovery", "support"]
---

# Troubleshooting

## Start with the safety rule

Do not clear browser data, delete the workspace, disable the vault, replace the Resume, or retry an import with an untrusted file as a first diagnostic step. Create a backup whenever the current workspace is accessible.

Never paste a real Resume, application document, API key, password, token, private path, or employer-private text into a public report.

## Setup does not continue

If Klar finds partial setup, choose **Continue setup**. If the expected draft cannot be loaded, Klar returns to Resume creation. **Start over** preserves a meaningful structured draft as recoverable history when one exists, but a raw imported file is never retained.

If the app remains blank, use a current browser, confirm JavaScript and site storage are available, reload once, and check whether the vault prompt is behind another window or tab. Do not clear site data before securing a backup.

## Resume file cannot be read or structured

- Confirm the file is PDF, DOCX, TXT, or Markdown and is not damaged or password-protected.
- Try copying its text into the paste field.
- Add more content if Klar says the text is too short.
- Confirm an AI key is available for structuring; manual creation remains available without one.
- Review OCR-dependent PDFs carefully because text extraction may omit or reorder content.

A read or structuring failure does not replace the current canonical Resume.

## Vault does not unlock

Check the exact passphrase, keyboard layout, capitalization, and accidental whitespace. A failed unlock leaves ciphertext unchanged. Klar has no passphrase reset or recovery key.

If a separate tested encrypted backup exists, restore it only when you know its password and understand that full restore replaces the current workspace after validation.

## Backup restore fails

| Message type | Likely cause | Safe response |
| --- | --- | --- |
| Not a valid Klar backup | Wrong file or invalid JSON | Select the original Klar JSON file |
| Unsupported schema | Backup from an unsupported future format | Use a compatible Klar release; do not edit the file |
| Integrity failed | File was damaged or modified | Restore an unmodified copy |
| Password could not open backup | Wrong password or damaged ciphertext | Check the password; current workspace remains unchanged |
| Restore transaction failed | Browser storage or data error | Preserve the file, verify storage availability, and retry once |

After a successful standard restore, re-enter and test credentials because they are intentionally excluded.

## Career search has no results

Open **Search diagnostics** and follow the displayed cause:

- all sources failed: check network, Worker configuration, and credentials;
- company hide list removed all: remove or narrow a term;
- employment or age filter removed all: broaden that filter;
- distance removed all: increase radius or use another city;
- role/market relevance removed all: review the title and job market/field;
- German or visa filters hid all: inspect the hidden section or relax one filter;
- no raw postings: broaden title or location;
- matching unfinished: retry.

A strict zero result can be correct. Klar does not fill the page with unrelated jobs.

## Distance behaves unexpectedly

Only configured cities have built-in coordinates. When the origin cannot be resolved, diagnostics state that the distance filter was not enforced. When a radius is enforceable, unlocatable ATS results are not silently treated as nearby. Worldwide remote jobs bypass distance only when Remote only was requested.

## One or more career sources fail

Expand source details. Other sources remain usable because failures are isolated.

- Adzuna requires both values from the same account and a working Klar Worker route.
- BA list search depends on an undocumented public-web v6 contract and may change without compatibility notice.
- ATS status distinguishes active, healthy empty, quarantined, retired, and skipped candidate tenants. Healthy empty means the board contract worked but returned no current regional jobs.
- Use **Report source** to open prefilled synthetic source context in Support.

Retry after checking the source URL and connectivity; repeated retries do not repair an upstream contract change.

## Flexible Work is partial or limited

- Partial means some sources did not finish; inspect source status and retry later.
- Limited means available sources returned no matching jobs; add cities, employment types, or workplaces.
- An **Official search** card opens a verified employer search page; it is not a specific vacancy. An **Open entry** card is used only for a genuine verified general-application route.
- Stop checking preserves already published results.

A public production build does not fall back to fixtures when its Worker is missing. If a production page ever labels or resembles sample data, stop relying on the results and report a deployment defect through Support.

An inferred tag is Klar's classification, not employer-published confirmation. Verify the official route.

## AI action does not start or finish

- Confirm the endpoint, model ID, key requirement, and available model list in Settings.
- The hosted HTTPS app cannot call an HTTP local endpoint because of mixed-content blocking.
- A temporary rolling-minute shortage is scheduled; wait for the displayed headroom.
- A permanently oversized Resume uses no-AI tailoring or bounded role chunking when enabled.
- An empty or malformed provider response is treated as a recoverable error and is not saved as real content.

Local search, Tracker, backup, and no-AI Resume tailoring remain available without AI.

## Klar score and AI opinion look identical

In v2.6.1 the two values are stored and labelled separately. Equality can occur, but the details must show independent provenance and a zero-point difference. If every job is equal or the AI model/rationale appears without an AI opinion, include a synthetic job title, release version, provider/model names, and reduced diagnostics in a Support report. Do not include the Resume or full job description.

Historical results created by v2.6.0.1 may contain an AI-looking model label or rationale without an independent provider score because that release overwrote the provider score during merge. Rescore deliberately under v2.6.1 if a new comparison is needed.

## Packet export is disabled

Check the gate for the output you need:

- **Resume DOCX or print PDF:** generate an AI or no-AI tailored Resume first. Current readiness requires a tailored baseline and no accepted blocked change. It does not require **Mark reviewed** or prove that confirmation-required changes were individually checked.
- **Cover-letter DOCX:** use current cover-letter provenance and resolve every error-severity document check, including required document details.
- **ZIP packet:** satisfy both the Resume and cover-letter gates. The ZIP contains the governed Resume and cover letter, not the recruiter message.
- **Historical cover letter:** remove duplicated wrapper elements and explicitly confirm the reviewed body, or regenerate it under the current contract.

A named referrer is required only to draft a referred/introduced recruiter message; it does not gate document downloads. A stale notice is advisory and does not itself disable existing downloads, although the artifacts should be regenerated before they are treated as current.

For PDF, use the browser print dialog and inspect the preview. A download error leaves the saved packet unchanged.

## Saved data appears missing

Confirm you opened the same browser, browser profile, site origin, and vault. Private/incognito profiles and another device have separate storage. If site data was cleared, restore a backup; Klar has no server copy.

## Installed app appears out of date

Reload when Klar offers a new-version notice. If an installed PWA remains stale, close all Klar windows and reopen it while online. Do not clear storage as a cache workaround unless a verified backup exists.

## Report the problem

Open **Support** from the Dashboard, choose an ordinary category, provide a concise synthetic description and reproduction steps, optionally include reduced diagnostics, and inspect the exact privacy preview. Confirm the preview and complete the anti-abuse check to submit one public GitHub issue. Klar returns the issue link and report ID.

Privacy/security concerns, exposed secrets, personal data, and abuse reports go to private GitHub vulnerability reporting and never through public submission. The Support form does not accept screenshots or files.

Client and Worker redactors catch known secret, email, path, URL-query, and embedded-data patterns, but they cannot identify every personal sentence. You remain responsible for the final review.
