#!/usr/bin/env python3
"""cProfile first upload in fresh subprocess."""
from __future__ import annotations

import cProfile
import pstats
import io
import os
import subprocess
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
CSV = REPO / "test-fixtures" / "large-dataset" / "retail_10k.csv"

profiler_code = f'''
import cProfile, pstats, io, os, sys, time
from pathlib import Path
os.chdir({str(BACKEND)!r})
sys.path.insert(0, os.getcwd())
file_bytes = Path({str(CSV)!r}).read_bytes()

def run_upload():
    import main as m
    from fastapi.testclient import TestClient
    c = TestClient(m.app)
    h = {{"X-Plan-Tier":"paid","X-Session-Id":"prof"}}
    return c.post("/upload", files={{"file":("retail_10k.csv", file_bytes, "text/csv")}}, headers=h)

pr = cProfile.Profile()
pr.enable()
t0 = time.perf_counter()
r = run_upload()
wall = (time.perf_counter()-t0)*1000
pr.disable()
print("WALL_MS", round(wall,1), "STATUS", r.status_code)
s = io.StringIO()
ps = pstats.Stats(pr, stream=s)
ps.sort_stats("cumulative")
ps.print_stats(40)
print("PROFILE_START")
print(s.getvalue())
print("PROFILE_END")
'''

proc = subprocess.run([sys.executable, "-c", profiler_code], capture_output=True, text=True, timeout=300)
text = proc.stdout
for line in text.splitlines():
    if line.startswith("WALL_MS") or line.startswith("STATUS"):
        print(line)
if proc.stderr:
    print("STDERR tail:", proc.stderr[-2000:])
# extract profile
if "PROFILE_START" in text:
    prof = text.split("PROFILE_START", 1)[1].split("PROFILE_END", 1)[0]
    lines = [ln for ln in prof.splitlines() if ln.strip()][:45]
    print("\n".join(lines))
