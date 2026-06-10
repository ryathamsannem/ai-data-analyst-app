# Deployment Checklist (Pilot / Staging)

**Phase:** 10B — Pilot Deployment Preparation · **11.1** — Vercel + Render  
**Date:** 2026-06-06  
**Related:** [`deployment-guide.md`](deployment-guide.md) · [`production-readiness-review.md`](production-readiness-review.md) · [`build-validation-report.md`](build-validation-report.md) · [`pilot-deployment-report.md`](pilot-deployment-report.md) · [`render.yaml`](../render.yaml)

Use this checklist before and during the **first real staging/pilot** deployment. This is a **single-tenant, low-traffic pilot** — not public multi-user SaaS.

---

## Go / no-go (pilot)

| Decision | Recommendation |
|----------|----------------|
| **Controlled staging pilot** (VPN, IP allowlist, or private URL; ≤10 trusted users) | **GO** — with constraints below |
| **Public multi-user SaaS** | **NO-GO** — Week 1 blockers (C1, C2, C3, H5, H6) still open |

**Pilot constraints (mandatory):**
- One active analyst/session at a time (global dataset — C3)
- Backend not exposed to open internet without network guard (reverse proxy / VPN)
- Treat mock plan limits as UX preview only (C2)
- Monitor Anthropic usage and cost (C1 — no auth on `/ask`)

---

## 1. Environment inventory

### Backend (runtime)

| Variable | Required (pilot) | Example | Notes |
|----------|------------------|---------|-------|
| `APP_ENV` | **Yes** | `production` | Enables fail-fast API key check |
| `ANTHROPIC_API_KEY` | **Yes** | `sk-ant-...` | From secret store; never commit |
| `ALLOWED_ORIGINS` | **Yes** | `https://staging.example.com` | Comma-separated frontend origin(s) |
| `AI_NARRATIVE_ENABLED` | No | `true` | Set `false` only if narrative disabled |

### Frontend (build-time)

| Variable | Required (pilot) | Example | Notes |
|----------|------------------|---------|-------|
| `NEXT_PUBLIC_API_BASE_URL` | **Yes** | `https://api-staging.example.com` | Baked into build; must match backend URL |

### Render (backend)

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `APP_ENV` | **Yes** | `production` | Set in `render.yaml` |
| `ANTHROPIC_API_KEY` | **Yes** | Secret in Render dashboard | Never commit |
| `ALLOWED_ORIGINS` | **Yes** | `https://your-app.vercel.app` | Exact Vercel origin(s), comma-separated |
| `AI_NARRATIVE_ENABLED` | No | `true` | Default in blueprint |
| `PORT` | Auto | — | Injected by Render; used in start command |

### Vercel (frontend)

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `NEXT_PUBLIC_API_BASE_URL` | **Yes** | `https://ai-data-analyst-api.onrender.com` | Set for **Production** and **Preview** builds |

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_AI_INSIGHTS_DEBUG` | unset | Debug panels in AI Insights |
| `INTENT_ENGINE_DISABLE` | unset | Disable intent engine metadata |

Copy [`.env.example`](../.env.example) for local reference. In staging, inject vars via host secret manager or CI.

---

## 2. Pre-deploy commands

### Backend

```bash
cd backend
pip install -r requirements.txt
python run_tests.py
```

**Production startup (pilot — uvicorn):**

```bash
cd backend
export APP_ENV=production
export ANTHROPIC_API_KEY=sk-ant-...
export ALLOWED_ORIGINS=https://staging.example.com

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
```

> **Note:** `gunicorn` is documented in [`deployment-guide.md`](deployment-guide.md) but is **not** pinned in `requirements.txt`. For pilot, use **uvicorn with `--workers 1`** to avoid multi-worker global-state issues (C3). Add gunicorn when moving to multi-worker + session isolation.

**Startup validation:**
- With `APP_ENV=production` and missing `ANTHROPIC_API_KEY` → process **must exit** at startup.

### Frontend

```bash
cd frontend
npm install
npm run test

