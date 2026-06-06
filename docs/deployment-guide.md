# Deployment Guide

Production startup notes for the AI Data Analyst App. See also [`production-readiness-review.md`](production-readiness-review.md) for the full audit.

---

## Architecture

| Service | Stack | Default port |
|---------|-------|--------------|
| Backend API | FastAPI + uvicorn/gunicorn | 8000 |
| Frontend | Next.js 16 | 3000 |

---

## Environment variables

Copy [`.env.example`](../.env.example) to `.env` for local development. In production, inject secrets via your host's secret manager — **never commit `.env`**.

### Backend (required in production)

| Variable | Required | Default (dev) | Description |
|----------|----------|---------------|-------------|
| `ANTHROPIC_API_KEY` | **Yes** when `APP_ENV=production` | — | Claude API key for AI narrative |
| `APP_ENV` | Recommended | `development` | Set to `production` for prod behavior |
| `ALLOWED_ORIGINS` | **Yes** in prod | `http://localhost:3000` | Comma-separated CORS origins |
| `AI_NARRATIVE_ENABLED` | No | `true` | Set `false` to disable AI narrative requirement |

### Frontend (build-time)

| Variable | Required | Default (dev) | Description |
|----------|----------|---------------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | **Yes** in prod | `http://localhost:8000` | Backend API origin for browser fetch |

---

## Health checks

| Endpoint | Purpose | Success |
|----------|---------|---------|
| `GET /health` | Liveness — process is running | `200` `{ "status": "ok" }` |
| `GET /ready` | Readiness — config valid for traffic | `200` when ready; `503` when not |

**Readiness behavior:**
- **Production:** returns `503` if `ANTHROPIC_API_KEY` is missing and AI narrative is enabled.
- **Development:** returns `200` with a warning when the API key is missing (fallback narrative allowed).

Configure your load balancer/orchestrator to use `/health` for liveness and `/ready` for readiness.

---

## Local development

```bash
# Backend
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env   # edit ANTHROPIC_API_KEY
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 — frontend defaults to `http://localhost:8000` when `NEXT_PUBLIC_API_BASE_URL` is unset.

---

## Production build

```bash
# Backend tests
cd backend
python run_tests.py

# Frontend tests + build
cd frontend
npm run test
npm run build
```

### Backend startup (recommended)

Do **not** use `--reload` in production.

```bash
cd backend
pip install -r requirements.txt

# Example with gunicorn + uvicorn workers (install gunicorn separately — not in requirements.txt)
gunicorn main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 2 \
  --bind 0.0.0.0:8000 \
  --timeout 120
```

**Pilot recommendation:** use a **single uvicorn worker** until per-session dataset isolation (C3) and durable usage (H6) land:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
```

See [`deployment-checklist.md`](deployment-checklist.md) for the full pilot checklist.

**Production env example:**

```bash
export APP_ENV=production
export ANTHROPIC_API_KEY=sk-ant-...
export ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
```

The server **fails fast at startup** if `APP_ENV=production`, AI narrative is enabled, and `ANTHROPIC_API_KEY` is missing.

### Frontend startup

```bash
cd frontend
export NEXT_PUBLIC_API_BASE_URL=https://api.example.com
npm run build
npm run start
```

Serve the frontend behind HTTPS. Point `NEXT_PUBLIC_API_BASE_URL` at your public backend URL (same origin or CORS-allowed cross-origin).

---

## CORS

Set `ALLOWED_ORIGINS` to every frontend origin that will call the API:

```bash
ALLOWED_ORIGINS=https://app.example.com,https://staging.example.com
```

Local dev defaults to `http://localhost:3000` when unset.

---

## Pre-deploy checklist

- [ ] `APP_ENV=production` on backend
- [ ] `ANTHROPIC_API_KEY` set in secret store
- [ ] `ALLOWED_ORIGINS` lists production frontend URL(s)
- [ ] `NEXT_PUBLIC_API_BASE_URL` set at frontend **build** time
- [ ] `/health` and `/ready` return 200 on staging
- [ ] Smoke test: upload → ask → PDF export
- [ ] Real `supportEmail` in `frontend/lib/branding-config.ts`
- [ ] Hide mock plan toggle for production builds (Week 1+)

---

## Known Week 1+ blockers (not in Week 0 scope)

- Authentication and server-side plan entitlements
- Per-session dataset isolation (multi-user)
- Durable usage tracking (Redis/DB)
- Docker / container images

See [`production-readiness-review.md`](production-readiness-review.md) remediation roadmap.
