# Klar v2.6 local-model package contract

This directory defines an internal feasibility format. It does not make
Qwen3.5-9B, Q4_K_M, llama.cpp, or either adapter a public product promise.

Every loadable package lives at the app-owned path
`<userData>/models/packages/<artifactId>/` and contains:

- `manifest.json`: model, license, provenance, runtime, hardware and
  compatibility metadata;
- `checksums.json`: exact byte size and SHA-256 digest for every declared model
  or adapter artifact; and
- `signature.json`: an Ed25519 signature over the canonical JSON payload
  `{ checksums, manifest }`.

The desktop process rejects undeclared files, missing checksums, symlinks,
directory traversal, untrusted keys, digest mismatches and signatures that do
not verify. It also requires the packaged base-model bytes to match the exact
source artifact named in the signed provenance record. The renderer cannot
choose a path or executable.

The v2.6 feasibility package uses
`bartowski/Qwen_Qwen3.5-9B-GGUF/Qwen_Qwen3.5-9B-Q4_K_M.gguf` at repository
revision `2dcd842c59ea5eb119267064550a7a4c592b16c3`: 6,169,341,984 bytes with
SHA-256 `d784ce9eda1a5a7b51e8f705a9e6310844bf4f173654d115823c775fdea56d43`.
This third-party quantization provenance is separate from the upstream
Qwen/Qwen3.5-9B base-model revision and license recorded in `baseModel`.

`model/examples/manifest.example.json` is an illustrative template. Replace all
uppercase placeholders and measured byte counts before packaging. Never treat
example metadata as a signed artifact.

## Signing an internal package

Generate an Ed25519 key outside the repository. Keep the private key in a secret
manager or an offline signing environment; package only its public key:

```sh
openssl genpkey -algorithm ED25519 -out klar-model-signing-private.pem
openssl pkey -in klar-model-signing-private.pem -pubout -out klar-model-signing-public.pem
node model/tools/prepare-base-validation-package.mjs \
  /secure/staging \
  /verified/Qwen_Qwen3.5-9B-Q4_K_M.gguf \
  /secure/keys/klar-model-signing-private.pem \
  /secure/keys/klar-model-signing-public.pem
node model/tools/verify-package.mjs \
  /secure/staging \
  qwen3.5-9b-q4km-base-validation \
  klar-model-production-1 \
  /secure/keys/klar-model-signing-public.pem
```

For an unpackaged developer run, provide the PEM text through
`KLAR_MODEL_PUBLIC_KEY_PEM`. Production packaging must copy the public key to
`resources/trust/model-signing-public.pem` and use key id
`klar-model-production-1`.

The schemas are versioned independently. Schema version 1 accepts a bounded
8,192-token candidate configuration but allows controlled experiments from
1,024 to 32,768 tokens. Product validators and evidence checks remain outside
the model and adapters.
