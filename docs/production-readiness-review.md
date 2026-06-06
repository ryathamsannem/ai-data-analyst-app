# Production Readiness Review (Phase 10)

**Date:** 2026-06-06  
**Scope:** Review only — no code changes in this phase  
**Audience:** Engineering / product before first real-user deployment  
**Verdict:** **Not ready for multi-user public production tomorrow** without addressing Critical and selected High items. Acceptable for **controlled single-tenant demo / internal pilot** with known limits.

---

## Executive summary

The application is feature-rich and well-tested for intent routing, PDF export, and SaaS limit UX. The **analytics pipeline is defensively designed** (pandas-first viz, Claude for narrative only, extensive intent_engine guards). However, the current architecture is **single-process, single-dataset, unauthenticated**, with **client-spoofable plan headers**, **hardcoded API URLs**, and **no production deployment artifacts**.

| Area | Readiness | Notes |
|------|-----------|-------|
| Security | 🔴 Blocker | No auth; limits bypassable; global state |
| Backend | 🟡 Partial | Good validation building blocks; memory/timeouts weak |
| Frontend | 🟡 Partial | Solid UX baseline; API URL + mobile limits gaps |
| AI pipeline | 🟢 Good guards | Graceful narrative fallback; viz path can 500 |
| PDF export | 🟡 Partial | Quota reserved too early; heavy main-thread work |
| SaaS limits | 🔴 Preview only | Not enforceable in production as implemented |
| Deployment | 🔴 Missing | No Docker, `.env.example`, prod startup, health checks |

---

## Findings by severity

### Critical (must fix before public production)

| ID | Area | Finding | Evidence | Remediation |
|----|------|---------|----------|-------------|
| C1 | Security | **No authentication** — any reachable client can upload files and invoke paid LLM `/ask` | `backend/main.py` — all routes open; `Anthropic` client at import | Add auth (API key, OAuth, or reverse-proxy). Rate-limit by authenticated identity. |
| C2 | Security / SaaS | **Plan tier is client-controlled** — `X-Plan-Tier: paid` bypasses file size, preview, PDF, and AI quotas | `backend/services/saas_context.py`; `frontend/lib/saas-session.ts` | Never trust client headers in prod. Derive tier from billing/subscription server-side. |
| C3 | Backend | **Single global dataset** — concurrent users overwrite each other's `df` | `backend/main.py` globals (`df`, `uploaded_file_bytes`, …) | Per-session or per-user dataset store (Redis, S3, DB). |
| C4 | Deployment | **Frontend API URL hardcoded to localhost** | `frontend/lib/usage-api.ts`, `frontend/app/page.tsx` (6+ fetch calls) | `NEXT_PUBLIC_API_BASE_URL` env var; document in deploy checklist. |
| C5 | PDF / SaaS | **PDF export quota reserved before validation completes** — failed export still consumes daily slot | `frontend/app/page.tsx` ~10371–10452: `reservePdfExport()` before contract check | Reserve after preflight passes, or refund on failure. |

---

### High (fix before broad rollout)

