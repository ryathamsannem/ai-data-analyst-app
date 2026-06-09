# Project Snapshot

**Generated:** June 8, 2026  
**Purpose:** Handoff snapshot for a new Cursor chat session  
**Branch:** `DEV` (working tree may contain uncommitted changes)

---

## Current application status

The **AI Data Analyst App** is a working **MVP-stage** analytics SaaS:

- Upload CSV / Excel / JSON / Parquet
- Explore **Overview** (KPIs, filters, auto-dashboard mini charts)
- Browse **Data Preview** (search, sort, pagination)
- Ask questions in **AI Insights** (pandas viz + Claude narrative)
- View chart history in **Charts**
- Export executive **PDF** from **Export** tab

Core flows are stable for controlled pilot use. Recent work focused on **intent routing**, **chart/PNG export polish**, **confidence scoring**, **follow-up context**, and **SaaS limit UX**.

**Baseline docs (verify against code before contradicting):**

- [`AGENTS.md`](AGENTS.md)
- [`PROJECT_ARCHITECTURE_SUMMARY.md`](PROJECT_ARCHITECTURE_SUMMARY.md)
- [`LATEST_STABLE_UI_SNAPSHOT.md`](LATEST_STABLE_UI_SNAPSHOT.md)
- [`PDF_EXPORT_STABLE_BASELINE.md`](PDF_EXPORT_STABLE_BASELINE.md)

---

## Features completed

| Area | Status | Key paths |
|------|--------|-----------|
| File upload + column mapping + sheet selection | ✅ Stable | `backend/main.py`, `backend/services/file_parsers.py` |
| Overview KPIs, filters, auto-dashboard | ✅ Stable | `frontend/app/page.tsx`, `frontend/lib/overview-ui.ts` |
| Data Preview (search/sort/pagination/copy) | ✅ Stable | `frontend/lib/data-preview-*.ts` |
| AI Insights ask → chart + narrative | ✅ Stable | `POST /ask`, `backend/intent_engine/` |
| Charts tab timeline + shared renderer | ✅ Stable | `frontend/contexts/chart-session-context.tsx`, `chart-renderer.tsx` |
| Intent engine (routing, confidence, correlation) | ✅ Wired | `backend/intent_engine/` (28 modules) |
| Follow-up conversation context | ✅ Implemented | `frontend/lib/ai-conversation-context.ts`, `backend/main.py` |
| Executive PDF export (multi-section) | ✅ Functional E2E | `frontend/app/pdf-report.ts` |
| Chart PNG export (offscreen renderer) | ✅ Production-ready polish | `frontend/lib/chart-png-capture.ts`, `chart-png-export-session.ts` |
| Mock SaaS plan limits UX | ✅ Working | `backend/services/plan_limits.py`, `frontend/lib/plan-limits.ts` |
| Health / readiness endpoints | ✅ Working | `GET /health`, `GET /ready` |
| Pilot landing + auto-upload flow | ✅ Working | `frontend/lib/pilot-landing.ts`, `upload-auto-flow.ts` |
| Percentage-point gap formatting (rates) | ✅ Fixed | `frontend/lib/metric-value-format.ts` |
| Rate >100% warning (muted, export + UI) | ✅ Fixed | `frontend/lib/chart-quality-warnings.ts` |

---

## Features in progress

| Area | Status | Notes |
|------|--------|-------|
| **Export/PDF finalization** | 🟡 Functional, not product-final | Pagination, page utilization, narrative density per `AGENTS.md` |
| **DAIE full migration** | 🟡 Design only | `DYNAMIC_ANALYTICS_INTENT_ENGINE.md` — no full engine swap |
| **Manual follow-up chain E2E QA** | 🟡 Pending | 5-step retail regression sequence in browser |
| **PDF 7-section smoke test** | 🟡 Pending | All Export checkboxes in downloaded PDF |
| **Multi-user production** | 🔴 Not started | Single global `df`; no auth |
| **TypeScript strict clean** | 🟡 Partial | Vitest passes; some `tsc` issues may remain in large files |
| **Real billing / server-side limits** | 🔴 Mock only | Client-spoofable `X-Plan-Tier` |

---

## Known issues

See [`bug-inventory.md`](bug-inventory.md) for full ranked list. Top items:

| ID | Severity | Summary |
|----|----------|---------|
| C1 | Critical | Global in-memory `df` — not multi-tenant |
| C2 | Critical | LLM narrative can diverge from chart on thin grounding |
| C3 | Critical | Chart routing fallback chain can mislead on edge intents |
| C4 | Critical | Missing `ANTHROPIC_API_KEY` → template fallback copy |
| H3 | High | Monolithic `page.tsx` (~14k) + `main.py` (~15.8k) |
| H5 | High | AI quota debited before pipeline completes |

**Test pitfall:** Do **not** run `unittest discover -s tests` — shadows `intent_engine` package. Use `cd backend && python run_tests.py -v`.

---

## Production readiness status

| Dimension | Verdict |
|-----------|---------|
| **Controlled pilot / demo** | ✅ Acceptable with known limits |
| **Public multi-user SaaS** | 🔴 **NO-GO** without auth, per-session datasets, server-side billing |
| **Automated tests** | ✅ Green — frontend **180** Vitest, backend **166** unittest (Jun 8, 2026) |
| **Lint / build** | ✅ `npm run lint`, `npm run build`, `npm run test` pass |
| **Deployment artifacts** | 🟡 Partial — `render.yaml`, `.env.example`; no Docker |

Full review: [`deployment-readiness.md`](deployment-readiness.md)

---

## Current priorities

1. **Commit / stabilize** uncommitted `DEV` work after QA sign-off
2. **Manual E2E:** follow-up chains + PDF all-sections smoke on pilot dataset
3. **PNG export spot-check** in light/dark mode after latest polish (offscreen renderer, 1100px h-bar)
4. **PDF polish phase** — page fill, export in-progress UI improvements
5. **Production blockers** (if moving beyond pilot): auth, per-session storage, server-side plan enforcement
6. **Incremental extraction** from `page.tsx` / `main.py` only when touching those areas

---

## Test status (Jun 8, 2026)

```bash
cd frontend && npm run lint && npm run build && npm run test   # 180 tests
cd backend && python run_tests.py -v                           # 166 tests
```

---

## Related handoff files

| File | Purpose |
|------|---------|
| [`system-understanding.md`](system-understanding.md) | Architecture flows |
| [`file-map.md`](file-map.md) | Important files + risk tiers |
| [`bug-inventory.md`](bug-inventory.md) | Open bugs ranked |
| [`root-cause-analysis.md`](root-cause-analysis.md) | Structural debt + risks |
| [`recent-work-summary.md`](recent-work-summary.md) | Latest session work |
| [`deployment-readiness.md`](deployment-readiness.md) | Security + deploy blockers |
