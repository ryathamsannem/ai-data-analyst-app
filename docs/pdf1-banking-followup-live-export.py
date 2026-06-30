#!/usr/bin/env python3
"""Live browser export: follow-up AI Insights PDF (Credit Card why)."""
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
ROOT_QUESTION = "Spend Amount by Product Type"
FOLLOW_UP = "Why is Credit Card highest?"
INSIGHT_PDF = OUT / "pdf1-banking-live-followup-insight-preset.pdf"
REPORT = OUT / "pdf1-banking-followup-live-validation-report.json"


def wait_ask_ready(page, marker: str, timeout_ms: int = 180_000) -> None:
    page.wait_for_function(
        f"""() => {{
      const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Ask AI');
      return btn && !btn.disabled && !/Generating AI insight|Thinking/.test(document.body.innerText) && document.body.innerText.includes({json.dumps(marker)});
    }}""",
        timeout=timeout_ms,
    )


def analyze_pdf(path: Path) -> dict:
    doc = fitz.open(path)
    pages = len(doc)
    page_texts = [doc[i].get_text("text") for i in range(pages)]
    text = "\n".join(page_texts)
    images = [len(doc[i].get_images(full=True)) for i in range(pages)]
    doc.close()
    return {
        "file": path.name,
        "pages": pages,
        "totalImages": sum(images),
        "hasFollowUpQuestion": FOLLOW_UP[:40] in text or "Credit Card" in text,
        "hasRootQuestionOnly": ROOT_QUESTION in text and FOLLOW_UP not in text,
        "hasProductType": "Product Type" in text,
        "hasDataPreview": "Appendix: Sample data" in text or "Data preview" in text,
        "hasConversationThread": "AI conversation thread" in text,
        "hasDataQuality": "Data quality" in text,
        "questionInExecutiveSummary": "Question:" in text,
        "snippet": text[:1200],
    }


def upload_banking(page) -> None:
    page.goto("http://localhost:3000/", wait_until="domcontentloaded")
    page.get_by_role("tab", name="Overview").click()
    page.locator('input[type="file"]').set_input_files(str(CSV))
    page.wait_for_selector("text=Spend Amount by Product Type", timeout=120_000)


def ask_root_then_followup(page) -> None:
    page.get_by_role("tab", name="AI Insights").click()
    reset = page.get_by_role("button", name=re.compile("Reset conversation", re.I))
    if reset.is_enabled():
        reset.click()
        page.wait_for_timeout(800)
    textarea = page.get_by_placeholder(re.compile("Ask about trends", re.I))
    textarea.fill(ROOT_QUESTION)
    page.get_by_role("button", name=re.compile("^Ask AI$", re.I)).click()
    wait_ask_ready(page, "Credit Card")
    export_btn = page.get_by_role(
        "button", name=re.compile("Export this insight \\(PDF\\)", re.I)
    )
    if not export_btn.is_visible():
        raise RuntimeError("Root export button not visible after first ask")
    textarea.fill(FOLLOW_UP)
    page.get_by_role("button", name=re.compile("^Ask AI$", re.I)).click()
    wait_ask_ready(page, "Credit Card")
    export_btn = page.get_by_role(
        "button", name=re.compile("Export this insight \\(PDF\\)", re.I)
    )
    if not export_btn.is_visible():
        raise RuntimeError("Follow-up export button not visible after follow-up ask")


def export_followup_insight(page) -> dict:
    before = time.time()
    with page.expect_download(timeout=180_000) as dl_info:
        page.get_by_role(
            "button", name=re.compile("Export this insight \\(PDF\\)", re.I)
        ).click()
    download = dl_info.value
    download.save_as(str(INSIGHT_PDF))
    return {
        "pdf": str(INSIGHT_PDF),
        "download_ms": int((time.time() - before) * 1000),
        "analysis": analyze_pdf(INSIGHT_PDF),
        "exportButtonVisibleBeforeExport": True,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {
        "csv": str(CSV),
        "rootQuestion": ROOT_QUESTION,
        "followUpQuestion": FOLLOW_UP,
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(accept_downloads=True)
        context.add_init_script(
            "localStorage.setItem('ai-analyst-plan-tier', 'paid');"
        )
        page = context.new_page()
        upload_banking(page)
        ask_root_then_followup(page)
        report["followUpInsightPreset"] = export_followup_insight(page)
        browser.close()
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
