# Large Dataset Validation — Phase 1 (10,000 Rows)

Generated On: June 15, 2026

## Executive Summary

Phase 1 validates the AI Analytics SaaS against a **10,000-row retail-style dataset** (`test-fixtures/large-dataset/retail_10k.csv`, 11 columns, ~0.75 MB). **No application code was changed** during this phase.

**Verdict:** The stack is **stable at 10k rows** — upload, profiling, dashboard generation, AI routing, and narrative all complete without crashes or browser freezes. Several paths are **borderline or over** the performance targets from [`production-readiness-baseline.md`](production-readiness-baseline.md); none are release blockers for a controlled pilot, but they define the optimization backlog before 50k/100k phases.

| Area | Result vs target | Severity |
|------|------------------|----------|
| Upload (warm server) | ~4.9–5.7s (target &lt;5s) | Medium |
| Profiling | ~791ms | Low |
| Dashboard (backend only) | ~1.0s (target &lt;3s) | Pass |
| Dashboard (UI end-to-end) | ~6.6s to first charts | High |
| AI insight (full `/ask`) | ~8.3–10.7s (target &lt;10s) | Medium |
| AI viz routing only | ~20–76ms | Pass |
| Chart render (browser) | No long tasks; ~6.6s incl. upload | Medium |
| PNG export (10k UI) | Not E2E measured | — |
| PDF export (10k UI) | ~90ms/PDF fixture bench only | Low |
| Browser responsiveness | No freezes; 0 long tasks during API | Pass |

---

## Test Environment

| Item | Value |
|------|--------|
| OS | Windows 10 (10.0.26200) |
| Dataset | `retail_10k.csv` — 10,000 rows, 11 columns, 0.75 MB |
| Plan tier | Paid (`X-Plan-Tier: paid`) |
| Backend | FastAPI via live `uvicorn` on `127.0.0.1:8000` + in-process `TestClient` |
| Frontend | Next.js dev on `localhost:3000` (browser spot-check) |
| AI narrative | Live Anthropic when reachable; fallback path when SSL fails |

---

## Measurement Results

### 1. Upload Time

| Method | Run 1 | Run 2 | Run 3 | Notes |
|--------|-------|-------|-------|-------|
| HTTP `POST /upload` (live server) | 5,701 ms | 4,953 ms | 4,889 ms | Includes parse, profile, mapping, dashboard, JSON response |
| HTTP `POST /upload` (browser `fetch`) | 4,415 ms | — | — | Same API; CORS from `localhost:3000` |
| `TestClient` (warm process) | 2,130 ms | 2,085 ms | 2,009 ms | In-process; no network |
| `TestClient` (cold process) | 41,519 ms | — | — | First request after import; not representative of warm production |

**Decomposition (in-process, warm):**

| Step | Avg (ms) |
|------|----------|
| CSV parse | 7.9 |
| `clean_dataframe` | 2.7 |
| **Profiling (`build_profile`)** | **791.2** |
| Semantic column mapping | 11.4 |
| Full upload payload (`_compose_upload_payload`) | 1,235.9 |

Response payload size: ~26 KB (preview capped at 15 rows; full dataset stays server-side).

**Target:** Upload &lt;5s → **borderline fail** on live HTTP (avg ~5.2s); **pass** on browser fetch (4.4s).

---

### 2. Profiling Time

`build_profile` on 10k rows: **761–822 ms** (avg **791 ms**).

Dominant work: `describe()` over numeric columns + per-column `nunique` across 11 columns. Acceptable for 10k but is the largest single CPU block in the upload path after dashboard build.

**Target:** No explicit target → **Low** concern; optimize if upload SLO tightened.

---

### 3. Dashboard Generation Time

| Component | Avg (ms) |
|-----------|----------|
| `build_auto_dashboard()` | 1,016.7 |
| `build_kpi_cards()` | 181.1 |
| `build_suggested_questions()` | 4.6 |
| `POST /filtered-dashboard` (refresh) | 2,016–2,073 |

