#!/usr/bin/env python3
"""Logical verification for generated Klar knowledge-base handbooks."""

from __future__ import annotations

import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_ROOT = ROOT / "output" / "pdf"
PUBLIC_ROOT = ROOT / "public" / "downloads"
RELEASE = "2.6.1"
EXPECTED = {
    f"klar-kb-product-user-v{RELEASE}.pdf": ("Product and User Handbook", 57),
    f"klar-kb-engineering-architecture-v{RELEASE}.pdf": ("Engineering and Architecture Handbook", 62),
    f"klar-kb-assurance-operations-v{RELEASE}.pdf": ("Security, Operations, and Governance Handbook", 62),
}
RETIRED_RESUME = re.compile(r"r(?:\u00e9|e\u0301)sum(?:\u00e9|e\u0301)", re.IGNORECASE)


for filename, (title, expected_pages) in EXPECTED.items():
    target = OUTPUT_ROOT / filename
    if not target.is_file() or target.stat().st_size < 20_000:
        raise SystemExit(f"Missing or unexpectedly small handbook: {target}")
    reader = PdfReader(target)
    if reader.is_encrypted:
        raise SystemExit(f"Unexpected encrypted PDF: {target}")
    if len(reader.pages) != expected_pages:
        raise SystemExit(f"Unexpected page count in {target}: {len(reader.pages)} != {expected_pages}")
    metadata_title = str((reader.metadata or {}).get("/Title", ""))
    if title not in metadata_title:
        raise SystemExit(f"Incorrect PDF title metadata in {target}: {metadata_title}")
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    cover_text = re.sub(r"\s+", " ", reader.pages[0].extract_text() or "").upper()
    for required in (title, RELEASE, "Controlled snapshot", "KB content hash"):
        if required not in text:
            raise SystemExit(f"Missing '{required}' in {target}")
    if not re.search(r"CLASSIFICATION\s+PUBLIC", cover_text):
        raise SystemExit(f"Cover is not classified PUBLIC in {target}")
    if re.search(r"CLASSIFICATION\s+INTERNAL", cover_text):
        raise SystemExit(f"Internal cover classification found in public handbook: {target}")
    if RETIRED_RESUME.search(text):
        raise SystemExit(f"Retired accented Resume spelling found in {target}")
    if str(reader.trailer["/Root"].get("/Lang", "")) != "en":
        raise SystemExit(f"Missing PDF document language in {target}")
    for page_number, page in enumerate(reader.pages, start=1):
        page_text = re.sub(r"\s+", " ", page.extract_text() or "")
        meaningful = re.sub(r"Klar Knowledge Base.*?PUBLIC", "", page_text)
        meaningful = re.sub(r"Controlled snapshot.*?Page \d+", "", meaningful)
        if len(meaningful.strip()) < 20:
            raise SystemExit(f"Blank or header-only page {page_number} in {target}")
        for annotation_ref in page.get("/Annots", []):
            annotation = annotation_ref.get_object()
            uri = annotation.get("/A", {}).get("/URI")
            if uri and not str(uri).startswith(("https://", "http://", "mailto:")):
                raise SystemExit(f"Non-absolute PDF link on page {page_number} in {target}: {uri}")
    public_copy = PUBLIC_ROOT / filename
    if not public_copy.is_file() or public_copy.read_bytes() != target.read_bytes():
        raise SystemExit(f"Published download does not byte-match the verified handbook: {public_copy}")
    print(f"Verified {target.name}: {len(reader.pages)} pages, {target.stat().st_size} bytes")