| ID | Area | Finding | Evidence | Remediation |
|----|------|---------|----------|-------------|
| H1 | Security | **CORS hardcoded to `http://localhost:3000`** | `backend/main.py` ~52–58 | `ALLOWED_ORIGINS` env (comma-separated). Restrict credentials to known origins. |
| H2 | Security | **File validation is extension-only** — no magic-byte / content sniffing; Excel loads all sheets into memory | `backend/services/file_parsers.py`; `main.py` Excel sheet scan ~5391–5398 | Content-type validation; cap sheets/cells; zip-bomb limits for `.xlsx`. |
| H3 | Backend | **Upload metadata set before parse succeeds** — failed upload leaves stale `df` with new filename/bytes | `main.py` ~5335–5365 | Parse into locals; commit globals only on success; rollback on failure. |
| H4 | Backend | **Full file read into RAM** — no streaming; bytes retained after parse | `await file.read()`; global `uploaded_file_bytes` | Stream/chunk CSV; drop bytes after parse or store externally; enforce row caps all tiers. |
| H5 | Backend | **AI quota debited before pipeline completes** | `record_ai_question()` ~15207 before viz ~15371 | Record usage only after successful response; or reserve/commit pattern. |
| H6 | Backend | **In-memory usage tracker** — not durable, not shared across workers | `backend/services/usage_tracker.py` | Redis/DB counters keyed to authenticated user. |
| H7 | Backend | **Missing `ANTHROPIC_API_KEY` fails silently at runtime** — charts render with template fallback copy | `main.py` ~48; narrative catch ~15691–15695; documented as C4 in `docs/bug-inventory.md` | Fail fast at startup; structured error when AI unavailable. |
| H8 | AI | **Viz pipeline in `/ask` unguarded** — unhandled exception → HTTP 500 | `compute_visualization_for_question()` not wrapped like narrative | Bounded try/except; return structured degraded response. |
| H9 | Frontend | **Plan/usage menu hidden on mobile** (`hidden sm:block`) | `frontend/components/app-shell/plan-usage-menu.tsx` | Mobile entry point (sidebar or icon sheet). |
| H10 | Frontend | **Usage fetch errors swallowed** | `page.tsx` ~6605–6607 `.catch(() => {})` | Non-blocking banner + retry; disable gated actions until loaded. |
| H11 | Frontend | **Client gates pass when `remaining == null`** | `frontend/lib/plan-limits.ts` `canAskAiQuestion` / `canExportPdf` | Block actions until usage payload loaded. |
| H12 | Deployment | **No production artifacts** — no Dockerfile, `.env.example`, health/readiness probes | Repo search | Add Dockerfile, compose, `.env.example`, `/health`, `/ready`. |
| H13 | Deployment | **Documented startup is dev-only** (`uvicorn --reload`) | `docs/project-snapshot.md` | `gunicorn` + workers, pinned deps, no reload in prod. |

---

### Medium

| ID | Area | Finding | Evidence | Remediation |
|----|------|---------|----------|-------------|
| M1 | Security | **CSV/spreadsheet formula injection not sanitized** on API preview/export paths | `/preview` returns raw cell values via `to_dict()` | Prefix/sanitize `=`, `+`, `-`, `@` on string cells; document export risk. |
| M2 | Security | **No secrets template** — `.env` gitignored but no `.env.example` | `.gitignore` line 11 | Add `.env.example` with required vars. |
| M3 | Backend | **No HTTP-level or Anthropic client timeouts** | No timeout in Claude call ~12352 | Configure uvicorn/gunicorn timeout + Anthropic `timeout=`. |
| M4 | Backend | **Broad `except Exception` + debug `print()` in hot paths** | 50+ occurrences in `main.py` | Global exception handler; structured logging; remove prod prints. |
| M5 | Backend | **Inconsistent missing-dataset contract** — `/ask` returns 200 JSON; others return 400 | `/ask` ~15168–15173 vs `/preview` ~5466 | Standardize status + error shape for frontend. |
| M6 | Backend | **No `question` length validation** on `QuestionRequest` | Pydantic model ~217–220 | Add `min_length` / `max_length`; cap prompt size. |
| M7 | Backend | **`full_dataset_analysis` plan flag not enforced server-side** | `plan_limits.py` only; unused in `/ask` | Enforce row/sample limits for free tier if product requires. |
| M8 | Backend | **No HTTP integration tests** for upload/ask/CORS/limits | `backend/tests/` — unit tests only | Add FastAPI `TestClient` smoke tests. |
| M9 | AI | **No post-generation narrative validation** against ground-truth numbers | Prompt-only guards | Lightweight numeric token verification vs `exact_result`. |
| M10 | AI | **No structured AI failure flag in API response** | Fallback returns plain `answer` string only | Add `narrativeStatus`, `narrativeErrorCode` fields. |
| M11 | AI | **Fragile Claude response parsing** (`content[0].text`) | ~12358 | Validate content blocks; fallback on malformed response. |
| M12 | Frontend | **Single global error string; no `aria-live`** | `page.tsx` error banner ~11014 | `role="alert"`; per-tab or stacked toasts. |
| M13 | Frontend | **PDF export has no in-progress UI** — double-click risk | No `exportingPdf` state | Disable buttons + spinner during export. |
| M14 | Frontend | **Heavy PDF work on main thread** (html2canvas, scale 2.5, 860px capture) | `pdf-report.ts`, `pdf-enterprise-style.ts` | Progress UI; lower scale option; timeout/cancel. |
| M15 | Frontend | **Modals lack focus trap** | `UpgradePlanModal`, mapping modal | Focus trap + restore focus on close. |
| M16 | Frontend | **Some API calls omit SaaS headers** | `filtered-dashboard`, `update-column-mapping` | Send `saasRequestHeaders()` consistently (until server-side auth replaces this). |
| M17 | SaaS | **`localStorage` in `saas-session.ts` without try/catch** | vs `theme.ts` / `sidebar-prefs.ts` which wrap | try/catch; in-memory fallback. |
| M18 | SaaS | **New session ID = new quota bucket** — clear storage resets limits | `getOrCreateSessionId()` | Tie limits to authenticated user server-side. |
| M19 | Branding | **Placeholder support email in PDF footer** | `branding-config.ts` `support@example.com` | Set real email before prod. |
| M20 | Deployment | **Health endpoint minimal** — no dependency checks | `GET /` returns static message ~252 | `/health` (liveness), `/ready` (API key, pyarrow). |

