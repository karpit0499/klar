---
title: "System Context and Runtime Topology"
description: "Verified architecture boundaries, runtime components, trust zones, and end-to-end data flows for Klar 2.6.1."
section: "Architecture"
order: 200
audience: ["Engineering", "Security", "Operations", "Product"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Engineering"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["architecture", "runtime", "data-flow", "trust-boundary"]
---

# System Context and Runtime Topology

## Purpose

This page defines where Klar executes, which component owns each responsibility, and where personal or third-party data can cross a boundary. It is the starting point for design review, incident analysis, and any change that introduces storage, networking, or code execution.

Klar 2.6.1 is a local-first React application with two delivery forms:

- a static web application hosted at `/klar/` with its Next-exported KB at `/klar/kb/` in one GitHub Pages artifact; and
- an Electron developer preview that embeds the same renderer and adds a constrained local-model runtime.

The application has no Klar-operated account database and no server-side career-data store. IndexedDB in the active browser or Electron profile is the system of record. A Cloudflare Worker is a bounded network relay for selected job sources and Groq; it is not an application backend.

## Context map

| Actor or system | Role | Data exchanged | Trust treatment |
| --- | --- | --- | --- |
| Person using Klar | Supplies Resume, preferences, decisions, credentials, and export requests | Personal data and career facts | Primary data owner; explicit action is required for external AI and exports |
| Klar renderer | Runs workflows, validation, ranking, storage, and document generation | Local application state | Trusted application code, but still inside the browser threat boundary |
| IndexedDB and session storage | Persist workspace data and selected settings or temporary credentials | Structured rows, ciphertext, caches | Device-local; optional vault protects selected content at rest |
| Cloudflare Worker (`klar-proxy`) | Relays allowlisted sources/Groq, maintains scheduled ATS cache, and submits confirmed ordinary reports | Search parameters, source responses, AI request/response, redacted feedback payload | Separate network trust zone; must not persist workspace or prompt content by design |
| GitHub Issues | Stores confirmed ordinary public bug/suggestion reports | Redacted report body, fixed label, report ID | Public external destination; private security reports use GitHub vulnerability reporting instead |
| Public job sources | Return vacancy or route information | Search queries and public listing data | Untrusted external input; normalize and validate before use |
| Configured AI provider | Performs explicitly invoked extraction, analysis, or writing | Bounded prompt projection and generated response | External processor selected by the user; output is untrusted until validated and reviewed |
| Electron main process | Enforces desktop navigation, IPC, package trust, and runtime lifecycle | Validated IPC payloads and local inference requests | Privileged boundary; renderer receives no general Node or file access |
| Local `llama-server` | Runs a verified model package on loopback | Prompt and generated JSON | Desktop-only, process-isolated, authenticated over ephemeral loopback |
| Export destination | Receives user-created backup, DOCX, PDF, or ZIP | Selected workspace or application artifact | Outside Klar after download; user controls subsequent retention and sharing |

## Runtime components

### Shared renderer

`src/main.tsx` mounts the React application. `src/App.tsx` owns top-level onboarding, vault gating, mode selection, and workspace routing. The renderer contains the product logic under `src/`; it is not a thin client over a remote API.

The production web build uses the `/klar/` base path. The KB uses the `/klar/kb/` Next static-export base path. The desktop build uses a relative `./` base so packaged `file://` loading works. The service worker is registered only for production web builds, excludes `/klar/kb/`, deletes only Klar-owned caches, and is not registered in Electron.

### Local persistence

Dexie wraps a database named `klar`. Schema version 7 contains 17 stores. The canonical Resume, application packets, searches, results, and tracking state are read and written locally. Optional vault encryption changes the at-rest representation of sensitive stores but does not create a remote sync service. See [Data Architecture, Vault, and Backup](/docs/data-architecture-vault-and-backup).

### Cloudflare Worker

The Worker provides health, Federal Employment Agency (BA), Adzuna, verified Source Fabric, scheduled ATS cache, protected public feedback, and the two supported Groq paths. It rebuilds upstream requests from fixed routes and allowlists rather than accepting arbitrary upstream URLs. See [Worker API and Network Security](/docs/worker-api-and-network-security).

### Electron boundary

The renderer is sandboxed with Node integration disabled. A frozen preload bridge exposes only system information, local runtime lifecycle, generation/cancellation, and redacted diagnostics. The Electron main process validates the sender and every payload before controlling the local model process. See [Electron Desktop and Local Runtime](/docs/electron-desktop-and-local-runtime).

## Principal data flows

### 1. Resume onboarding and storage

1. The person selects a PDF, DOCX, or text file.
2. Klar extracts text in the renderer; the original file is not uploaded or retained as a normal workflow artifact.
3. If AI extraction is chosen, Klar sends a bounded text projection to the configured provider through the direct or Worker path.
4. The response is schema-validated and normalized into Resume schema version 2.
5. The person reviews the result before it becomes the canonical Resume.
6. Klar writes the canonical row and bounded history locally, in vault ciphertext when the vault is enabled.

### 2. Career discovery and ranking

1. Klar derives a thin matching profile from the canonical Resume at runtime.
2. Source adapters retrieve jobs directly or through the Worker; ATS jobs come from bounded pages of the scheduled verified-tenant cache rather than browser fan-out.
3. Klar validates, normalizes, deduplicates, filters, and ranks results locally.
4. Deterministic results are publishable without AI. A validated provider assessment is nested and shown as a separate AI opinion; it cannot replace deterministic eligibility, confidence, score, or rank.
5. Results and diagnostics are cached locally. See [Career Discovery and Ranking](/docs/career-discovery-and-ranking).

### 3. Flexible Work discovery

1. Flexible Work preferences supply their own cities, radius, arrangements, roles, and workplaces; no Resume is required.
2. A bounded session reads valid cache, runs enabled connectors, accepts independent batches, and terminates at its hard deadline.
3. Every accepted opportunity carries source and field-level provenance.
4. Duplicates merge in place and official direct application destinations take precedence.
5. Candidate direct connectors do not run. Verified official-search routes remain route cards rather than fabricated vacancies or API results.
6. Search, cache, and connector-health state remain local. See [Flexible Work and Source Fabric](/docs/flexible-work-and-source-fabric).

### 4. Application preparation

1. The selected job is copied into a local application packet snapshot.
2. Deterministic tailoring proposes a conservative baseline from existing Resume facts.
3. Optional AI creates structured proposals constrained by Resume evidence and the job description.
4. The person accepts, rejects, or edits each proposed change; unsupported changes are blocked at decision and export boundaries.
5. Klar generates DOCX, browser-print PDF, or a ZIP locally. See [Resume and Application Generation](/docs/resume-and-application-generation).

### 5. Backup and recovery

1. Klar assembles a local workspace snapshot.
2. The selected mode either excludes credentials, preserves existing vault ciphertext, encrypts sensitive data with a backup password, or—after an exact warning confirmation—exports readable sensitive data.
3. Import validates format and digest, authenticates encrypted material, migrates supported historical schemas, and atomically replaces the database.

### 6. Ordinary public feedback

1. The person prepares synthetic details on Support and reviews the exact client-redacted preview.
2. After confirmation, the renderer sends the bounded payload, Turnstile token, honeypot, and report ID to the Worker.
3. The Worker revalidates and redacts, enforces abuse controls, and creates one issue in the fixed public repository.
4. GitHub stores the public issue; Klar displays its URL/number and does not persist a separate support case.
5. Security, privacy, exposed-secret, and personal-data reports bypass this flow and use private vulnerability reporting.

## Trust boundaries and invariants

| Boundary | Invariant |
| --- | --- |
| Renderer to IndexedDB | All persisted product state has an explicit store and migration path; sensitive plaintext stores are empty while the vault is enabled |
| Renderer to Worker | Only configured Worker routes are used; source data, AI responses, and feedback remain untrusted input; server checks repeat client validation |
| Worker to source | The upstream host/path is fixed or allowlisted and redirects are revalidated |
| Renderer to AI | Invocation is explicit, prompt input is minimized, response schemas are validated, and generated claims require evidence and human review |
| Renderer to Electron main | Only the narrow preload contract is available; sender, frame, origin, types, sizes, and lifecycle are checked again in main |
| Electron main to runtime | Only verified compatible packages execute; loopback is ephemeral and authenticated; the renderer never receives the bearer credential |
| Klar to downloaded file | Export occurs only on user action; after download, protection and retention are the recipient's responsibility |

## Availability and deployment implications

- Web application availability depends on the static host, cached application assets, configured Worker, and third-party sources. An installed service worker can preserve parts of the shell, but Klar does not claim complete offline discovery.
- The static app does not continue searches while closed. A search exists only while its active browser or desktop session runs.
- A Worker failure reduces external source and Groq connectivity; it does not delete local state or prevent deterministic local workspace use.
- A third-party connector failure must be isolated from other connectors and produce an honest partial or limited state.
- Desktop local inference can remain usable without an internet connection only after a trusted runtime and compatible model package are installed; normal product generation is not yet routed to that provider in 2.6.1.

## Review triggers

Review this page when any of the following changes: a new remote service, storage location, IPC method, Worker route, model runtime, service-worker behavior, background task, account/sync feature, or export destination.

Related controls are documented in [Security, Privacy, and Threat Model](/docs/security-privacy-and-threat-model) and operational responses in [Operations Runbooks](/docs/operations-runbooks).
