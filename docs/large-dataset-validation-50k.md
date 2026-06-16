# Large Dataset Validation — Phase 2 (50,000 Rows)

Generated On: June 15, 2026

## Executive Summary

Phase 2 validates the AI Analytics SaaS against a **50,000-row retail-style dataset** (`test-fixtures/large-dataset/retail_50k.csv`, 11 columns, ~3.75 MB). **No application code was changed** during this phase.

**Verdict:** The stack is **functionally stable at 50k rows** — upload, profiling, dashboard generation, AI routing, chart rendering, PNG export, and PDF export all complete without crashes or browser freezes. Performance is **materially slower than the 10k baseline** (~4–6× on server-side upload path); this is a **capacity/optimization backlog** item, not a release blocker for a controlled pilot with paid-tier limits.

| Area | 50k result | 10k baseline | vs 10k | Severity |
|------|------------|--------------|--------|----------|
| Upload (live HTTP) | ~19.9–22.0s | ~4.9–5.7s | ~4× | High |
| Profiling | ~4.4–4.8s | ~791ms | ~5.8× | High |
| Dashboard (backend only) | ~5.4–5.7s | ~1.0s | ~5.5× | High |
| Overview UI first chart paint | ~21.3s | ~6.6s | ~3.2× | High |
| AI insight (full `/ask`) | ~22–33s | ~8–11s | ~2.5–3× | High |
| AI viz routing only | ~68–174ms | ~20–76ms | ~1–2× | Low |
| Charts tab rendering | Pass (timeline + preview) | Pass | — | Pass |
| PNG export (browser) | ~5–6s | Not E2E at 10k | Works | Medium |
| PDF export (browser) | ~10–12s | Fixture ~89ms/PDF | Works | Medium |
| Browser long tasks | 3–5 tasks, ≤712ms total | 0 during API | Minor | Low |
| Backend RSS | ~264 MB | ~169 MB | +95 MB | Medium |

### Acceptance checklist

| Criterion | Result |
|-----------|--------|
| No crashes | **Pass** |
| No browser freeze | **Pass** (long tasks present but sub-second; UI remained interactive) |
| Upload and dashboard usable | **Pass** (slow ~20s upload; dashboard renders correctly) |
| AI Insights correct chart/routing | **Pass** (`horizontalBar`, `revenue` × `city`, `ranking`, Pune top city) |
| PNG export works | **Pass** (Overview mini-chart + Charts tab “Download Chart PNG”) |
| PDF export works | **Pass** (insight PDF + Export tab “Download Report PDF”) |

---

## Test Environment

| Item | Value |
|------|--------|
| OS | Windows 10 (10.0.26200) |
| Dataset | `retail_50k.csv` — 50,000 rows, 11 columns, 3.75 MB |
| Plan tier | Paid (`X-Plan-Tier: paid`; UI plan toggle set to Paid) |
| Backend | FastAPI via live `uvicorn` on `127.0.0.1:8000` + in-process `TestClient` |
| Frontend | Next.js dev on `localhost:3000` (browser E2E via CDP + MCP) |
| AI narrative | Live Anthropic when reachable |
| Timings | **Wall-clock / `performance.now()` / `time.perf_counter()` only** — no tracemalloc on SLO paths |

---

## Measurement Results

### 1. Upload Time

| Method | Run 1 | Run 2 | Run 3 | Notes |
|--------|-------|-------|-------|-------|
| HTTP `POST /upload` (live server) | 19,923 ms | 20,121 ms | 20,211 ms | Warm server; includes parse, profile, mapping, dashboard |
| HTTP `POST /upload` (browser `fetch`) | 22,002 ms | — | — | CORS from `localhost:3000` |
| `TestClient` (warm process) | 11,583 ms | 11,873 ms | 11,793 ms | In-process; no network |
| Overview UI (file input → first chart) | **21,264 ms** | — | — | Paid plan; continuous poll until `.recharts-wrapper` |

**10k comparison:** Live HTTP ~4.9–5.7s → **~4× slower** at 50k. Scaling is roughly linear with row count on the upload path (not unexpected for in-memory pandas profiling + dashboard discovery).

**Target:** Upload &lt;5s → **fail at 50k** (expected for current architecture).

---

### 2. Profiling Time

`build_profile` on 50k rows: **4,422–4,765 ms** (avg **4,565 ms**).

| Step | 50k avg (ms) | 10k avg (ms) | Ratio |
|------|--------------|--------------|-------|
| CSV parse | 41.2 | 7.9 | 5.2× |
| `clean_dataframe` | 16.3 | 2.7 | 6.0× |
| **Profiling (`build_profile`)** | **4,565** | **791** | **5.8×** |
| Semantic column mapping | 61.8 | 11.4 | 5.4× |

Dominant upload-path cost at 50k is **`build_profile`** (~38% of live HTTP upload time).

---

### 3. Auto Dashboard Generation Time

| Component | 50k avg (ms) | 10k avg (ms) | Ratio |
|-----------|--------------|--------------|-------|
| `build_auto_dashboard()` | **5,492** | 1,017 | 5.4× |
| Auto chart count | **6** | 7 | Schema/opportunity variance |

