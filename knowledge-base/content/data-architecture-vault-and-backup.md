---
title: "Data Architecture, Vault, and Backup"
description: "Current Klar persistence model, Dexie schema history, encryption boundary, backup formats, recovery controls, and retention rules."
section: "Data"
order: 220
audience: ["Engineering", "Security", "Operations", "Privacy reviewers"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Engineering"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["data", "indexeddb", "vault", "encryption", "backup", "migration"]
---

# Data Architecture, Vault, and Backup

## Purpose

This page defines the authoritative local data model and the controls that prevent schema changes, encryption transitions, or backup operations from silently losing or exposing user data.

## Storage principles

1. **Local system of record.** Product state is stored in the browser or Electron profile, not in a Klar account service.
2. **One career-fact authority.** `ResumeData` schema version 2 is canonical. Thin profile data is derived when needed.
3. **Optional authenticated encryption.** The vault protects selected content and credentials at rest; it does not claim protection against compromised code or an unlocked device.
4. **Explicit portability.** Backup and export are user actions with modes that make credential and readable-data treatment clear.
5. **Atomic transitions.** Vault enable/disable and backup import authenticate and validate before replacing or deleting authoritative rows.
6. **Unknown is not invented.** Missing fields remain absent through normalization and migration.

## Dexie database

The database name is `klar`; the current Dexie schema version is 7.

| Store | Primary key | Contents | Sensitive-content treatment |
| --- | --- | --- | --- |
| `settings` | `key` | Locale, feature/config values, provider configuration, operational events | Remains outside content ciphertext; credential helpers control secret rows separately |
| `profiles` | `id` | Historical thin-profile compatibility store | Cleared by v5 migration; current Profile is derived |
| `preferences` | `id` | Career and Flexible Work preferences | Moved into vault content while enabled |
| `jobs` | `queryKey` | Career result cache | Moved into vault content while enabled |
| `matches` | `cacheKey` | Career match results, including an optional nested AI assessment with its own provenance | Moved into vault content while enabled |
| `tracked` | `jobId` | Application tracker rows | Moved into vault content while enabled |
| `dashboard` | `id` | Personal dashboard row | Moved into vault content while enabled |
| `vectors` | `jobId` | Local embedding cache | Moved into vault content while enabled |
| `savedSearches` | `id` | Career searches and seen identities | Moved into vault content while enabled |
| `vault` | `id` | Content and optional credential ciphertext envelopes | Ciphertext authority while enabled |
| `resumes` | `id` | Canonical Resume row | Moved into vault content while enabled |
| `resumeHistory` | `id` | Bounded Resume snapshots | Moved into vault content while enabled |
| `resumeDrafts` | `id` | Recoverable Resume draft | Moved into vault content while enabled |
| `flexibleSearches` | `id` | Saved Resume-free searches | Moved into vault content while enabled |
| `flexibleCache` | `queryKey` | Validated Flexible Work opportunity cache | Remains a plaintext operational/cache store |
| `connectorHealth` | `connectorId` | Content-free failure, latency, breaker, and kill-switch state | Remains plaintext; should contain no personal content |
| `packets` | `id` | Persistent application workspaces and provenance | Moved into vault content while enabled |

“Plaintext” means not protected by the optional vault; it is still inside the browser's origin-scoped storage. Operating-system account, disk, browser-profile, and device protections remain relevant.

## Schema and migration history

| Dexie version | Product era | Change | Migration behavior |
| --- | --- | --- | --- |
| 1 | Original | Six stores: settings, profiles, preferences, jobs, matches, tracked | Initial schema |
| 2 | Early dashboard | Adds dashboard and vectors | Additive |
| 3 | Saved search | Adds saved searches | Additive |
| 4 | 2.2 vault | Adds vault; removes legacy `rawText` from profile rows | Vault remains opt-in; upgrade deletes the debug field |
| 5 | 2.3 canonical Resume | Adds Resume, history, draft; converts legacy rich Resume or latest Profile; clears profiles, match, and vector caches | One atomic transaction and migration snapshot |
| 6 | 2.4 Source Fabric | Adds Flexible Work searches, cache, and connector health | Additive |
| 7 | 2.5 Application Quality | Adds packet store | Deliberately additive; no Resume migration folded into it |

Migration code must be idempotent within Dexie's upgrade semantics, preserve unsupported historical input until validation succeeds, and invalidate any derived cache whose inputs or meaning changed.

## Canonical Resume retention

The current Resume row uses ID `current`; the onboarding draft uses `onboarding`. Resume history retains at most 10 snapshots and removes snapshots older than 90 days. Snapshot reasons include edit, reupload, migration, manual save, and restart/recovery. This is an edit-recovery mechanism, not indefinite records management.

Saved-search seen identities are capped at 5,000 and expire after 180 days. Packet versions are bounded to five per packet and export history to 20 entries. Operational events are bounded to 100 browser events and desktop diagnostics to 200 in-memory events.

## Match-result compatibility

The outer match row remains the deterministic authority so v2.6.0 caches and Tracker snapshots can still be read. A v2.6.1 AI result is nested under `aiAssessment`; it is never inferred from an old model label or rationale. Historical rows without that object show only the Klar score. Cache identity includes provider, endpoint, model choice, prompt/schema, scorer, locale, and inputs so results from incompatible contracts do not collide.

Support submissions are not stored as a new Klar database record. The form holds its draft in component memory, sends the confirmed redacted payload to the Worker, and displays the returned public issue URL/report ID. GitHub then owns the submitted public issue under its retention and deletion rules.

## Vault cryptography

### Primitive and envelope

`src/crypto/resumeCrypto.ts` uses Web Crypto:

- PBKDF2 with SHA-256;
- 210,000 iterations;
- a random 16-byte salt;
- AES-GCM with a 256-bit key;
- a random 12-byte IV; and
- envelope version 1 containing `v`, `salt`, `iv`, and `ct`.

AES-GCM authentication detects an incorrect passphrase and ciphertext modification before plaintext is accepted. The salt and IV are non-secret parameters and travel with the ciphertext.

### Logical separation

The vault row has separate authenticated envelopes:

- **content envelope**, logical schema version 3: canonical Resume/history/draft, preferences, jobs, matches, tracker, dashboard, vectors, saved searches, Flexible Work searches, and packets, with reserved collections for original files and knowledge-base content;
- **credential envelope**, logical schema version 1: remembered Groq credential and the atomic Adzuna credential pair.

This separation allows a standard backup to retain protected content while excluding credential ciphertext byte-for-byte.

### State transitions

Enabling encryption requires a passphrase of at least 12 characters and the required acknowledgements. Klar assembles the sensitive snapshot, encrypts and authenticates it, commits the vault row, and deletes the corresponding plaintext rows in one database transaction. Unlock keeps plaintext in memory and migrates any supported legacy Flexible Work data into the content envelope. Vault mutations are serialized; an epoch guard prevents a queued write from committing after lock.

Disabling encryption decrypts and authenticates first, writes plaintext stores, and removes the vault row atomically. Lock clears the in-memory unlocked state. Klar cannot recover a forgotten passphrase.

### Security boundary

The vault is designed to reduce exposure from casual IndexedDB inspection, copied browser profiles, and device-at-rest access without the passphrase. It does not protect data from malicious code running in the same unlocked origin, a compromised operating system, screen capture, keylogging, or a person using an already unlocked Klar session. See [Security, Privacy, and Threat Model](/docs/security-privacy-and-threat-model).

## Credentials

Groq credential storage depends on the “remember” choice and vault state:

- remembered with vault enabled: credential envelope;
- remembered without vault: local setting controlled by the credential helper;
- not remembered: session storage or in-memory state.

Adzuna credentials are a pair and are accepted only when both application ID and key are present. Worker-provided credentials and user-provided credentials are not partially combined.

Provider endpoint/model configuration is not itself treated as a secret and stays in settings. Custom endpoint configuration may reveal organizational infrastructure and should still be treated as non-public configuration in support reports.

## Backup contract

Current backups use format identifier `klar-backup`, schema version 6, and include Klar release metadata.

| Mode | Sensitive data | Credentials | Required action |
| --- | --- | --- | --- |
| Standard | Plain workspace when vault is off; existing content ciphertext when vault is on | Secret setting rows and credential ciphertext removed | Normal export confirmation |
| Complete encrypted | If vault is off, selected sensitive workspace and credentials are encrypted with a backup password of at least 12 characters; if vault is on, existing encrypted envelopes are copied | Included only inside authenticated ciphertext | Password/explicit complete-backup choice |
| Readable sensitive export | Decrypted workspace content | Depends on the explicitly selected readable payload; should be treated as highly sensitive | Exact confirmation text `EXPORT DECRYPTED DATA` and unlocked vault when enabled |

Every backup carries a SHA-256 digest calculated over the JSON representation without the integrity field. This detects accidental modification; it is not a digital signature and does not establish who created the file.

## Import and recovery

Import follows a validate-before-replace sequence:

1. parse JSON and validate the format, version, mode, and required top-level structure;
2. verify the SHA-256 digest when present;
3. decrypt and authenticate encrypted material before database mutation;
4. migrate supported historical formats, including raw legacy v1/v2/v2.1, schema v4 from 2.2, and schema v5 from 2.3–2.5;
5. validate primary structure and key expectations;
6. replace the workspace in one Dexie transaction; and
7. reload the application so all readers observe the imported authority.

Structural validation is intentionally bounded and does not deeply validate every nested property of every row. Imports from unknown tools or edited JSON therefore remain untrusted. Use the controlled procedure in [Operations Runbooks](/docs/operations-runbooks).

## Data deletion

The application-level wipe clears all 17 stores. Browser or Electron profile deletion is an additional platform-level removal option. Downloaded exports, backups, provider-side request retention, and copies shared with employers are separate systems and are not deleted by clearing Klar.

## Change control checklist

Any persistent-data change must answer:

- What is the single authority after the change?
- Is the shape sensitive, operational, cache-only, or a credential?
- How does it behave with the vault locked, unlocked, enabled, and disabled?
- Is it included in each backup mode and historical import path?
- What is the migration, rollback, cache invalidation, and failure atomicity story?
- What retention bound and deletion path apply?
- Which tests prove new, upgrade, backup, wrong-password, corrupt-input, and interrupted-operation behavior?

Implementation procedures are in [Engineering Setup and Change Guide](/docs/engineering-setup-and-change-guide); open limitations are tracked in [Known Gaps and Risk Register](/docs/known-gaps-and-risk-register).