---

### Low

| ID | Area | Finding | Evidence | Remediation |
|----|------|---------|----------|-------------|
| L1 | Security | `INTENT_ENGINE_DISABLE` env can silently disable routing metadata | `backend/intent_engine/attach.py` | Disallow or loud startup log in prod. |
| L2 | Backend | No upload TTL / explicit cleanup lifecycle | Bytes retained in memory indefinitely | Session TTL; clear on replace. |
| L3 | Backend | `pandas>=2.0.0` unpinned in requirements | `requirements.txt` | Pin all prod dependencies. |
| L4 | AI | Synchronous `time.sleep` in retry loop blocks workers | ~12370, 12382 | Async or shorter backoff with jitter. |
| L5 | AI | Hardcoded model ID | `claude-haiku-4-5-20251001` | Env-configurable model. |
| L6 | Frontend | Sidebar uses `role="tab"` without full tabs pattern | `app-sidebar.tsx` | `aria-current="page"` on nav links. |
| L7 | Frontend | Filtered-dashboard refresh fails silently | `page.tsx` ~6761–6770 | Inline warning on failure. |
| L8 | Frontend | AI catch uses generic message for non-limit errors | ~7904–7907 | Preserve server `detail` where safe. |
| L9 | PDF | Conversation appendix unbounded in PDF thread | `pdf-report.ts` ~3763 | Cap thread length (e.g. last 20 turns). |
| L10 | PDF | `buildExecutivePdfExportInput` always returns `ok: true` | dead branch in page | Remove or implement validation. |
| L11 | SaaS | Mock “Switch to Paid” visible in production UI | `plan-usage-menu.tsx`, upgrade modal | Hide behind dev flag in prod builds. |
| L12 | XSS | Single `dangerouslySetInnerHTML` in theme boot script | `theme-script.tsx` | Acceptable if script is static; keep audited. |
| L13 | Accessibility | Ask textarea label not associated via `htmlFor` | `page.tsx` ~12310 | Add `id` / `htmlFor` link. |

---

## Area reviews (detail)

### 1. Security

**Current state**
- CORS: single origin localhost, credentials enabled, all methods/headers allowed.
- Upload: tier-based size caps (100 KB free / 25 MB paid — **spoofable**), extension-based format detection, basename stripping on filename.
- Secrets: `.env` gitignored; `ANTHROPIC_API_KEY` loaded via `dotenv`; no startup validation.
- XSS: React default escaping for UI; AI answers rendered as text (not HTML). Theme script is the only `dangerouslySetInnerHTML`.
- CSV injection: cell values returned raw in preview/API; risk if user re-opens in Excel.

**Production blockers:** C1, C2, C3, C4.