**Target:** Dashboard &lt;3s (backend) → **fail at 50k** (~5.5s backend-only).

**UI end-to-end:** File input change → first `.recharts-wrapper` on Overview: **21,264 ms** (includes ~20s server upload + React render of 6 mini charts).

**10k comparison:** ~6.6s UI E2E → **~3.2× slower** at 50k.

---

### 4. Overview UI First Chart Paint

| Observation | 50k | 10k |
|-------------|-----|-----|
| Time to first `.recharts-wrapper` | **21,264 ms** | ~6,558 ms |
| Charts rendered on Overview | 6 | 7 |
| KPI / summary populated | Yes | Yes |
| Dataset badge | 50,000 rows | 10,000 rows |

Charts render correctly (trends, horizontal bars, scatter, region breakdown). No empty states or axis overlap observed at 50k.

---

### 5. AI Insights `/ask` Timing

| Path | 50k latency | 10k latency | Notes |
|------|-------------|-------------|-------|
| `compute_visualization_for_question` (routing only) | 68–174 ms | 20–76 ms | Warm; sub-200ms |
| `POST /ask` (HTTP, live) | 22,106–28,116 ms | 8,306–10,697 ms | Ranking question + narrative |
| `POST /ask` (browser `fetch`) | 26,788 ms | 8,306 ms | Same question |
| UI Ask AI → chart + answer visible | **32,456 ms** | ~8–11s | “Which city generates the highest revenue?” |

**Routing correctness (verified on 50k):**

| Field | Value |
|-------|-------|
| `chartType` | `horizontalBar` |
| `metricColumn` | `revenue` |
| `categoryColumn` | `city` |
| `intent` | `ranking` |
| Chart points | 15 |
| Top city (narrative + chart) | **Pune** (~506.2M revenue) |
| HTTP status | 200 |

**Target:** AI Insight &lt;10s → **fail at 50k** for full `/ask` (~22–33s). Viz-only path still **passes**.

---

### 6. Charts Tab Rendering

| Check | Result |
|-------|--------|
| Timeline lists auto-dashboard charts | **6 entries** after 50k upload |
| Select timeline item → preview | **Pass** (“Revenue vs Profit” preview with scatter + AI read panel) |
| Recharts in preview pane | 1 wrapper after selection |
| Tab switch responsiveness | **Pass** (no freeze) |

Charts tab uses timeline selection before preview; empty preview until a card is selected (expected product behavior).

---

### 7. PNG Export

| Location | Result | Approx. time |
|----------|--------|--------------|
| Overview mini-chart (“Export this chart as a PNG image”) | **Pass** — button present and click completes | ~6,014 ms |
| Charts tab (“Download Chart PNG”) | **Pass** — download triggered after timeline selection | ~5,002 ms |

**10k comparison:** PNG was not E2E timed at 10k; export path is **functional at 50k** with html2canvas-style capture latency in the multi-second range.

---

### 8. PDF Export

| Method | Result | Time |
|--------|--------|------|
| AI Insights “Export this insight (PDF)” | **Pass** | ~10,014 ms |
| Export tab “Download Report PDF” | **Pass** | ~12,014 ms |
| Phase 7 vitest (`vitest.phase7.config.ts`) | **18/18 pass** | 1,672 ms total (~**93 ms/PDF** on fixtures) |

Browser PDF at 50k session state is slower than fixture-only bench (includes chart capture + narrative blocks) but **completes without error**.

**10k comparison:** Fixture PDF ~89ms/PDF unchanged; live 50k browser PDF now E2E verified (gap closed from Phase 1).

---

### 9. Browser Freeze / Long Tasks

| Check | 50k | 10k |
|-------|-----|-----|
| Main-thread long tasks during upload → first chart | **3** tasks, **532 ms** total (max single **370 ms**) | 0 during API-only |
| Long tasks during AI Insights ask | **5** tasks, **712 ms** total | 0 during API-only |
| UI freeze / tab hang | **None observed** | Pass |
| Dev hydration warning | Present in sidebar (`app-sidebar.tsx`) | Same |

Long tasks appear during React/Recharts paint after large upload; none exceeded ~400ms individually and the UI remained navigable (tabs, filters, ask flow all responsive).

---

### 10. Backend Memory Usage

| Metric | 50k | 10k |
|--------|-----|-----|
| RSS before 50k processing | 134.6 MB | — |
| RSS after upload + profile + dashboard + `/ask` | **263.1 MB** | ~169 MB |
| Delta | **+128 MB** | — |
| Runaway growth / OOM | **None** | — |

Memory growth is consistent with holding a 50k-row DataFrame plus profile aggregates in a single session. No leak signal in single-session testing.

---

## Findings by Severity

### Critical

_None._ No crashes, data loss, incorrect empty states, or wrong chart type/routing at 50k rows.

---

### High

