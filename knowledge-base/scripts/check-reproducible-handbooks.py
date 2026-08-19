#!/usr/bin/env python3
"""Build the controlled handbooks twice and require byte-identical output."""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_ROOT = ROOT / "output" / "pdf"
EXPORTER = ROOT / "scripts" / "export-handbooks.py"
EXPECTED_NAMES = {
    "klar-kb-product-user-v2.6.1.pdf",
    "klar-kb-engineering-architecture-v2.6.1.pdf",
    "klar-kb-assurance-operations-v2.6.1.pdf",
}


def snapshot() -> dict[str, tuple[int, str]]:
    files = sorted(OUTPUT_ROOT.glob("klar-kb-*-v2.6.1.pdf"))
    names = {path.name for path in files}
    if names != EXPECTED_NAMES:
        missing = sorted(EXPECTED_NAMES - names)
        extra = sorted(names - EXPECTED_NAMES)
        raise RuntimeError(f"Unexpected handbook set; missing={missing}, extra={extra}")
    return {
        path.name: (path.stat().st_size, hashlib.sha256(path.read_bytes()).hexdigest())
        for path in files
    }


def build() -> dict[str, tuple[int, str]]:
    environment = os.environ.copy()
    environment["SOURCE_DATE_EPOCH"] = "1786406400"
    environment["PYTHONHASHSEED"] = "0"
    subprocess.run(
        [sys.executable, str(EXPORTER), "--generated-on", "2026-08-11"],
        cwd=ROOT,
        env=environment,
        check=True,
    )
    return snapshot()


def main() -> None:
    first = build()
    second = build()
    if first != second:
        changed = sorted(name for name in EXPECTED_NAMES if first.get(name) != second.get(name))
        raise RuntimeError(f"Handbook bytes changed across identical builds: {changed}")
    for name, (size, digest) in sorted(second.items()):
        print(f"Reproducible {name}: {size} bytes, sha256={digest}")


if __name__ == "__main__":
    main()
