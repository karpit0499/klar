---
title: "Flexible Work Guide"
description: "Configure, run, interpret, save, and act on Resume-optional Flexible Work discovery."
section: "User Guide"
order: 220
audience: ["Klar users", "Product support"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Product Support"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["user-guide", "flexible-work", "source-fabric", "open-entry"]
---

# Flexible Work Guide

## Purpose

Flexible Work helps find minijobs, part-time, working-student, temporary, seasonal, weekend, evening, and night opportunities by place and practical work preferences. Discovery does not require or use a Resume.

Current employer-direct coverage is focused on Germany. Results depend on configured public sources, employer routes, and their availability during the bounded search session.

## Configure preferences

At minimum, provide:

- one city or place; and
- at least one employment arrangement or workplace type.

Each location has a radius. You may add multiple locations. Radius input is normalized to a supported positive range.

Optional refinements include:

- role families such as cashier, shelf stocking, warehouse, delivery, kitchen, service, cleaning, reception, event staff, or customer service;
- days and periods of availability;
- maximum weekly hours;
- German and English comfort;
- physical-work preference;
- driving licence or bike;
- earliest start date.

Leaving optional fields blank keeps the search broad. Selecting **Show me different kinds** clears role-family filtering while retaining the other preferences.

## Run and control the search

Select **Search flexible work**. Klar starts the search automatically and publishes stable result pages progressively.

While it runs, the status shows:

- how many jobs are ready;
- how many sources are still active;
- an estimated maximum time remaining;
- determinate session progress; and
- a **Stop checking** action.

Stopping ends the session without discarding results already published. Klar does not show a terminal “No results” state while sources are still unfinished.

At completion, the banner identifies a complete, partial, or limited session. Retry starts a new search with the same preferences.

## Inspect source status

The source panel shows each employer family, connector state, result count, fetch time, last success, extraction confidence, official route, and report action. Possible states include active, healthy empty, fallback route, quarantined, retired, failed, did not finish, skipped, pending, and checking. Candidate connectors do not run.

The panel also reports results hidden as not relevant Flexible Work and the number of merged duplicate families. A partial session is usable but does not represent full market coverage.

Sample results exist only in explicitly labelled development/test builds. A production build without a configured Worker fails release validation instead of presenting fixtures as live vacancies.

## Read an opportunity card

A card may represent:

- a specific vacancy with an Apply route; or
- an **Open application** or official employer program without one specific vacancy.

The Source Explorer can also show one of 100 verified official employer search destinations added in v2.6.1. An **Official search** card is a route to the employer's own search page, not evidence of one vacancy. Only two verified destinations currently qualify as genuine open-entry routes. Klar does not proxy those pages or count them as direct API results.

Review employer, brand, city or remote state, employment and role tags, hourly pay only when published, source confidence, fetch/verification dates, duplicate information, and any “inferred” notice. Inferred fields are Klar classifications, not employer-published guarantees.

Always verify the official route before relying on pay, hours, location, or availability.

## Save and rerun a search

After an unsaved search returns results, choose **Save this search**, confirm its name, and save it. The Flexible Work home lists saved searches with their locations and last-run date.

The first run establishes a baseline. On a later run, Klar marks opportunities as New when their stable identities were not already recorded. Deleting a saved search removes the definition and baseline but does not submit or withdraw any application.

## Prepare a message without a Resume

Choose **Prepare message** to open the deterministic preparation drawer.

1. Optionally add name, email, and phone and save them to Flexible Work preferences.
2. Review the availability summary built from your saved preferences.
3. Edit or copy the employer message. It is generated from your own details and the opportunity, without an AI key.
4. Optionally print or save the compact profile card.
5. Open the official vacancy or program route.

The draft and availability autosave in the opportunity's flexible packet. Klar does not auto-fill, pre-submit, or submit the employer form.

## Add Career Roles later

Choose **Add Resume for Career Roles** from Flexible Work or the Dashboard-linked Resume workspace. Adding a Resume enables Career Roles without removing Flexible Work or its saved searches. See [Product modes](/docs/product-modes).
