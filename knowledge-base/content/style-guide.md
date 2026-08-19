---
title: "Documentation Style Guide"
description: "Mandatory language, terminology, structure, and accessibility conventions for all Klar documentation."
section: "Governance"
order: 40
audience: ["All Klar contributors", "Editors", "Translators"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Documentation"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["governance", "style", "terminology", "resume"]
---

# Documentation Style Guide

## Mandatory Resume terminology

Use **Resume** for Klar's named canonical document, workspace, fields, capability, or generated artifact, and at the beginning of a sentence. Use **resume** only for a generic career document in ordinary prose. The canonical English term contains no accent marks.

This rule applies to:

- the Klar interface;
- documentation and help text;
- code comments, identifiers intended for people, test descriptions, and fixtures;
- generated document labels and filenames;
- release notes, issues, and support material.

Do not introduce accented spellings as variants, quotations, or search aliases in Klar-owned content. German user content may use the established German word **Lebenslauf**. Code identifiers remain `resume` unless a language-specific UI label is required.

## Voice and intent

Write in clear, direct language. Lead with the outcome or decision, then explain constraints and procedure. Prefer “Klar stores the workspace in this browser” over abstract or promotional language.

Use:

- **you** for user instructions;
- **Klar** for product behavior;
- an explicit role, such as “release owner,” for organizational duties;
- **must** for mandatory requirements, **should** for strong recommendations, and **may** for optional actions.

Avoid claims such as “secure,” “private,” “complete,” “accurate,” or “AI-powered” without stating the relevant boundary and evidence.

## Current versus target language

Current pages use present tense only for verified behavior. Approved future behavior belongs on a page with `status: target`; planning intent that is not a current product contract uses `status: planned`. Both should use phrases such as “the target is” or “the planned capability would.” Never hide a missing implementation behind future-tense wording inside a current user guide.

## Page structure

Each page should answer, as applicable:

1. What is the outcome or purpose?
2. Who is the page for?
3. What is in scope and out of scope?
4. What must be true before starting?
5. What is the current procedure or contract?
6. What can fail, and what remains safe?
7. What limitations or human checks apply?
8. What related page owns the next level of detail?

Use one `#` heading for the page title, meaningful `##` sections, and short paragraphs. Use tables for exact comparisons and lists for independent items. Do not use a table when a short sentence is clearer.

## Product and interface terms

Use the interface's established capitalization:

- **Klar**
- **Career Roles** when naming the product mode; “career roles” in general prose
- **Flexible Work** when naming the product mode
- **Resume** according to the mandatory rule above
- **Tracker**, **Dashboard**, **Settings**, and **Application Packet** when naming a surface
- **Groq**, **Adzuna**, **Bundesagentur für Arbeit**, **Cloudflare Worker**, and **GitHub Pages** as proper names

Do not call local vocabulary ranking a neural embedding model. Do not describe a ranking score as a hiring probability.

## Instructions and safety

- Number steps when order matters.
- State destructive consequences before the action.
- Name what remains unchanged after a failed action.
- Put prerequisites before the first step.
- Give the recovery route for data loss, lockout, connector failure, and export failure.
- Never ask a user to paste a real resume, application document, credential, private path, or unredacted diagnostic into a public issue.

## Examples, code, and data

Examples must be synthetic. Do not use a real person's contact details, career history, API key, employer-private material, or local path. Code samples must be minimal, runnable for the applicable version, and explicit about placeholders. Explain why a non-obvious command or configuration exists.

Inline code comments should explain intent, constraints, or surprising behavior. They should not restate syntax. Technical reference pages may document exported symbols; user guides should describe outcomes rather than internal function names.

## Links and accessibility

Use descriptive link text, such as [Backups and recovery](/docs/backups-and-recovery), rather than “click here.” Do not rely on color, position, or an icon alone to communicate state. Tables need clear headers. Images need meaningful alternative text when they carry information.

## Bilingual content

The current Klar interface supports English and German. Public user guidance should preserve the same meaning in both languages when localized; one language must not make a stronger product or privacy claim than the other. Klar-owned engineering documentation is English-first unless an approved need requires otherwise.

User-visible error/status values should be stable codes translated at render time. Use shared locale formatters for dates, relative time, counts, percentages, currencies, and plural forms. Search normalization may equate German `ß`/`ss` and umlaut/digraph forms, but displayed names and user-entered content remain unchanged.
