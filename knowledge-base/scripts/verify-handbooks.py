#!/usr/bin/env python3
"""Logical verification for generated Klar knowledge-base handbooks."""

from __future__ import annotations

import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_ROOT = ROOT / "output" / "pdf"
EXPECTED = {
    "klar-kb-product-user-v2.6.0.1.pdf": "Product and User Handbook",
    "klar-kb-engineering-architecture-v2.6.0.1.pdf": "Engineering and Architecture Handbook",
    "klar-kb-assurance-operations-v2.6.0.1.pdf": "Security, Operations, and Governance Handbook",
}
RETIRED_RESUME = re.compile(r"r(?:\u00e9|e\u0301)sum(?:\u00e9|e\u0301)", re.IGNORECASE)


for filename, title in EXPECTED.items():
    target = OUTPUT_ROOT / filename
    if not target.is_file() or target.stat().st_size < 20_000:
        raise SystemExit(f"Missing or unexpectedly small handbook: {target}")
    reader = PdfReader(target)
    if reader.is_encrypted:
        raise SystemExit(f"Unexpected encrypted PDF: {target}")
    if len(reader.pages) < 4:
        raise SystemExit(f"Unexpectedly short handbook: {target}")
    metadata_title = str((reader.metadata or {}).get("/Title", ""))
    if title not in metadata_title:
        raise SystemExit(f"Incorrect PDF title metadata in {target}: {metadata_title}")
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    cover_text = re.sub(r"\s+", " ", reader.pages[0].extract_text() or "").upper()
    for required in (title, "2.6.0.1", "Controlled snapshot", "KB content hash"):
        if required not in text:
            raise SystemExit(f"Missing '{required}' in {target}")
    if not re.search(r"CLASSIFICATION\s+PUBLIC", cover_text):
        raise SystemExit(f"Cover is not classified PUBLIC in {target}")
    if re.search(r"CLASSIFICATION\s+INTERNAL", cover_text):
        raise SystemExit(f"Internal cover classification found in public handbook: {target}")
    if RETIRED_RESUME.search(text):
        raise SystemExit(f"Retired accented Resume spelling found in {target}")
    print(f"Verified {target.name}: {len(reader.pages)} pages, {target.stat().st_size} bytes")
