# Large Dataset Validation — Phase 3 (100,000 Rows)

Generated On: June 15, 2026

## Executive Summary

Phase 3 validates the AI Analytics SaaS against a **100,000-row retail-style dataset** (`test-fixtures/large-dataset/retail_100k.csv`, 11 columns, ~7.50 MB). **No application code was changed** during this phase. Validation was re-run from a clean state after a system restart (fresh browser session; no continuation of a prior stuck browser run).

**Verdict:** The stack is **functionally stable at 100k rows** under paid-tier limits — upload, profiling, dashboard generation, AI routing, Overview/Charts/Insights rendering, PNG export, and PDF export all complete without crashes, OOM, or browser freezes. Performance is **materially slower than 50k/10k** (~2× row count drives ~2–2.6× server work and ~2.3× UI upload-to-chart latency); this is a **capacity backlog**, not a functional blocker for a controlled pilot.

| Area | 100k result | 50k baseline | 10k baseline | vs 50k | Severity |
|------|-------------|--------------|--------------|--------|----------|
| Upload (live HTTP, warm) | ~58–64s | ~20s | ~5s | ~3× | High |
| Upload (`TestClient`, warm) | ~29–34s | ~12s | ~2s | ~2.5× | High |
| Profiling (`build_profile`) | ~12.0s | ~4.6s | ~0.79s | ~2.6× | High |
| Dashboard (backend only) | ~14.1s | ~5.5s | ~1.0s | ~2.6× | High |
| Overview UI first chart paint | ~48.8s | ~21.3s | ~6.6s | ~2.3× | High |
| AI insight (full `/ask`, HTTP) | ~26–67s | ~22–33s | ~8–11s | ~1.2–2× | High |
| AI viz routing only | ~209ms | ~68–174ms | ~20–76ms | ~1–3× | Low |
| Charts tab rendering | Pass | Pass | Pass | — | Pass |
| PNG export (browser) | ~6s | ~5–6s | — | Similar | Medium |
| PDF export (browser) | ~15s | ~10–12s | — | Similar | Medium |
| Browser long tasks (session) | ~30 tasks, ~5.2s total | ~3–5, ≤712ms | 0 | Higher | Medium |
| Backend RSS | **~357 MB** | ~264 MB | ~169 MB | +93 MB | Medium |

### Acceptance checklist

| Criterion | Result |
|-----------|--------|
| No crashes | **Pass** |
| No OOM | **Pass** (RSS ~357 MB; no process kill) |
| No browser freeze | **Pass** (long tasks present; max single ~507ms; tabs responsive) |
| Upload and dashboard usable | **Pass** (slow ~30–65s upload depending on path) |
| AI routing correct | **Pass** (`horizontalBar`, `revenue` × `city`, `ranking`, Ahmedabad top city) |
| PNG export works | **Pass** (Overview + Charts tab) |
| PDF export works | **Pass** (Export tab “Download Report PDF” ~15s; preview populated) |

---

## Test Environment

| Item | Value |
|------|--------|
| OS | Windows 10 (10.0.26200) |
| Dataset | `retail_100k.csv` — 100,000 rows, 11 columns, 7.50 MB (reused existing fixture) |
| Plan tier | Paid (`X-Plan-Tier: paid`; UI plan toggle set to Paid) |
| Backend | FastAPI on `127.0.0.1:8000` (confirmed healthy) |
| Frontend | Next.js dev on `localhost:3000` (confirmed healthy) |
| Timings | Wall-clock / `performance.now()` / `time.perf_counter()` only — **no tracemalloc** on SLO paths |
| Browser | Fresh MCP session (`viewId` new after restart); no prior stuck lock resumed |

---

## Measurement Results

### 1. Upload Time

| Method | Run 1 | Run 2 | Run 3 | Notes |
|--------|-------|-------|-------|-------|
| HTTP `POST /upload` (live server, isolated) | 64,371 ms | 58,274 ms | 58,627 ms | Warm server after prior 100k loads; avg **~60.4s** |
| HTTP `POST /upload` (browser `fetch`, new session) | 59,289 ms | — | — | CORS from `localhost:3000` |
| `TestClient` (warm in-process) | 33,842 ms | 30,726 ms | 28,647 ms | Avg **~31.1s**; no network |
| Overview UI (file input → first chart) | **48,791 ms** | — | — | Continuous poll until `.recharts-wrapper` |

**Stage decomposition (`TestClient`, warm):**

| Step | Avg (ms) |
|------|----------|
| CSV parse | 100.4 |
| `clean_dataframe` | 38.5 |
| **Profiling (`build_profile`)** | **11,982.3** |
| Semantic column mapping | 180.0 |

Response payload size: ~26 KB (preview capped; full dataset server-side).

**Bottleneck:** `build_profile` (~39% of in-process upload path) + `build_auto_dashboard` (~14s, see below). Live HTTP upload on a warm, memory-loaded server was **~2× slower** than `TestClient` (GC / RSS pressure / concurrent uvicorn work).

