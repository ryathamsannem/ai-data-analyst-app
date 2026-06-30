#!/usr/bin/env python3
"""One-off live browser export for PDF-1 banking_financial_1k validation."""
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
INSIGHT_PDF = OUT / "pdf1-banking-live-insight-preset.pdf"
FULL_PDF = OUT / "pdf1-banking-live-export-full.pdf"
REPORT = OUT / "pdf1-banking-live-validation-report.json"


def wait_ask_ready(page, marker: str, timeout_ms: int = 180_000) -> None:
    page.wait_for_function(
        f"""() => {{
      const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Ask AI');
      return btn && !btn.disabled && !/Generating AI insight|Thinking/.test(document.body.innerText) && document.body.innerText.includes({json.dumps(marker)});
    }}""",
        timeout=timeout_ms,
    )


def section_order(text: str, titles: list[str]) -> list[str]:
    indexed = [(t, text.find(t)) for t in titles if text.find(t) >= 0]
    return [t for t, _ in sorted(indexed, key=lambda x: x[1])]


def analyze_pdf(path: Path) -> dict:
    doc = fitz.open(path)
    pages = len(doc)
    page_texts = [doc[i].get_text("text") for i in range(pages)]
    text = "\n".join(page_texts)
    images = []
    for i in range(pages):
        images.append(len(doc[i].get_images(full=True)))
    viz_page = next(
        (i + 1 for i, t in enumerate(page_texts) if "Visualization" in t),
        None,
    )
    viz_png = None
    if viz_page:
        pix = doc[viz_page - 1].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        viz_png = OUT / f"pdf1-banking-live-viz-page-{viz_page}.png"
        pix.save(str(viz_png))
    doc.close()

    segment_terms = ["Premium", "SME", "Corporate", "Retail", "customer segment"]
    product_terms = [
        "Credit Card",
        "Term Deposit",
        "Personal Loan",
        "Mortgage",
        "Auto Loan",
        "Product Type",
    ]
    return {
        "file": path.name,
        "pages": pages,
        "imagesPerPage": images,
        "totalImages": sum(images),
        "hasChartCaptureUnavailable": "Chart capture unavailable" in text,
        "hasCategoryCategory": "Category: Category" in text,
        "hasProductTypeChip": ("Product Type" in text) or ("Category: Product Type" in text),
        "segmentTermsInPdf": [t for t in segment_terms if t in text],
        "productTermsInPdf": [t for t in product_terms if t in text],
        "sectionOrder": section_order(
            text,
            [
                "Executive summary",
                "KPI dashboard",
                "AI insight",
                "AI conversation thread",
                "Visualization",
                "Appendix: Sample data",
                "Data quality",
                "Technical appendix",
            ],
        ),
        "vizPage": viz_page,
        "vizScreenshot": str(viz_png) if viz_png else None,
    }


def upload_banking(page) -> None:
    page.goto("http://localhost:3000/", wait_until="domcontentloaded")
    page.get_by_role("tab", name="Overview").click()
    page.locator('input[type="file"]').set_input_files(str(CSV))
    page.wait_for_selector("text=Spend Amount by Product Type", timeout=120_000)
    page.wait_for_selector("text=banking_financial_1k.csv", timeout=30_000)


def ask_product_type(page) -> None:
    page.get_by_role("tab", name="AI Insights").click()
    reset = page.get_by_role("button", name=re.compile("Reset conversation", re.I))
    if reset.is_enabled():
        reset.click()
        page.wait_for_timeout(800)
    textarea = page.get_by_placeholder(re.compile("Ask about trends", re.I))
    textarea.fill(QUESTION)
    page.get_by_role("button", name=re.compile("^Ask AI$", re.I)).click()
    wait_ask_ready(page, "Credit Card")


def export_insight_preset(page) -> dict:
    before = time.time()
    with page.expect_download(timeout=180_000) as dl_info:
        page.get_by_role("button", name=re.compile("Export this insight \\(PDF\\)", re.I)).click()
    download = dl_info.value
    download.save_as(str(INSIGHT_PDF))
    return {
        "pdf": str(INSIGHT_PDF),
        "download_ms": int((time.time() - before) * 1000),
        "analysis": analyze_pdf(INSIGHT_PDF),
    }


def export_full(page) -> dict:
    page.get_by_role("tab", name="Export").click()
    checks = [
        ("KPIs", True),
        ("AI Insight", True),
        ("Chart", True),
        ("Data Preview", True),
        ("Data Quality", True),
        ("AI conversation thread", False),
        ("Technical appendix", True),
    ]
    for label, exact in checks:
        cb = page.get_by_role(
            "checkbox", name=label if exact else re.compile(label, re.I), exact=exact
        )
        if not cb.is_checked():
            cb.check()
    before = time.time()
    with page.expect_download(timeout=180_000) as dl_info:
        page.get_by_role("button", name=re.compile("Download Report PDF", re.I)).click()
    download = dl_info.value
    download.save_as(str(FULL_PDF))
    return {
        "pdf": str(FULL_PDF),
        "download_ms": int((time.time() - before) * 1000),
        "analysis": analyze_pdf(FULL_PDF),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"csv": str(CSV), "question": QUESTION}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(accept_downloads=True)
        context.add_init_script(
            "localStorage.setItem('ai-analyst-plan-tier', 'paid');"
        )
        page = context.new_page()
        upload_banking(page)
        ask_product_type(page)
        report["insightPreset"] = export_insight_preset(page)
        browser.close()
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
