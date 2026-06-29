#!/usr/bin/env python3
"""Live full Export-tab PDF — real_estate follow-up viz layout check."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import fitz
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "pdf-validation-screenshots"
CSV = ROOT / "test-fixtures" / "domain_upload_1k" / "real_estate_property_1k.csv"
ROOT_Q = "What is the average price by property type?"
FOLLOW_UP = "Why is Condo the highest?"
FULL_PDF = OUT / "pdf1-real-estate-full-export-followup.pdf"
REPORT = OUT / "pdf1-real-estate-full-export-validation-report.json"


def wait_ask_ready(page, marker: str, timeout_ms: int = 180_000) -> None:
    page.wait_for_function(
        f"""() => {{
      const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Ask AI');
      return btn && !btn.disabled && !/Generating AI insight|Thinking/.test(document.body.innerText) && document.body.innerText.includes({json.dumps(marker)});
    }}""",
        timeout=timeout_ms,
    )


def page_starts_with_orphan_source(text: str) -> bool:
    """True when a page begins with Source metadata before Visualization body."""
    pages = [p.strip() for p in re.split(r"\f", text) if p.strip()]
    if not pages:
        pages = text.split("\n\n\n")
    for chunk in pages:
        lines = [ln.strip() for ln in chunk.splitlines() if ln.strip()]
        if not lines:
            continue
        head = " ".join(lines[:4]).lower()
        if head.startswith("source") and "automated dashboard" in head:
            rest = " ".join(lines[4:12]).lower()
            if "visualization" not in rest[:120]:
                return True
    return False


def analyze_pdf(path: Path) -> dict:
    doc = fitz.open(path)
    pages = len(doc)
    page_texts = [doc[i].get_text("text") for i in range(pages)]
    text = "\n".join(page_texts)
    doc.close()
    viz_page = next(
        (i + 1 for i, t in enumerate(page_texts) if "Visualization" in t),
        None,
    )
    source_orphan_pages = []
    for i, t in enumerate(page_texts):
        lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
        if not lines:
            continue
        if lines[0].lower().startswith("source") and "automated" in lines[0].lower():
            if "Visualization" not in t[:200]:
                source_orphan_pages.append(i + 1)
    return {
        "file": path.name,
        "pages": pages,
        "vizPage": viz_page,
        "hasConversationThread": "AI conversation thread" in text,
        "hasAppendixSampleData": "Appendix: Sample data" in text,
        "appendixAfterViz": text.find("Appendix: Sample data") > text.find("Visualization"),
        "orphanSourcePageStarts": source_orphan_pages,
        "orphanSourceAtPageTop": page_starts_with_orphan_source(text),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"csv": str(CSV), "rootQuestion": ROOT_Q, "followUp": FOLLOW_UP}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(accept_downloads=True)
        context.add_init_script(
            "localStorage.setItem('ai-analyst-plan-tier', 'paid');"
        )
        page = context.new_page()
        page.goto("http://localhost:3000/", wait_until="domcontentloaded")
        page.get_by_role("tab", name="Overview").click()
        page.locator('input[type="file"]').set_input_files(str(CSV))
        page.wait_for_selector("text=property", timeout=120_000)
        page.get_by_role("tab", name="AI Insights").click()
        reset = page.get_by_role("button", name=re.compile("Reset conversation", re.I))
        if reset.is_enabled():
            reset.click()
            page.wait_for_timeout(800)
        textarea = page.get_by_placeholder(re.compile("Ask about trends", re.I))
        textarea.fill(ROOT_Q)
        page.get_by_role("button", name=re.compile("^Ask AI$", re.I)).click()
        wait_ask_ready(page, "Condo")
        textarea.fill(FOLLOW_UP)
        page.get_by_role("button", name=re.compile("^Ask AI$", re.I)).click()
        wait_ask_ready(page, "Condo")
        page.get_by_role("tab", name="Export").click()
        checks = [
            re.compile(r"^KPIs$", re.I),
            re.compile(r"AI Insight", re.I),
            re.compile(r"^Chart$", re.I),
            re.compile(r"Data Preview", re.I),
            re.compile(r"Data Quality", re.I),
            re.compile(r"AI conversation thread", re.I),
        ]
        for pattern in checks:
            cb = page.get_by_role("checkbox", name=pattern)
            if cb.count() and not cb.first.is_checked():
                cb.first.check()
        before = time.time()
        with page.expect_download(timeout=180_000) as dl_info:
            page.get_by_role("button", name=re.compile("Download Report PDF", re.I)).click()
        dl_info.value.save_as(str(FULL_PDF))
        report["fullExport"] = {
            "pdf": str(FULL_PDF),
            "download_ms": int((time.time() - before) * 1000),
            "analysis": analyze_pdf(FULL_PDF),
        }
        browser.close()
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
