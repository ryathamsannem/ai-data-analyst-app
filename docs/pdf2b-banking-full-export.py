#!/usr/bin/env python3
"""One-off PDF-2B validation — banking full export with data preview + quality."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import fitz
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "pdf1_banking", ROOT / "docs" / "pdf1-banking-live-export.py"
)
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

FULL_PDF = ROOT / "docs" / "pdf-validation-screenshots" / "pdf1-banking-export-full.pdf"
REPORT = ROOT / "docs" / "pdf-validation-screenshots" / "pdf2b-banking-validation-report.json"


def validate_pdf(path: Path) -> dict:
    doc = fitz.open(path)
    text = "\n".join(doc[i].get_text("text") for i in range(len(doc)))
    doc.close()
    return {
        "file": path.name,
        "hasAccId": "ACC-000001" in text,
        "hasBadAccountDate": "2001-01-01" in text and "ACC-000001" not in text,
        "hasReportMonth": "2024-01-01" in text,
        "hasPreviewDuplicateLabel": "Sample duplicate-like rows (preview check)" in text,
        "hasPreviewDuplicateNote": "not a full-file duplicate audit" in text,
        "hasFileWideRows": "Total rows (file-wide)" in text,
    }


def export_full_for_pdf2b(page) -> dict:
    import re
    import time

    page.get_by_role("tab", name="Export").click()
    checks = [
        re.compile(r"^KPIs$", re.I),
        re.compile(r"AI Insight", re.I),
        re.compile(r"^Chart$", re.I),
        re.compile(r"Data Preview", re.I),
        re.compile(r"Data Quality", re.I),
    ]
    for pattern in checks:
        cb = page.get_by_role("checkbox", name=pattern)
        if cb.count() and not cb.first.is_checked():
            cb.first.check()
    before = time.time()
    with page.expect_download(timeout=180_000) as dl_info:
        page.get_by_role("button", name=re.compile("Download Report PDF", re.I)).click()
    path = ROOT / "docs" / "pdf-validation-screenshots" / "pdf1-banking-export-full.pdf"
    dl_info.value.save_as(str(path))
    return {
        "pdf": str(path),
        "download_ms": int((time.time() - before) * 1000),
    }


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(accept_downloads=True)
        context.add_init_script(
            "localStorage.setItem('ai-analyst-plan-tier', 'paid');"
        )
        page = context.new_page()
        mod.upload_banking(page)
        mod.ask_product_type(page)
        result = export_full_for_pdf2b(page)
        browser.close()
    result["pdf2b"] = validate_pdf(Path(result["pdf"]))
    REPORT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
