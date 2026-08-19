#!/usr/bin/env python3
"""Generate controlled Klar Knowledge Base PDF handbooks from governed Markdown."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import textwrap
from datetime import date
from pathlib import Path

# ReportLab uses SOURCE_DATE_EPOCH for PDF dates and trailer identifiers. Set
# the controlled release date before importing ReportLab so identical governed
# sources produce identical bytes instead of embedding the wall-clock time.
CONTROLLED_SOURCE_DATE_EPOCH = "1786406400"  # 2026-08-11T00:00:00Z
configured_epoch = os.environ.get("SOURCE_DATE_EPOCH")
if configured_epoch not in (None, CONTROLLED_SOURCE_DATE_EPOCH):
    raise RuntimeError(
        "SOURCE_DATE_EPOCH must be 1786406400 for the v2.6.1 controlled PDFs."
    )
os.environ["SOURCE_DATE_EPOCH"] = CONTROLLED_SOURCE_DATE_EPOCH

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader, PdfWriter
from pypdf.generic import BooleanObject, DictionaryObject, NameObject, TextStringObject


ROOT = Path(__file__).resolve().parent.parent
CONTENT_ROOT = ROOT / "content"
GENERATED_DOCS = ROOT / "generated" / "docs.json"
OUTPUT_ROOT = ROOT / "output" / "pdf"
PUBLIC_ROOT = ROOT / "public" / "downloads"
RELEASE = "2.6.1"
SITE_URL = "https://karpit0499.github.io/klar/kb"

INK = colors.HexColor("#111318")
MUTED = colors.HexColor("#62656D")
FAINT = colors.HexColor("#6B6E76")
LINE = colors.HexColor("#DADBD6")
PAPER = colors.HexColor("#F7F6F2")
COBALT = colors.HexColor("#2C4BFF")
COBALT_PALE = colors.HexColor("#E9ECFF")

BUNDLES = {
    "product-user": {
        "title": "Product and User Handbook",
        "classification": "PUBLIC",
        "sections": {"Product", "User Guide"},
    },
    "engineering-architecture": {
        "title": "Engineering and Architecture Handbook",
        "classification": "PUBLIC",
        "sections": {
            "Architecture",
            "Data",
            "Discovery",
            "Application Preparation",
            "AI and Models",
            "Platform",
            "Engineering",
        },
    },
    "assurance-operations": {
        "title": "Security, Operations, and Governance Handbook",
        "classification": "PUBLIC",
        "sections": {
            "Governance",
            "Security and Privacy",
            "Quality and Operations",
            "Decisions and Roadmap",
        },
    },
}

PUBLISHED_STATUSES = {"current", "approved", "target", "planned", "deprecated", "historical"}

SECTION_ORDER = [
    "Governance",
    "Product",
    "User Guide",
    "Architecture",
    "Data",
    "Discovery",
    "Application Preparation",
    "AI and Models",
    "Platform",
    "Security and Privacy",
    "Engineering",
    "Quality and Operations",
    "Decisions and Roadmap",
]


def ascii_dashes(value: str) -> str:
    return re.sub(r"[\u2010\u2011\u2012\u2013\u2014\u2212]", "-", value)


def inline_markup(value: str) -> str:
    value = ascii_dashes(value.strip())
    placeholders: list[str] = []

    def protect(pattern: str, replacement):
        nonlocal value

        def store(match: re.Match[str]) -> str:
            placeholders.append(replacement(match))
            return f"@@KB{len(placeholders) - 1}@@"

        value = re.sub(pattern, store, value)

    protect(r"`([^`]+)`", lambda match: f'<font name="Courier">{html.escape(match.group(1))}</font>')
    def link_markup(match: re.Match[str]) -> str:
        target = match.group(2)
        if target.startswith("/"):
            path, marker, fragment = target.partition("#")
            target = f"{SITE_URL}{path.rstrip('/')}/"
            if marker:
                target = f"{target}#{fragment}"
        return f'<link href="{html.escape(target, quote=True)}" color="#2C4BFF">{html.escape(match.group(1))}</link>'

    protect(
        r"\[([^\]]+)\]\((https?://[^)]+|/[^)]+)\)",
        link_markup,
    )
    value = html.escape(value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", value)
    for index, replacement in enumerate(placeholders):
        value = value.replace(f"@@KB{index}@@", replacement)
    return value


def content_hash(docs: list[dict]) -> str:
    digest = hashlib.sha256()
    source_paths = sorted({doc["sourcePath"] for doc in docs})
    for source_path in source_paths:
        source = CONTENT_ROOT / source_path
        digest.update(source_path.encode("utf8"))
        digest.update(b"\0")
        digest.update(source.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:16]


def repository_baseline() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short=12", "HEAD"],
            cwd=ROOT.parent,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unavailable"


def source_body(source_path: str) -> str:
    raw = (CONTENT_ROOT / source_path).read_text(encoding="utf8")
    if raw.startswith("---\n"):
        _, _, rest = raw.partition("\n---\n")
        raw = rest
    return re.sub(r"^\s*#\s+[^\n]+\n+", "", raw)


def paragraph_style(styles, name: str):
    return styles[name]


def table_flowables(lines: list[str], styles, available_width: float):
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        rows.append(cells)
    if len(rows) >= 2 and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in rows[1]):
        rows.pop(1)
    if not rows:
        return []
    columns = max(len(row) for row in rows)
    normalized = [row + [""] * (columns - len(row)) for row in rows]
    if columns > 5 and len(normalized) > 1:
        headers = normalized[0]
        cards = []
        for row in normalized[1:]:
            data = [
                [
                    Paragraph(inline_markup(header), styles["TableHeaderCard"]),
                    Paragraph(inline_markup(value), styles["TableCell"]),
                ]
                for header, value in zip(headers, row, strict=True)
            ]
            card = Table(data, colWidths=[42 * mm, available_width - 42 * mm], hAlign="LEFT")
            card.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), PAPER),
                ("GRID", (0, 0), (-1, -1), 0.35, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            cards.extend([KeepTogether([card]), Spacer(1, 8)])
        return cards

    data = [[Paragraph(inline_markup(cell), styles["TableCell"]) for cell in row] for row in normalized]
    table = Table(data, colWidths=[available_width / columns] * columns, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PAPER),
        ("TEXTCOLOR", (0, 0), (-1, 0), INK),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [table]


def markdown_flowables(markdown: str, styles, available_width: float):
    lines = ascii_dashes(markdown).splitlines()
    story = []
    index = 0
    paragraph: list[str] = []

    def flush_paragraph():
        if paragraph:
            story.append(Paragraph(inline_markup(" ".join(part.strip() for part in paragraph)), styles["BodyTextKB"]))
            paragraph.clear()

    while index < len(lines):
        line = lines[index].rstrip()
        stripped = line.strip()
        if not stripped:
            flush_paragraph()
            index += 1
            continue

        if stripped.startswith("```"):
            flush_paragraph()
            index += 1
            code = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code.extend(textwrap.wrap(lines[index], width=98, replace_whitespace=False, drop_whitespace=False) or [""])
                index += 1
            story.append(Preformatted("\n".join(code), styles["CodeBlock"]))
            index += 1
            continue

        heading = re.match(r"^(#{2,4})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            style_name = "Heading2KB" if level == 2 else "Heading3KB"
            story.append(Paragraph(inline_markup(heading.group(2)), styles[style_name]))
            index += 1
            continue

        if "|" in stripped and index + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-{3,}", lines[index + 1]):
            flush_paragraph()
            table_lines = [line]
            index += 1
            while index < len(lines) and "|" in lines[index] and lines[index].strip():
                table_lines.append(lines[index])
                index += 1
            tables = table_flowables(table_lines, styles, available_width)
            if tables:
                story.extend([*tables, Spacer(1, 8)])
            continue

        list_match = re.match(r"^\s*(?:[-*]|\d+\.)\s+(.+)$", line)
        if list_match:
            flush_paragraph()
            ordered = bool(re.match(r"^\s*\d+\.", line))
            items = []
            while index < len(lines):
                candidate = re.match(r"^\s*(?:[-*]|\d+\.)\s+(.+)$", lines[index])
                if not candidate:
                    break
                items.append(ListItem(Paragraph(inline_markup(candidate.group(1)), styles["ListText"]), leftIndent=9))
                index += 1
            story.append(ListFlowable(items, bulletType="1" if ordered else "bullet", leftIndent=18, bulletFontSize=8, spaceAfter=8))
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            quote = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quote.append(lines[index].strip().lstrip(">").strip())
                index += 1
            story.append(Paragraph(inline_markup(" ".join(quote)), styles["QuoteKB"]))
            continue

        if re.fullmatch(r"[-*_]{3,}", stripped):
            flush_paragraph()
            story.append(Spacer(1, 7))
            index += 1
            continue

        paragraph.append(line)
        index += 1

    flush_paragraph()
    return story


class KlarHandbookTemplate(BaseDocTemplate):
    def __init__(self, filename: str, *, handbook_title: str, classification: str, **kwargs):
        self.handbook_title = handbook_title
        self.classification = classification
        super().__init__(filename, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="body")
        self.addPageTemplates([PageTemplate(id="default", frames=[frame], onPage=self.draw_page)])

    def draw_page(self, canvas, doc):
        canvas.saveState()
        canvas.setTitle(f"Klar Knowledge Base - {self.handbook_title}")
        canvas.setAuthor("Klar Documentation")
        page = canvas.getPageNumber()
        if page > 1:
            canvas.setStrokeColor(LINE)
            canvas.setLineWidth(0.5)
            canvas.line(self.leftMargin, A4[1] - 17 * mm, A4[0] - self.rightMargin, A4[1] - 17 * mm)
            canvas.setFont("Helvetica", 7.5)
            canvas.setFillColor(MUTED)
            canvas.drawString(self.leftMargin, A4[1] - 13 * mm, f"Klar Knowledge Base · {self.handbook_title}")
            canvas.drawRightString(A4[0] - self.rightMargin, A4[1] - 13 * mm, self.classification)
            canvas.line(self.leftMargin, 15 * mm, A4[0] - self.rightMargin, 15 * mm)
            canvas.drawString(self.leftMargin, 10 * mm, "Controlled snapshot · Verify against the live knowledge base before use")
            canvas.drawRightString(A4[0] - self.rightMargin, 10 * mm, f"Page {page}")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        levels = {"SectionTitle": 0, "DocTitle": 1}
        level = levels.get(flowable.style.name)
        if level is None:
            return
        text = flowable.getPlainText()
        key = f"toc-{self.seq.nextf('heading')}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=False)
        self.notify("TOCEntry", (level, text, self.page, key))


def build_styles():
    base = getSampleStyleSheet()
    return {
        "CoverLabel": ParagraphStyle("CoverLabel", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=COBALT, spaceAfter=13, tracking=1.2),
        "CoverTitle": ParagraphStyle("CoverTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=34, leading=36, textColor=INK, alignment=TA_LEFT, spaceAfter=14),
        "CoverSubtitle": ParagraphStyle("CoverSubtitle", parent=base["Normal"], fontName="Helvetica", fontSize=13, leading=19, textColor=MUTED, spaceAfter=26),
        "CoverMeta": ParagraphStyle("CoverMeta", parent=base["Normal"], fontName="Courier", fontSize=8.5, leading=14, textColor=INK),
        "TOCTitle": ParagraphStyle("TOCTitle", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=25, leading=29, textColor=INK, spaceAfter=18),
        "SectionTitle": ParagraphStyle("SectionTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=30, leading=34, textColor=INK, spaceAfter=13),
        "SectionLead": ParagraphStyle("SectionLead", parent=base["Normal"], fontName="Helvetica", fontSize=12, leading=18, textColor=MUTED),
        "DocTitle": ParagraphStyle("DocTitle", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=24, leading=28, textColor=INK, spaceAfter=8),
        "DocDescription": ParagraphStyle("DocDescription", parent=base["Normal"], fontName="Helvetica", fontSize=11, leading=16, textColor=MUTED, spaceAfter=14),
        "BodyTextKB": ParagraphStyle("BodyTextKB", parent=base["BodyText"], fontName="Helvetica", fontSize=9.5, leading=14.3, textColor=INK, spaceAfter=8),
        "Heading2KB": ParagraphStyle("Heading2KB", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=INK, spaceBefore=18, spaceAfter=8, keepWithNext=True),
        "Heading3KB": ParagraphStyle("Heading3KB", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=INK, spaceBefore=13, spaceAfter=6, keepWithNext=True),
        "ListText": ParagraphStyle("ListText", parent=base["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=INK, spaceAfter=2),
        "QuoteKB": ParagraphStyle("QuoteKB", parent=base["BodyText"], fontName="Helvetica", fontSize=9.5, leading=14, textColor=INK, leftIndent=12, rightIndent=8, borderColor=COBALT, borderWidth=1.7, borderPadding=8, backColor=COBALT_PALE, spaceBefore=5, spaceAfter=10),
        "CodeBlock": ParagraphStyle("CodeBlock", parent=base["Code"], fontName="Courier", fontSize=7, leading=9.2, textColor=colors.white, backColor=INK, borderPadding=8, spaceBefore=5, spaceAfter=10),
        "TableCell": ParagraphStyle("TableCell", parent=base["BodyText"], fontName="Helvetica", fontSize=8, leading=10.5, textColor=INK),
        "TableHeaderCard": ParagraphStyle("TableHeaderCard", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=INK),
        "MetaLabel": ParagraphStyle("MetaLabel", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.2, leading=9.5, textColor=FAINT),
        "MetaValue": ParagraphStyle("MetaValue", parent=base["Normal"], fontName="Helvetica", fontSize=7.5, leading=10, textColor=INK),
    }


def metadata_table(doc, styles, available_width: float):
    items = [
        ("STATUS", doc["status"]),
        ("VERSION", doc["applicableVersion"]),
        ("CLASSIFICATION", doc["classification"]),
        ("OWNER", doc["owner"]),
        ("LAST VERIFIED", doc["lastVerified"]),
        ("NEXT REVIEW", doc["nextReview"]),
    ]
    cells = [
        [Paragraph(label, styles["MetaLabel"]), Paragraph(inline_markup(value), styles["MetaValue"])]
        for label, value in items
    ]
    table = Table(cells, colWidths=[28 * mm, available_width - 28 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def build_bundle(bundle_id: str, docs: list[dict], revision: str, snapshot_hash: str, generated_on: str) -> Path:
    bundle = BUNDLES[bundle_id]
    selected = [doc for doc in docs if doc["section"] in bundle["sections"]]
    selected.sort(key=lambda item: (SECTION_ORDER.index(item["section"]), item["order"], item["title"]))
    if not selected:
        raise RuntimeError(f"Bundle {bundle_id} has no documents.")

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_ROOT / f"klar-kb-{bundle_id}-v{RELEASE}.pdf"
    styles = build_styles()
    template = KlarHandbookTemplate(
        str(output),
        handbook_title=bundle["title"],
        classification=bundle["classification"],
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=24 * mm,
        bottomMargin=22 * mm,
        title=f"Klar Knowledge Base - {bundle['title']}",
        author="Klar Documentation",
        subject="Controlled knowledge-base snapshot",
    )

    story = [
        Spacer(1, 30 * mm),
        Paragraph("KLAR KNOWLEDGE BASE", styles["CoverLabel"]),
        Paragraph(bundle["title"], styles["CoverTitle"]),
        Paragraph("A controlled snapshot generated from the governed Markdown source. The live knowledge base remains authoritative for current guidance.", styles["CoverSubtitle"]),
        Table(
            [
                [Paragraph("Klar release", styles["MetaLabel"]), Paragraph(RELEASE, styles["MetaValue"])],
                [Paragraph("Classification", styles["MetaLabel"]), Paragraph(bundle["classification"], styles["MetaValue"])],
                [Paragraph("Generated", styles["MetaLabel"]), Paragraph(generated_on, styles["MetaValue"])],
                [Paragraph("Implementation baseline", styles["MetaLabel"]), Paragraph(revision, styles["MetaValue"])],
                [Paragraph("KB content hash", styles["MetaLabel"]), Paragraph(snapshot_hash, styles["MetaValue"])],
                [Paragraph("Accessible live version", styles["MetaLabel"]), Paragraph(f'<link href="{SITE_URL}" color="#2C4BFF">{SITE_URL}</link>', styles["MetaValue"])],
                [Paragraph("Controlled-copy notice", styles["MetaLabel"]), Paragraph("Verify against the live KB before operational use.", styles["MetaValue"])],
            ],
            colWidths=[42 * mm, template.width - 42 * mm],
            style=TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
                ("BACKGROUND", (0, 0), (0, -1), PAPER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]),
        ),
        PageBreak(),
        Paragraph("Table of contents", styles["TOCTitle"]),
    ]
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle("TOCSection", fontName="Helvetica-Bold", fontSize=10, leading=14, leftIndent=0, firstLineIndent=0, textColor=INK, spaceBefore=7),
        ParagraphStyle("TOCDoc", fontName="Helvetica", fontSize=8.5, leading=12, leftIndent=14, firstLineIndent=0, textColor=MUTED),
    ]
    story.extend([toc, PageBreak()])

    current_section = None
    for doc_index, doc in enumerate(selected):
        if doc["section"] != current_section:
            current_section = doc["section"]
            story.extend([
                Spacer(1, 35 * mm),
                Paragraph(current_section, styles["SectionTitle"]),
                Paragraph(f"{sum(1 for item in selected if item['section'] == current_section)} controlled documents in this section.", styles["SectionLead"]),
                PageBreak(),
            ])
        story.extend([
            Paragraph(doc["title"], styles["DocTitle"]),
            Paragraph(inline_markup(doc["description"]), styles["DocDescription"]),
            KeepTogether([metadata_table(doc, styles, template.width), Spacer(1, 14)]),
        ])
        story.extend(markdown_flowables(source_body(doc["sourcePath"]), styles, template.width))
        if doc_index < len(selected) - 1:
            story.append(PageBreak())

    template.multiBuild(story)
    add_pdf_language_and_display_title(output)
    return output


def add_pdf_language_and_display_title(output: Path) -> None:
    reader = PdfReader(output)
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer._root_object[NameObject("/Lang")] = TextStringObject("en")
    writer._root_object[NameObject("/ViewerPreferences")] = DictionaryObject({
        NameObject("/DisplayDocTitle"): BooleanObject(True),
    })
    temporary = output.with_suffix(".tmp.pdf")
    with temporary.open("wb") as handle:
        writer.write(handle)
    temporary.replace(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", action="append", choices=sorted(BUNDLES), help="Generate only the selected bundle; repeat as needed.")
    parser.add_argument("--source-revision", default=os.environ.get("KB_SOURCE_REVISION") or repository_baseline())
    parser.add_argument("--generated-on", default=date.today().isoformat())
    args = parser.parse_args()

    docs = json.loads(GENERATED_DOCS.read_text(encoding="utf8"))
    unpublished = [
        doc["slug"]
        for doc in docs
        if doc.get("classification") != "public" or doc.get("status") not in PUBLISHED_STATUSES
    ]
    if unpublished:
        raise RuntimeError(
            "Generated documentation contains records that cannot be published: "
            + ", ".join(unpublished)
        )
    chosen = args.bundle or list(BUNDLES)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    if not args.bundle:
        for directory in (OUTPUT_ROOT, PUBLIC_ROOT):
            for retired in directory.glob("klar-kb-*-v*.pdf"):
                retired.unlink()
    snapshot_hash = content_hash(docs)
    for bundle_id in chosen:
        output = build_bundle(bundle_id, docs, args.source_revision, snapshot_hash, args.generated_on)
        shutil.copy2(output, PUBLIC_ROOT / output.name)
        print(output)


if __name__ == "__main__":
    main()
