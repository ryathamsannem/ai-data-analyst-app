# Deployment Readiness

**Generated:** June 8, 2026  
**Verdict:** ✅ **Pilot-ready** (controlled single-user) · 🔴 **Not ready** for public multi-user SaaS

---

## Summary matrix

| Area | Pilot | Public prod | Notes |
|------|-------|-------------|-------|
| Security | 🟡 | 🔴 | No auth; spoofable limits |
| Multi-user | 🔴 | 🔴 | Global `df` |
| API configuration | 🟢 | 🟢 | Env-based URL + CORS |
| Environment variables | 🟢 | 🟢 | `.env.example` documented |
| Error handling | 🟡 | 🟡 | Generic UI errors; some silent catches |
| Logging | 🔴 | 🔴 | `print()` in hot paths; no structured logs |
| Monitoring | 🔴 | 🔴 | No APM, metrics, or alerting |
| Automated tests | 🟢 | 🟡 | Unit tests green; no HTTP E2E in CI |
| PNG export | 🟢 | 🟢 | Offscreen renderer; tested |
| PDF export | 🟡 | 🟡 | Functional; polish incomplete |

---

## Security

### Current state

| Control | Status |
|---------|--------|
| Authentication | ❌ None — all routes open |
| Authorization | ❌ None |
| Plan tier enforcement | ❌ Client header `X-Plan-Tier` — spoofable |
| Session isolation | ❌ Single global dataset per process |
| CORS | ✅ `ALLOWED_ORIGINS` env (was localhost-only) |
| File upload validation | 🟡 Extension-based; tier size caps |
| Secrets management | 🟡 `.env` gitignored; `.env.example` provided |
| XSS | 🟢 React escaping; AI answers as text |
| CSV injection | 🟡 Raw cell values in API preview |
| HTTPS | ✅ Expected Vercel + Render TLS |

### Blockers for public production

1. Add authentication (OAuth, API keys, or proxy auth)
2. Per-user dataset storage — never global `df`
3. Server-side subscription / quota — never trust `X-Plan-Tier`
4. Rate limiting on `/ask` and `/upload` by identity
5. Content sniffing on uploads; sheet/cell caps

---

## Multi-user support

| Requirement | Current | Needed |
|-------------|---------|--------|
| Isolated datasets | ❌ Global `df` | Per-session store |
| Isolated usage counters | ❌ In-memory per `X-Session-Id` | Per-auth-user durable store |
| Concurrent uploads | ❌ Race on globals | Locks or isolated state |
| Chart history | ❌ Browser only | Optional server persistence |
| Horizontal scaling | ❌ Broken with globals | External state + sticky or stateless design |

**Pilot workaround:** Deploy to a **single trusted user**; treat backend as single-tenant.

---

## API configuration

### Frontend → Backend

| Setting | Location | Production value |
|---------|----------|------------------|
| API base URL | `NEXT_PUBLIC_API_BASE_URL` | `https://<render-service>.onrender.com` |
| Default fallback | `frontend/lib/api-base.ts` | `http://localhost:8000` |

Most fetches use `apiUrl()` helper; verify no stray hardcoded URLs remain in `page.tsx` when deploying.

### Backend CORS

| Setting | Location | Production value |
|---------|----------|------------------|
| Allowed origins | `ALLOWED_ORIGINS` | Vercel app URL(s), comma-separated |
| Parser | `backend/services/cors_config.py` | — |

### SaaS headers (mock)

| Header | Set by | Production |
|--------|--------|------------|
| `X-Session-Id` | `saas-session.ts` | Replace with auth session |
| `X-Plan-Tier` | `saas-session.ts` | **Remove trust** — server-derived only |

---

## Environment variables

### Required for production

| Variable | Service | Required |
|----------|---------|----------|
| `ANTHROPIC_API_KEY` | Render backend | ✅ Yes |
| `APP_ENV=production` | Render backend | ✅ Yes |
| `ALLOWED_ORIGINS` | Render backend | ✅ Yes |
| `NEXT_PUBLIC_API_BASE_URL` | Vercel frontend | ✅ Yes |

### Optional

| Variable | Purpose |
|----------|---------|
| `AI_NARRATIVE_ENABLED` | Disable Claude narrative |
| `NEXT_PUBLIC_AI_INSIGHTS_DEBUG` | Debug panels — **unset in prod** |
| `INTENT_ENGINE_DISABLE` | Emergency routing disable — **avoid in prod** |
| `PORT` | Set by Render automatically |

