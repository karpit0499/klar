# Klar Developer Preview desktop integration

The v2.6 desktop foundation is integrated. The renderer remains the existing
sandboxed web application: renderer modules do not import Electron or Node.js
and never receive runtime tokens, filesystem paths or process handles.

## Pinned build toolchain

`package.json` and `package-lock.json` are authoritative. The desktop-specific
pins are Electron `43.2.0`, electron-builder `26.15.3`, `@electron/fuses`
`1.8.0`, concurrently `10.0.4`, and wait-on `9.1.0`. Use `npm ci`; do not replace
the lockfile with an unreviewed install.

The supported scripts are:

```sh
npm run desktop:dev
npm run desktop:pack:mac-arm64
npm run desktop:pack:win-x64
npm run desktop:dist:mac-arm64
npm run desktop:dist:win-x64
npm run desktop:fuses:check
npm run desktop:smoke
npm run desktop:dist:production
```

The desktop renderer build intentionally uses Vite base `./`. GitHub Pages uses
`/klar/`, which is correct for the hosted app but cannot resolve assets from a
packaged `file://` window. Keep `public/theme-bootstrap.js` as a same-origin
file; do not loosen the packaged Content Security Policy for inline scripts.

## Managed runtime and model trust

Install the reviewed llama.cpp runtime before packaging:

```sh
node desktop/tools/install-runtime.mjs darwin-arm64
# On the Windows CI runner instead:
node desktop/tools/install-runtime.mjs win32-x64
```

The installer downloads build tag `b10199`, verifies the pinned archive
SHA-256, rejects unsafe links, and records upstream provenance. Runtime files
remain ignored under `desktop/vendor/<platform>/`.

Only the model-signing public key is packaged at
`desktop/resources/trust/model-signing-public.pem`. The key generator used by
CI creates an ephemeral test identity; it is not production trust. Production
private keys must never enter the repository or an uploaded artifact.

The main process binds llama.cpp to `127.0.0.1` on an ephemeral port, writes an
ephemeral API-key file with mode `0600`, deletes it after warm-up, disables the
runtime Web UI and network downloads, and limits inference to one concurrent
slot. The renderer can request only a verified installed artifact ID.

## Release-evidence sequence

Run the complete web/Worker gate before installing ignored binary inputs:

```sh
npm ci
npm run qa
npm run audit:production
```

The full build-tool audit is a separate gate:

```sh
npm run audit:build-tools
```

At the final 8 August 2026 verification, the production and full lockfile audits
both report zero known vulnerabilities. Re-run both commands immediately before
building an artifact because advisory data can change. A later non-zero result
returns public distribution to HOLD until it is fixed or explicitly reviewed;
never reuse this dated result as proof for a future lockfile.

After the runtime and a validation trust key are installed, produce the final
archive once, then smoke the unpacked application from that same invocation:

```sh
npm run desktop:dist:mac-arm64
npm run desktop:smoke
shasum -a 256 release/desktop/*.zip
```

Windows CI runs the corresponding x64 script and `Get-FileHash -Algorithm
SHA256`. The public-repository workflow validates and hashes the exact archive
but deliberately uploads no unsigned binary. An internal package is not ready
even for controlled testing until fuse states,
runtime hash, model signature, warm-up, cancellation, crash recovery, renderer
isolation, and archive checksum evidence all pass.
