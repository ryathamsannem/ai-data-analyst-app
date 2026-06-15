#!/usr/bin/env python3
"""Minimal cold start: only `import main` then first upload (matches TestClient bench)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
CSV = REPO / "test-fixtures" / "large-dataset" / "retail_10k.csv"

code = f'''
import os, sys, time, json
from pathlib import Path
os.chdir({str(BACKEND)!r})
sys.path.insert(0, os.getcwd())
file_bytes = Path({str(CSV)!r}).read_bytes()
t_process = time.perf_counter()
t0 = time.perf_counter()
import main as m
import_ms = (time.perf_counter()-t0)*1000
from fastapi.testclient import TestClient
t0 = time.perf_counter()
c = TestClient(m.app)
tc_ms = (time.perf_counter()-t0)*1000
h = {{"X-Plan-Tier":"paid","X-Session-Id":"minimal-cold"}}
t0 = time.perf_counter()
r1 = c.post("/upload", files={{"file":("retail_10k.csv", file_bytes, "text/csv")}}, headers=h)
up1 = (time.perf_counter()-t0)*1000
t0 = time.perf_counter()
r2 = c.post("/upload", files={{"file":("retail_10k.csv", file_bytes, "text/csv")}}, headers=h)
up2 = (time.perf_counter()-t0)*1000
print(json.dumps({{
  "import_main_ms": round(import_ms,1),
  "testclient_ms": round(tc_ms,1),
  "upload1_ms": round(up1,1),
  "upload2_ms": round(up2,1),
  "total_to_upload1_ms": round((time.perf_counter()-t_process)*1000 - up1, 1),
  "wall_to_upload1_done_ms": round((time.perf_counter()-t_process)*1000,1),
  "status": [r1.status_code, r2.status_code]
}}))
'''

proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=300)
print(proc.stdout)
if proc.stderr:
    print("STDERR:", proc.stderr[-3000:])
print("exit", proc.returncode)
