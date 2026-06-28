# Next Work Plan

**Recommended priorities** after chart UI polish + Phase A cleanup (June 16, 2026)

---

## 1. PNG export quality

**Why:** On-screen charts improved (plot-v4); PNG capture should match session detail framing and typography.

**Scope:**
- Parity check: Charts tab PNG vs on-screen for line/H-Bar/donut
- `chart-png-export-svg-polish.ts` / `chart-png-export-layout.ts` tuning
- Overview card PNG vs live mini chart alignment

**Avoid:** Changing chart kind logic or shell widths; tune export spec layer only.

**Files:** `frontend/lib/chart-png-export-*.ts`, `frontend/lib/overview-dashboard-export.ts`

---

## 2. AI Insights answer quality

**Why:** C2/C10 open issues — narrative can drift from chart values; follow-ups need tighter grounding.

**Scope:**
- Expand `test_follow_up_context.py` coverage
- Strengthen grounding block validation in `/ask` response handling
- Browser QA checklist for column-meta and outlier questions
- Clearer Reset / topic-change affordance (H9)

**Avoid:** Broad routing reorder without regression pack.

**Files:** `backend/main.py` (narrative), `frontend/lib/ai-conversation-context.ts`, intent_engine tests

---

## 3. Production hardening

**Why:** Deployment blockers for multi-user public use (C1, H7, H1, H5).

**Priority order:**
1. Per-session dataset storage (not global `df`)
2. Authentication + server-side plan tier
3. Durable usage counters (Redis/DB)
4. Rate limiting on `/upload` and `/ask`
5. Structured logging / monitoring

**Files:** `backend/main.py`, `backend/services/usage_tracker.py`, `backend/services/saas_context.py`

---

## 4. Performance optimization

**Why:** Explicitly pending since `4247ef3` — bulk load / large dataset paths.

**Scope:**
- Profile filtered-dashboard refresh and `/ask` on 10k–100k fixtures
- `useTransition` / memo audit on hot paths in `page.tsx`
- Backend pandas hot paths in viz aggregation
- PDF generation chunking or web worker (M9)

**Avoid:** Premature `page.tsx` extraction without a narrow target module.

**Fixtures:** `test-fixtures/large-dataset/`

---

## 5. Export/PDF finalization (product)

**Why:** Functional but not product-final per `AGENTS.md` and M13.

**Scope:**
- Print-light theme polish
- Appendix pagination bounds (M10)
- Section toggle UX on Export tab
- Phase 7 PDF matrix regression (`vitest.phase7.config.ts`)

**Files:** `frontend/app/pdf-report.ts`, `frontend/lib/pdf-executive-content.ts`

---

## Suggested sequence

```
1. PNG export parity (low risk, visible win)
2. AI answer grounding tests + narrow narrative fixes
3. Performance profiling (large datasets)
4. PDF product finalization
5. Production hardening (parallel track if deploying)
```

---

## Do not reopen without explicit approval

- Narrow viewport / centered chart island layout experiments
- Shell max-width changes on line/area
- H-Bar / Donut renderer rewrites
- Overview mini-card pipeline merge into session renderer
