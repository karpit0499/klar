---
title: "Security, Privacy, and Threat Model"
description: "Assets, trust boundaries, adversaries, controls, residual risks, privacy behavior, and secure-reporting rules for Klar 2.6.1."
section: "Security and Privacy"
order: 300
audience: ["Security", "Engineering", "Privacy reviewers", "Operations", "Leadership"]
status: "current"
classification: "public"
applicable_version: "2.6.1"
owner: "Klar Security"
last_verified: "2026-08-11"
next_review: "2026-09-11"
tags: ["security", "privacy", "threat-model", "controls", "risk"]
---

# Security, Privacy, and Threat Model

## Purpose and scope

This threat model defines what Klar protects, which adversaries and failures are in scope, and where protection ends. It covers the static web application, local browser storage, Cloudflare Worker, third-party sources and AI providers, downloaded artifacts, and the experimental Electron capability.

Klar 2.6's desktop capability is experimental and its binaries are not publicly distributed. Security fixes are supported on current `main` and the latest available build. The project provides best-effort maintenance and no response-time or paid-support SLA.

## Security objectives

1. Keep Resume, preferences, applications, and credentials local unless a user explicitly invokes an external action.
2. Prevent third-party source content and AI output from becoming trusted code or facts.
3. Make network relays finite, allowlisted, bounded, and non-persistent.
4. Protect selected local content at rest with authenticated encryption when the vault is enabled.
5. Prevent the desktop renderer from gaining general operating-system authority.
6. Execute only signed, checksummed, compatible local-model packages.
7. Fail safely without deleting reviewed state, fabricating results, or exposing sensitive diagnostics.
8. Make release and security claims proportional to dated evidence.

## Asset classification

| Class | Examples | Required handling |
| --- | --- | --- |
| Restricted personal | Canonical Resume, contact data, application writing, notes, job decisions, readable backup | Minimize, encrypt at rest when vault enabled, never log, explicit export/share |
| Restricted credential | Groq key, Adzuna pair, vault/backup passphrase, model private signing key | Never log or place in prompts; separate credential storage; private signing key never packaged |
| Confidential configuration | Provider endpoint, Worker deployment details, source controls, release evidence | Share only for operational need; redact support output where it identifies private infrastructure |
| Internal operational | Content-free connector health, status, safe error category, build/test results | Bounded retention and safe tokens only |
| Public external | Job listings, employer routes, public source responses | Still untrusted input; validate, sanitize, timestamp, and preserve provenance |
| Public product | Static application assets and approved public KB pages | Integrity through reviewed build/deployment process |

## Trust boundaries

The material boundaries are detailed in [System Context and Runtime Topology](/docs/system-context-and-runtime-topology). Security review must treat these crossings explicitly:

- document file into renderer parser;
- renderer into IndexedDB or session storage;
- renderer through Worker to source/provider;
- Support preview through the protected Worker feedback route to public GitHub Issues;
- untrusted source/provider response into domain state;
- renderer across preload IPC into Electron main;
- Electron main into the local runtime and model package;
- local protected state into a downloaded file; and
- redacted diagnostics into a public or private report.

## Threats, controls, and residual exposure

### Local data disclosure

**Threats:** copied browser profile, shared device, local inspection, lost device, readable backup, forgotten open session.

**Controls:** origin-scoped IndexedDB, optional PBKDF2/AES-GCM vault, separate content/credential envelopes, passphrase requirements, lock, standard backup credential exclusion, exact warning for readable export, full wipe.

**Residual:** vault-disabled data is readable to the local browser profile; vault-enabled data is accessible to Klar while unlocked; operating-system compromise, keylogging, screenshots, and malicious same-origin code are outside the at-rest guarantee. Passphrases are unrecoverable.

### Web code or dependency compromise

**Threats:** XSS, malicious dependency/update, compromised static hosting, service-worker persistence.

**Controls:** React escaping, constrained rendering, production build review, lockfile, syntax/type/test/build gates, production dependency and build-tool audits, web CSP-related discipline, service worker disabled in Electron, content-free diagnostics.

**Residual:** the browser vault cannot defend against malicious application code executing after unlock. Dependency audits are advisory-database snapshots, not proof of absence. A compromised release channel can undermine local-first guarantees.

### Malicious document, job, or AI content

**Threats:** parser exploit, oversized content, active HTML, prompt injection, schema confusion, fabricated claim, unsafe application URL.

**Controls:** client-side bounded extraction, fixed projections, source normalization, content-type/size bounds on Fabric, no upstream JavaScript execution, structured-output validation, evidence gates, deterministic rank, human review, HTTPS destination controls on desktop.

**Residual:** source descriptions and document parsers are complex untrusted-input surfaces. Prompt injection cannot be solved by instruction text alone. User review remains mandatory.

### Credential exposure and provider misuse

**Threats:** key in source control, logs, URL, prompt, browser persistence, public report, malicious endpoint, quota theft.

**Controls:** credential helpers, separate credential vault, session-only option, Worker deployment secrets, authorization headers, stripped Adzuna query credentials, atomic pair selection, diagnostics redaction, explicit custom endpoint configuration. GitHub and Turnstile secrets exist only in Worker bindings, never the renderer.

**Residual:** custom endpoints can observe all data intentionally sent to them. Browser-origin policy is not a complete abuse-control boundary, and provider-side retention, quotas, and account security remain external responsibilities.

### Worker SSRF, resource exhaustion, and relay abuse

**Threats:** relay misuse, unsafe redirect or destination handling, oversized responses, high request volume, and upstream secret leakage.

