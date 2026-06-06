#!/usr/bin/env python3
"""Phase 7 PDF analysis — extract text, render PNG previews, emit summary JSON."""
from __future__ import annotations

import json
import re
from pathlib import Path

import fitz  # pymupdf

ROOT = Path(__file__).resolve().parents[1]
SCREEN_DIR = ROOT / "docs" / "pdf-validation-screenshots"
MANIFEST_IN = SCREEN_DIR / "phase7-manifest.json"
ANALYSIS_OUT = SCREEN_DIR / "phase7-analysis.json"

SECTION_MARKERS = {
    "kpi": re.compile(r"KPI dashboard", re.I),
    "aiInsight": re.compile(r"AI insight", re.I),
    "chart": re.compile(r"Visualization", re.I),
    "preview": re.compile(r"Data preview", re.I),
    "dataQuality": re.compile(r"Data quality", re.I),
    "conversation": re.compile(r"AI conversation thread", re.I),
    "appendix": re.compile(r"Technical appendix", re.I),
    "executiveSummary": re.compile(r"Executive summary", re.I),
    "pageFooter": re.compile(r"Page \d+ of \d+", re.I),
}

CONVERSATION_QUESTIONS = [
    "Which city generates the highest revenue?",
    "Why is Mumbai highest?",
    "What evidence supports this conclusion?",
    "Which columns were used for this analysis?",
    "Show the calculations behind this answer.",
]


def extract_text(pdf_path: Path) -> str:
    doc = fitz.open(pdf_path)
    parts: list[str] = []
    for page in doc:
        parts.append(page.get_text("text"))
    doc.close()
    return "\n".join(parts)


def render_previews(pdf_path: Path, stem: str, max_pages: int = 3) -> list[str]:
    doc = fitz.open(pdf_path)
    pngs: list[str] = []
    for i in range(min(len(doc), max_pages)):
        pix = doc[i].get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        name = f"{stem}-page{i + 1}.png"
        out = SCREEN_DIR / name
        pix.save(str(out))
        pngs.append(name)
    doc.close()
    return pngs


def analyze_pdf(pdf_path: Path) -> dict:
    text = extract_text(pdf_path)
    markers = {k: bool(v.search(text)) for k, v in SECTION_MARKERS.items()}
    page_match = re.findall(r"Page \d+ of (\d+)", text)
    page_count = int(page_match[-1]) if page_match else text.count("\f") + 1
    return {
        "textLength": len(text),
        "pageCount": page_count,
        "markers": markers,
        "hasRawJson": bool(re.search(r'\{"|column_types', text)),
        "hasProvenanceNotes": bool(re.search(r"Provenance notes", text, re.I)),
        "hasAnalysisMetadata": bool(re.search(r"Analysis metadata", text, re.I)),
        "hasRoutingPlanBlock": bool(
            re.search(r"Routing plan|routing plan|intent.*ranking", text, re.I)
        ),
        "conversationQuestionsPresent": [
            q for q in CONVERSATION_QUESTIONS if q in text
        ],
        "conversationQuestionCount": len(
            [q for q in CONVERSATION_QUESTIONS if q in text]
        ),
    }


def main() -> None:
    manifest = json.loads(MANIFEST_IN.read_text(encoding="utf-8"))
    analysis: list[dict] = []

    # PNG previews for representative combos (retail dataset)
    preview_combos = [
        "phase7-retail-kpi_only.pdf",
        "phase7-retail-all_sections.pdf",
        "phase7-retail-conversation_only.pdf",
        "phase7-retail-appendix_only.pdf",
    ]

    for entry in manifest:
        pdf_name = entry["file"]
        pdf_path = SCREEN_DIR / pdf_name
        if not pdf_path.exists():
            continue
        info = analyze_pdf(pdf_path)
        stem = pdf_path.stem
        pngs: list[str] = []
        if pdf_name in preview_combos:
            pngs = render_previews(pdf_path, stem)
        analysis.append(
            {
                **entry,
                **info,
                "pngPreviews": pngs,
            }
        )

    ANALYSIS_OUT.write_text(json.dumps(analysis, indent=2), encoding="utf-8")
    print(f"Wrote {ANALYSIS_OUT} ({len(analysis)} entries)")
    preview_count = sum(len(a.get("pngPreviews", [])) for a in analysis)
    print(f"Rendered {preview_count} PNG previews")


if __name__ == "__main__":
    main()