export NEXT_PUBLIC_API_BASE_URL=https://api-staging.example.com
npm run build
npm run start
```

Serve behind HTTPS (reverse proxy or platform static host).

---

## 3. Post-deploy verification

### Health probes

| Check | Command / URL | Expected |
|-------|---------------|----------|
| Liveness | `GET /health` | `200` `{ "status": "ok" }` |
| Readiness | `GET /ready` | `200` `{ "ready": true }` in prod with key set |
| Missing key (prod) | Startup without key | Process exits with `RuntimeError` |

**Example (PowerShell):**

```powershell
(Invoke-WebRequest http://localhost:8000/health -UseBasicParsing).Content
(Invoke-WebRequest http://localhost:8000/ready -UseBasicParsing).Content
```

### Build artifact check

After `npm run build` with `NEXT_PUBLIC_API_BASE_URL` set, confirm the staging API host appears in `.next/static/chunks/*.js` (see [`build-validation-report.md`](build-validation-report.md)).

---

## 4. Staging smoke test plan

Run manually on staging URL after deploy. Use a small CSV (≤100 KB on free tier mock, or paid tier for larger files).

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1. **Upload** | Upload sample CSV from Overview | File accepted; columns/KPIs populate; no CORS error |
| 2. **Preview** | Open Data Preview tab | Rows load; filters work |
| 3. **AI ask** | AI Insights → ask e.g. “Top products by revenue” | Answer + chart render; no 500 |
| 4. **Follow-up** | Ask follow-up e.g. “What about profit?” | Context preserved; new chart/answer |
| 5. **PDF** | Export PDF from Insights (aligned chart) | PDF downloads; footer shows branding |
| 6. **Usage limits** | Free tier: use AI ask until limit; try PDF export twice | Upgrade modal / 429; PDF quota not consumed on failed preflight (Phase 10A) |
| 7. **Plan toggle** | Header plan menu → view usage | Counters update after ask/PDF (mock billing only) |
| 8. **Health** | Hit `/health` and `/ready` | Both return expected JSON |

**Sample datasets:** use repo test fixtures or a 20–50 row retail CSV with columns like product, revenue, region, date.

**Failure triage:**
- CORS error → check `ALLOWED_ORIGINS` matches browser origin exactly (scheme + host + port)
- API calls to `localhost` → rebuild frontend with `NEXT_PUBLIC_API_BASE_URL`
- `/ready` 503 → set `ANTHROPIC_API_KEY`
- 500 on `/ask` → check backend logs; verify key valid

---

## 5. Pilot deployment checklist (operator)

### Before deploy

- [ ] Staging URLs decided (frontend + API)
- [ ] Secrets stored (`ANTHROPIC_API_KEY`)
- [ ] `ALLOWED_ORIGINS` matches staging frontend URL
- [ ] `NEXT_PUBLIC_API_BASE_URL` set for frontend build
- [ ] `supportEmail` updated in `frontend/lib/branding-config.ts` (currently `support@example.com`)
- [ ] Backend tests pass (`python run_tests.py`)
- [ ] Frontend tests pass (`npm run test`)
- [ ] Frontend build pass (`npm run build` with staging API URL)
- [ ] Network guard in place (VPN / IP allowlist / private ingress)

### Deploy

- [ ] Deploy backend with `APP_ENV=production`
- [ ] Verify `/health` and `/ready` return 200
- [ ] Deploy frontend build artifact
- [ ] Run smoke test plan (Section 4)

### After deploy

- [ ] Document staging URLs and env for team
- [ ] Monitor Anthropic API usage/cost
- [ ] Confirm single active user policy communicated

---

## 6. Rollback steps

| Scenario | Action |
|----------|--------|
| **Bad frontend build** | Redeploy previous frontend artifact; or rebuild from last known-good git tag with correct `NEXT_PUBLIC_API_BASE_URL` |
| **Bad backend deploy** | Stop process; redeploy previous backend version; verify `/health` |
| **Config error (CORS / API URL)** | Fix env; restart backend and/or rebuild frontend; no code rollback needed |
| **API key leak** | Rotate `ANTHROPIC_API_KEY` in secret store; restart backend |
| **Data corruption / bad upload state** | Restart backend process (clears in-memory `df`); re-upload file |
| **Full rollback** | Revert to previous git commit; redeploy both services; run smoke test step 1–3 only |

**Rollback verification:** `/health` → upload → ask (minimal path).

---

## 7. Deferred blockers (intentional for pilot)

These remain **open by design** for Phase 10B. Accept only for **controlled pilot** — not public launch.

| ID | Blocker | Pilot risk | Mitigation |
|----|---------|------------|------------|
| **C1** | No authentication | Anyone with API URL can call `/ask` (LLM cost) | Private network; IP allowlist; monitor usage |
| **C2** | Client-controlled plan tier | Limits bypassable via headers | Treat limits as demo UX; don’t rely on for billing |
| **C3** | Single global dataset | Concurrent users overwrite data | **Single user at a time**; uvicorn `--workers 1` |
| **H5** | AI quota debited before pipeline completes | Lost quota on failed ask | Low traffic pilot; retry manually |
| **H6** | In-memory usage tracker | Resets on restart; not multi-worker safe | Single worker; accept reset on deploy |

**Week 1+ (before public launch):** auth (C1), server-side entitlements (C2), per-session datasets (C3), quota timing (H5), durable usage (H6).

---

## 8. Quick reference

| Item | Value |
|------|-------|
| Backend (local) | port 8000 |
| Backend (Render) | `$PORT` (platform) |
| Frontend (local) | port 3000 (`next start`) |
| Frontend (Vercel) | managed |
| Health | `GET /health` |
| Readiness | `GET /ready` |
| Render blueprint | [`render.yaml`](../render.yaml) |
| Env template | [`.env.example`](../.env.example) |
| Detailed ops guide | [`deployment-guide.md`](deployment-guide.md) |

---

## 9. Vercel + Render checklist (Phase 11.1)

### Before deploy

- [ ] Repo pushed to GitHub/GitLab
- [ ] `render.yaml` reviewed at repo root
- [ ] Vercel project **Root Directory** = `frontend`
- [ ] `vercel.json` **not required** (Next.js auto-detected)
- [ ] Backend tests pass (`python run_tests.py`)
- [ ] Frontend tests pass (`npm run test`)

### Render (backend)

- [ ] Create Blueprint from `render.yaml` or manual Web Service with `rootDir: backend`
- [ ] **Build:** `pip install --upgrade pip && pip install -r requirements.txt`
- [ ] **Start:** `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1`
- [ ] Set `ANTHROPIC_API_KEY` (secret)
- [ ] Set `ALLOWED_ORIGINS` to Vercel URL(s)
- [ ] `GET /health` → 200
- [ ] `GET /ready` → 200, `ready: true`

### Vercel (frontend)

- [ ] Import repo; root = `frontend`
- [ ] Set `NEXT_PUBLIC_API_BASE_URL` = Render service URL (no trailing slash)
- [ ] Redeploy after any API URL change
- [ ] App loads at Vercel URL without console CORS errors

### Post-deploy smoke (Section 4)

- [ ] Upload → AI → Follow-up → PDF → Usage limits on **Vercel URL**

---

## 10. Production QA gates (AI Insights + PDF)

Complete before promoting staging to production. See [`ai-insights-production-qa-roadmap.md`](ai-insights-production-qa-roadmap.md).

### Wave completion

| Wave | Domains | Routing QA | Live narrative (staging) |
|------|---------|------------|--------------------------|
| 1 | Retail, Marketing, Sales, Geography, Banking | [ ] `wave1_qa_execution.py --routing-only` | [ ] Complete |
| 2 | Finance/FP&A, Operations, Customer Support | [ ] `wave_qa_runner.py --wave 2 --routing-only` | [ ] Complete |
| 3 | HR, Healthcare | [ ] `wave_qa_runner.py --wave 3 --routing-only` | [ ] Complete |

### Cross-domain regression

```bash
cd backend
python scripts/cross_domain_regression.py
```

- [ ] Exit code 0 — all 10 domains pass gates
- [ ] Report: `docs/ai-insights-cross-domain-regression-report.md`

**Gates:** domain avg ≥7.5 · ≥90% questions ≥7.0 · zero hallucination fails · zero critical · negative tests limitation-first

### PDF export

- [ ] Phase 7 automated matrix pass (`npx vitest run --config vitest.phase7.config.ts`)
- [ ] If Export tab changed: manual P7-005 on ≥1 dataset
- [ ] See [`pdf-export-final-validation-runbook.md`](pdf-export-final-validation-runbook.md)

### Production go / no-go

| Criterion | Required |
|-----------|----------|
| Cross-domain regression | **PASS** |
| Wave 1–3 live narrative | Hallucination **0**; domain avg ≥ **7.8** |
| PDF automated matrix | **18/18** pass |
| Backend tests | `python run_tests.py` green |
| Frontend tests | `npm run test` green |
| Pilot constraints (§1) | Still apply — not public SaaS |

**GO** for controlled production pilot when all boxes checked. **NO-GO** for public multi-user until C1–C3 resolved (§7).
