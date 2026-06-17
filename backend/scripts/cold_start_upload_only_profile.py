#!/usr/bin/env python3
"""Profile upload handler only (main pre-imported)."""
from __future__ import annotations

import cProfile
import io
import os
import pstats
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
CSV = REPO / "test-fixtures" / "large-dataset" / "retail_10k.csv"

os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

import main as main_mod  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

file_bytes = CSV.read_bytes()
headers = {"X-Plan-Tier": "paid", "X-Session-Id": "upload-only-prof"}
client = TestClient(main_mod.app)

pr = cProfile.Profile()
pr.enable()
t0 = time.perf_counter()
resp = client.post(
    "/upload",
    files={"file": ("retail_10k.csv", file_bytes, "text/csv")},
    headers=headers,
)
wall = (time.perf_counter() - t0) * 1000
pr.disable()
print(f"upload_only_ms={wall:.1f} status={resp.status_code}")

s = io.StringIO()
ps = pstats.Stats(pr, stream=s)
ps.sort_stats("cumulative")
ps.print_stats(50)
print(s.getvalue())
