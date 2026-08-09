#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const output = path.join(here, 'klar_qwen35_adapter_kaggle.ipynb')
let nextCellId = 1

function lines(source) {
  const normalized = source.replace(/^\n/, '').replace(/\s+$/, '')
  return normalized.split('\n').map((line) => `${line}\n`)
}

function markdown(source) {
  return {
    cell_type: 'markdown',
    id: `klar-${String(nextCellId++).padStart(2, '0')}`,
    metadata: {},
    source: lines(source),
  }
}

function code(source) {
  return {
    cell_type: 'code',
    execution_count: null,
    id: `klar-${String(nextCellId++).padStart(2, '0')}`,
    metadata: {},
    outputs: [],
    source: lines(source),
  }
}

const notebook = {
  cells: [
    markdown(`
# Klar v2.6 — auditable Qwen3.5-9B adapter feasibility run

This Kaggle notebook runs one tiny, synthetic, text-only LoRA experiment for
either the **Precision** or **Writer** slot. It is an engineering proof, not a
quality claim and not a production training recipe.

The built-in records are authored synthetic fixtures. They contain no
production résumé, application, recruiter-message, user-note, diagnostic or
cloud-provider content. The held-out fixtures are never passed to training.

Before running: enable a Kaggle **T4** GPU and internet access. In the setup
cell, leave **ADAPTER_SLOT = "precision"** for the first run. Then restart the
session, change it to **"writer"**, and run all cells again. Keep the two output
archives separate. The model, dataset and Python dependencies are pinned and
the run is seeded, but Kaggle's base image and GPU can change.
The provenance file records the observed environment; do not claim bit-for-bit
reproducibility across different Kaggle sessions.
`),
    code(`
# Fail before downloading the model if Kaggle's managed image is too old for
# the pinned Qwen3.5/Transformers stack. This was checked against Kaggle GPU
# image v170 (PyTorch 2.10.0 + torchvision 0.25.0) on 2026-07-31.
from packaging.version import Version
import torch
import torchvision

torch_version = Version(torch.__version__.split("+")[0])
if torch_version < Version("2.10.0"):
    raise RuntimeError(
        f"PyTorch {torch.__version__} is too old. In Kaggle, choose the current "
        "notebook image, restart the session, and run again. Do not replace "
        "Kaggle's CUDA-enabled PyTorch with an arbitrary CPU wheel."
    )

if not torch.cuda.is_available():
    raise RuntimeError("Enable a GPU in Kaggle notebook settings, then restart the session.")

compute_capability = torch.cuda.get_device_capability(0)
if compute_capability < (7, 0):
    raise RuntimeError(
        f"GPU compute capability {compute_capability} is too old for the pinned "
        "CUDA 12.8/bitsandbytes stack. Choose an Nvidia T4 (not P100) in "
        "Kaggle notebook settings, restart the session, and run again."
    )

print({
    "kaggle_torch": torch.__version__,
    "kaggle_torchvision": torchvision.__version__,
    "gpu": torch.cuda.get_device_name(0),
    "compute_capability": compute_capability,
})
`),
    code(`
# Reproducible dependency snapshot captured 2026-07-31.
# Qwen3.5 requires a current Transformers build, so Git dependencies are pinned
# to immutable commits instead of a moving main branch.
%pip install -q --disable-pip-version-check \\
  "transformers @ git+https://github.com/huggingface/transformers.git@71c6f699ac9b3f8fc42a6a3e9dc59034c349a678" \\
  "peft @ git+https://github.com/huggingface/peft.git@9f1fe21d8131a24634d6d23c13efa2aae72b6cca" \\
  "trl @ git+https://github.com/huggingface/trl.git@922dc584664d87482935e1fa7d958930fc5223cf" \\
  bitsandbytes==0.50.0 datasets==5.0.1 accelerate==1.14.0 safetensors==0.8.0
`),
    code(`
import hashlib
import inspect
import json
import os
import platform
import random
import shutil
import subprocess
import zipfile
from pathlib import Path

import numpy as np
import torch
import accelerate
import bitsandbytes
import datasets
import peft
import safetensors
import transformers
import trl
from datasets import Dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    set_seed,
)
from trl import SFTConfig, SFTTrainer

DEPENDENCY_REVISIONS = {
    "transformers": "71c6f699ac9b3f8fc42a6a3e9dc59034c349a678",
    "peft": "9f1fe21d8131a24634d6d23c13efa2aae72b6cca",
    "trl": "922dc584664d87482935e1fa7d958930fc5223cf",
}

required_sft_config = {
    "max_length", "completion_only_loss", "full_determinism",
    "eval_strategy", "gradient_checkpointing",
}
required_sft_trainer = {
    "model", "args", "train_dataset", "processing_class",
}
missing_config = required_sft_config - set(inspect.signature(SFTConfig).parameters)
missing_trainer = required_sft_trainer - set(inspect.signature(SFTTrainer).parameters)
if missing_config or missing_trainer:
    raise RuntimeError({
        "missing_sft_config_parameters": sorted(missing_config),
        "missing_sft_trainer_parameters": sorted(missing_trainer),
    })

cuda_probe = (torch.ones(1, device="cuda") * 2).item()
torch.cuda.synchronize()
if cuda_probe != 2:
    raise RuntimeError("The Kaggle GPU failed a real CUDA tensor operation.")

SEED = 260731
BASE_MODEL = "Qwen/Qwen3.5-9B"
BASE_REVISION = "c202236235762e1c871ad0ccb60c8ee5ba337b9a"
# Beginner-visible experiment switch. Use "precision" for the first clean
# session, then "writer" in a newly restarted session.
ADAPTER_SLOT = "precision"
if ADAPTER_SLOT not in {"precision", "writer"}:
    raise ValueError('ADAPTER_SLOT must be "precision" or "writer"')

OUTPUT_DIR = Path("/kaggle/working") / f"klar-{ADAPTER_SLOT}-adapter-v1"
MAX_LENGTH = 1024
MAX_STEPS = 12

os.environ["TOKENIZERS_PARALLELISM"] = "false"
if OUTPUT_DIR.exists():
    shutil.rmtree(OUTPUT_DIR)
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)
torch.cuda.manual_seed_all(SEED)
set_seed(SEED)
torch.backends.cuda.matmul.allow_tf32 = False
torch.backends.cudnn.allow_tf32 = False
torch.backends.cudnn.benchmark = False
torch.backends.cudnn.deterministic = True

if not torch.cuda.is_available():
    raise RuntimeError("This feasibility notebook requires a Kaggle GPU.")

print({
    "slot": ADAPTER_SLOT,
    "gpu": torch.cuda.get_device_name(0),
    "compute_capability": torch.cuda.get_device_capability(0),
    "cuda_runtime": torch.version.cuda,
    "torch": torch.__version__,
    "transformers": transformers.__version__,
    "peft": peft.__version__,
    "trl": trl.__version__,
    "bitsandbytes": bitsandbytes.__version__,
    "datasets": datasets.__version__,
    "accelerate": accelerate.__version__,
    "safetensors": safetensors.__version__,
    "base_model": BASE_MODEL,
    "base_revision": BASE_REVISION,
    "seed": SEED,
})
`),
    markdown(`
## Frozen synthetic fixtures

Precision examples exercise extraction and evidence linking. Writer examples
exercise short recruiter messages, grounded cover-letter language and résumé
bullet revision in German and English. Every desired answer is constrained to
facts stated in the input.
`),
    code(`
FIXTURES = [
    {
        "id": "precision-en-01", "slot": "precision", "split": "train",
        "language": "en",
        "system": "Extract only explicit job requirements. Return compact JSON.",
        "user": "Data Analyst. Required: SQL and Power BI. German B2 is preferred. Hybrid in Berlin.",
        "assistant": '{"required_skills":["SQL","Power BI"],"preferred_languages":["German B2"],"work_mode":"hybrid","city":"Berlin"}',
    },
    {
        "id": "precision-de-01", "slot": "precision", "split": "train",
        "language": "de",
        "system": "Extrahiere nur ausdrücklich genannte Anforderungen als kompaktes JSON.",
        "user": "Für die Stelle als Produktionsplaner sind SAP PP und Deutsch C1 erforderlich. Erfahrung mit Lean ist wünschenswert.",
        "assistant": '{"required_skills":["SAP PP"],"required_languages":["Deutsch C1"],"preferred_skills":["Lean"]}',
    },
    {
        "id": "precision-en-02", "slot": "precision", "split": "train",
        "language": "en",
        "system": "Link requirements only to quoted candidate evidence. Use null when unsupported.",
        "user": "Requirement: lifecycle email automation. Evidence: Managed weekly Mailchimp campaigns and audience segments. Requirement: Salesforce Marketing Cloud.",
        "assistant": '{"links":[{"requirement":"lifecycle email automation","evidence":"Managed weekly Mailchimp campaigns and audience segments."},{"requirement":"Salesforce Marketing Cloud","evidence":null}]}',
    },
    {
        "id": "precision-de-02", "slot": "precision", "split": "train",
        "language": "de",
        "system": "Verknüpfe Anforderungen nur mit wörtlich vorhandenen Nachweisen.",
        "user": "Anforderung: Lieferantenmanagement. Nachweis: Koordinierte drei lokale Lieferanten für ein Hochschulprojekt. Anforderung: Six Sigma Zertifikat.",
        "assistant": '{"links":[{"requirement":"Lieferantenmanagement","evidence":"Koordinierte drei lokale Lieferanten für ein Hochschulprojekt."},{"requirement":"Six Sigma Zertifikat","evidence":null}]}',
    },
    {
        "id": "precision-en-03", "slot": "precision", "split": "train",
        "language": "en",
        "system": "Classify explicit constraints without guessing.",
        "user": "The role is a 20-hour working-student contract. Candidates must be enrolled and available on Tuesdays.",
        "assistant": '{"employment":"working_student","hours_per_week":20,"required_enrollment":true,"required_days":["Tuesday"]}',
    },
    {
        "id": "precision-de-03", "slot": "precision", "split": "train",
        "language": "de",
        "system": "Klassifiziere ausdrücklich genannte Bedingungen ohne Vermutungen.",
        "user": "Die Tätigkeit ist vor Ort in Ulm. Ein Führerschein Klasse B ist zwingend. Reisebereitschaft wird nicht erwähnt.",
        "assistant": '{"work_mode":"on_site","city":"Ulm","required_credentials":["Führerschein Klasse B"],"travel_required":null}',
    },
    {
        "id": "precision-en-eval", "slot": "precision", "split": "eval",
        "language": "en",
        "system": "Extract only explicit requirements. Return compact JSON.",
        "user": "CRM Specialist. HubSpot is required; SQL is a plus. Remote within Germany. English C1.",
        "assistant": '{"required_skills":["HubSpot"],"preferred_skills":["SQL"],"work_mode":"remote_germany","required_languages":["English C1"]}',
    },
    {
        "id": "precision-de-eval", "slot": "precision", "split": "eval",
        "language": "de",
        "system": "Extrahiere nur ausdrücklich genannte Anforderungen als kompaktes JSON.",
        "user": "Gesucht wird ein Junior Controller mit Excel. Power BI ist von Vorteil. Arbeitsort ist Köln, zwei Homeoffice-Tage sind möglich.",
        "assistant": '{"seniority":"junior","required_skills":["Excel"],"preferred_skills":["Power BI"],"city":"Köln","remote_days_per_week":2}',
    },
    {
        "id": "writer-en-01", "slot": "writer", "split": "train",
        "language": "en",
        "system": "Write a concise recruiter message using only supplied facts.",
        "user": "Role: Junior Data Analyst at Northstar. Candidate evidence: built Power BI dashboards in a university project; uses SQL in coursework. Ask for a short conversation.",
        "assistant": "Hello Northstar team, I am interested in the Junior Data Analyst role. I built Power BI dashboards for a university project and use SQL in my coursework. Would you be open to a short conversation about the position? Best regards",
    },
    {
        "id": "writer-de-01", "slot": "writer", "split": "train",
        "language": "de",
        "system": "Schreibe eine kurze Recruiter-Nachricht nur mit den gelieferten Fakten.",
        "user": "Rolle: CRM Specialist bei Nordlicht. Nachweis: zwei Jahre Mailchimp-Kampagnen und Zielgruppensegmentierung. Bitte um ein kurzes Gespräch.",
        "assistant": "Guten Tag liebes Nordlicht-Team, die Position als CRM Specialist interessiert mich sehr. Ich bringe zwei Jahre Erfahrung mit Mailchimp-Kampagnen und Zielgruppensegmentierung mit. Hätten Sie Zeit für ein kurzes Gespräch? Freundliche Grüße",
    },
    {
        "id": "writer-en-02", "slot": "writer", "split": "train",
        "language": "en",
        "system": "Revise one résumé bullet. Preserve facts and do not add metrics.",
        "user": "Original: Helped the team with weekly sales reports. Evidence: Prepared weekly Excel reports and checked missing values.",
        "assistant": "Prepared weekly Excel sales reports and checked source data for missing values.",
    },
    {
        "id": "writer-de-02", "slot": "writer", "split": "train",
        "language": "de",
        "system": "Überarbeite einen Lebenslauf-Stichpunkt. Erhalte alle Fakten und erfinde keine Kennzahlen.",
        "user": "Original: Unterstützung bei der Produktionsplanung. Nachweis: Pflege von SAP-PP-Auftragsdaten und Abstimmung mit der Fertigung.",
        "assistant": "Pflegte SAP-PP-Auftragsdaten und stimmte Planungsänderungen mit der Fertigung ab.",
    },
    {
        "id": "writer-en-03", "slot": "writer", "split": "train",
        "language": "en",
        "system": "Write one grounded cover-letter paragraph with a natural tone.",
        "user": "Role: Marketing Analyst. Company: Birch. Evidence: Google Analytics coursework, an A/B testing project, and Excel campaign reports. Do not claim employment experience.",
        "assistant": "I am drawn to Birch's Marketing Analyst role because it combines measurement with practical campaign decisions. Through Google Analytics coursework, an A/B testing project, and Excel campaign reporting, I have built a solid foundation that I would be keen to apply and deepen in your team.",
    },
    {
        "id": "writer-de-03", "slot": "writer", "split": "train",
        "language": "de",
        "system": "Schreibe einen belegbaren Anschreiben-Absatz in natürlichem Ton.",
        "user": "Rolle: Junior Produktionsplaner. Unternehmen: Werkblick. Nachweis: Hochschulprojekt zur Kapazitätsplanung, SAP-PP-Grundkenntnisse. Keine Berufserfahrung behaupten.",
        "assistant": "Die Position als Junior Produktionsplaner bei Werkblick spricht mich an, weil sie analytische Planung mit enger Abstimmung in der Fertigung verbindet. In einem Hochschulprojekt zur Kapazitätsplanung und durch meine SAP-PP-Grundkenntnisse habe ich dafür eine solide Grundlage aufgebaut, die ich in Ihrem Team weiterentwickeln möchte.",
    },
    {
        "id": "writer-en-eval", "slot": "writer", "split": "eval",
        "language": "en",
        "system": "Write a concise recruiter message using only supplied facts.",
        "user": "Role: Working Student BI at Elm. Evidence: Power BI dashboard project and Excel. Ask whether applications are still being reviewed.",
        "assistant": "Hello Elm team, I am interested in the Working Student BI role. I have completed a Power BI dashboard project and work with Excel. Are applications for the role still being reviewed? Best regards",
    },
    {
        "id": "writer-de-eval", "slot": "writer", "split": "eval",
        "language": "de",
        "system": "Überarbeite einen Lebenslauf-Stichpunkt. Erhalte alle Fakten und erfinde keine Kennzahlen.",
        "user": "Original: Newsletter gemacht. Nachweis: Monatliche Newsletter in Mailchimp erstellt und Links vor Versand geprüft.",
        "assistant": "Erstellte monatliche Newsletter in Mailchimp und prüfte sämtliche Links vor dem Versand.",
    },
]

selected = [row for row in FIXTURES if row["slot"] == ADAPTER_SLOT]
train_rows = [row for row in selected if row["split"] == "train"]
eval_rows = [row for row in selected if row["split"] == "eval"]
assert train_rows and eval_rows
assert not ({row["id"] for row in train_rows} & {row["id"] for row in eval_rows})

def canonical_hash(value):
    encoded = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()

DATASET_SHA256 = canonical_hash(selected)
print({
    "train_examples": len(train_rows),
    "held_out_examples": len(eval_rows),
    "dataset_sha256": DATASET_SHA256,
})
`),
    code(`
compute_dtype = (
    torch.bfloat16
    if torch.cuda.is_bf16_supported()
    else torch.float16
)
quantization = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_use_double_quant=True,
    bnb_4bit_compute_dtype=compute_dtype,
)

tokenizer = AutoTokenizer.from_pretrained(
    BASE_MODEL,
    revision=BASE_REVISION,
)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    revision=BASE_REVISION,
    quantization_config=quantization,
    torch_dtype=compute_dtype,
    device_map="auto",
)
model.config.use_cache = False
model = prepare_model_for_kbit_training(
    model,
    use_gradient_checkpointing=True,
)

lora_config = LoraConfig(
    r=8,
    lora_alpha=16,
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
`),
    code(`
def training_record(example):
    return {
        "prompt": [
            {"role": "system", "content": example["system"]},
            {"role": "user", "content": example["user"]},
        ],
        "completion": [
            {"role": "assistant", "content": example["assistant"]},
        ],
        "chat_template_kwargs": {"enable_thinking": False},
    }

train_dataset = Dataset.from_list([training_record(row) for row in train_rows])

training_args = SFTConfig(
    output_dir=str(OUTPUT_DIR / "checkpoints"),
    max_length=MAX_LENGTH,
    packing=False,
    max_steps=MAX_STEPS,
    per_device_train_batch_size=1,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    warmup_ratio=0.1,
    lr_scheduler_type="cosine",
    optim="paged_adamw_8bit",
    logging_steps=1,
    save_strategy="no",
    eval_strategy="no",
    report_to="none",
    gradient_checkpointing=True,
    completion_only_loss=True,
    full_determinism=True,
    bf16=(compute_dtype == torch.bfloat16),
    fp16=(compute_dtype == torch.float16),
    seed=SEED,
    data_seed=SEED,
)

trainer = SFTTrainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    processing_class=tokenizer,
)
train_result = trainer.train()
print(train_result.metrics)
`),
    markdown(`
## Held-out smoke check

The following cell generates against the two excluded fixtures. It records raw
outputs for human and deterministic schema/fidelity review; it does not turn
string similarity into a product-quality claim.
`),
    code(`
model.config.use_cache = True
model.eval()
held_out_results = []

for row in eval_rows:
    prompt = tokenizer.apply_chat_template(
        [
            {"role": "system", "content": row["system"]},
            {"role": "user", "content": row["user"]},
        ],
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=False,
    )
    inputs = tokenizer(
        [prompt],
        return_tensors="pt",
        padding=True,
    ).to(model.device)
    with torch.inference_mode():
        generated = model.generate(
            **inputs,
            max_new_tokens=256,
            do_sample=False,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    new_tokens = generated[0, inputs["input_ids"].shape[-1]:]
    output_text = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
    held_out_results.append({
        "id": row["id"],
        "expected": row["assistant"],
        "generated": output_text,
    })

print(json.dumps(held_out_results, ensure_ascii=False, indent=2))
`),
    code(`
adapter_dir = OUTPUT_DIR / "adapter"
adapter_dir.mkdir(parents=True, exist_ok=True)
model.save_pretrained(adapter_dir, safe_serialization=True)
tokenizer.save_pretrained(adapter_dir)

def file_sha256(file_path):
    digest = hashlib.sha256()
    with open(file_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

artifact_files = []
for file_path in sorted(path for path in adapter_dir.rglob("*") if path.is_file()):
    artifact_files.append({
        "path": file_path.relative_to(OUTPUT_DIR).as_posix(),
        "bytes": file_path.stat().st_size,
        "sha256": file_sha256(file_path),
    })

provenance = {
    "schemaVersion": 1,
    "experiment": "klar-qwen35-adapter-feasibility-v1",
    "adapterSlot": ADAPTER_SLOT,
    "baseModel": BASE_MODEL,
    "baseRevision": BASE_REVISION,
    "dependencyRevisions": DEPENDENCY_REVISIONS,
    "seed": SEED,
    "datasetSha256": DATASET_SHA256,
    "trainExampleIds": [row["id"] for row in train_rows],
    "heldOutExampleIds": [row["id"] for row in eval_rows],
    "maxSteps": MAX_STEPS,
    "maxLength": MAX_LENGTH,
    "lora": {
        "r": 8,
        "alpha": 16,
        "dropout": 0.05,
        "targetModules": sorted(lora_config.target_modules),
    },
    "environment": {
        "python": platform.python_version(),
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
        "gpu": torch.cuda.get_device_name(0),
        "computeCapability": list(torch.cuda.get_device_capability(0)),
        "transformers": transformers.__version__,
        "peft": peft.__version__,
        "trl": trl.__version__,
        "bitsandbytes": bitsandbytes.__version__,
        "datasets": datasets.__version__,
        "accelerate": accelerate.__version__,
        "safetensors": safetensors.__version__,
        "nvidiaSmi": subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"],
            text=True,
        ).strip(),
        "pipFreeze": subprocess.check_output(
            ["python", "-m", "pip", "freeze"], text=True
        ).splitlines(),
    },
    "files": artifact_files,
    "heldOutResults": held_out_results,
}

with open(OUTPUT_DIR / "provenance.json", "w", encoding="utf-8") as handle:
    json.dump(provenance, handle, ensure_ascii=False, indent=2, sort_keys=True)
    handle.write("\\n")

archive = Path("/kaggle/working") / f"klar-{ADAPTER_SLOT}-adapter-v1.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
    for file_path in sorted(path for path in OUTPUT_DIR.rglob("*") if path.is_file()):
        archive_path = file_path.relative_to(OUTPUT_DIR.parent).as_posix()
        info = zipfile.ZipInfo(archive_path, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        bundle.writestr(info, file_path.read_bytes())
print({
    "archive": str(archive),
    "archive_sha256": file_sha256(archive),
    "adapter_files": artifact_files,
})
`),
    markdown(`
## Graduation gate

Download the ZIP and verify its printed SHA-256 before conversion. Convert the
PEFT adapter with the pinned llama.cpp commit documented in LOCAL_LOAD.md, then
load it beside the separately verified Q4_K_M candidate package. Do not promote
either slot on this smoke run alone. Compare base, Precision, Writer, cloud and
deterministic baselines on the frozen multilingual evaluation harness first.
`),
  ],
  metadata: {
    accelerator: 'GPU',
    kaggle: {
      accelerator: 'gpu',
      dataSources: [],
      dockerImageVersionId: null,
      isGpuEnabled: true,
      isInternetEnabled: true,
      language: 'python',
      sourceType: 'notebook',
    },
    kernelspec: {
      display_name: 'Python 3',
      language: 'python',
      name: 'python3',
    },
    language_info: {
      name: 'python',
      version: '3',
    },
  },
  nbformat: 4,
  nbformat_minor: 5,
}

const serialized = `${JSON.stringify(notebook, null, 1)}\n`
if (process.argv.includes('--check')) {
  const existing = await readFile(output, 'utf8').catch(() => '')
  if (existing !== serialized) {
    throw new Error(
      'The committed Kaggle notebook is stale. Run this generator without --check.',
    )
  }
  console.log(`Verified ${output}`)
} else {
  await writeFile(output, serialized, 'utf8')
  console.log(output)
}