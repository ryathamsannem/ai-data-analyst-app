# Deployment Guide

Production startup notes for the AI Data Analyst App. See also [`production-readiness-review.md`](production-readiness-review.md) for the full audit.

---

## Architecture

| Service | Stack | Default port |
|---------|-------|--------------|
| Backend API | FastAPI + uvicorn | 8000 (local) / `$PORT` (Render) |
| Frontend | Next.js 16 | 3000 (local) / Vercel (managed) |

**Recommended hosting (Phase 11.1):** Frontend on **Vercel**, backend on **Render** — see [Vercel + Render](#vercel--render-deployment-phase-111) below.

---

## Environment variables

Copy [`.env.example`](../.env.example) for local reference. In production, set variables in **Render** (backend) and **Vercel** (frontend) dashboards — **never commit `.env`**.

### Backend (required in production)

| Variable | Required | Default (dev) | Description |
|----------|----------|---------------|-------------|
| `ANTHROPIC_API_KEY` | **Yes** when `APP_ENV=production` | — | Claude API key for AI narrative |
| `APP_ENV` | Recommended | `development` | Set to `production` for prod behavior |
| `ALLOWED_ORIGINS` | **Yes** in prod | `http://localhost:3000` | Comma-separated CORS origins (exact match) |
| `AI_NARRATIVE_ENABLED` | No | `true` | Set `false` to disable AI narrative requirement |
| `PORT` | Render only | — | Auto-set by Render; used in start command |

### Frontend (build-time — Vercel)

| Variable | Required | Default (dev) | Description |
|----------|----------|---------------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | **Yes** in prod | `http://localhost:8000` | Backend API origin (no trailing slash) |

Used by [`frontend/lib/api-base.ts`](../frontend/lib/api-base.ts) for all browser `fetch` calls.

---

## Health checks

| Endpoint | Purpose | Success |
|----------|---------|---------|
| `GET /health` | Liveness — process is running | `200` `{ "status": "ok" }` |
| `GET /ready` | Readiness — config valid for traffic | `200` when ready; `503` when not |

**Readiness behavior:**
- **Production:** returns `503` if `ANTHROPIC_API_KEY` is missing and AI narrative is enabled.
- **Development:** returns `200` with a warning when the API key is missing (fallback narrative allowed).

**Render:** set `healthCheckPath: /health` in [`render.yaml`](../render.yaml).

---

## Local development

```bash
# Backend
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env   # edit ANTHROPIC_API_KEY in backend/.env
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 — frontend defaults to `http://localhost:8000` when `NEXT_PUBLIC_API_BASE_URL` is unset.

---

## Production build (local verify)

```bash
# Backend tests
cd backend
python run_tests.py

# Frontend tests + build
cd frontend
npm run test
npm run build
```

### Backend startup (local / VM)

Do **not** use `--reload` in production.

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
```

> **Single worker only** until per-session dataset isolation (C3) and durable usage (H6) land.

### Frontend startup (local)

```bash
cd frontend
export NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com
npm run build
npm run start
```

---

## CORS

Set `ALLOWED_ORIGINS` to every frontend origin that will call the API:

```bash
ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app-git-main-you.vercel.app
```

- Origins must match **scheme + host + port** exactly.
- Wildcards are **not** supported — list each Vercel preview URL explicitly if needed.
- Local dev defaults to `http://localhost:3000` when unset.

Configured in [`backend/services/cors_config.py`](../backend/services/cors_config.py).

---

## Vercel + Render deployment (Phase 11.1)

Split hosting: **frontend on Vercel**, **backend API on Render**. Use [`render.yaml`](../render.yaml) for the API.

### Architecture

| Service | Platform | Root directory | Public URL example |
|---------|----------|----------------|-------------------|
| Frontend | Vercel | `frontend/` | `https://your-app.vercel.app` |
| Backend API | Render Web Service | `backend/` | `https://ai-data-analyst-api.onrender.com` |

**No `vercel.json` required** — Vercel auto-detects Next.js 16 when **Root Directory** = `frontend`.

---

### Step 1 — Deploy backend on Render

1. Push repo to GitHub/GitLab.
2. Render Dashboard → **New** → **Blueprint** → connect repo → apply `render.yaml`.
3. Set secret env vars when prompted:
   - `ANTHROPIC_API_KEY`
   - `ALLOWED_ORIGINS` — e.g. `https://your-app.vercel.app`
4. Note the service URL after deploy.

**Commands (from `render.yaml`):**

| Phase | Command |
|-------|---------|
| **Build** | `pip install --upgrade pip && pip install -r requirements.txt` |
| **Start** | `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1` |
| **Health check** | `GET /health` |

**Verify:**

```bash
curl https://YOUR-SERVICE.onrender.com/health
curl https://YOUR-SERVICE.onrender.com/ready
```

---

### Step 2 — Deploy frontend on Vercel

1. Vercel → **Add New Project** → import repo.
2. **Root Directory:** `frontend`
3. **Environment Variables** (Production + Preview):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_BASE_URL` | `https://YOUR-SERVICE.onrender.com` |

4. Deploy.

| Phase | Command |
|-------|---------|
| **Install** | `npm install` |
| **Build** | `npm run build` |

---

### Step 3 — CORS + smoke test

1. Ensure Render `ALLOWED_ORIGINS` matches the exact Vercel URL in the browser.
2. Redeploy Render after changing `ALLOWED_ORIGINS`.
3. Run smoke test in [`deployment-checklist.md`](deployment-checklist.md) §4 on the Vercel URL.

---

### Deployment risks (Vercel + Render)

| Risk | Mitigation |
|------|------------|
| CORS mismatch | Exact Vercel URL in `ALLOWED_ORIGINS` |
| Stale API URL in frontend | Rebuild Vercel after changing `NEXT_PUBLIC_API_BASE_URL` |
| Render cold start | First request after idle may be slow; use Starter plan for pilot |
| In-memory state (C3) | Single instance, single worker |
| No auth (C1) | Restrict API URL exposure; monitor Anthropic usage |
| Preview deployments | Add each preview origin to CORS or test production URL only |

---

### Rollback

| Platform | Action |
|----------|--------|
| Vercel | Deployments → previous deployment → **Promote to Production** |
| Render | **Rollback** to prior deploy in Events tab |

---

## Pre-deploy checklist

- [ ] `APP_ENV=production` on Render
- [ ] `ANTHROPIC_API_KEY` set in Render secrets
- [ ] `ALLOWED_ORIGINS` lists Vercel frontend URL(s)
- [ ] `NEXT_PUBLIC_API_BASE_URL` set in Vercel (Production + Preview)
- [ ] `/health` and `/ready` return 200 on Render
- [ ] Smoke test: upload → ask → PDF export on Vercel URL
- [ ] Real `supportEmail` in `frontend/lib/branding-config.ts`

See [`deployment-checklist.md`](deployment-checklist.md) for the full operator checklist.

---

## Known Week 1+ blockers

- Authentication and server-side plan entitlements
- Per-session dataset isolation (multi-user)
- Durable usage tracking (Redis/DB)

See [`production-readiness-review.md`](production-readiness-review.md) remediation roadmap.