Auto dashboard produced **7 charts** + KPI cards on the retail 10k schema.

**Target:** Dashboard &lt;3s (backend) → **pass** (~1.0s dashboard-only).

**UI end-to-end:** File input change → first `.recharts-wrapper` visible: **~6,558 ms** (includes client upload, server processing, React render). Exceeds 3s dashboard UX target when upload is included.

---

### 4. AI Response Latency

| Path | Latency | Notes |
|------|---------|-------|
| `compute_visualization_for_question` (ranking) | 20–64 ms | Warm |
| `compute_visualization_for_question` (trend) | 75 ms | Monthly bucket on 10k |
| `compute_visualization_for_question` (executive) | 31 ms | |
| `POST /ask` full (HTTP, LLM live) | 10,102–10,697 ms | Ranking question + narrative |
| `POST /ask` (browser `fetch`) | 8,306 ms | Same question |
| `POST /ask` (LLM unreachable / SSL retry) | ~16,450 ms | 4× retry before fallback |

Viz/routing is **sub-100ms** on 10k. End-to-end `/ask` is dominated by **LLM narrative** (~8–11s when API healthy).

**Target:** AI Insight &lt;10s → **borderline** (10.1–10.7s HTTP; 8.3s browser). **Pass** on viz-only path.

---

### 5. Chart Rendering Latency

| Observation | Value |
|-------------|-------|
| Grouped chart points (ranking by city) | 15 categories |
| Backend chart pipeline | Included in viz routing (~20–75 ms) |
| Browser long tasks during API upload+ask | **0** |
| Overview charts after UI upload | Visible at ~6.6s |

Recharts renders 7 auto-dashboard mini charts + AI insight chart without main-thread long-task warnings in Chrome during API-driven flows. Full paint timing includes network + server work.

**Not measured:** Dedicated stopwatch for Recharts paint after data already in memory (isolated render-only).

---

### 6. PNG Export Latency

**Not E2E measured** at 10k in this phase. The Overview UI exposed **“Export this chart as a PNG image”** after upload; automated click-to-download timing was not captured.

**Proxy:** PNG export QA unit tests (`chart-png-export-qa.test.ts`) pass on presentation constants; no 10k-row DOM capture benchmark exists yet.

**Finding:** Measurement gap — schedule in Phase 1b or Phase 2 export stress pass.

---

### 7. PDF Export Latency

| Method | Result |
|--------|--------|
| Phase 7 vitest (`vitest.phase7.config.ts`) | 18 PDF combos in **1,610 ms** (~**89 ms/PDF**) |
| 10k-loaded browser Export tab | Not timed |

Phase 7 uses representative fixture payloads, not the live 10k session state. PDF generation path is fast for standard section combos; **10k UI state + html2canvas chart capture** remains unverified.

---

### 8. Browser Responsiveness

| Check | Result |
|-------|--------|
| Tab navigation (Overview → AI Insights) | Responsive |
| Main-thread long tasks (Performance API) | **0** during upload + ask API calls |
| UI freeze / crash | **None** |
| Dev-mode hydration warning | Present in sidebar (`app-sidebar.tsx`) — dev-only noise |

Paid plan active; 10k rows loaded; filters, suggested questions, and auto dashboard rendered.

---

### 9. Memory

| Metric | Value |
|--------|-------|
| Backend RSS after 10k processing | ~169 MB |
| Upload trace peak (tracemalloc, cold) | ~29.5 MB |

No runaway growth observed in single-session 10k upload + multiple `/ask` calls.

---

## Findings by Severity

### Critical

_None._ Application remained stable; no crashes, data loss, or incorrect empty states at 10k rows.

---

### High

| ID | Finding | Evidence | Recommendation (future phase) |
|----|---------|----------|-------------------------------|
| H-01 | **End-to-end Overview paint ~6.6s** exceeds 3s dashboard UX target when upload is included | Browser: file input → charts at 6,558 ms | Profile client upload UX; consider progressive dashboard (KPIs first, charts lazy); defer non-critical `suggested_questions` |
| H-02 | **Cold-process first upload ~41s** | TestClient first `/upload` after fresh Python import | Document warm-pool / pre-started workers for production; not a warm-server issue |

