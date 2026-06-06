#!/usr/bin/env python3
"""P7-005 browser Export tab QA via Playwright (real Chromium UI)."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import fitz
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "pdf-validation-screenshots"
DL = Path.home() / "Downloads"

DATASETS = [
    {
        "id": "generic",
        "csv": Path(r"c:\Users\gullu\Downloads\domain_quality_generic.csv"),
        "questions": [
            "Which region generates the highest revenue?",
            "Why is North highest?",
            "What evidence supports this conclusion?",
            "Which columns were used for this analysis?",
            "Show the calculations behind this answer.",
        ],
        "ready_text": "department",
    },
    {
        "id": "geographic",
        "csv": Path(r"c:\Users\gullu\Downloads\geographic_performance.csv"),
        "questions": [
            "Which city generates the highest revenue?",
            "Why is Mumbai highest?",
            "What evidence supports this conclusion?",
            "Which columns were used for this analysis?",
            "Show the calculations behind this answer.",
        ],
        "ready_text": "Maharashtra",
    },
]

CONV_CHECKS = {
    "generic": [
        "Which region generates the highest revenue?",
        "Why is North highest?",
        "What evidence supports this conclusion?",
        "Which columns were used",
        "Show the calculations behind this answer.",
    ],
    "geographic": [
        "Which city generates the highest revenue?",
        "Why is Mumbai highest?",
        "What evidence supports this conclusion?",
        "Which columns were used",
        "Show the calculations behind this answer.",
    ],
}


def analyze_pdf(path: Path, dataset_id: str) -> dict:
    doc = fitz.open(path)
    text = "\n".join(doc[i].get_text("text") for i in range(len(doc)))
    pages = len(doc)
    blank = [
        i + 1
        for i in range(pages)
        if len(doc[i].get_text("text").strip()) < 20
    ]
    doc.close()
    conv = CONV_CHECKS[dataset_id]
    return {
        "file": path.name,
        "pages": pages,
        "sections": {
            "kpi": "KPI dashboard" in text,
            "aiInsight": "AI insight" in text,
            "chart": "Visualization" in text,
            "preview": "Data preview" in text,
            "dataQuality": "Data quality" in text,
            "conversation": "AI conversation thread" in text,
            "appendix": "Technical appendix" in text,
        },
        "conversationPresent": {q: q in text for q in conv},
        "hasRawJson": ('{"' in text) or ("column_types" in text),
        "blankPages": blank,
        "pass": all(
            [
                "KPI dashboard" in text,
                "AI insight" in text,
                "Visualization" in text,
                "Data preview" in text,
                "Data quality" in text,
                "AI conversation thread" in text,
                "Technical appendix" in text,
                not (('{"' in text) or ("column_types" in text)),
                not blank,
                all(q in text for q in conv),
            ]
        ),
    }


def wait_ask_ready(page, marker: str, timeout_ms: int = 120_000) -> None:
    page.wait_for_function(
        f"""() => {{
      const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Ask AI');
      return btn && !btn.disabled && !/Thinking/.test(document.body.innerText) && document.body.innerText.includes({json.dumps(marker)});
    }}""",
        timeout=timeout_ms,
    )


def run_dataset(page, ds: dict) -> dict:
    log: dict = {"dataset": ds["id"], "steps": []}
    page.goto("http://localhost:3000/", wait_until="domcontentloaded")
    page.get_by_role("tab", name="Overview").click()
    with page.expect_file_chooser(timeout=30_000) as fc_info:
        page.get_by_label(re.compile("Choose a dataset file", re.I)).click()
    fc_info.value.set_files(str(ds["csv"]))
    upload = page.get_by_role("button", name=re.compile("^Upload Dataset$", re.I))
    upload.wait_for(state="visible", timeout=15_000)
    page.wait_for_timeout(400)
    with page.expect_response(lambda r: "/upload" in r.url and r.status == 200, timeout=60_000):
        upload.click()
    page.wait_for_selector("text=Total Revenue", timeout=90_000)
    log["steps"].append("upload_ok")

    page.get_by_role("tab", name="AI Insights").click()
    for i, q in enumerate(ds["questions"]):
        textarea = page.get_by_placeholder(re.compile("Example:", re.I))
        textarea.fill(q)
        page.get_by_role("button", name=re.compile("^Ask AI$", re.I)).click()
        marker = "North" if ds["id"] == "generic" and i == 0 else (
            "Mumbai" if i == 0 else "revenue"
        )
        wait_ask_ready(page, marker)
        log["steps"].append(f"q{i+1}_ok")

    page.get_by_role("tab", name="Export").click()
    checks = [
        ("KPIs", True),
        ("AI Insight", True),
        ("Chart", True),
        ("Data Preview", True),
        ("Data Quality", True),
        ("AI conversation thread", False),
        ("Technical appendix", False),
    ]
    for label, exact in checks:
        cb = page.get_by_role("checkbox", name=label if exact else re.compile(label, re.I), exact=exact)
        if not cb.is_checked():
            cb.check()

    before = time.time()
    with page.expect_download(timeout=120_000) as dl_info:
        page.get_by_role("button", name=re.compile("Download Report PDF", re.I)).click()
    download = dl_info.value
    dest = OUT / f"p7-005-{ds['id']}-manual-export.pdf"
    download.save_as(str(dest))
    log["pdf"] = str(dest)
    log["download_ms"] = int((time.time() - before) * 1000)
    log["analysis"] = analyze_pdf(dest, ds["id"])
    page.screenshot(path=str(OUT / f"p7-005-{ds['id']}-export-tab.png"), full_page=True)
    return log


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        for ds in DATASETS:
            results.append(run_dataset(page, ds))
        browser.close()
    out_json = OUT / "p7-005-manual-results.json"
    out_json.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
