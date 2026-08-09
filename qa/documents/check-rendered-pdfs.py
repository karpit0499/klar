#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from pypdf import PdfReader


def inspect_pdf(pdf: Path) -> dict:
    reader = PdfReader(str(pdf))
    page_text = [(page.extract_text() or "").strip() for page in reader.pages]
    text = "\n".join(page_text)
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    checks = {
        "every_page_has_text": all(len(value) >= 20 for value in page_text),
        "no_replacement_character": "\ufffd" not in text,
        "expected_page_count": (
            len(reader.pages) >= 2
            if "two-page-fixture" in pdf.name
            else len(reader.pages) >= 1
        ),
    }
    if pdf.name.startswith("resume-lab-"):
        headings = {
            "SUMMARY",
            "KURZPROFIL",
            "EXPERIENCE",
            "BERUFSERFAHRUNG",
            "EDUCATION",
            "AUSBILDUNG",
            "SKILLS",
            "KENNTNISSE",
        }
        normalized_lines = {line.upper() for line in lines}
        checks["sections_detected"] = len(headings.intersection(normalized_lines)) >= 3
        try:
            employer_index = next(
                index
                for index, line in enumerate(lines)
                if "Example Manufacturing GmbH" in line
            )
        except StopIteration:
            employer_index = -1
        nearby = lines[employer_index : employer_index + 4] if employer_index >= 0 else []
        checks["date_employer_association"] = any(
            "01/2024" in line and ("Present" in line or "heute" in line)
            for line in nearby
        )
        checks["evidence_string_present"] = (
            "Built weekly SQL and Power BI reporting for production and logistics reviews."
            in text
        )
    if pdf.name.startswith("cover-letter-"):
        checks["semantic_letter_fields"] = all(
            value in text
            for value in (
                "Alex Example",
                "Example Mobility GmbH",
                "Operations Data Analyst",
            )
        )
        checks["no_prompt_fragment"] = not any(
            value in text
            for value in (
                "VERIFIED RÉSUMÉ EVIDENCE",
                "JOB REQUIREMENTS",
                "SYSTEM PROMPT",
            )
        )
    return {
        "file": str(pdf),
        "pages": len(reader.pages),
        "characters": len(text),
        "checks": checks,
        "pass": all(checks.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate text extraction and page counts from rendered Klar DOCX PDFs."
    )
    parser.add_argument("render_roots", nargs="+", type=Path)
    args = parser.parse_args()
    pdfs = sorted(
        {
            pdf.resolve()
            for root in args.render_roots
            for pdf in root.rglob("*.pdf")
        }
    )
    if not pdfs:
        raise SystemExit("No rendered PDF files found.")
    reports = [inspect_pdf(pdf) for pdf in pdfs]
    result = {
        "documents": reports,
        "pass": all(report["pass"] for report in reports),
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if not result["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()