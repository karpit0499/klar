---
title: "Electron Desktop and Local Runtime"
description: "Desktop renderer isolation, IPC contract, local model process lifecycle, signed package trust, diagnostics, packaging, and experimental limitations."
section: "Platform"
order: 280
audience: ["Desktop engineering", "Security", "Release engineering", "AI engineering", "Operations"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Engineering"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["electron", "desktop", "ipc", "llama-cpp", "model-trust", "signing"]
---

# Electron Desktop and Local Runtime

## Purpose

The Electron build adds an isolated, verified local-model runtime without granting the web renderer general desktop privileges. The 2.6.0.1 desktop capability is experimental and its binaries are not publicly distributed; its security architecture is implemented and tested, but public signing, adapter evidence, and normal-workflow local-provider integration are not complete.

## Process and privilege model

| Process | Privilege | Responsibility |
| --- | --- | --- |
| Renderer | Browser sandbox | Shared React UI and local IndexedDB workflows |
| Preload | Context-isolated bridge | Publish a frozen, narrow, type/size-checked API |
| Electron main | Privileged desktop authority | Window policy, IPC validation, package trust, process lifecycle, diagnostics |
| `llama-server` | Child process on loopback | Execute one local generation request at a time |

BrowserWindow uses `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`. Webviews and insecure content are not enabled. The minimum window is 960 × 700.

## Renderer loading and content security

In development, the renderer URL must be loopback HTTP with path `/` or `/index.html`. A packaged build loads the local application file. The production content-security policy allows scripts only from self, blocks frames and objects, and permits network connections only to self and HTTPS. Development adds the bounded loopback and WebSocket needs of Vite.

All permission requests are denied. Same-window navigation is limited to the trusted renderer. External opening accepts only credential-free HTTPS URLs that are not loopback. The IPC sender must be the main frame and exactly match the trusted development origin or packaged file boundary.

The current package retains a compatibility-related Electron fuse exception while using the existing packaged-renderer loading model. A future custom application protocol should remove that exception through a separately tested migration.

## Preload bridge

The bridge exposes only:

- redacted system information;
- runtime status, start, and stop;
- AI generation and cancellation; and
- redacted diagnostics.

It exposes no generic `invoke`, filesystem, shell, process, environment, or path API. Preload validation improves error feedback; main-process validation is authoritative and repeated to protect against a compromised renderer.

Every IPC change must constrain channel, sender, frame, object keys, string sizes, enum values, request ID, timeout, schema, and lifecycle state. Unknown properties are rejected rather than forwarded to the runtime.

## Runtime lifecycle

The bundled runtime version is pinned to llama.cpp `b10199`. On start, main:

1. verifies the selected model package and compatibility;
2. locates the platform-specific bundled runtime;
3. creates a random API credential in a mode-0600 temporary file;
4. starts `llama-server` with an allowlisted environment;
5. binds `127.0.0.1` on an ephemeral port;
6. disables the runtime web UI and external access, limits parallelism to one, and applies supported model/adapter arguments;
7. polls health until ready or the bounded startup fails; and
8. deletes the credential file after warmup while retaining the secret only in main memory.

The renderer never receives the port authorization credential. One generation is active at a time. Cancellation, crash, and window close move the runtime through explicit states and reject affected requests. Stop first requests graceful termination and then uses forced termination after bounded waits; close and application quit always clean up the child process.

The pinned runtime uses thinking disabled and JSON-object plus schema constraints for structured generation. Compatibility behavior is tied to the runtime pin and must be revalidated before an upgrade.

## Model package trust

Managed packages live under the Electron user-data directory at `models/packages/{artifactId}`. Package schema version 1 uses:

- a manifest describing artifact, runtime, app range, prompt contract, platform, base/adapter role, and provenance;
- an exact checksum map; and
- an Ed25519 signature over canonical JSON containing checksums and manifest.

Verification rejects:

- untrusted key IDs or invalid signatures;
- missing, extra, non-regular, or symlink files;
- path traversal;
- size or SHA-256 mismatch;
- manifest/checksum key mismatch;
- provenance source-artifact mismatch; and
- incompatible app, runtime, prompt schema, platform, or adapter relation.

Installation uses staging and an atomic final rename and does not replace an existing package implicitly.

The compatibility baseline is Klar `>=2.6.0 <2.7.0`, llama.cpp `b10199`, and prompt schema `klar-generation-v1`. A 2.7 release must deliberately update or preserve this range; changing only the application version can make every current package incompatible by design.

## Trust keys

Development can load a public key from `KLAR_MODEL_PUBLIC_KEY_PEM`. Packaged builds trust only `resources/trust/model-signing-public.pem` with the production key ID. The private signing key must never be committed, packaged, written to diagnostics, or supplied to the application at runtime.

The current documented base-model package pins the Qwen3.5-9B Q4_K_M upstream artifact, revision, size, and digest. The model and adapter files are not bundled or downloaded automatically. Base-package preparation is supported; precision and writer adapter claims remain **HOLD** until genuine artifacts and benchmark evidence exist.

## Memory and support tiers

Desktop tiering is based on physical memory:

- below 12 GiB: unsupported;
- 12 GiB to below 24 GiB: minimum tier; and
- 24 GiB or more: recommended.

This is a compatibility guard, not a guarantee of latency or output quality. Model size, platform, other processes, and runtime upgrades still affect behavior.

## Diagnostics and privacy

Desktop diagnostics are memory-only and capped at 200 events. Redaction removes known sensitive keys, credentials, emails, paths, and URL query/hash data and applies generic secret patterns. Diagnostics are operational aids, not a formally complete data-loss-prevention system. The issue-report flow shows a redacted preview and opens the external issue destination; it never submits automatically.

## Packaging and release state

The experimental build configuration produces:

- macOS Apple Silicon ZIP with ad-hoc signature; and
- Windows x64 portable package.

CI builds and tests these packages but deliberately does not publish them. Production configuration targets signed/notarized macOS arm64+x64 DMG/ZIP and signed Windows x64 NSIS, with a draft GitHub release provider. Production signing remains **HOLD** until real credentials, notarization, provenance, hashes, smoke results, and approval are present.

Electron fuses are explicit. Packaged smoke and fuse verification test the artifact after packaging; source tests alone do not prove the final fuse or ASAR state.

## Current product limitation

The desktop runtime panel can install/verify, start/stop, generate/cancel, and inspect diagnostics through the provider-neutral foundation. Normal Resume extraction, tailoring, cover-letter, recruiter-message, and related application call sites still use the production cloud-compatible client. Klar 2.6.0.1 must not claim that ordinary application generation automatically stays on-device.

## Change checklist

Review window options, CSP, navigation, permissions, IPC schema, sender validation, secret handling, runtime arguments, environment, port binding, cancellation, crash recovery, package canonicalization, signature/trust roots, compatibility, fuses, packaging, smoke tests, and logs for every desktop change.

Release controls are in [Test Strategy and Release Gates](/docs/test-strategy-and-release-gates); incident steps are in [Operations Runbooks](/docs/operations-runbooks); unresolved desktop items are in [Known Gaps and Risk Register](/docs/known-gaps-and-risk-register).