---

### 2. Backend

**Current state**
- Error handling: mix of `HTTPException`, JSON 200 fallbacks, and unhandled 500s in viz path.
- Validation: Pydantic models with `extra="ignore"`; missing field length limits.
- Memory: full-file read + retained bytes + full Excel sheet scan for “best sheet”.
- Logging: structured warnings in some paths; extensive debug `print()` elsewhere.
- Cleanup: no session TTL; globals persist until next upload.

**Positive:** `_json_safe()` for NaN/Inf; upload format errors → 400; plan limit 413/429 responses; Claude retry with backoff.

---

### 3. Frontend

**Current state**
- **Loading:** AI ask (“Thinking…”), preview (`aria-busy`), upload states — good.
- **Error:** single dismissible banner; limit errors open upgrade modal — good for limits, weak for general errors.
- **Empty:** charts tab, overview upload, filter-empty, PDF section empty states — good.
- **Mobile:** responsive sidebar drawer, stacked grids; plan menu and dataset badge hidden on xs/sm.
- **A11y:** many `aria-label`s on charts/actions; gaps on error announcements and modals.

---

### 4. AI pipeline

**Current state**
- **Service failure:** 4-attempt retry on transient errors; narrative fallback preserves chart + analysis; user sees plain-text explanation.
- **Missing dataset:** upload rejected if empty; `/ask` returns friendly message (HTTP 200); filtered empty cohort handled.
- **Hallucination guards:** intent_engine routing, correlation lock, confidence scoring, cautious narrative blocks, unsupported intent payloads, extensive unit tests.

**Risk:** Misconfigured API key looks like a working product; viz exceptions can 500; no numeric verification of narrative vs chart data.

---

### 5. PDF export

**Current state**
- Client-side jsPDF + html2canvas/chart SVG capture.
- Empty states for missing chart/embed; sensible caps on preview columns, series samples, thumbnails.
- Failure: generic “Unable to generate PDF report.” at page level.
- **Quota:** server reservation via `POST /usage/pdf-export` before generation — consumed even if contract check fails afterward (C5).

---

### 6. SaaS limits

**Current state (V1 mock)**
- Limits defined in `plan_limits.py`; enforced server-side **if headers are trusted**.
- Frontend: usage dashboard, upgrade modal, client pre-checks.
- Abuse: change `X-Plan-Tier`, clear `localStorage` session ID, double-click PDF export, ask before usage loads.

**Intent:** Preview/demo model only until auth + server-side entitlements exist.

---

### 7. Deployment

#### Required environment variables (inferred)

| Variable | Required | Used by | Documented |
|----------|----------|---------|------------|
| `ANTHROPIC_API_KEY` | **Yes** (for AI narrative) | `backend/main.py` | `docs/bug-inventory.md` only |
| `ALLOWED_ORIGINS` | **Yes** (prod) | Not implemented — hardcoded | Recommended in docs |
| `NEXT_PUBLIC_API_BASE_URL` | **Yes** (prod) | Not implemented — hardcoded | No |
| `INTENT_ENGINE_DISABLE` | No | `intent_engine/attach.py` | bug-inventory |
| `NEXT_PUBLIC_AI_INSIGHTS_DEBUG` | No | Frontend debug panels | Yes |

#### Build commands

```bash
# Backend
cd backend
pip install -r requirements.txt
python run_tests.py          # unit tests (145 tests)

# Frontend
cd frontend
npm install
npm run test                 # vitest (106+ tests)
npm run build                # production Next.js build
npm run lint                 # eslint
```

#### Startup commands (current — development)

```bash
# Backend (dev)
cd backend
uvicorn main:app --reload --port 8000

# Frontend (dev)
cd frontend
npm run dev                  # http://localhost:3000
```

#### Startup commands (recommended — production)

```bash
# Backend (example — not yet in repo)
cd backend
gunicorn main:app -k uvicorn.workers.UvicornWorker -w 2 --bind 0.0.0.0:8000 --timeout 120

# Frontend (after build)
cd frontend
npm run build
npm run start                # or serve via CDN/reverse proxy
```