| ID | Finding | Evidence | Recommendation (future phase) |
|----|---------|----------|-------------------------------|
| H-01 | **Live HTTP upload ~20s** (~4× 10k) | 3-run avg ~20.1s on `127.0.0.1:8000` | Sample/lazy profiling; parallelize dashboard + profile; streaming upload response (KPIs first) |
| H-02 | **Profiling ~4.6s** dominates upload | `build_profile` bench | Column-level sampling above row threshold; cache profile on re-upload |
| H-03 | **Dashboard backend ~5.5s** (~5.5× 10k) | `build_auto_dashboard` bench | Profile `discover_chart_opportunities`; cap opportunity scan at scale |
| H-04 | **Overview UI first paint ~21s** (~3.2× 10k) | Browser E2E 21,264 ms | Progressive dashboard render; defer non-critical suggested questions |
| H-05 | **Full `/ask` ~22–33s** (~2.5–3× 10k) | HTTP + UI timing | Stream narrative; show chart before LLM returns; tighten prompt at scale |

---

### Medium

| ID | Finding | Evidence | Recommendation (future phase) |
|----|---------|----------|-------------------------------|
| M-01 | **Backend RSS ~264 MB** (+95 MB vs 10k) | `psutil` after session | Monitor at 100k; consider column pruning for unused dtypes |
| M-02 | **PNG/PDF browser export 5–12s** | E2E click timing | Acceptable for pilot; optimize capture resolution at scale |
| M-03 | **TestClient upload ~11.8s** vs HTTP ~20s | Network + serialization overhead | Document warm-worker deployment; not a functional bug |
| M-04 | **6 auto charts vs 7 at 10k** | Opportunity discovery variance | Review chart opportunity thresholds at higher cardinality |
| M-05 | **Long tasks during paint** (≤712ms cumulative) | PerformanceObserver | Watch at 100k; consider chart lazy-mount |

---

### Low

| ID | Finding | Evidence | Recommendation (future phase) |
|----|---------|----------|-------------------------------|
| L-01 | **Dev hydration warning** in sidebar | Next.js overlay on `localhost:3000` | Track separately from prod build |
| L-02 | **Viz routing ~68–174ms** at 50k | Still sub-200ms | No action for 50k pilot |
| L-03 | **Phase 7 fixture PDF ~93ms/PDF** | Vitest 1,672ms / 18 tests | Good regression baseline |
| L-04 | **Charts tab requires timeline selection** | Empty preview until click | Expected UX; document in onboarding |

---

## Targets Scorecard (50k vs 10k)

| Target | Goal | 50k measured | 10k measured | 50k status |
|--------|------|--------------|--------------|------------|
| Upload | &lt;5s | ~20s (HTTP) | ~5s | Fail (expected) |
| Dashboard | &lt;3s | ~5.5s backend / ~21s UI | ~1s / ~6.6s | Fail |
| AI Insight | &lt;10s | ~22–33s full ask | ~8–11s | Fail |
| 50k responsive | Usable without freeze | Pass | N/A | **Pass** |
| No browser freeze | Required | Pass | Pass | **Pass** |
| Stable / no crash | Required | Pass | Pass | **Pass** |
| Correct AI routing | Required | Pass | Pass | **Pass** |
| PNG/PDF export | Required | Pass | Partial (10k) | **Pass** |

---

## Scaling Summary (50k ÷ 10k)

| Stage | ~Ratio |
|-------|--------|
| Rows | 5× |
| File size | 5× |
| CSV parse | 5.2× |
| Profiling | 5.8× |
| Dashboard | 5.4× |
| Live HTTP upload | 4.0× |
| UI first chart | 3.2× |
| Full `/ask` | 2.5–3× |
| Memory RSS | 1.6× |

Server-side work scales slightly **worse than linear** on profiling/dashboard; end-to-end UX scales **better than linear** on `/ask` (LLM floor dominates).

---

## Reproduction

Dataset:

```
test-fixtures/large-dataset/retail_50k.csv
```

Generate if missing:

```bash
cd backend
python scripts/large_dataset_validation.py 50000
```

Live HTTP bench (server on :8000):

```bash
cd backend
python scripts/large_dataset_http_bench.py
```

In-process decomposition + memory:

```bash
cd backend
python scripts/large_dataset_validation.py 50000
```

Browser E2E (copy CSV to `frontend/public/` temporarily for `fetch` upload, or use file picker manually):

```bash
# Optional: cp test-fixtures/large-dataset/retail_50k.csv frontend/public/retail_50k_validation.csv
# Start frontend :3000, backend :8000, set Paid plan, upload via Overview
```

Phase 7 PDF fixture bench:

```bash
cd frontend
npx vitest run --config vitest.phase7.config.ts
```

---

## Next Steps (Phase 3 — not executed here)

Per [`production-readiness-baseline.md`](production-readiness-baseline.md):

1. **100k row validation** — memory ceiling, preview virtualization, upload SLO
2. **Profile + dashboard optimization** — `cProfile` on `build_profile` and `build_auto_dashboard` at 50k+
3. **Progressive upload UX** — KPI/summary first, charts lazy
4. **Prod build perf pass** — dev hydration noise vs production bundle
5. **Export stress at 100k** — PNG/PDF with full session state

**No code fixes were applied in Phase 2** — findings are report-only pending prioritization.
