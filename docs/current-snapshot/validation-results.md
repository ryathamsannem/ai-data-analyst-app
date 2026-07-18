# Validation Results

**Snapshot:** July 8, 2026 (post-performance-fix stable snapshot) · Branch `DEV` · HEAD `a9e1e85`.

---

## Large dataset performance validation (July 8, 2026)

**Outcome:** Large dataset upload/dashboard performance restored. 100k upload now responds quickly and auto-dashboard appears immediately after the upload response.

### Backend discovery cache fix

| Validation | Result |
|------------|--------|
| Golden output comparison | **PASS** for 10k / 50k / 75k / 100k |
| Chart output drift | **None intentionally introduced** — chart count/types/titles/selection fingerprints matched |
| Targeted backend tests | **PASS**: `cd backend && python -m pytest tests/test_auto_dashboard_opportunities.py` |
| Performance result | 100k `discover_chart_opportunities` improved significantly via request-local reuse |

### Frontend bounded tick-generation fix

| Validation | Result |
|------------|--------|
| Root cause confirmed | `buildTicks` / `capPremiumAxisTicks` were hot; 50k response → Recharts was ~74s before fix |
| Fix | Bounded tick generation in `frontend/lib/overview-premium-axis-domain.ts`; arithmetic tick-count estimate before array materialization |
| Axis/domain tests | **PASS**: `npx vitest run lib/overview-premium-axis-domain.test.ts` — 34 passed |
| Related chart tests | **PASS**: `npx vitest run lib/chart-renderer-line-labels.test.ts lib/line-value-labels.test.ts lib/cartesian-chart-decisions.test.ts` — 75 passed |
| Build | **PASS**: `cd frontend && npm run build` |
| Manual upload validation | **PASS** for 10k, 50k, and 100k uploads |
| 50k timing after fix | JSON parse → all Recharts wrappers ~338ms |
| 10k timing after fix | JSON parse → all Recharts wrappers ~342ms |
| Duplicate `/filtered-dashboard` | Not observed after upload |

### Scope constraints observed

- No lazy rendering or staged dashboard rendering was used.
- No backend response shape change.
- No chart selection/scoring/title changes intended.
- No chart labels/tooltips/PDF/PNG export/AI Insights/suggested-questions behavior changes intended.

---

## Final snapshot validation (June 28, 2026)

### Full backend

```bash
cd backend && python -m pytest tests/
```

- **Result:** **478 passed, 0 failed**

### Full frontend

```bash
cd frontend && npm run test
cd frontend && npm run build
```

| Check | Result |
|-------|--------|
| Vitest | **743 passed, 0 failed** (85 files) |
| Build | **PASS** — Next.js 16.2.4; TypeScript clean |

### Targeted regression suites (final snapshot)

```bash
cd backend && python -m pytest \
  tests/test_cross_domain_15_overview_validation.py \
  tests/test_cross_domain_upload_1k.py \
  tests/test_marketing_campaigns_mapping_dashboard.py \
  tests/test_upload_mapping_edge_cases.py \
  tests/test_overview_banking_gold_dashboard.py \
  tests/test_overview_hr_gold_dashboard.py \
  tests/intent_engine/test_banking_utilization_routing.py \
  tests/test_auto_dashboard_opportunities.py \
  tests/test_auto_dashboard_showcase_regression.py
```

- **Result:** **All pass** (81 tests across 9 files)

---

## Previously resolved failures (now green)

These were pre-existing before commit `61d0145`; all fixed in the showcase/banking cleanup pass:

| Former failure | Resolution |
|----------------|------------|
| `test_banking_utilization_routing.py` — utilization trend suggested question | Temporal `month` fallback + banking utilization suggestion |
| `test_auto_dashboard_opportunities.py` — showcase count/diversity (3 tests) | Showcase-rich scatter policy, dimension dedup, `discovered_count` gating |
| `test_auto_dashboard_showcase_regression.py` — scatter payload | Relationship-bucket scatter for showcase-rich pools |

---

## 15-domain Overview validation

```bash
cd backend && python -m pytest tests/test_cross_domain_15_overview_validation.py
```

- **Result:** **7 passed**
- **Summary:** 14/15 High confidence; 1 justified Medium (banking); 0 default scatter; AI summary sanity 15/15 PASS
- **Doc:** [`final-overview-15-domain-validation.md`](./final-overview-15-domain-validation.md)

---

## H-Bar/V-Bar parity validation (Pass 5B → 5C.5)

| Check | Method | Verdict |
|-------|--------|---------|
| Zero baseline (currency/count H/V-Bar) | `overview-bar-value-domain.test.ts` | PASS |
| Low-rate percent cap (delinquency ~5%) | Unit tests 5C.2 | PASS |
| H-Bar band fill / category sizing | `horizontal-bar-visual.test.ts` | PASS |
| Overview H-Bar 85% utilization cap | Unit tests + Loan Balance fixture | PASS |
| Percent chip 1.0% not 100% | Domain/metric tests | PASS |
| Export/live domain parity | `cartesian-chart-decisions.test.ts`, export tests | PASS |
| Cross-surface renderer wiring | Static trace | PASS |
| Manual H-Bar/V-Bar premium match | **FROZEN** after 5C.5 | **FROZEN** |

---

## P1 — Export regression pass

**Status:** Complete (unchanged from June 27 validation).

- Targeted export tests: **87/87** pass
- Phase 7 PDF matrix: 18/18 PDFs via `phase7-pdf-generate.test.ts`
- Full vitest at snapshot: **743/743**
- Build: **PASS**

**Note:** Running full `npm run test` may regenerate PDF binaries under `docs/pdf-validation-screenshots/`. Restore with `git checkout -- docs/pdf-validation-screenshots/*.pdf` unless intentionally refreshing baseline PDFs.

---

## Overview defaults confirmation — gold fixtures

**Status:** Complete (June 27, 2026). Backend probe + targeted pytest **37/37** + frontend golden summary tests.

| Fixture | Verdict |
|---------|---------|
| `retail_gold_10000.csv` | **PASS** |
| `banking_gold_10000.csv` | **PASS** — no default scatter |
| `banking_financial_services.csv` | **PASS** |
| `hr_gold_5000.csv` | **PASS** |

Detail: prior section in git history; no regressions in final snapshot run.

---

## Cleanup audit

**Status:** Complete.

- Archived: `docs/latest-project-snapshot/` → `docs/archive/latest-project-snapshot/`
- Audit doc: [`cleanup-audit-before-final-snapshot.md`](./cleanup-audit-before-final-snapshot.md)
- No production code changed during cleanup

---

## How to continue in a new Cursor chat

**Baseline:** [`final-release-readiness-summary.md`](./final-release-readiness-summary.md) · [`latest-working-snapshot.md`](./latest-working-snapshot.md)

**Do not** reopen H-Bar/V-Bar parity unless a regression is reported with measured SVG evidence.

**Optional next work:** browser spot-check, AI Insights narrative QA, platform auth/storage/metering.
