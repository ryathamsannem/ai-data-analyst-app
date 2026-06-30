#!/usr/bin/env python3
"""Live validation for generic chart-contract insight alignment (banking + hospitality)."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import fitz
from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "pdf-validation-screenshots"
FIXTURE_DIR = ROOT / "test-fixtures" / "domain_upload_1k"

SCENARIOS = [
    {
        "id": "banking",
        "csv": FIXTURE_DIR / "banking_financial_1k.csv",
        "question": "Spend Amount by Product Type",
        "chartHint": "Product Type",
        "goodTerms": [
            "Credit Card",
            "Term Deposit",
            "Personal Loan",
            "Mortgage",
            "Auto Loan",
            "Product Type",
        ],
        "badTerms": ["Premium", "SME", "Corporate", "Retail", "customer segment"],
        "overviewWait": "Spend Amount by Product Type",
    },
    {
        "id": "hospitality",
        "csv": FIXTURE_DIR / "hospitality_bookings_1k.csv",
        "question": "Room Revenue by Room Type",
        "chartHint": "Room Type",
        "goodTerms": ["Suite", "Executive", "Deluxe", "Family", "Standard", "Room Type"],
        "badTerms": [
            "Downtown",
            "Beach",
            "Suburban",
            "Business District",
            "Airport",
        ],
        "overviewWait": "Grand Plaza",
    },
]


def wait_ask_ready(page: Page, timeout_ms: int = 180_000) -> None:
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


def extract_ui_answer_text(page: Page) -> str:
    body = page.inner_text("body")
    m = re.search(
        r"AI Answer\s*\n+([\s\S]{20,4000}?)(?:\n(?:SUPPORTING DETAIL|WHY THIS MATTERS|VISUALIZATION|Export this insight)|$)",
        body,
        re.I,
    )
    return m.group(1).strip() if m else body


def chart_title_from_body(body: str) -> str:
    m = re.search(r"VISUALIZATION\s*\n+([^\n]+)", body)
    return m.group(1).strip() if m else ""


def term_hits(text: str, terms: list[str]) -> list[str]:
    return [t for t in terms if re.search(re.escape(t), text, re.I)]


def analyze_pdf(path: Path, scenario_id: str) -> dict:
    doc = fitz.open(path)
    pages = len(doc)
    page_texts = [doc[i].get_text("text") for i in range(pages)]
    text = "\n".join(page_texts)
    images = [len(doc[i].get_images(full=True)) for i in range(pages)]
    viz_pages = [i + 1 for i, t in enumerate(page_texts) if "Visualization" in t]
    viz_page = viz_pages[0] if viz_pages else None
    viz_png = None
    if viz_page:
        pix = doc[viz_page - 1].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        viz_png = OUT / f"pdf-mandatory-fix-{scenario_id}-viz-page-{viz_page}.png"
        pix.save(str(viz_png))
    doc.close()
    return {
        "file": path.name,
        "pages": pages,
        "imagesPerPage": images,
        "vizPage": viz_page,
        "vizScreenshot": str(viz_png) if viz_png else None,
        "fullTextSample": text[:2500],
    }


def run_scenario(page: Page, scenario: dict) -> dict:
    page.get_by_role("tab", name="Overview").click()
    page.locator('input[type="file"]').set_input_files(str(scenario["csv"]))
    page.wait_for_selector(f"text=/{re.escape(scenario['overviewWait'])}/i", timeout=120_000)

    page.get_by_role("tab", name="AI Insights").click()
    reset = page.get_by_role("button", name=re.compile("Reset conversation", re.I))
    if reset.is_enabled():
        reset.click()
        page.wait_for_timeout(800)

    question = scenario["question"]
    textarea = page.get_by_placeholder(re.compile("Ask about trends", re.I))
    textarea.fill(question)
    page.get_by_role("button", name=re.compile("^Ask AI$", re.I)).click()
    wait_ask_ready(page)

    body = page.inner_text("body")
    ui_answer = extract_ui_answer_text(page)
    sid = scenario["id"]
    ui_png = OUT / f"pdf-mandatory-fix-{sid}-ui-answer.png"
    page.screenshot(path=str(ui_png), full_page=False)

    insight_pdf = OUT / f"pdf-mandatory-fix-{sid}-insight-preset.pdf"
    with page.expect_download(timeout=180_000) as dl_info:
        page.get_by_role("button", name=re.compile("Export this insight \\(PDF\\)", re.I)).click()
    download = dl_info.value
    download.save_as(str(insight_pdf))

    pdf_analysis = analyze_pdf(insight_pdf, sid)
    pdf_text = pdf_analysis.pop("fullTextSample", "")

    good_ui = term_hits(ui_answer, scenario["goodTerms"])
    bad_ui = term_hits(ui_answer, scenario["badTerms"])
    good_pdf = term_hits(pdf_text, scenario["goodTerms"])
    bad_pdf = term_hits(pdf_text, scenario["badTerms"])

    return {
        "id": sid,
        "question": question,
        "chartTitle": chart_title_from_body(body),
        "uiAnswerSample": ui_answer[:1200],
        "uiScreenshot": str(ui_png),
        "insightPdf": str(insight_pdf),
        "pdfAnalysis": pdf_analysis,
        "uiGoodTerms": good_ui,
        "uiBadTerms": bad_ui,
        "pdfGoodTerms": good_pdf,
        "pdfBadTerms": bad_pdf,
        "uiPassesAlignment": (
            scenario["chartHint"].lower() in chart_title_from_body(body).lower()
            and len(bad_ui) == 0
            and len(good_ui) >= 2
        ),
        "pdfPassesAlignment": len(bad_pdf) == 0 and len(good_pdf) >= 2,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"scenarios": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(
            accept_downloads=True, viewport={"width": 1440, "height": 1200}
        )
        context.add_init_script(
            "localStorage.setItem('ai-analyst-plan-tier', 'paid');"
        )
        page = context.new_page()
        for scenario in SCENARIOS:
            page.goto("http://localhost:3000/", wait_until="domcontentloaded")
            report["scenarios"].append(run_scenario(page, scenario))

        page.close()
        browser.close()

    report["allPass"] = all(
        s["uiPassesAlignment"] and s["pdfPassesAlignment"] for s in report["scenarios"]
    )
    report_path = OUT / "pdf-mandatory-fix-generic-alignment-report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
