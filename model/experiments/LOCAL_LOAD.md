# Adapter conversion and local-load proof

This is the step-by-step recipe that turns the two Kaggle training outputs into
GGUF adapters, loads them beside the verified base model, and re-runs the
benchmark so base, Precision and Writer can be compared honestly.

Nothing here downloads the base weights. The Q4_K_M GGUF is the artifact you
already verified in Phase 5, and the model package is managed separately.

**Before you start you need all four of these.** Stop if any is missing.

| Requirement | How to confirm |
| --- | --- |
| The verified base GGUF | `test -f "$KLAR_V26_MODEL_FILE"` from Phase 5 |
| Both Kaggle ZIPs | `klar-precision-adapter-v1.zip`, `klar-writer-adapter-v1.zip` |
| The recorded SHA-256 of each ZIP | written into your controlled evidence directory |
| The pinned llama.cpp runtime | `desktop/vendor/darwin-arm64/llama-server` from `node desktop/tools/install-runtime.mjs darwin-arm64` |

Pinned llama.cpp build tag `b10199`, commit
`b4ca032ae3729516943884786de4ae39fba0bbca`. Every command below assumes the
repository root `/Users/kumararpit/klar`. Linux users replace `stat -f %z` with
`stat -c %s` and `shasum -a 256` with `sha256sum`.

---

## Step 1 — create one private working directory

Everything produced here is evidence, not source. Keep it out of the repository.

```sh
umask 077
KLAR_ADAPTER_ROOT="$HOME/.klar-private-evidence/v2.6/adapters"
mkdir -p "$KLAR_ADAPTER_ROOT/zips" \
  "$KLAR_ADAPTER_ROOT/extracted" \
  "$KLAR_ADAPTER_ROOT/gguf" \
  "$KLAR_ADAPTER_ROOT/base-config"
chmod 700 "$KLAR_ADAPTER_ROOT"
echo "$KLAR_ADAPTER_ROOT"
```

Copy the two downloaded ZIPs into `"$KLAR_ADAPTER_ROOT/zips"` before continuing.

## Step 2 — verify each ZIP before extracting it

Replace the two placeholder digests with the values you recorded from Kaggle.

```sh
KLAR_PRECISION_ZIP_SHA256="PASTE_THE_RECORDED_PRECISION_ZIP_SHA256"
KLAR_WRITER_ZIP_SHA256="PASTE_THE_RECORDED_WRITER_ZIP_SHA256"

for slot in precision writer; do
  zip="$KLAR_ADAPTER_ROOT/zips/klar-${slot}-adapter-v1.zip"
  test -f "$zip" || { echo "Stop: $zip is missing." >&2; exit 1; }
  actual="$(shasum -a 256 "$zip" | awk '{print $1}')"
  case "$slot" in
    precision) expected="$KLAR_PRECISION_ZIP_SHA256" ;;
    writer)    expected="$KLAR_WRITER_ZIP_SHA256" ;;
  esac
  test "$actual" = "$expected" || {
    echo "Stop: $slot ZIP digest $actual does not match $expected." >&2
    exit 1
  }
  echo "$slot ZIP verified: $actual"
done
```

A digest mismatch means the download is not the artifact you trained. Do not
extract it.

## Step 3 — extract and inspect the provenance

```sh
for slot in precision writer; do
  rm -rf "$KLAR_ADAPTER_ROOT/extracted/$slot"
  mkdir -p "$KLAR_ADAPTER_ROOT/extracted/$slot"
  unzip -q "$KLAR_ADAPTER_ROOT/zips/klar-${slot}-adapter-v1.zip" \
    -d "$KLAR_ADAPTER_ROOT/extracted/$slot"
  echo "--- $slot ---"
  find "$KLAR_ADAPTER_ROOT/extracted/$slot" -type f | sort
  cat "$KLAR_ADAPTER_ROOT/extracted/$slot/provenance.json"
done
```

Read every `provenance.json` yourself. Reject the run and retrain if any of
these is true:

- the pinned base model revision is absent or different from the notebook's;
- a dependency version differs from the notebook's frozen snapshot;
- the GPU name is not a T4;
- the train and eval id sets overlap;
- a file you did not expect is present.

Each extracted slot must contain an `adapter` directory holding
`adapter_config.json` and `adapter_model.safetensors`.

```sh
for slot in precision writer; do
  test -f "$KLAR_ADAPTER_ROOT/extracted/$slot/adapter/adapter_config.json"
  test -f "$KLAR_ADAPTER_ROOT/extracted/$slot/adapter/adapter_model.safetensors"
done
echo "both adapter directories are complete"
```

