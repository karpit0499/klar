---
title: "Backups and Recovery"
description: "Choose, create, validate, restore, and safely store Klar backups and vault-protected workspaces."
section: "User Guide"
order: 280
audience: ["Klar users", "Product support", "Operations"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Product Support"
last_verified: "2026-08-11"
next_review: "2026-11-11"
tags: ["user-guide", "backup", "restore", "vault", "recovery"]
---

# Backups and Recovery

## Why backups are required

Klar does not keep a server copy of the workspace. A backup is the recovery and device-migration mechanism for Resume data, preferences, saved searches, Tracker records, Dashboard, packets, and other local state.

Create a backup after initial setup, before a destructive action or major Resume replacement, and on a regular schedule appropriate to your application activity. Store at least one tested copy outside the browser profile.

## Choose a backup type

| Type | Contains | Credentials | Protection and use |
| --- | --- | --- | --- |
| Standard backup | Workspace data; encrypted vault content remains ciphertext when a vault exists | Never | Routine recovery; readable workspace JSON when the vault is disabled |
| Complete encrypted backup | Workspace plus Groq and Adzuna credentials | Encrypted only | Device migration when connections must move too |
| Readable export | Sensitive career workspace as readable JSON | Never | Exceptional inspection or portability; requires explicit confirmation and an unlocked vault |

All current backup envelopes include Klar version, backup schema 6, export time, mode, and a SHA-256 integrity digest.

## Create a standard backup

1. Open **Settings → Backup & encryption**.
2. Choose **Download standard backup**.
3. Store the JSON file safely.
4. Periodically inspect it through the onboarding restore preview in a disposable browser profile or fresh Klar instance. Confirm the expected date, version, and categories; when practical, complete a test restore only in that disposable environment and verify the expected workspace.

When the vault is disabled, sensitive career content in a standard backup is readable JSON. When the vault is enabled, the workspace remains encrypted ciphertext but the credential envelope is removed. In both cases API credentials are excluded.

## Create a complete encrypted backup

If the vault is disabled:

1. Enter a backup password of at least 12 characters.
2. Choose **Download complete encrypted backup**.
3. Store the file and password separately.

Klar encrypts workspace content and credentials before creating the file.

If the vault is already enabled, the complete backup preserves the existing encrypted content and credential envelopes. The vault passphrase is required for restore; Settings does not request a separate backup password in this state.

Klar cannot recover either password.

## Create a readable export

Readable export is available only while the vault is unlocked. Type the exact confirmation `EXPORT DECRYPTED DATA`, then download the JSON file.

The export excludes credentials but exposes career data, notes, contacts, and other workspace content in readable form. It is not protected by the vault after download. Use it only for a defined purpose and delete copies according to that purpose.

## Inspect and restore

Full restore replaces the active workspace after validation. Create a separate current backup first whenever the existing workspace is accessible.

### During onboarding

1. Select a Klar JSON backup.
2. Review its export time, Klar version, content categories, and password requirement.
3. Enter the backup or vault password when required.
4. Choose **Restore full workspace**.

The onboarding flow provides this non-destructive preview before the restore action.

### From Settings

1. Enter the backup or vault password first when the file is encrypted.
2. Choose **Import backup** and select the Klar JSON file.

Selecting a valid file from Settings immediately begins the validated full restore and then reloads Klar. There is no separate metadata preview or final confirmation after file selection, so do not choose **Import backup** merely to inspect a file.

Before changing active data, Klar validates:

- JSON and Klar backup format;
- supported schema or a supported legacy migration path;
- version and export timestamp;
- allowed backup mode;
- workspace structure and primary keys;
- absence of readable credentials;
- Flexible Work preference bounds;
- SHA-256 integrity;
- encrypted content and credentials with the supplied password.

Only after successful validation does one database transaction replace the active stores. If validation, authentication, or the transaction fails, the previous workspace remains unchanged. After an encrypted restore, Klar attempts to unlock with the same password; if that final unlock fails, the restored data remains encrypted and can be unlocked after reload.

## After restore

1. Reload Klar if it does not reload automatically.
2. Unlock the vault when present.
3. Confirm the canonical Resume, preferences, Tracker, packets, and saved searches.
4. Test Adzuna and the AI engine separately. A standard backup intentionally leaves credentials absent.
5. Create a fresh backup after confirming any migration.

## Vault operation

Enabling the vault requires matching passphrases of at least 12 characters and acknowledgement that Klar cannot recover it. Klar authenticates the newly encrypted content before clearing plaintext stores.

While unlocked, decrypted content exists in memory for the session. **Lock now** clears the in-memory content and session-only key. Disabling encryption moves the unlocked content and remembered credentials back to plaintext browser stores, then removes the vault.

The vault protects IndexedDB content at rest from casual inspection. It does not protect against an attacker controlling the device or page while the vault is unlocked.

## Recovery limits

- A forgotten vault or complete-backup password is unrecoverable.
- A corrupted or edited backup that fails integrity cannot be imported.
- Unsupported future schemas cannot be guessed or partially imported.
- A backup does not revoke data already submitted to an employer or provider.
- Downloaded Resume, packet, CSV, XLSX, PDF, and readable JSON files have their own storage risk.

Use [Troubleshooting](/docs/troubleshooting) for restore errors.
