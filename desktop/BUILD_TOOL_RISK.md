# Desktop build-tool risk register — v2.6

- Status: **PASS at the pinned v2.6 lockfile; re-audit before every release**
- Recorded: 2026-08-08
- Scope: development/build dependencies only
- Owner: repository maintainer
- Review trigger: every electron-builder or npm advisory update, and before any
  public desktop artifact

## Evidence

```sh
npm run audit:production
npm run audit:build-tools
```

At the final v2.6 verification on 8 August 2026, both commands report zero
known vulnerabilities across the pinned lockfile. electron-builder remains
26.15.3 and its transitive `tar` dependency resolves to 7.5.22. Keep the
complete JSON output as release evidence: the npm advisory database and
transitive dependency resolutions can change after this document is written.

## Current controls

- electron-builder is a pinned development dependency and is absent from the
  shipped renderer dependency set.
- CI uses the committed lockfile with `npm ci` on ephemeral GitHub-hosted
  runners and read-only repository permissions.
- Pull-request builds receive no production signing or publishing secrets.
- Build configuration and artifact names are repository-controlled; the
  preview workflow does not package an untrusted user-supplied glob or template.
- The final unpacked app is fuse-checked and smoke-tested after the exact dist
  invocation, then the archive receives a SHA-256 sidecar. The public workflow
  deliberately uploads no unsigned binary.
- `desktop:dist:production` forces `--publish never`; publication is a later,
  separately authorized step.

These controls remain required even while the audit is green.

## Exit criteria

If either audit becomes non-zero, public desktop distribution returns to HOLD
until an upgraded and fully tested lockfile clears it, or a documented security
review maps every remaining advisory to the exact trusted-input build path and
records a time-bounded owner acceptance. A green dependency audit does not by
itself graduate an unsigned preview: signing, platform, model and human-quality
gates remain separate.

Never use `npm audit fix --force` blindly: any forced major/downgrade must be
reviewed, locked, packaged, and rerun through the complete desktop matrix.
