---
title: "Operations Runbooks"
description: "Actionable diagnosis, containment, recovery, verification, and escalation procedures for Klar service and data incidents."
section: "Quality and Operations"
order: 330
audience: ["Operations", "Engineering", "Security", "Support", "Release owners"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Operations"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["operations", "runbook", "incident", "recovery", "rollback"]
---

# Operations Runbooks

## Purpose

These runbooks turn a symptom into safe containment and a verifiable outcome. Klar has no central user-content backend, so operations focus on the static release, Cloudflare Worker, third-party source/provider boundaries, local recovery, and desktop preview artifacts.

## Universal incident procedure

For every incident:

1. **Classify impact:** privacy/security, data loss, source integrity, generated-claim integrity, availability, or release/distribution.
2. **Preserve minimum evidence:** release, commit, platform, time, safe error category, source/connector ID, and reproduction with synthetic data. Do not collect a real Resume, application, key, password, prompt, or unredacted backup.
3. **Contain:** disable the affected connector/feature, stop distribution, roll back the static release, or stop the desktop runtime as appropriate.
4. **Protect local state:** do not recommend clearing data before offering and verifying a safe backup when the workspace is accessible.
5. **Diagnose against the current code/configuration:** do not rely on an old roadmap or build guide.
6. **Recover and verify:** use the success criteria in the relevant runbook and run proportionate regression/release gates.
7. **Communicate honestly:** distinguish no results from insufficient coverage, deterministic from AI output, candidate from verified connector, and preview from production.
8. **Record:** root cause, affected versions, decision, tests, rollback, documentation change, and residual risk without personal content.

Suspected security or personal-data exposure uses private vulnerability reporting under [Security, Privacy, and Threat Model](/docs/security-privacy-and-threat-model).

## Static web release failure

**Trigger:** blank page, asset 404, broken `/klar/` routing, wrong `version.json`, widespread regression after Pages deployment.

**Containment:** stop further merges/deployments. Identify the last known verified `main` deployment. Do not publish a locally built `dist` outside the workflow.

**Diagnosis:** check Pages workflow result, uploaded artifact, Vite base, `version.json`, service-worker cache behavior, browser console with synthetic state, and whether the fault is cached or in the deployed artifact.

**Recovery:** fix forward through a reviewed commit or revert the specific release commit through normal version control, then allow the verify/deploy workflow to build and deploy the exact source. If stale service-worker state is involved, update cache/version handling rather than instructing destructive data wipes.

**Success:** new workflow is green; fresh and previously installed clients load; local IndexedDB state remains; version metadata is correct; critical Career/Flexible/vault routes pass smoke review.

## Worker outage or misconfiguration

**Trigger:** health failure, widespread BA/Adzuna/Fabric/Groq relay errors, CORS rejection, missing secrets, unexpected 403/404/5xx.

**Containment:** preserve local deterministic functionality. If a route could expose secrets or become an open relay, disable/rollback Worker deployment immediately. If only one source is affected, use its kill switch or remove it from the source plan rather than disabling unrelated routes.

**Diagnosis:** check `/health`, Worker deployment/version, configured origin list, secret presence without revealing values, route/method, upstream status class, response-size/content-type rejection, and content-free logs/traces.

**Recovery:** restore the last verified Worker or deploy a reviewed fix after Worker types, security tests, generated binding check, and dry run. Confirm the Pages build points to the intended Worker URL.

**Success:** allowed production origin succeeds; disallowed origin remains rejected; absent/invalid credential fails safely; route bounds and no-store headers remain; client shows partial states honestly during any remaining source outage.

## Connector breakage or source drift

**Trigger:** parse failures, zero rows inconsistent with official inventory, stale links, blocked/CAPTCHA response, timeout surge, schema failure, duplicate explosion.

**Containment:** kill the connector locally/configurably, open its circuit, or remove it from the enabled plan. Do not bypass access controls, CAPTCHA, robots restrictions, or explicit blocking. Keep fallback and other sources active.

**Diagnosis:** verify official ownership and permitted route; inspect a content-redacted structural sample; compare registry host/path/parser version and Worker allowlist; check pagination, content type, expiry, fallback, health, and last verified time.

**Recovery:** update parser/contract and safe fixtures, or downgrade support to the honest official route plus baseline aggregator fallback. Candidate connectors remain candidate until the full verification gate is complete.

**Success:** inventory and zero-inventory fixtures pass; malformed/timeout/removal are isolated; provenance is correct; fallback is usable; session remains under 60 seconds; UI does not claim complete direct coverage.

## Synthetic Flexible Work data in a live build

**Trigger:** `usingFixtures=true`, recognizable fixture rows, or no configured Worker on a production deployment.

**Containment:** stop describing results as live. Disable affected production entry point or restore the correctly configured build. Preserve fixture mode for controlled development only.

**Diagnosis:** confirm baked `VITE_WORKER_URL`, static artifact provenance, Worker health, and environment separation.

**Recovery:** rebuild through CI with the reviewed Worker URL and add/verify a release assertion that production cannot silently present fixture content as live.

**Success:** production result provenance is real and verifiable; offline/development fixture state is unmistakably labelled; no synthetic opportunity is cached as live user data.

## AI provider, credential, quota, or schema failure

**Trigger:** unauthorized response, quota/rate error, model retired, empty/invalid structured output, timeout, malformed generated content.

**Containment:** stop automatic retry loops; preserve deterministic result and last reviewed packet artifact. Never ask for a key in a public report or log it.

**Diagnosis:** identify engine, endpoint class, model identifier, relay/direct path, credential retention mode, error category, budget state, and consumer validation failure using synthetic input.

**Recovery:** correct the credential/endpoint/model selection, wait for bounded quota reset, or deploy a compatibility fix with one bounded retry. A new provider/model requires full prompt, schema, evidence, privacy, and release review.

**Success:** valid structured response passes the capability consumer; invalid responses fail closed; no false 0/100 score or empty artifact is cached; prior reviewed content remains intact.

## Vault cannot unlock

**Trigger:** incorrect-passphrase/authentication failure or unreadable vault.

**Containment:** do not clear the database, disable encryption, or repeatedly edit the ciphertext. Confirm the person is in the same browser profile/origin and is not entering a backup password instead of the vault passphrase.

**Diagnosis:** distinguish wrong passphrase, origin/profile mismatch, corrupted local storage, and unsupported envelope version. Collect only error category/version—not ciphertext or personal data—in a report.

**Recovery:** use the correct passphrase or import a known-good complete encrypted backup with its correct password. Klar cannot recover or reset a forgotten vault passphrase. If neither exists, be explicit that protected content is unrecoverable.

**Success:** authentication succeeds, content loads, sensitive plaintext stores remain empty while vault is enabled, and a fresh complete encrypted backup can be verified.

## Backup restore

**Trigger:** new device/profile, local corruption, or deliberate rollback.

**Precondition:** preserve the current workspace with a new backup if it can be opened. Work on a copy of the candidate backup. Confirm file mode, format, version, and password availability.

**Procedure:** use the in-app import; review its validation result; provide the backup password only in the local UI; allow decrypt/authenticate/migrate checks to finish before replacement; reload after the atomic commit.

**Do not:** edit encrypted JSON, paste it into support, treat the SHA-256 digest as author authentication, or import an unknown file merely because it parses.

**Success:** canonical Resume, preferences, searches, packets, tracker, vault state, and relevant caches/counts reconcile; credentials are present only when the selected backup mode included them; wrong password/corrupt copy still fails without modifying the workspace.

## Export or document failure

**Trigger:** blank/corrupt DOCX/PDF/ZIP, missing content, unsupported claim warning, wrong language, stale provenance, mobile download failure.

**Containment:** do not send the document. Preserve packet and reviewed decisions; record a content-free `export_failure` event if the product path does so.

**Diagnosis:** check packet kind/job snapshot, language workspace, Resume presence, accepted blocked changes, cover-letter provenance, generator/format version, browser download support, and semantic document checks.

**Recovery:** resolve evidence/readiness blockers, regenerate through the current exporter, and test the exact artifact in supported readers. Do not manually relabel historical provenance.

**Success:** selectable text, correct language and facts, current provenance, no placeholders or blocked claims, expected ZIP contents, and successful user-controlled download.

## Desktop runtime or package failure

**Trigger:** package rejected, runtime fails warmup, generation hangs, cancellation fails, process crashes, signature/compatibility error, orphaned process.

**Containment:** stop the runtime and distribution of the affected package. Do not weaken signature, checksum, path, compatibility, sandbox, IPC, CSP, or fuse checks to make a package run.

**Diagnosis:** use redacted in-memory diagnostics; confirm memory tier, platform, app/runtime/prompt compatibility, trusted public key ID, checksum/signature, runtime provenance, one-request limit, and child-process state. Keep private keys and model paths out of reports.

**Recovery:** install a correctly signed compatible package or a reviewed runtime; correct manifest/provenance through the packaging pipeline; run lifecycle, cancellation, crash recovery, packaged smoke, and fuse checks.

**Success:** verified package installs atomically, warmup succeeds on authenticated ephemeral loopback, cancel returns terminal state, close/quit leaves no child process, and the exact archive hash is recorded.

## Suspected vulnerability or personal-data exposure

**Trigger:** secret leak, sandbox escape, code execution, unauthorized network transfer, model-package trust bypass, encryption/authentication flaw, public personal data.

**Containment:** stop affected deployment/distribution, revoke exposed provider/deployment credentials, rotate trust material when compromise is plausible, preserve minimal private evidence, and avoid public discussion.

**Escalation:** use GitHub private vulnerability reporting. Coordinate disclosure only after containment and a decision. Public issues must never contain real personal documents, credentials, paths, or unredacted diagnostics.

**Success:** root cause fixed, credentials/trust roots rotated where necessary, regression and release gates pass, affected claims/docs updated, and disclosure decision recorded privately.

## Local data wipe

**Trigger:** explicit user request to remove Klar's local workspace.

**Procedure:** explain that wipe clears all 17 Klar IndexedDB stores but not downloaded files, backups, browser sync copies, provider records, or employer submissions. Offer a backup only if the person requests retention. Require the product's explicit destructive confirmation, execute the wipe, and verify onboarding appears with no prior state.

**Success:** all Klar stores are empty in the active origin/profile and the user understands remaining external copies.

## Evidence record template

For any resolved operation, record: incident ID; dates; affected release/commit/platform; non-personal symptom; impact class; containment; root cause; changed code/configuration; checks run; artifact/deployment hash where relevant; recovery result; residual risk; linked KB updates; approver. Store no Resume, application, key, prompt, or source response body in this record.
