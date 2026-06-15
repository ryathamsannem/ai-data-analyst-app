# Cold-Start Upload Latency Analysis

Generated On: June 15, 2026

## Summary

The **~41s first-upload** figure from Phase 1 large-dataset validation was **not representative of production upload handling**. It was measured with **`tracemalloc.start()` enabled** during the first `POST /upload`, which adds heavy per-allocation tracing overhead across millions of pandas/FastAPI calls.

**Without tracemalloc**, on the same 10,000-row dataset (`test-fixtures/large-dataset/retail_10k.csv`):

| Scenario | First upload | Second upload |
|----------|-------------|---------------|
| `TestClient` (main already imported) | **~2.1–2.4s** | **~2.0–2.6s** |
| Fresh subprocess (`import main` + upload) | **~6.7s wall** | **~2.4s** |
| Live HTTP (`uvicorn` already running) | **~4.9–5.7s** | **~4.9–5.7s** |
| With `tracemalloc.start()` | **~24–41s** | **~30–50s** |

**Pinpointed bottleneck (real path):** Process-level **`import main`** (~1.7s) plus first-request **column typing** (`detect_column_types` / `pd.to_datetime` on every column) and **auto-dashboard opportunity discovery** (~2–3s combined). **No LLM call, embedding load, or model warmup occurs on the upload endpoint.**

---

## Observed vs Reproduced

| Source | First upload | Notes |
|--------|-------------|-------|
| Phase 1 bench (`tracemalloc` on) | **41,519 ms** | Documented in `large-dataset-validation-10k.md` |
| Re-run with `tracemalloc` | **24,152–32,936 ms** | Same inflation pattern |
| Re-run without `tracemalloc` | **2,140–2,448 ms** | Same code, same CSV |
| Live `uvicorn` HTTP | **4,889–5,701 ms** | Network + ASGI; server already warm |

---

## Instrumentation Results

Environment: Windows 10, Python 3.x (Anaconda), FastAPI `TestClient`, paid tier, 10k retail CSV.

Probe scripts (analysis only, not used in production): `backend/scripts/cold_start_probe.py`, `cold_start_minimal.py`, `cold_start_upload_only_profile.py`.

### A. End-to-end cold path (fresh subprocess, no tracemalloc)

| Stage | Duration (ms) | Notes |
|-------|---------------|-------|
| **1. Process start → `import main`** | **1,743** | Loads pandas, FastAPI, **Anthropic client (eager)**, services |
| 2. `TestClient` construction | 0.1 | Negligible |
| **3. First `POST /upload` (HTTP total)** | **2,316** | Handler + response |
| 4. Second `POST /upload` | 2,598 | No material warmup delta |
| **Wall to first upload complete** | **6,658** | Import + upload |

### B. Upload handler breakdown (main pre-imported, cProfile, no tracemalloc)

| Stage | Duration (ms) | % of upload |
|-------|---------------|-------------|
| **1. Upload endpoint entry** (`upload_file`) | **4,905** | 100% (total) |
| 2. File read (`await file.read()`) | &lt;1 | In-memory `TestClient` |
| **3. Pandas `read_csv`** (`load_dataframe_from_upload`) | **~10** | &lt;1% |
| 3b. `clean_dataframe` | ~3 | &lt;1% |
| **4. Profiling — `detect_column_types`** | **~3,176** | **~65%** |
| ↳ `_datetime_parse_ratio` / `pd.to_datetime` (×2 per column × 11 cols) | ~2,777 | Dominant sub-step |
| **4b. Profiling — `build_profile`** (`describe` + `nunique`) | **~1,899** | **~39%** (overlaps typing in same pass) |
| **5. Dataset metadata — semantic mapping** | **~13** | `apply_semantic_column_mapping` |
| **6. Dashboard generation** | **~2,515** | `build_auto_dashboard` |
| ↳ `discover_chart_opportunities` | ~2,689 | First-pass chart candidate scan |
| ↳ `build_dashboard_charts_from_opportunities` | ~2,034 | Chart payload assembly |
| 6a. KPI cards | ~204 | |
| 6c. Suggested questions | ~5 | `intent_engine` already warm |
| 6d. Dimension catalog | ~2 | |
| 6e. Filter breadcrumb | &lt;1 | |
| **7. LLM initialization / call** | **0** | **Not invoked on upload** |
| **8. Embedding / model loading** | **N/A** | **No embeddings in codebase** |
| **9. Lazy imports (first upload)** | **~2** | `geographic_scope`; suggested_questions engine ~0ms |
| **10. Startup cache creation** | **0** | No persistent cache; in-memory globals only |
| JSON serialize response | ~0.4 | ~26 KB payload |

*Note: cProfile stages overlap (typing runs inside `build_profile` path via shared `detect_column_types`). Treat **~3.2s datetime typing + ~0.7s describe/nunique + ~2.5s dashboard discovery** as the three real CPU blocks.*

### C. Process import stack (before any upload, isolated `importlib`)

