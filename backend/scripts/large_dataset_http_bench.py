#!/usr/bin/env python3
"""HTTP upload/ask timing against live uvicorn (no tracemalloc)."""
from __future__ import annotations

import sys
import time
from pathlib import Path

import requests

rows = int(sys.argv[1]) if len(sys.argv) > 1 else 50_000
csv = Path(__file__).resolve().parents[2] / "test-fixtures" / "large-dataset" / f"retail_{rows//1000}k.csv"
b = csv.read_bytes()
h = {"X-Plan-Tier": "paid", "X-Session-Id": f"http-{rows}"}
url = "http://127.0.0.1:8000"

print("health", requests.get(url + "/health", timeout=10).status_code)
for i in range(3):
    t = time.perf_counter()
    r = requests.post(
        url + "/upload",
        files={"file": (csv.name, b, "text/csv")},
        headers=h,
        timeout=300,
    )
    print(f"upload_{i+1}_ms", round((time.perf_counter() - t) * 1000, 1), "status", r.status_code)

t = time.perf_counter()
r = requests.post(
    url + "/ask",
    json={"question": "Which city generates the highest revenue?", "dashboard_filters": []},
    headers=h,
    timeout=300,
)
ms = round((time.perf_counter() - t) * 1000, 1)
body = r.json()
viz = body.get("visualization") or {}
print("ask_ms", ms, "chart", viz.get("chartType"), "status", r.status_code)