**Template:** [`.env.example`](.env.example)  
**Guide:** [`docs/deployment-guide.md`](docs/deployment-guide.md)  
**Checklist:** [`docs/deployment-checklist.md`](docs/deployment-checklist.md)

---

## Error handling

### Backend

| Pattern | Issue |
|---------|-------|
| Broad `except Exception` in `/ask` | May mask root cause |
| Missing API key → fallback copy | Looks like real answer (C4) |
| Inconsistent HTTP status for missing dataset | `/ask` 200 vs others 400 |
| No global exception handler | Stack traces may leak in dev |

### Frontend

| Pattern | Issue |
|---------|-------|
| Single global `error` string | One error at a time |
| Usage fetch `.catch(() => {})` | Silent plan load failure |
| `canAskAiQuestion` when `remaining == null` | Actions allowed before usage loaded |
| PNG export errors | ✅ Surfaces via `onChartExportError` / `setError` |
| PDF export | Refund on failure ✅ |

### Recommendations

- Structured API error shape `{ code, message, detail }`
- `role="alert"` on error banner
- Block gated actions until usage payload loads

---

## Logging

| Current | Gap |
|---------|-----|
| Python `logging` in intent_engine | No centralized request logging |
| `print()` in `main.py` hot paths | Not production-suitable |
| No correlation IDs | Cannot trace ask → viz → narrative |
| No frontend error reporting | Silent failures in usage fetch |

**Recommendations:** Structured JSON logs on Render; request ID middleware; Sentry or similar for frontend.

---

## Monitoring

| Capability | Status |
|------------|--------|
| Liveness | ✅ `GET /health` |
| Readiness | ✅ `GET /ready` (API key check in prod) |
| Render health check | ✅ `render.yaml` → `/health` |
| Metrics (latency, error rate) | ❌ |
| Uptime alerting | ❌ |
| Anthropic quota / rate limit monitoring | ❌ |
| Disk/memory on large uploads | ❌ |

---

## Deployment blockers

### Hard blockers (public multi-user)

| ID | Blocker |
|----|---------|
| B1 | No authentication |
| B2 | Global in-memory `df` |
| B3 | Client-spoofable plan tier |
| B4 | In-memory usage tracker |

### Soft blockers (pilot quality)

| ID | Blocker |
|----|---------|
| B5 | Manual E2E QA not signed off |
| B6 | PDF polish / 7-section smoke test |
| B7 | Uncommitted `DEV` changes not tagged |
| B8 | Placeholder support email in PDF |
| B9 | `SHOW_INTENT_DEBUG = true` in `analysis-intent-debug.ts` |

### Non-blockers (pilot OK)

| Item | Notes |
|------|-------|
| PNG export | Offscreen renderer; 180 tests pass |
| Intent engine tests | 166 backend tests pass |
| CORS + API URL env | Configured |
| Render + Vercel split | Documented |

---

## Recommended deploy steps (pilot)

1. **Render:** Deploy `backend/` with `render.yaml`
   - Set `ANTHROPIC_API_KEY`, `APP_ENV=production`, `ALLOWED_ORIGINS`
2. **Vercel:** Deploy `frontend/`
   - Set `NEXT_PUBLIC_API_BASE_URL` to Render URL
   - **Do not** set `NEXT_PUBLIC_AI_INSIGHTS_DEBUG`
3. **Verify:** `GET /ready` returns 200
4. **Smoke:** Upload pilot CSV → Overview charts → Ask Insights → PNG export → PDF export
5. **Limit:** Single user / trusted testers only

---

## CI / build verification (pre-deploy)

```bash
cd frontend
npm run lint
npm run build
npm run test          # 180 tests

cd ../backend
python run_tests.py -v   # 166 tests
```

---

## Related documents

- [`project-snapshot.md`](project-snapshot.md) — feature status
- [`bug-inventory.md`](bug-inventory.md) — ranked issues
- [`root-cause-analysis.md`](root-cause-analysis.md) — structural risks
- [`docs/production-readiness-review.md`](docs/production-readiness-review.md) — detailed Phase 10 review
- [`docs/deployment-checklist.md`](docs/deployment-checklist.md) — step-by-step checklist