| Stage | Duration (ms) |
|-------|---------------|
| `import numpy` | 76 |
| `import pandas` | 415 |
| `import fastapi` | 374 |
| **`import anthropic`** | **702** |
| `import uvicorn` | 23 |
| `import main` (incremental after deps) | 297 |
| **Total typical import chain** | **~1,750–1,940** |

Anthropic client is constructed at **`main.py` import time** (`client = Anthropic(...)`), not on first upload.

### D. `tracemalloc` artifact (explains ~41s observation)

| Condition | Upload #1 (ms) | Upload #2 (ms) |
|-----------|----------------|----------------|
| Normal | 2,140 | 2,019 |
| `tracemalloc.start()` before upload | **24,152** | **30,295** |
| Phase 1 original measurement | **41,519** | 2,085 (warm) |

`tracemalloc` traces **~12–14M function calls** on a single upload (pandas `to_datetime`, groupby, dashboard discovery). **Do not use tracemalloc for upload SLO measurement.**

---

## Bottleneck Ranking (production-relevant)

| Rank | Stage | Impact | First-hit only? |
|------|-------|--------|-----------------|
| **1** | **`detect_column_types` / `pd.to_datetime`** | **~1.7–3.2s** of upload | Slightly faster on repeat; still costly every upload |
| **2** | **`discover_chart_opportunities`** | **~1.7–2.7s** | Similar each upload |
| **3** | **`build_profile` numeric `describe`** | **~0.7–0.9s** | Every upload |
| **4** | **`import main` (process cold)** | **~1.7s** | Once per worker process |
| **5** | **`import anthropic` at module load** | **~0.7s** | Once per process (not upload-specific) |
| — | `read_csv` 10k | ~8–10ms | Negligible |
| — | LLM / embeddings | 0 | Not on upload path |

---

## Ruled Out (possible causes from brief)

| Hypothesis | Verdict |
|------------|---------|
| Lazy model / embedding loading | **Ruled out** — no embedding or ML model code |
| First LLM client init on upload | **Ruled out** — client created at import; upload does not call Claude |
| First `pandas` / `numpy` import inside upload | **Partial** — import happens at `import main`; not inside handler |
| First chart cache creation | **Ruled out** — no disk cache; opportunities recomputed each upload |
| AI service warmup on upload | **Ruled out** — no `/ask` on upload |
| Upload handler regression | **Ruled out** — warm uploads consistently ~2–5s |

---

## Upload Code Path (reference)

```
POST /upload
  → file.read()                         # bytes in memory
  → load_dataframe_from_upload()        # read_csv ~10ms
  → clean_dataframe()
  → build_profile()
      → detect_column_types()           # ← primary CPU sink (to_datetime × columns)
      → describe() + nunique()
  → apply_semantic_column_mapping()
  → build_upload_response()
      → build_kpi_cards()
      → build_auto_dashboard()
          → discover_chart_opportunities()  # ← secondary CPU sink
          → build_dashboard_charts_from_opportunities()
      → build_suggested_questions()
      → dimension catalog + breadcrumb
  → JSON response (~26 KB)
```

**`/ask` and narrative generation are not called.**

---

## Frontend Note

Frontend startup does **not** add to backend upload time. Browser-measured upload (~4.4s) reflects backend processing + HTTP; the **~41s figure was backend benchmark instrumentation**, not React hydration.

---

## Reproduction

```bash
cd backend

# A) Clean cold wall (import + first upload)
python scripts/cold_start_minimal.py

# B) Full stage table
python scripts/cold_start_probe.py

# C) cProfile upload only (main pre-imported)
python scripts/cold_start_upload_only_profile.py

# D) tracemalloc inflation demo (do NOT use for SLOs)
python -c "
import time, sys, tracemalloc
from pathlib import Path
sys.path.insert(0,'.')
import main as m
from fastapi.testclient import TestClient
b=Path('../test-fixtures/large-dataset/retail_10k.csv').read_bytes()
c=TestClient(m.app)
tracemalloc.start()
t=time.perf_counter()
c.post('/upload', files={'file':('retail_10k.csv',b,'text/csv')}, headers={'X-Plan-Tier':'paid'})
print(round((time.perf_counter()-t)*1000,1), 'ms')
"
```

---

## Conclusion

| Question | Answer |
|----------|--------|
| Where is the **41s** spent? | Primarily **`tracemalloc` tracing overhead** (~24–41s), not production upload logic. |
| Real first-upload cost (no tracing)? | **~2.3s** in-process after `import main`; **~6.7s** cold subprocess; **~5s** live HTTP. |
| Top real bottleneck? | **`detect_column_types`** (`pd.to_datetime` on all columns) + **`discover_chart_opportunities`**. |
| LLM / models on upload? | **No.** |

**No fixes applied** — analysis only. Optimization candidates (future): sample rows for datetime inference, defer dashboard discovery, lazy Anthropic import, worker pre-warm.