---

### Medium

| ID | Finding | Evidence | Recommendation (future phase) |
|----|---------|----------|-------------------------------|
| M-01 | **Live HTTP upload ~5.0–5.7s** slightly over 5s SLO | 3-run avg ~5.18s on `127.0.0.1:8000` | Cache profile stats; parallelize `build_auto_dashboard` + `build_kpi_cards`; consider incremental upload response |
| M-02 | **Full `/ask` ~10.1–10.7s** borderline vs 10s SLO | HTTP timing with live LLM | Stream narrative; reduce prompt size at 10k; show chart before narrative returns |
| M-03 | **Profiling ~800ms** is ~15% of upload path | `build_profile` bench | Sample or lazy profile for large datasets; cache on re-upload |
| M-04 | **PNG/PDF not E2E validated at 10k** | No timed browser export runs | Add export stress checklist in Phase 2 |
| M-05 | **Filtered dashboard refresh ~2s** | `POST /filtered-dashboard` | Acceptable; watch at 50k |

---

### Low

| ID | Finding | Evidence | Recommendation (future phase) |
|----|---------|----------|-------------------------------|
| L-01 | **LLM retry adds ~6s** when API unreachable | 16.4s ask with SSL failure vs 10.7s healthy | Fail faster in dev; surface clearer “narrative unavailable” |
| L-02 | **Dev hydration warning** in sidebar | Next.js overlay on `localhost:3000` | Track separately from prod build |
| L-03 | **Phase 7 PDF ~89ms/PDF** on fixtures | Vitest bench | Good baseline; not a 10k regression signal alone |
| L-04 | **`/preview` returns 15-row preview** in upload payload regardless of `row_limit` test setup | API design | Expected; Data Preview pagination not stress-tested here |

---

## Targets Scorecard (10k)

| Target | Goal | Measured | Status |
|--------|------|----------|--------|
| Upload | &lt;5s | 4.4–5.7s (context-dependent) | Borderline |
| Dashboard | &lt;3s | 1.0s backend / 6.6s UI E2E | Mixed |
| AI Insight | &lt;10s | 8.3–10.7s full ask | Borderline |
| 50k responsive | N/A this phase | — | — |
| No browser freeze | Required | Pass | Pass |
| Stable / no crash | Required | Pass | Pass |

---

## Reproduction

Dataset (generated once):

```
test-fixtures/large-dataset/retail_10k.csv
```

Backend HTTP bench (live server on :8000):

```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
# separate terminal:
python -c "
import time, requests
from pathlib import Path
b = Path('../test-fixtures/large-dataset/retail_10k.csv').read_bytes()
h = {'X-Plan-Tier': 'paid', 'X-Session-Id': 'bench'}
url = 'http://127.0.0.1:8000'
t = time.perf_counter()
r = requests.post(url+'/upload', files={'file': ('retail_10k.csv', b, 'text/csv')}, headers=h)
print('upload_ms', round((time.perf_counter()-t)*1000, 1), r.status_code)
"
```

In-process decomposition: run the benchmark block used during validation (parse → profile → dashboard) via `TestClient` and `main.build_profile` / `main.build_auto_dashboard`.

Frontend PDF fixture bench:

```bash
cd frontend
npx vitest run --config vitest.phase7.config.ts
```

---

## Next Steps (Phase 2 — not executed here)

Per [`production-readiness-baseline.md`](production-readiness-baseline.md) open items:

1. **50k row validation** — upload, profile, dashboard, filter refresh
2. **100k row validation** — memory ceiling, preview virtualization
3. **Export stress** — PNG + PDF with 10k session loaded in browser
4. **Performance profiling** — `cProfile` on `build_profile` and `build_auto_dashboard`
5. **Mobile UX review**

**No code fixes were applied in Phase 1** — findings are report-only pending prioritization.