---

### 2. Profiling Time

`build_profile` on 100k rows: **11,774–12,154 ms** (avg **11,982 ms**).

| Rows | Profiling avg | Ratio vs 10k |
|------|---------------|--------------|
| 10k | 791 ms | 1× |
| 50k | 4,565 ms | 5.8× |
| 100k | 11,982 ms | **15.2×** |

Scaling is **super-linear** between 50k→100k (~2.6× for 2× rows). Dominant CPU block on the upload path.

**Proposed fix (report only):** Sampled profiling above row threshold; parallel column stats; cache profile on re-upload.

---

### 3. Auto Dashboard Generation Time

| Component | 100k avg (ms) | 50k avg (ms) | 10k avg (ms) |
|-----------|---------------|--------------|--------------|
| `build_auto_dashboard()` | **14,101.8** | 5,492 | 1,017 |
| Auto chart count | **6** | 6 | 7 |

**Target:** Dashboard &lt;3s (backend) → **fail at 100k** (~14.1s).

**Proposed fix (report only):** Profile `discover_chart_opportunities`; defer non-critical suggested questions; progressive dashboard response.

---

### 4. Overview UI First Chart Paint

| Observation | 100k | 50k | 10k |
|-------------|------|-----|-----|
| Time to first `.recharts-wrapper` | **48,791 ms** | 21,264 ms | 6,558 ms |
| Charts on Overview | 6 | 6 | 7 |
| Row badge | 100,000 | 50,000 | 10,000 |
| KPI / AI summary populated | Yes | Yes | Yes |

Charts render correctly (trends, bars, scatter). No empty states or crashes.

---

### 5. AI Insights `/ask` Timing & Routing

| Path | 100k latency | Notes |
|------|--------------|-------|
| `compute_visualization_for_question` (routing only) | **209 ms** avg | Warm in-process |
| `POST /ask` (`TestClient`) | **41,088–41,141 ms** | Ranking question + narrative (LLM path) |
| `POST /ask` (HTTP live, isolated) | **26,032 ms** | After warm uploads; chart + narrative |
| `POST /ask` (browser `fetch`, fresh session) | **66,523 ms** | New session id after UI upload |

**Routing correctness (verified on 100k):**

| Field | Value |
|-------|-------|
| `chartType` | `horizontalBar` |
| `metricColumn` | `revenue` |
| `categoryColumn` | `city` |
| `intent` | `ranking` |
| Chart points | 15 |
| Top city (100k fixture) | **Ahmedabad** (~1.00B revenue) |
| HTTP status | 200 |

Export tab preview also showed aligned insight copy (Ahmedabad, 100k row cohort) after PDF export click.

**Proposed fix (report only):** Stream narrative; show chart before LLM returns; fail faster on LLM SSL retry in dev.

---

### 6. Charts Tab Rendering

| Check | Result |
|-------|--------|
| Timeline after 100k upload | **6 auto-dashboard entries** |
| Select “Revenue vs Profit” → preview | **Pass** (~658 ms to Recharts after selection) |
| Recharts in preview | 1 wrapper |
| Tab navigation | Responsive |

---

### 7. PNG Export

| Location | Result | Approx. time |
|----------|--------|--------------|
| Charts tab (“Download Chart PNG”) | **Pass** | ~6,014 ms |
| Overview mini-chart (“Export this chart as a PNG image”) | **Pass** | ~6,014 ms |

---

### 8. PDF Export

| Method | Result | Time |
|--------|--------|------|
| Export tab “Download Report PDF” | **Pass** — download triggered; preview showed KPI + AI context | ~15,005 ms |
| Phase 7 vitest (`vitest.phase7.config.ts`) | **18/18 pass** | 2,114 ms total (~**117 ms/PDF** on fixtures) |

**Note:** Fixture PDF bench does not exercise live 100k session chart capture. Trend-chart image gaps on PDF Visualization pages are tracked separately (see prior RCA on Monthly Revenue Trend capture readiness); export **completed** without crash at 100k.

---

### 9. Browser Responsiveness / Long Tasks

Measured across the full fresh browser session (upload → Overview → Charts → Export → API spot-check):

| Metric | Value |
|--------|-------|
| Long-task events (Performance API) | **~30** |
| Cumulative long-task duration | **~5,205 ms** |
| Max single long task | **~507 ms** |
| UI freeze / crash | **None** |
| Dev hydration warning | Present in header (`app-header.tsx`) — dev-only |

Long tasks cluster around post-upload Recharts paint (6 mini charts). UI remained navigable throughout.

---

### 10. Backend Memory Usage

| Metric | 100k | 50k | 10k |
|--------|------|-----|-----|
| RSS before processing | 140.2 MB | 134.6 MB | — |
| RSS after upload + profile + dashboard + `/ask` | **356.6 MB** | 263.1 MB | ~169 MB |
| Delta | **+216 MB** | +128 MB | — |
| OOM / process kill | **None** | None | None |

