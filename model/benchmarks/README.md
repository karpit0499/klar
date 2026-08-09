# Klar v2.6 local-model benchmark

This harness produces evidence; it does not turn missing work into a green
check. It exercises six synthetic tasks in English and German:

| Task | Local base | Precision adapter | Writer adapter | Groq comparison | Deterministic |
| --- | --- | --- | --- | --- | --- |
| Job extraction | required | required | — | optional | — |
| Evidence linking | required | required | — | optional | — |
| Normalization | required | — | — | optional | required |
| Resume expression | required | — | required | optional | — |
| Cover letter | required | — | required | optional | — |
| Recruiter message | required | — | required | optional | — |

Every generated response must be one directly parseable JSON object. A Markdown
fence is a failure. The fixture validator checks the exact shape, exact
required/preferred skill membership, exact unique requirement-to-evidence
mapping (including required `null` mappings), required evidence IDs, unknown
evidence IDs and selected unsupported claims. Finding the expected words or IDs
somewhere else in the JSON cannot satisfy those structured checks. This is a
controlled engineering check, not a substitute for the release-blocking
bilingual human review.

## What the report measures

- streaming time to first non-empty token and total response time;
- structured-output and fixture-grounding validity;
- prompt, completion and total token counts when the server reports them;
- peak resident memory for an owned server, or an external server whose PID was
  explicitly supplied;
- base-model, adapter and runtime byte counts, with optional SHA-256 hashing;
- macOS thermal-pressure samples through the built-in `pmset` command; other
  platforms receive an explicit `unsupported` marker;
- hardware architecture, CPU, logical-core count, memory and Klar's memory tier;
- the source commit, whether that source tree had uncommitted changes, and owned
  runtime warm-up time;
- a real in-flight cancellation check and post-cancellation health check;
- an opt-in crash/restart check only for a process created by this harness.

`summary.localModelMetrics` is deliberately scoped to executed `local-*` cases
only. Its rates use every local `pass`/`fail` case as the denominator, so a
generation failure cannot disappear from structured-output or grounding rates.
Latency percentiles and peak RSS use the available measurements from that same
local executed set. Deterministic normalization rows, optional Groq rows, and
unexecuted `hold`/`not_run` rows never enter these metrics.

The report never stores an API key or full artifact path. Complete generated
outputs are omitted by default. `--include-outputs` is safe for the committed
synthetic fixtures, but should stay off if the fixtures are ever replaced with
private material.

## Preferred genuine local run

Use the exact verified runtime and model paths. Adapter variables are optional,
but leaving them out deliberately creates release `hold` rows for the Precision
and Writer experiments.

```sh
KLAR_BENCH_RUNTIME_PATH="/verified/llama-server" \
KLAR_BENCH_MODEL_PATH="/verified/qwen3.5-9b-q4_k_m.gguf" \
KLAR_BENCH_PRECISION_ADAPTER_PATH="/verified/precision-v1.gguf" \
KLAR_BENCH_WRITER_ADAPTER_PATH="/verified/writer-v1.gguf" \
npx tsx model/benchmarks/run.ts \
  --output "/absolute/path/klar-v26-model-benchmark.json" \
  --hash-artifacts \
  --include-outputs \
  --crash-recovery
```

The harness binds only to `127.0.0.1`, creates an ephemeral API key, uses
`--offline`, streams each test one at a time, kills only the child process it
created for the crash check, restarts it, and cleans up the temporary key.

## Connect to an existing local server

This mode can measure generation and cancellation. RSS is measured only when a
PID is supplied. Crash recovery is always `not_run`, because the harness refuses
to kill a process it does not own.

```sh
KLAR_BENCH_LOCAL_URL="http://127.0.0.1:8080" \
KLAR_BENCH_LOCAL_API_KEY="read-from-your-local-secret-store" \
KLAR_BENCH_LOCAL_PID="12345" \
npx tsx model/benchmarks/run.ts \
  --output "/absolute/path/klar-v26-model-benchmark.json"
```

An external Precision or Writer adapter is considered available only when its
loaded llama.cpp LoRA index is explicit:

```sh
KLAR_BENCH_PRECISION_LORA_ID="0" \
KLAR_BENCH_WRITER_LORA_ID="1"
```

## Optional Groq comparison

If `GROQ_API_KEY` is absent, all Groq rows are recorded as optional `not_run`
with `missing_credentials`. No request is attempted and no result is invented.
If a key is present, the default comparison model is
`openai/gpt-oss-120b`; override it with `KLAR_BENCH_GROQ_MODEL`.
Cloud usage may incur charges under the account's current plan, so it is never a
required local-experiment gate.

## Interpreting status

- `pass`: the request ran and all machine-checkable fixture assertions passed.
- `fail`: a configured request or required probe ran and failed.
- `hold`: a required model, adapter, runtime or other prerequisite is absent.
- `not_run`: the case was intentionally skipped, such as missing optional Groq
  credentials or a crash check against a server the harness does not own.

Exit code `0` means all required evidence passed, `1` means at least one
required failure, `2` means required evidence remains on hold/not-run, and `64`
means the command or configuration is invalid.

The canonical machine-readable contract is
`model/schemas/benchmark-report.schema.json`. Generated JSON reports belong in
a controlled release-evidence location, not in source control.