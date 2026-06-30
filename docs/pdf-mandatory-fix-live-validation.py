#!/usr/bin/env python3
"""Live validation for mandatory AI answer alignment + PDF viz cohesion fixes."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import fitz
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "pdf-validation-screenshots"
CSV = ROOT / "test-fixtures" / "domain_upload_1k" / "banking_financial_1k.csv"
QUESTION = "Spend Amount by Product Type"
INSIGHT_PDF = OUT / "pdf-mandatory-fix-banking-insight-preset.pdf"
UI_SCREENSHOT = OUT / "pdf-mandatory-fix-banking-ui-answer.png"
REPORT = OUT / "pdf-mandatory-fix-banking-validation-report.json"

SEGMENT_TERMS = ["Premium", "SME", "Corporate", "Retail", "customer segment"]
PRODUCT_TERMS = [
    "Credit Card",
    "Term Deposit",
    "Personal Loan",
    "Mortgage",
    "Auto Loan",
    "Product Type",
]


def wait_ask_ready(page, timeout_ms: int = 180_000) -> None:
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        body = page.inner_text("body")
        ask_btn = page.get_by_role("button", name=re.compile("^Ask AI$", re.I))
        loading = bool(
            re.search(r"Generating AI insight|Thinking|Loading chart", body, re.I)
        )
        if (
            ask_btn.count() > 0
            and not ask_btn.is_disabled()
            and not loading
            and ("Export this insight" in body or "AI Answer" in body)
        ):
            return
        page.wait_for_timeout(1500)
    raise TimeoutError("Ask AI did not finish within timeout")


def extract_ui_answer_text(page) -> str:
    body = page.inner_text("body")
    m = re.search(
        r"AI Answer\s*\n+([\s\S]{20,3000}?)(?:\n(?:SUPPORTING DETAIL|WHY THIS MATTERS|VISUALIZATION|Export this insight)|$)",
        body,
        re.I,
    )
    return m.group(1).strip() if m else ""


def chart_title_from_body(body: str) -> str:
    m = re.search(r"VISUALIZATION\s*\n+([^\n]+)", body)
    return m.group(1).strip() if m else ""


def analyze_pdf(path: Path) -> dict:
    doc = fitz.open(path)
    pages = len(doc)
    page_texts = [doc[i].get_text("text") for i in range(pages)]
    text = "\n".join(page_texts)
    images = [len(doc[i].get_images(full=True)) for i in range(pages)]

    viz_pages = [i + 1 for i, t in enumerate(page_texts) if "Visualization" in t]
    chart_pages = [i + 1 for i, img in enumerate(images) if img > 0]
    viz_split = False
    viz_page = viz_pages[0] if viz_pages else None
    chart_on_viz_page = False
    if viz_page:
        chart_on_viz_page = images[viz_page - 1] > 0
        if not chart_on_viz_page and chart_pages:
            next_chart = next((p for p in chart_pages if p > viz_page), None)
            viz_split = next_chart is not None and next_chart == viz_page + 1

    viz_png = None
    if viz_page:
        pix = doc[viz_page - 1].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        viz_png = OUT / f"pdf-mandatory-fix-banking-viz-page-{viz_page}.png"
        pix.save(str(viz_png))

    doc.close()
    return {
        "file": path.name,
        "pages": pages,
        "imagesPerPage": images,
        "hasAppendixSampleData": "Appendix: Sample data" in text,
        "hasDataQuality": "Data quality" in text,
        "hasConversationThread": "AI conversation thread" in text,
        "segmentTermsInPdf": [t for t in SEGMENT_TERMS if t in text],
        "productTermsInPdf": [t for t in PRODUCT_TERMS if t in text],
        "vizPage": viz_page,
        "chartOnVizPage": chart_on_viz_page,
        "vizSplitAwkward": viz_split,
        "vizScreenshot": str(viz_png) if viz_png else None,
    }


def term_hits(text: str, terms: list[str]) -> list[str]:
    return [t for t in terms if re.search(re.escape(t), text, re.I)]


def run_scenario(page, question: str) -> dict:
    page.get_by_role("tab", name="AI Insights").click()
    reset = page.get_by_role("button", name=re.compile("Reset conversation", re.I))
    if reset.is_enabled():
        reset.click()
        page.wait_for_timeout(800)
    textarea = page.get_by_placeholder(re.compile("Ask about trends", re.I))
    textarea.fill(question)
    page.get_by_role("button", name=re.compile("^Ask AI$", re.I)).click()
    wait_ask_ready(page)
    body = page.inner_text("body")
    return {
        "question": question,
        "chartTitle": chart_title_from_body(body),
        "uiAnswer": extract_ui_answer_text(page),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"csv": str(CSV)}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 1200})
        context.add_init_script(
            "localStorage.setItem('ai-analyst-plan-tier', 'paid');"
        )
        page = context.new_page()
        page.goto("http://localhost:3000/", wait_until="domcontentloaded")
        page.get_by_role("tab", name="Overview").click()
        page.locator('input[type="file"]').set_input_files(str(CSV))
        page.wait_for_selector("text=Spend Amount by Product Type", timeout=120_000)

        primary = run_scenario(page, QUESTION)
        page.screenshot(path=str(UI_SCREENSHOT), full_page=False)
        before = time.time()
        with page.expect_download(timeout=180_000) as dl_info:
            page.get_by_role("button", name=re.compile("Export this insight \\(PDF\\)", re.I)).click()
        download = dl_info.value
        download.save_as(str(INSIGHT_PDF))
        pdf_analysis = analyze_pdf(INSIGHT_PDF)
        browser.close()

    report["scenario"] = primary
    report["uiScreenshot"] = str(UI_SCREENSHOT)
    report["uiSegmentTerms"] = term_hits(primary["uiAnswer"], SEGMENT_TERMS)
    report["uiProductTerms"] = term_hits(primary["uiAnswer"], PRODUCT_TERMS)
    report["uiPassesAlignment"] = (
        "Product Type" in primary["chartTitle"]
        and len(report["uiSegmentTerms"]) == 0
        and any(t in report["uiProductTerms"] for t in PRODUCT_TERMS[:5])
    )
    report["insightPreset"] = {
        "pdf": str(INSIGHT_PDF),
        "download_ms": int((time.time() - before) * 1000),
        "analysis": pdf_analysis,
    }
    report["pdfPassesAlignment"] = (
        len(pdf_analysis["segmentTermsInPdf"]) == 0
        and any(t in pdf_analysis["productTermsInPdf"] for t in PRODUCT_TERMS[:5])
    )
    report["pdfPassesVizCohesion"] = (
        pdf_analysis["chartOnVizPage"] and not pdf_analysis["vizSplitAwkward"]
    )
    report["pdfPassesSlimPreset"] = not (
        pdf_analysis["hasAppendixSampleData"]
        or pdf_analysis["hasDataQuality"]
        or pdf_analysis["hasConversationThread"]
    )
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
