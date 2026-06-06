# Build Validation Report (Phase 10B)

**Date:** 2026-06-06  
**Environment:** Windows 10, Node.js (Next.js 16.2.4), Python 3.x backend  
**Purpose:** Validate pilot/staging deployment readiness after Phase 10A Week 0 blockers

---

## Summary

| Check | Result | Notes |
|-------|--------|-------|
| `.env.example` completeness | **PASS** | Covers backend + frontend vars from Phase 10A |
| `deployment-guide.md` accuracy | **PASS** with note | gunicorn not in `requirements.txt`; use uvicorn for pilot |
| Frontend `npm run build` + `NEXT_PUBLIC_API_BASE_URL` | **PASS** | After 2 minimal TS fixes (see below) |
| Frontend `npm run lint` | **FAIL** (pre-existing) | 17 errors, 97 warnings — not blocking pilot if build passes |
| Backend production startup | **PASS** | uvicorn + `APP_ENV=production` |
| `GET /health` | **PASS** | 200 |
| `GET /ready` | **PASS** | 200 with key; startup blocked without key |
| Backend unit tests | **PASS** | `python run_tests.py` exit 0 (Phase 10A baseline) |
| Frontend unit tests | **PASS** | 112/112 vitest |

---

## 1. Deployment package review

### `.env.example`

Verified variables:

```
ANTHROPIC_API_KEY
APP_ENV
ALLOWED_ORIGINS
AI_NARRATIVE_ENABLED
NEXT_PUBLIC_API_BASE_URL
NEXT_PUBLIC_AI_INSIGHTS_DEBUG (commented)
INTENT_ENGINE_DISABLE (commented)
```

**Gap (documented, not blocking):** no `PORT` var — uvicorn port is CLI flag. Acceptable for pilot.

### `deployment-guide.md`

| Claim | Verified |
|-------|----------|
| CORS via `ALLOWED_ORIGINS` | Yes — `backend/services/cors_config.py` |
| `/health` and `/ready` | Yes — tested live |
| Production fail-fast without API key | Yes — `validate_startup_config()` |
| `NEXT_PUBLIC_API_BASE_URL` for frontend | Yes — `frontend/lib/api-base.ts` |
| gunicorn production command | Documented but **gunicorn not in requirements.txt** — use uvicorn for pilot |

**Recommendation:** Pilot uses `uvicorn main:app --workers 1` until C3/H6 resolved.

---

## 2. Frontend build validation

### Command

```powershell
$env:NEXT_PUBLIC_API_BASE_URL='https://staging-api.example.com'
cd frontend
npm run build
```

### Result: **PASS** (exit 0)

```
✓ Compiled successfully
✓ Finished TypeScript
✓ Generating static pages (4/4)
Route (app): ○ /  (Static)
```

### API URL in bundle

Confirmed `staging-api.example.com` embedded in production chunks:

- `frontend/.next/static/chunks/*.js`
- `frontend/.next/server/chunks/ssr/*.js`

### Fixes applied to unblock build (minimal)

| File | Issue | Fix |
|------|-------|-----|
| `frontend/app/components/chart-value-axis-title.tsx` | `textAnchor` / Recharts prop types | Widened props to `unknown`; narrowed anchor union |
| `frontend/lib/selected-visualization.ts` | Missing `humanizeColumnName` import | Added import from `@/lib/analytics-metadata` |

These were pre-existing TypeScript errors surfaced only by `next build` — not introduced by Phase 10A.

### Frontend lint

```bash
npm run lint
```

**Result: FAIL** — exit 1  
**114 problems** (17 errors, 97 warnings)

Primary error categories (pre-existing):
- `react-hooks/set-state-in-effect` in `page.tsx`, `use-plan-usage.ts`, etc.
- `react-hooks/rules-of-hooks` in one component
- `prefer-const` in a few files

**Pilot impact:** Build succeeds; lint debt does not block staging deploy but should be scheduled before public launch.

---

## 3. Backend validation

### Production startup command (tested)

```powershell
$env:APP_ENV='production'
$env:ANTHROPIC_API_KEY='sk-test-pilot'
$env:ALLOWED_ORIGINS='https://staging.example.com'
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8765
```

**Result:** Server started successfully.

### Health endpoint

```
GET http://127.0.0.1:8765/health
→ 200 {"status":"ok","service":"ai-data-analyst-backend"}
```

### Readiness endpoint

```
GET http://127.0.0.1:8765/ready
→ 200 {"ready":true,"checks":{"app":true,"environment":"production","ai_narrative_enabled":true,"anthropic_api_key_present":true},"warnings":[]}
```

### Startup fail-fast (missing API key)

```
APP_ENV=production, ANTHROPIC_API_KEY=empty
→ RuntimeError: ANTHROPIC_API_KEY is required when APP_ENV=production and AI narrative is enabled.
```

**Result:** PASS

### TestClient validation (alternate)

Same results via `fastapi.testclient.TestClient` without live server.

---

## 4. Test suites

| Suite | Command | Result |
|-------|---------|--------|
| Backend | `python run_tests.py` | PASS (exit 0) |
| Frontend | `npm run test` | 112/112 PASS |

---

## 5. Go / no-go recommendation

| Deployment type | Verdict |
|-----------------|---------|
| **Private staging / pilot** (single user, network guard) | **GO** |
| **Public internet, multi-user** | **NO-GO** |

**Conditions for pilot GO:**
1. Use validated build with correct `NEXT_PUBLIC_API_BASE_URL`
2. Set all backend production env vars
3. Run smoke test plan in [`deployment-checklist.md`](deployment-checklist.md)
4. Enforce single-user / private access policy
5. Update `supportEmail` in branding config before external users

**Before public launch:** resolve C1, C2, C3, H5, H6 (see deployment checklist Section 7).

---

## 6. Files touched in validation

| File | Reason |
|------|--------|
| `frontend/app/components/chart-value-axis-title.tsx` | TS build fix |
| `frontend/lib/selected-visualization.ts` | Missing import fix |
| `docs/deployment-checklist.md` | New — pilot checklist |
| `docs/build-validation-report.md` | This report |

Temporary logs (optional cleanup): `docs/_build-validation-lint.log`, `docs/_build-validation-frontend.log`