## Step 4 — assemble the base configuration directory

`convert_lora_to_gguf.py` reads the base model's **configuration and tokenizer**
to resolve tensor names. It does not read the base weights, so this directory
stays small — a few megabytes, not gigabytes.

Download these files from the upstream Qwen3.5-9B repository on Hugging Face at
one pinned revision, and record that revision in your evidence:

```text
config.json
generation_config.json
tokenizer.json
tokenizer_config.json
special_tokens_map.json
```

```sh
KLAR_BASE_REVISION="PASTE_THE_UPSTREAM_QWEN3_5_9B_REVISION"
python3 -m venv "$KLAR_ADAPTER_ROOT/hf-venv"
source "$KLAR_ADAPTER_ROOT/hf-venv/bin/activate"
python -m pip install --upgrade pip
python -m pip install "huggingface_hub==0.35.3"

python - <<'PY'
import os
from huggingface_hub import hf_hub_download
root = os.environ["KLAR_ADAPTER_ROOT"] + "/base-config"
revision = os.environ["KLAR_BASE_REVISION"]
for name in [
    "config.json",
    "generation_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
]:
    path = hf_hub_download(
        repo_id="Qwen/Qwen3.5-9B",
        filename=name,
        revision=revision,
        local_dir=root,
    )
    print("downloaded", path)
PY

deactivate
ls -la "$KLAR_ADAPTER_ROOT/base-config"
```

If the upstream repository is gated, accept its licence in your Hugging Face
account first and run `huggingface-cli login` inside the same virtual
environment. Verify the model card licence before any redistribution decision.

## Step 5 — build the pinned converter in its own environment

Never install these dependencies into the system Python.

```sh
cd "$KLAR_ADAPTER_ROOT"
rm -rf llama.cpp
git clone https://github.com/ggml-org/llama.cpp.git
git -C llama.cpp checkout b4ca032ae3729516943884786de4ae39fba0bbca
test "$(git -C llama.cpp rev-parse HEAD)" = "b4ca032ae3729516943884786de4ae39fba0bbca"

python3 -m venv "$KLAR_ADAPTER_ROOT/convert-venv"
source "$KLAR_ADAPTER_ROOT/convert-venv/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r llama.cpp/requirements.txt
python -c "import gguf, torch; print('gguf and torch are importable')"
```

## Step 6 — convert both adapters

```sh
for slot in precision writer; do
  python "$KLAR_ADAPTER_ROOT/llama.cpp/convert_lora_to_gguf.py" \
    --base "$KLAR_ADAPTER_ROOT/base-config" \
    --outtype f16 \
    --outfile "$KLAR_ADAPTER_ROOT/gguf/${slot}-v1.gguf" \
    "$KLAR_ADAPTER_ROOT/extracted/$slot/adapter"
done
deactivate

ls -la "$KLAR_ADAPTER_ROOT/gguf"
for slot in precision writer; do
  shasum -a 256 "$KLAR_ADAPTER_ROOT/gguf/${slot}-v1.gguf"
done
```

Record both GGUF digests in your evidence. A conversion that prints a tensor
name warning has not succeeded; resolve it before continuing.

**Check it.** Both files exist and are non-empty:

```sh
test -s "$KLAR_ADAPTER_ROOT/gguf/precision-v1.gguf"
test -s "$KLAR_ADAPTER_ROOT/gguf/writer-v1.gguf"
echo "both adapters converted"
```

## Step 7 — start the reviewed runtime with both slots loaded

Slot order is the order of `--lora`, so Precision is id `0` and Writer is id
`1`. `--lora-init-without-apply` keeps both unapplied until a request selects
one, which is what makes a fair base comparison possible.

```sh
cd /Users/kumararpit/klar
KLAR_LLAMA_SERVER="$PWD/desktop/vendor/darwin-arm64/llama-server"
test -x "$KLAR_LLAMA_SERVER"

KLAR_API_KEY_FILE="$KLAR_ADAPTER_ROOT/ephemeral-api-key"
( umask 077; openssl rand -base64 32 | tr -d '\n' > "$KLAR_API_KEY_FILE" )
chmod 600 "$KLAR_API_KEY_FILE"
KLAR_API_KEY="$(cat "$KLAR_API_KEY_FILE")"

"$KLAR_LLAMA_SERVER" \
  --host 127.0.0.1 \
  --port 8080 \
  --model "$KLAR_V26_MODEL_FILE" \
  --alias klar-local \
  --ctx-size 8192 \
  --parallel 1 \
  --api-key-file "$KLAR_API_KEY_FILE" \
  --no-webui \
  --offline \
  --lora "$KLAR_ADAPTER_ROOT/gguf/precision-v1.gguf,$KLAR_ADAPTER_ROOT/gguf/writer-v1.gguf" \
  --lora-init-without-apply &
KLAR_LLAMA_PID=$!
echo "llama-server pid: $KLAR_LLAMA_PID"
```