#### Production configuration checklist

- [ ] Set `ANTHROPIC_API_KEY` in secure secret store (not committed)
- [ ] Implement and set `ALLOWED_ORIGINS` for production frontend URL(s)
- [ ] Set `NEXT_PUBLIC_API_BASE_URL` (or equivalent) for frontend build
- [ ] Replace `--reload` with production ASGI server + multiple workers
- [ ] Add `/health` and `/ready` endpoints
- [ ] Add reverse proxy (TLS termination, request size limits, rate limiting)
- [ ] Pin all Python dependencies (`requirements.txt`)
- [ ] Configure log aggregation (replace debug prints)
- [ ] Set real `supportEmail` and `exportFilePrefix` in `branding-config.ts`
- [ ] Hide mock plan toggle (`Switch to Paid`) in production builds
- [ ] Decide single-tenant vs multi-tenant — **do not deploy multi-user until C3 resolved**
- [ ] Add `.env.example` to repository
- [ ] Smoke test: upload → ask → PDF export on staging URL
- [ ] Monitor Anthropic usage, 429 rate, narrative fallback rate

---

## Positive signals (production-ready elements)

| Area | What works |
|------|------------|
| Intent engine | Broad guardrail test suite; correlation/decline/multi-metric unsupported paths |
| AI architecture | Pandas-first viz; Claude prose-only; safety system prompt |
| Upload | Format detection, size limits, empty-file rejection, JSON-safe responses |
| PDF | Section empty states, capture fallbacks, branding footer, filename helper |
| Frontend UX | Mobile nav drawer, loading on ask/preview, upgrade modal with live usage |
| SaaS UX | Usage dashboard, quota progress bars, refresh events |
| Branding | Single config file, PDF/header/sidebar integration |
| Tests | 145 backend + 106 frontend unit tests; Phase 7 PDF validation |

---

## Go / no-go recommendation

| Deployment type | Recommendation |
|-----------------|----------------|
| **Public multi-user SaaS tomorrow** | **No-go** — address C1–C5 and H1–H6 minimum |
| **Internal demo / single analyst / localhost** | **Go with caveats** — document known limits |
| **Staging behind auth (VPN / IP allowlist)** | **Conditional go** — fix C4, H1, H12, H13, C5 first |

---

## Suggested remediation order (no code in Phase 10)

### Week 0 — Blockers (before any external users)

1. C4 — `NEXT_PUBLIC_API_BASE_URL` + backend `ALLOWED_ORIGINS`
2. C5 — PDF quota reserve after preflight
3. H12/H13 — `.env.example`, production startup docs, health endpoints
4. H7 — startup validation for `ANTHROPIC_API_KEY`

### Week 1 — Security & limits (before paid launch)

5. C1 — authentication layer
6. C2 — server-side plan entitlements (remove header trust)
7. H5/H6 — durable usage tracking; debit on success only
8. H1 — env-driven CORS

### Week 2 — Scale & polish (before multi-user)

9. C3 — per-session dataset isolation
10. H3/H4 — upload atomicity and memory bounds
11. H8 — viz pipeline error boundary
12. H9–H11 — frontend usage/limits UX hardening

### Ongoing

- M1 CSV injection sanitization
- M9 narrative numeric validation
- M8 HTTP integration tests
- M13–M14 PDF export UX and performance

---

## References

| Document / file | Relevance |
|-----------------|-----------|
| `docs/bug-inventory.md` | Known C4 API key fallback |
| `docs/branding-guide.md` | Branding before prod |
| `docs/project-snapshot.md` | Dev startup commands |
| `backend/main.py` | Routes, globals, CORS, `/ask` |
| `backend/services/saas_context.py` | Header-based tier/session |
| `backend/services/usage_tracker.py` | In-memory quotas |
| `frontend/lib/saas-session.ts` | Client plan/session |
| `frontend/lib/usage-api.ts` | Hardcoded API base |
| `frontend/app/page.tsx` | Export flow, errors, fetches |

---

*Phase 10 complete. Switch to Agent mode to implement remediation items.*
