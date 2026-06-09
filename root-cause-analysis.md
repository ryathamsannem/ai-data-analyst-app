# Root Cause Analysis

**Generated:** June 8, 2026  
**Purpose:** Structural issues, debt, and risk categories for handoff planning

---

## Executive summary

The app delivers a **coherent analytics MVP** with strong **deterministic chart pipeline** and growing **intent_engine** test coverage. Production risk concentrates in **session architecture** (single global dataset), **trust boundary** (LLM narrative vs pandas viz), and **mock SaaS limits** — not in basic chart rendering or upload parsing.

---

## Critical architectural issues

### 1. Single-process global session

**Root cause:** Early MVP chose module-level globals (`df`, `column_mapping`, …) in `backend/main.py` for speed.

**Effects:**

- No multi-user isolation
- No horizontal scaling without sticky sessions + external state anyway
- Upload race conditions under concurrency

**Why it persists:** Entire API surface assumes one active dataset; refactoring touches every endpoint.

---

### 2. Monolithic application cores

**Root cause:** `page.tsx` and `main.py` grew as single files absorbing all features.

**Effects:**

- High regression risk per edit
- Difficult code review
- Intent engine only **partially** extracted (backend); frontend chart logic split but state remains central

**Why it persists:** `AGENTS.md` explicitly discourages broad refactors of stable UI; extraction is incremental only.

---

### 3. Dual chart pipelines (Overview vs session)

**Root cause:** Overview mini charts need compact 360px layout; Charts/Insights need full session renderer.

**Effects:**

- Two presentation paths must stay semantically aligned
- PNG export uses offscreen `ChartRenderer` clone (third render path at export time)

**Mitigation:** `final-chart-presentation.ts` for session; `computeOverviewDashboardChartPresentation` for overview; tests for rate/pp formatting.

---

### 4. LLM as narrative layer only (but user trusts prose)

**Root cause:** Claude adds executive readability; pandas owns numbers.

**Effects:**

- Narrative can diverge when prompts fail or `exact_result` empty
- Users read answer text before verifying chips

**Mitigation:** Frontend gates (`insightChartMatchesCurrentQuestion`); prompt grounding blocks; confidence scoring.

**Residual:** No mechanical post-validation of narrative numbers.

---

## Technical debt inventory

| Debt | Location | Interest cost |
|------|----------|---------------|
| 14k-line SPA | `page.tsx` | Every UI feature touches hot file |
| 15.8k-line API | `main.py` | Routing order fragile |
| `intent_engine.legacy` ↔ `main` delegation | backend | Circular imports, duplicate logic |
| Client-only plan enforcement | `plan-limits.ts` | Meaningless in prod without server auth |
| Filter-unaware preview | `/preview` | User confusion vs Insights cohort |
| No HTTP integration tests | `backend/tests/` | Deploy regressions undetected |
| TypeScript strict gaps | large TS files | IDE noise, latent bugs |
| Debug intent panel always on flag | `analysis-intent-debug.ts` `SHOW_INTENT_DEBUG = true` | May leak debug UI |

---

## Deployment risks

| Risk | Likelihood | Impact | Mitigation today |
|------|------------|--------|------------------|
| Wrong `NEXT_PUBLIC_API_BASE_URL` on Vercel | Medium | App unusable | `.env.example` + deployment guide |
| Missing `ANTHROPIC_API_KEY` on Render | Medium | Fake answers + charts | `/ready` check in prod |
| CORS mismatch (Vercel ↔ Render) | Medium | All API calls fail | `ALLOWED_ORIGINS` env |
| Render single worker + global `df` | High | Data cross-talk if shared URL | Pilot: single user only |
| Render cold start + large upload | Medium | Timeout on big files | Paid tier limits; file size caps |
| No pinned Python deps | Low | Reproducible deploy drift | Pin in `requirements.txt` |

**Deploy topology:** Vercel (frontend) + Render (backend) per `docs/deployment-guide.md`. No Docker.

---

## Scaling risks

| Dimension | Current ceiling | Bottleneck |
|-----------|-----------------|------------|
| Concurrent users | 1 effective dataset | Global `df` |
| File size | 100 KB free / 25 MB paid (spoofable) | Memory read + pandas parse |
| AI questions | 10/day free, 300/mo paid (in-memory) | `usage_tracker.py` |
| PDF exports | 1/day free | Quota + main-thread jsPDF |
| Chart history | Browser memory | No server persistence |
| Worker scaling | Broken without external session store | Globals |

---

## AI reliability risks

| Risk | Mechanism | Guard |
|------|-----------|-------|
| Wrong chart type | Keyword + fallback routing in `main.py` | `intent_engine`, correlation pack first |
| Wrong aggregation (mean vs sum) | Column resolution | `column_resolve.py`, rate tests |
| Geographic false positives | Scope detector | `geographic_scope.py` + tests |
| Executive phrase misroute | Ambiguous intent | `executive_ambiguous_intent.py` |
| Low confidence on simple ranks | Scoring thresholds | `confidence_scoring.py` (fixed Jun 2026) |
| Follow-up context bleed | Thread metadata | `ai-conversation-context.ts` — needs E2E QA |
| Model outage / rate limit | Anthropic SDK errors | Retry + fallback copy (trust risk) |

**Disable switch:** `INTENT_ENGINE_DISABLE=true` removes enrichment — use only for emergency debug.

---

## Export risks

### PNG export

| Risk | Status (Jun 2026) |
|------|-------------------|
| Visible chart flicker during capture | ✅ **Fixed** — offscreen portal |
| Disconnected line paths (animation) | ✅ **Fixed** — `pngCaptureMode`, stable SVG wait |
| Wide empty h-bar canvas | ✅ **Mitigated** — 1100px width, compact plot util |
| html2canvas Tailwind v4 `color-mix` | ✅ **Avoided** — Canvg + canvas header |
| Dark mode unreadable axes | ✅ Themed via `chart-axis-theme.ts` |

**Residual:** Manual spot-check after deploy for new datasets.

### PDF export

| Risk | Status |
|------|--------|
| Section gating wrong mode | ✅ Fixed — executive mode honors checkboxes |
| Quota consumed on failure | 🟡 Refund path exists — verify ordering |
| Main-thread freeze on large reports | Open — no progress/cancel |
| Chart–insight misalignment in PDF | Gated by same match helpers as UI |
| Page utilization / density | Open — product polish phase |
| Capture ref stale after question change | Gated — must align before export |

---

## Root cause → remediation map

```
Global df (C1)
  └─► Per-tenant dataset service + auth identity

Spoofable plan (H1)
  └─► Server-side subscription + remove X-Plan-Tier trust

Monoliths (H3)
  └─► Extract on touch: export session, filter state, /ask handler

Narrative drift (C2)
  └─► Numeric validator + narrativeStatus in API response

PNG/PDF trust
  └─► Keep alignment gates; never export without question match
```

---

## What is NOT a root cause problem

These are **stable** and should not be re-architected without explicit request:

- Recharts chart-type semantics (horizontal bars stay horizontal)
- Overview card chrome and filter bar layout
- `AiInsightChartShell` viewport structure
- Pandas as chart calculation engine
- jsPDF + Canvg export strategy

See [`AGENTS.md`](AGENTS.md).
