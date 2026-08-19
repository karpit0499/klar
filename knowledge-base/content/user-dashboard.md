---
title: "Dashboard Guide"
description: "Maintain the device-local Dashboard identity, image, about text, links, and career context."
section: "User Guide"
order: 260
audience: ["Klar users", "Product support"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Product Support"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["user-guide", "dashboard", "local-data"]
---

# Dashboard Guide

## Purpose

The Dashboard is Klar's device-local home for personal presentation and at-a-glance context. It is separate from the canonical Resume and does not change matching or application evidence.

In Flexible Work mode, the Dashboard navigation shows the Flexible Work launcher and saved Flexible Work searches instead. Switch to Career Roles to view the personal Dashboard when a canonical Resume exists.

## Edit the Dashboard

Choose **Edit** to maintain:

- display name;
- headline;
- location;
- about text;
- labelled links; and
- an optional image.

Choose **Save** to commit the form. Removing an image from the form removes it from the Dashboard after saving.

## Image handling

Klar accepts image files up to 2 MB. The browser converts the image to a data URL and stores it with the Dashboard, allowing it to survive a JSON backup. The image is not uploaded by the Dashboard workflow.

If a vault is enabled, Dashboard content is stored inside the encrypted workspace. A downloaded readable export or unencrypted standard backup created while the vault is disabled can still contain the image data in readable form.

## At-a-glance context

When a canonical Resume and career preferences exist, the Dashboard may show skill count, total years of experience when derivable, target titles, and primary location. These values come from the canonical Resume and saved preferences; edit their owning source rather than the Dashboard.

## Workspace links

The Career Dashboard links to two focused workspaces:

- **Resume** opens creation, editing, replacement, completeness, history, and the optional design lab.
- **Support** opens the privacy preview and protected bug or suggestion form.

These are secondary destinations rather than additional items in the four-item mobile primary navigation. Hash deep links, browser Back, focus restoration, and unsaved-change protection are part of the navigation contract.

## Boundaries

- The Dashboard headline is not a verified Resume headline and is not inserted into production Resume exports.
- Dashboard links are opened as entered; review the URL before selecting it.
- Dashboard information is not a public profile and is not sent to employers by Klar.
- Clearing browser data can remove an unbacked-up Dashboard.

See [Resume and profile](/docs/resume-and-profile) and [Backups and recovery](/docs/backups-and-recovery).