Wait for it to report healthy:

```sh
until curl -sf -H "Authorization: Bearer $KLAR_API_KEY" \
  http://127.0.0.1:8080/health >/dev/null; do
  sleep 2
done
echo "runtime is healthy"
```

## Step 8 — make the same request three ways

The only difference between these three calls is the `lora` field. Anything else
would make the comparison meaningless.

```sh
for arm in base precision writer; do
  case "$arm" in
    base)      lora='[]' ;;
    precision) lora='[{"id": 0, "scale": 1.0}]' ;;
    writer)    lora='[{"id": 1, "scale": 1.0}]' ;;
  esac
  echo "--- $arm ---"
  curl -s http://127.0.0.1:8080/v1/chat/completions \
    -H "Authorization: Bearer $KLAR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d "{
      \"model\": \"klar-local\",
      \"messages\": [
        {\"role\": \"system\", \"content\": \"Answer only with the requested JSON object.\"},
        {\"role\": \"user\", \"content\": \"Return the normalized job title and occupation family for: Werkstudent Datenanalyse (m/w/d).\"}
      ],
      \"temperature\": 0,
      \"max_tokens\": 256,
      \"lora\": $lora,
      \"response_format\": {
        \"type\": \"json_object\",
        \"schema\": {
          \"type\": \"object\",
          \"additionalProperties\": false,
          \"required\": [\"normalizedTitle\", \"occupationFamily\"],
          \"properties\": {
            \"normalizedTitle\": {\"type\": \"string\"},
            \"occupationFamily\": {\"type\": \"string\"}
          }
        }
      }
    }" | tee "$KLAR_ADAPTER_ROOT/held-out-$arm.json"
  echo
done
```

Use `json_object` with an inline `schema`. A live interoperability check found
that the superficially plausible `json_schema` type did not constrain this model
reliably and could return the wrong keys inside a Markdown fence.

## Step 9 — re-run the full benchmark for all three arms

The benchmark reads the adapter paths from the environment and reports each arm
separately, so this is the measurement that belongs in your evidence.

```sh
cd /Users/kumararpit/klar
KLAR_BENCH_RUNTIME_PATH="$KLAR_LLAMA_SERVER" \
KLAR_BENCH_MODEL_PATH="$KLAR_V26_MODEL_FILE" \
KLAR_BENCH_PRECISION_ADAPTER_PATH="$KLAR_ADAPTER_ROOT/gguf/precision-v1.gguf" \
KLAR_BENCH_WRITER_ADAPTER_PATH="$KLAR_ADAPTER_ROOT/gguf/writer-v1.gguf" \
npx tsx model/benchmarks/run.ts \
  --output "$KLAR_ADAPTER_ROOT/klar-v26-model-benchmark-adapters.json" \
  --hash-artifacts \
  --include-outputs \
  --crash-recovery
```

Exit code `0` means every required case passed, `1` is an honest failure, `2`
is a hold, and `64` is invalid configuration. Record the exit code with the
report; a non-zero code is the result, not a reason to rerun until it passes.

## Step 10 — record what you measured, then stop the runtime

For each arm record valid-output rate, evidence fidelity, German and English
quality, time to first token, total latency, peak resident memory and thermal
behaviour. Abort one in-flight request and terminate the server once, to prove
cancellation and crash recovery, before any package is signed.

```sh
kill "$KLAR_LLAMA_PID"
wait "$KLAR_LLAMA_PID" 2>/dev/null || true
pgrep -f llama-server || echo "no residual llama-server process"
rm -f "$KLAR_API_KEY_FILE"
```

Kill only the exact recorded process id. Never kill a broad process-name
pattern on a machine you share with other work.

---

The runtime flags and the per-request `lora` field match the pinned llama.cpp
server interface. Re-review this whole document whenever the runtime commit
changes. Two converted adapters are a feasibility result, not quality evidence:
the ranking and writing human gates still decide whether local intelligence may
graduate.