**Controls:** finite routes, fixed or allowlisted destinations, HTTPS reconstruction, redirect revalidation, private-network screening, bounded high-risk operations, safe errors, and an explicit production origin policy. The feedback route additionally enforces strict shape/size, honeypot, server-side redaction, Turnstile action/hostname, rate limit, fixed repository/labels, stable report IDs, no automatic retry, and no-store responses.

**Residual:** origin policy alone cannot prevent non-browser misuse; resource and client-level abuse controls are not yet uniform across every relay; and destination validation needs further defense in depth. The fixed host catalog reduces but does not eliminate server-side request-forgery risk.

### Source integrity and stale opportunities

**Threats:** broken parser, changed third-party schema, stale/removed vacancy, aggregator impersonation, duplicate conflict, synthetic test data in production.

**Controls:** normalization, verified-only execution, per-tenant scheduled ATS cache, provenance, cache expiry/revalidation, circuit breaker, kill switch, official-search/open-entry distinction, production fixture assertion, diagnostics, honest partial state.

**Residual:** third-party availability and truth are not controlled by Klar. Verification proves a dated route/contract observation, not future inventory, employer endorsement, or completeness. Official search routes do not become vacancies merely because they return HTTP 200. See [Known Gaps and Risk Register](/docs/known-gaps-and-risk-register).

### Public feedback abuse or disclosure

**Threats:** bot-created issues, duplicate issues, public personal data, secret exposure, malicious links, label/repository manipulation, token theft, or an attempted public vulnerability disclosure.

**Controls:** local preview and explicit confirmation, restricted categories, field/byte limits, client and server redaction, empty honeypot, server-side Turnstile validation, rate limit, stable report ID, fixed public repository and labels, Worker-only GitHub token, content-safe logging, no screenshots/files, and a private-security escape route.

**Residual:** automated redaction cannot understand every personal sentence; GitHub receives and retains a confirmed public issue; Turnstile, KV, and GitHub availability are external dependencies. The 30-day KV replay record prevents ordinary repeated report IDs but is not a transactional exactly-once queue, so an ambiguous network outcome still requires a report-ID check before retry. The person must review the exact preview. Klar provides no promise of issue response time.

### Backup tampering or destructive import

**Threats:** corrupt file, wrong passphrase, edited JSON, malicious oversized/nested rows, accidental workspace replacement.

**Controls:** format/version validation, SHA-256 digest, AES-GCM authentication for encrypted payloads, supported migration list, validate-before-replace, one atomic transaction.

**Residual:** backup digest proves integrity relative to the file, not authorship; validation is not a deep schema audit of every nested row. A valid readable backup is a sensitive copy outside Klar.

### Desktop privilege escalation and model substitution

**Threats:** compromised renderer invoking OS capabilities, unsafe navigation, Electron misconfiguration, untrusted runtime/model, package traversal/symlink, loopback access, secret leakage, orphaned process.

**Controls:** sandbox, Node disabled, context isolation, permission denial, CSP/navigation policy, narrow frozen bridge, duplicated authoritative main validation, exact sender checks, signed manifest/checksums, path and file-type validation, compatible trust key, ephemeral authenticated loopback, allowlisted environment, cleanup, explicit fuses, packaged smoke tests.

**Residual:** experimental binaries are unsigned/ad hoc and not publicly distributed; a packaging compatibility exception remains under review; diagnostics redaction is bounded pattern matching; Electron/runtime/dependency vulnerabilities remain possible. Normal product generation is not yet routed to the local provider.

## Privacy behavior by operation

| Operation | Leaves the device? | Notes |
| --- | --- | --- |
| Edit, rank, track, save search, generate deterministic export | No by Klar design | Public job retrieval may already have occurred; local state remains on device |
| Retrieve jobs | Yes | Query/location parameters go to direct sources or Worker/upstream; Resume content is not required for raw retrieval |
| AI Resume extraction or writing | Yes for configured cloud provider; the experimental local path is separate | Only the bounded prompt projection should be sent; provider terms apply |
| Worker health | Yes | No career content required |
| Create backup or document | No until the user moves/shares it | Downloaded copy is outside the vault |
| Submit ordinary bug or suggestion | Yes, only after preview and confirmation | Redacted structured data goes through the Worker to a public GitHub issue; GitHub retention applies |
| Report security or privacy concern | Yes, after the person follows the private route | Klar does not send it through the public feedback API |
| Clear Klar data | No | Does not delete downloaded files or provider/source records |

Klar currently has no account analytics or central content telemetry. Browser operational events are content-free, local, and capped at 100. Desktop diagnostics are memory-only and capped at 200. Limited telemetry improves privacy but reduces fleet-wide detection and incident reconstruction.

## Secure reporting

Suspected authentication, encryption, secret-handling, sandbox escape, code execution, update, model trust, or personal-data exposure issues must use [GitHub private vulnerability reporting](https://github.com/karpit0499/klar/security/advisories/new). Do not use a public issue.

[Public GitHub issues](https://github.com/karpit0499/klar/issues/new/choose) are appropriate for ordinary defects only after replacing names, emails, phone numbers, employer-private text, paths, query strings, identifiers, and documents with synthetic examples. Never attach a real Resume, cover letter, application, key, password, token, private signing key, or unredacted diagnostic archive.

The in-app Support tool submits only an ordinary public report after preview, confirmation, and abuse checks. It never submits security/privacy reports, screenshots, or arbitrary attachments. Follow [Operations Runbooks](/docs/operations-runbooks) for triage and containment.

## Review triggers

Re-run this threat model for any new origin, remote service, account/sync capability, telemetry event, storage store, secret, file parser, HTML renderer, Worker route/host, background task, IPC channel, runtime flag, model format/trust key, updater, signing method, export type, or provider fallback.