Memory growth is consistent with a 100k-row in-memory DataFrame plus profile aggregates. **~357 MB** is within acceptable pilot bounds but should be monitored before multi-tenant hosting.

**Proposed fix (report only):** Monitor at sustained concurrency; dtype downcasting; optional column pruning for unused fields.

---

## Findings by Severity

### Critical

_None._ No crashes, data loss, OOM, or incorrect routing at 100k rows.

---

### High

| ID | Finding | Evidence | Bottleneck | Proposed fix |
|----|---------|----------|------------|--------------|
| H-01 | **Live HTTP upload ~58–64s** on warm server | 3-run isolated HTTP avg ~60.4s | `build_profile` + `build_auto_dashboard` + JSON compose under RSS pressure | Lazy/sampled profile; parallel dashboard; streaming upload response |
| H-02 | **Profiling ~12s** (~2.6× vs 50k) | `build_profile` bench 11,982 ms avg | Per-column `describe` / `nunique` over 100k × 11 cols | Sampled stats above threshold; cache on re-upload |
| H-03 | **Dashboard backend ~14.1s** | `build_auto_dashboard` bench | `discover_chart_opportunities` scan | Cap opportunity scan; profile hot path |
| H-04 | **Overview UI first paint ~49s** | Browser E2E 48,791 ms | Server upload + React render of 6 charts | Progressive dashboard; lazy chart mount |
| H-05 | **Full `/ask` ~26–67s** | HTTP 26s warm; browser 66.5s fresh session | LLM narrative + SSL retry variance | Stream narrative; chart-first response |

---

### Medium

| ID | Finding | Evidence | Proposed fix |
|----|---------|----------|--------------|
| M-01 | **Backend RSS ~357 MB** (+93 MB vs 50k) | `psutil` after session | Monitor multi-session; dtype optimization |
| M-02 | **HTTP upload ~2× slower than TestClient** at 100k | ~60s HTTP vs ~31s TestClient | Dedicated worker pool; avoid concurrent bench on same process |
| M-03 | **Long tasks ~5.2s cumulative** during session | PerformanceObserver | Lazy-mount Overview mini charts |
| M-04 | **PNG/PDF ~6–15s** at 100k | Browser click timing | Acceptable for pilot; optimize capture resolution later |
| M-05 | **Super-linear profiling scale** 50k→100k | 4.6s → 12.0s | Column-level sampling (see H-02) |

---

### Low

| ID | Finding | Evidence | Proposed fix |
|----|---------|----------|--------------|
| L-01 | **Viz routing ~209ms** at 100k | Still sub-300ms | No action for pilot |
| L-02 | **Dev hydration warning** | Next.js overlay | Track separately from prod build |
| L-03 | **Phase 7 fixture PDF ~117ms/PDF** | Vitest 2,114 ms / 18 tests | Regression baseline only |
| L-04 | **6 auto charts vs 7 at 10k** | Opportunity variance | Review thresholds at scale |

---

## Scaling Summary

| Stage | 10k → 50k | 50k → 100k | 10k → 100k |
|-------|-----------|------------|------------|
| Rows | 5× | 2× | 10× |
| File size | 5× | 2× | 10× |
| Profiling | 5.8× | 2.6× | 15.2× |
| Dashboard | 5.4× | 2.6× | 13.9× |
| TestClient upload | ~6× | 2.5× | ~15× |
| UI first chart | 3.2× | 2.3× | 7.4× |
| Memory RSS | — | +35% | +111% vs 10k |

Server-side work scales **worse than linear** on profiling/dashboard; memory scales **better than linear** (sub-2× per 2× rows).

---

## Reproduction

Dataset (existing fixture — not regenerated):

```
test-fixtures/large-dataset/retail_100k.csv
```

In-process decomposition + memory:

```bash
cd backend
python scripts/large_dataset_validation.py 100000
```

Live HTTP bench (server on :8000):

```bash
cd backend
python scripts/large_dataset_http_bench.py 100000
```

Browser E2E (optional — copy CSV to `frontend/public/` temporarily for `fetch` upload):

```bash
# cp test-fixtures/large-dataset/retail_100k.csv frontend/public/retail_100k_validation.csv
# Start frontend :3000, backend :8000, set Paid plan, upload via Overview
```

Phase 7 PDF fixture bench:

```bash
cd frontend
npx vitest run --config vitest.phase7.config.ts
```

---

## Next Steps (not executed here)

1. **Profile optimization** — `cProfile` on `build_profile` and `build_auto_dashboard` at 100k+
2. **Progressive upload UX** — KPI/summary first, charts lazy
3. **PDF trend-chart capture** — align PDF readiness with PNG export path (see prior RCA)
4. **Prod build perf pass** — dev hydration vs production bundle
5. **Concurrency / memory ceiling** — multi-session load test before SaaS multi-tenant

**No code fixes were applied in Phase 3** — findings are report-only pending prioritization.
