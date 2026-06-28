# Latest Working Snapshot

**Snapshot date:** June 28, 2026  
**Purpose:** Baseline before **Mapping Confidence Calibration — Medium domains review**  
**Branch:** `DEV`

---

## Git state

| Item | Value |
|------|-------|
| **Branch** | `DEV` (up to date with `origin/DEV`) |
| **Latest commit** | `e353dee` — Improve healthcare and SaaS mapping: distinct secondary metrics and SaaS domain label. |
| **Working tree** | **Clean** — no modified or untracked files |
| **Recent commits** | `e353dee` healthcare/SaaS mapping · `5e198ae` HR age-chart demotion · `b2c930c` upload edge cases · `138ee9d` P1 UX audit |

---

## Completed phases (frozen / closed)

| Phase | Status | Doc |
|-------|--------|-----|
| H-Bar / V-Bar visual parity (Passes 5B.1 → 5C.5) | **Frozen** | [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md) |
| Export regression pass (P1) | **Complete** | [`validation-results.md`](./validation-results.md) § P1 export |
| Overview defaults confirmation (4 gold fixtures) | **Complete** | [`validation-results.md`](./validation-results.md) § Overview defaults |
| P1 error/loading/empty UX audit | **Complete** | [`p1-error-loading-ux-audit.md`](./p1-error-loading-ux-audit.md) |
| Upload / mapping edge cases | **Complete** | [`p1-upload-mapping-edge-cases.md`](./p1-upload-mapping-edge-cases.md) |
| P2 HR discovery cleanup (age-band demotion) | **Complete** | commit `5e198ae`; `test_overview_hr_gold_dashboard.py` |
| 9-domain 1k upload fixture validation | **Complete** | [`cross-domain-upload-mapping-validation.md`](./cross-domain-upload-mapping-validation.md) |
| Healthcare / SaaS duplicate primary-secondary follow-up | **Complete** | commit `e353dee`; distinct profit roles + SaaS exec label |

**Do not change in next pass:** chart visuals, export, H-Bar/V-Bar parity, AI routing, backend scoring unrelated to confidence calibration.

---

## Test & build status (June 28, 2026)

### Targeted backend (snapshot validation)

```bash
cd backend && python -m pytest tests/test_cross_domain_upload_1k.py \
  tests/test_cross_domain_mapping_qa.py \
  tests/test_upload_mapping_edge_cases.py \
  tests/test_overview_hr_gold_dashboard.py
```

| Suite | Result |
|-------|--------|
| `test_cross_domain_upload_1k.py` | **PASS** (included in 35) |
| `test_cross_domain_mapping_qa.py` | **PASS** |
| `test_upload_mapping_edge_cases.py` | **PASS** |
| `test_overview_hr_gold_dashboard.py` | **PASS** |
| **Combined** | **35/35 passed** |

### Full backend

```bash
cd backend && python -m pytest tests/
```

| Result | Notes |
|--------|-------|
| **452 passed, 6 failed** | Same 6 pre-existing failures (unchanged) |

**Pre-existing failures (do not treat as regressions):**

| Test | Area |
|------|------|
| `tests/intent_engine/test_banking_utilization_routing.py::...::test_suggested_questions_include_utilization_trend` | Banking suggested questions |
| `tests/test_auto_dashboard_chart_quality.py::...::test_no_weak_chart_titles` | marketing.csv weak title |
| `tests/test_auto_dashboard_opportunities.py::...::test_before_after_chart_count_improvement` | Sales showcase chart count |
| `tests/test_auto_dashboard_opportunities.py::...::test_showcase_dimension_diversity_and_donut_cap` | Sales showcase dimension diversity |
| `tests/test_auto_dashboard_opportunities.py::...::test_showcase_produces_diverse_charts` | Sales showcase chart count |
| `tests/test_auto_dashboard_showcase_regression.py::...::test_scatter_payload_has_numeric_x_axis` | Sales showcase scatter |

### Frontend

```bash
cd frontend && npm run test
cd frontend && npm run build
```

| Check | Result |
|-------|--------|
| Vitest | **741/741 passed** (85 files) |
| Build | **PASS** — Next.js 16.2.4 (Turbopack); TypeScript clean |

---

## Fixtures verified

**Path:** `test-fixtures/domain_upload_1k/`

| File | Present |
|------|---------|
| `retail_ecommerce_1k.csv` | ✅ |
| `banking_financial_1k.csv` | ✅ |
| `hr_workforce_1k.csv` | ✅ |
| `healthcare_patient_1k.csv` | ✅ |
| `manufacturing_quality_1k.csv` | ✅ |
| `marketing_campaign_1k.csv` | ✅ |
| `saas_subscription_1k.csv` | ✅ |
| `supply_chain_logistics_1k.csv` | ✅ |
| `education_student_1k.csv` | ✅ |
| `generate_domain_1k_fixtures.py` | ✅ |
| `manifest.json` | ✅ |

---

## Open items

See [`open-items.md`](./open-items.md). **Single active P1 item:**

### Mapping Confidence Calibration — Medium domains review

Four 1k fixtures still aggregate **Medium** confidence (acceptable but not calibrated to High):

| Fixture | Notes |
|---------|-------|
| `supply_chain_logistics_1k.csv` | Medium aggregate; profit role alternatives exist |
| `saas_subscription_1k.csv` | Medium aggregate; distinct secondary now fixed; SaaS label present |
| `healthcare_patient_1k.csv` | Medium aggregate; distinct secondary now fixed; Healthcare label present |
| `banking_financial_1k.csv` | Medium aggregate; no region column; narrow profit-role gap |

**Deferred (non-blocking):** platform auth/tenancy; P2 histogram polish; browser E2E export; 6 pre-existing backend failures.

---

## Next recommended task

> **Mapping Confidence Calibration — Medium domains review**

Calibrate aggregate mapping confidence for the four Medium fixtures above without changing chart visuals, export, H-Bar/V-Bar parity, AI routing, or unrelated backend scoring.

### Files likely involved

| File | Role |
|------|------|
| `backend/main.py` | Domain inference, role scoring, aggregate confidence |
| `backend/services/executive_kpi_cards.py` | Executive domain taxonomy (SaaS/healthcare already extended) |
| `backend/tests/test_cross_domain_upload_1k.py` | Fixture expectations + confidence assertions |
| `docs/current-snapshot/cross-domain-upload-mapping-validation.md` | Validation record |
| `frontend/app/page.tsx` | Only if UI confidence display differs from backend `mapping_confidence` payload |

---

## Safe to proceed?

**Yes.** Working tree is clean; targeted suites pass; full backend failure set matches documented pre-existing 6; frontend 741/741 + build clean. Safe to start mapping-confidence work in a new chat.

**Warnings before changes:**

1. Do **not** reopen H-Bar/V-Bar parity or export paths unless a regression is filed with evidence.
2. Expect **6 pre-existing backend failures** in full `pytest tests/` — compare failure list, do not chase unless new.
3. Update `test_cross_domain_upload_1k.py` expectations if confidence targets change from Medium → High.
4. Healthcare/SaaS duplicate-metric issue is **closed** — next pass is confidence tuning only, not remapping primary/secondary.
