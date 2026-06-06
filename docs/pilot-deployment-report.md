# Pilot Deployment Report (Phase 11)

**Date:** 2026-06-06  
**Environment:** Local controlled pilot (production env on dedicated ports)  
**Related:** [`deployment-checklist.md`](deployment-checklist.md) · [`deployment-guide.md`](deployment-guide.md) · [`build-validation-report.md`](build-validation-report.md)

---

## Deployment model

This execution deploys a **controlled local pilot** simulating staging:

| Role | URL | Notes |
|------|-----|-------|
| **Frontend (production build)** | http://localhost:3002 | `next start` — use **localhost** hostname for CORS |
| **Backend API (production mode)** | http://127.0.0.1:8001 | uvicorn, `--workers 1` |
| **Alternate frontend URL** | http://127.0.0.1:3002 | Requires matching CORS entry |

> **Not a public cloud staging URL.** Same production configuration as real staging; suitable for pilot validation before hosting on VPN/private ingress.

---

## URLs used

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3002 |
| Backend API | http://127.0.0.1:8001 |
| Health | http://127.0.0.1:8001/health |
| Readiness | http://127.0.0.1:8001/ready |

---

## Environment checklist

| Variable | Required | Set | Verified |
|----------|----------|-----|----------|
| `APP_ENV` | Yes | `production` | `/ready` → `"environment":"production"` |
| `ANTHROPIC_API_KEY` | Yes | From `backend/.env` (not committed) | `/ready` → `anthropic_api_key_present: true` |
| `ALLOWED_ORIGINS` | Yes | `http://127.0.0.1:3002,http://localhost:3002` | Browser fetch from `localhost:3002` → 200 |
| `NEXT_PUBLIC_API_BASE_URL` | Yes (build) | `http://127.0.0.1:8001` | Embedded in production build |
| Single worker | Yes | `--workers 1` | uvicorn startup |

### Startup commands (executed)

**Backend:**
```powershell
cd backend
$env:APP_ENV='production'
$env:ALLOWED_ORIGINS='http://127.0.0.1:3002,http://localhost:3002'
python -m uvicorn main:app --host 127.0.0.1 --port 8001 --workers 1
```

**Frontend:**
```powershell
cd frontend
$env:NEXT_PUBLIC_API_BASE_URL='http://127.0.0.1:8001'
npm run build
npx next start -p 3002 -H 127.0.0.1
```

**Secrets:** `ANTHROPIC_API_KEY` loaded from existing `backend/.env` via `python-dotenv` — not stored in repo.

---

## Deployment validation

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Backend starts successfully | **PASS** | Uvicorn startup complete on `:8001` |
| 2 | `/health` returns ok | **PASS** | `{"status":"ok","service":"ai-data-analyst-backend"}` |
| 3 | `/ready` returns ready true | **PASS** | `ready: true`, production env, API key present |
| 4 | Frontend loads | **PASS** | http://localhost:3002 — title "AI Data Analyst", nav tabs render |
| 5 | Upload CSV | **PASS** | API: 36 rows, 11 cols (`retail_analytics_regression.csv`); browser fetch upload 200 |
| 6 | Ask AI question | **PASS** | API: 200, bar chart, narrative length 137 |
| 7 | Follow-up question | **PASS** | API: 200, profit-by-region follow-up, bar chart |
| 8 | Export PDF | **PARTIAL** | PDF **quota reserve** 200 (`pdf_used=1`); full browser PDF download not automated (needs file picker + chart session). Phase 7 PDF unit tests pass separately. |
| 9 | Usage dashboard | **PASS** | Header "Free" menu opens; Refresh triggers usage fetch ("Refreshing…"); API usage after 2 asks: `ai_used=2`, `ai_rem=8` |
| 10 | No critical errors | **PASS** (with note) | No backend 500s during smoke; see issues below |

### API smoke session (automated)

```
UPLOAD_OK rows=36 cols=11
ASK1_OK chart=bar
ASK2_OK chart=bar
USAGE ai_used=2 ai_rem=8 pdf_used=0 → PDF_RESERVE_OK pdf_used=1
Session: pilot-smoke-07aa34c3
```

### Browser smoke (automated)

- Page load and navigation chrome: **PASS**
- CORS API call from `localhost:3002` → `127.0.0.1:8001/health`: **PASS**
- Programmatic upload + ask from browser context: **PASS**
- Usage menu + Refresh: **PASS**

---

## Issues found

| Severity | Issue | Impact | Mitigation |
|----------|-------|--------|------------|
| **Medium** | **CORS origin mismatch** — `127.0.0.1` vs `localhost` are different origins | Frontend at `http://127.0.0.1:3002` fails API calls if CORS only lists `localhost` | Set `ALLOWED_ORIGINS` to **both** hostnames (or standardize on one in DNS/docs) |
| **Low** | **File picker not automatable** in browser smoke | Full UI upload/PDF export path requires manual step in pilot QA | Manual: upload fixture CSV via Overview; export from Insights after ask |
| **Low** | **Dev servers still on :3000 / :8000** | Separate from pilot stack; avoid confusion | Use pilot ports 3002/8001 only for pilot QA |
| **Info** | **Mock plan toggle visible** | Expected for V1 pilot | Hide in production branding pass (Week 1+) |
| **Info** | **Global dataset (C3)** | Single backend process — one analyst at a time | Document in pilot onboarding |

No backend 500 errors or startup failures observed during smoke.

---

## Smoke test summary

| Step | Status |
|------|--------|
| Upload → AI → Follow-up → Usage | **PASS** (API + browser integration) |
| PDF export (full download) | **PARTIAL** (quota PASS; UI download manual) |
| Usage limits | **PASS** (counters increment; free tier PDF reserve consumes slot) |

---

## Go / no-go for pilot users

| Audience | Decision | Conditions |
|----------|----------|------------|
| **≤10 trusted pilot users** (private/VPN, single analyst at a time) | **GO** | Use documented URLs; include **both** CORS origins if hostname varies; manual PDF spot-check once per release |
| **Public internet / multi-user** | **NO-GO** | Week 1 blockers (auth, C3, C2) still open |

### Pilot user instructions (minimal)

1. Open **http://localhost:3002** (or your staging hostname — must match `ALLOWED_ORIGINS`).
2. Upload a CSV (≤100 KB on free tier mock).
3. AI Insights → ask a question → optional follow-up.
4. Export PDF from Insights when chart is aligned.
5. Check usage via header **Free** menu.
6. **One user at a time** per backend instance.

---

## Rollback (if needed)

1. Stop pilot processes on ports 3002 / 8001.
2. Revert to dev stack (`npm run dev` + uvicorn `:8000`) if needed.
3. Re-run `python run_tests.py` and `npm run test` before re-deploy.

---

## Next steps (optional)

- [ ] Host on private staging URL (Render/Fly/VPS) with TLS + IP allowlist
- [ ] Set real `supportEmail` in `branding-config.ts`
- [ ] Manual PDF download spot-check with pilot CSV
- [ ] Week 1: auth + server-side entitlements before broader access

---

*Phase 11 complete. Pilot stack may remain running on ports 3002/8001 until stopped manually.*
