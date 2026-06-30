# Cleanup Audit — Before Final Snapshot

**Audit date:** June 28, 2026  
**Branch:** `DEV`  
**Backend at audit time:** 478 passed, 0 failed  
**Frontend at audit time:** 743 passed (85 files), build clean  
**Method:** Inventory → reference grep → risk classification → apply **low-risk only** changes.

---

## Executive summary

| Area | Candidates reviewed | Deleted | Archived | Kept |
|------|---------------------|---------|----------|------|
| `docs/current-snapshot/` | 16 files | 0 | 0 | 16 |
| `docs/latest-project-snapshot/` | 11 files | 0 | **11 → `docs/archive/`** | — |
| `docs/pdf-validation-screenshots/` | 24 tracked artifacts | 0 | 0 | 24 |
| `test-fixtures/` | 61 paths | 0 | 0 | 61 |
| `backend/tests/` | 90 paths | 0 | 0 | 90 |
| Frontend tests/fixtures | 85 vitest files + fixtures | 0 | 0 | all |

**Safe cleanup applied:** moved superseded `docs/latest-project-snapshot/` → `docs/archive/latest-project-snapshot/`; added `docs/archive/README.md`.  
**No production code, chart, export, mapping, or dashboard logic changed.**

**Post-snapshot doc hygiene (recommended, not applied here):** refresh stale pass counts in `current-status.md`, `validation-results.md`, `latest-working-snapshot.md`, and `open-items.md` (still cite 452 passed / 6 failed and pre-fix open items).

---

## 1. `docs/current-snapshot/`

| File / path | Category | Reason | Referenced by | Risk | Recommended action |
|-------------|----------|--------|---------------|------|--------------------|
| `current-status.md` | **keep** | Active status hub | `latest-working-snapshot.md`, `open-items.md` | low | Keep; **update** backend 478/0 and resolved failure list at snapshot |
| `open-items.md` | **keep** | Prioritized backlog | `current-status.md` | low | Keep; **update** P1 items (15-domain done, backend green) |
| `validation-results.md` | **keep** | Test/build evidence | `latest-working-snapshot.md`, export runbook | low | Keep; **update** counts (478/0, 743 frontend) |
| `latest-working-snapshot.md` | **keep** | Canonical pre-release baseline | User-protected | low | Keep; **update** git state + test table at snapshot |
| `final-overview-15-domain-validation.md` | **keep** | 15-domain validation record | User-protected; `test_cross_domain_15_overview_validation.py` | low | Keep |
| `cross-domain-upload-mapping-validation.md` | **keep** | 9-domain 1k validation | `test_cross_domain_upload_1k.py` | low | Keep |
| `p1-error-loading-ux-audit.md` | **keep** | Closed P1 UX audit | User-protected | low | Keep |
| `p1-upload-mapping-edge-cases.md` | **keep** | Closed edge-case audit | `test_upload_mapping_edge_cases.py` | low | Keep |
| `chart-visual-parity-open-items.md` | **keep** | Frozen H-Bar/V-Bar record | User-protected; AGENTS baseline | low | Keep (frozen parity reference) |
| `overview-pass-status.md` | **keep** | Pass 5A→5C.5 detail log | `current-status.md`, `open-items.md` | low | Keep (historical pass record, still linked) |
| `ai-insights-status.md` | **keep** | AI Insights completed work | `current-status.md` | low | Keep |
| `file-map.md` | **keep** | Key file index for snapshot | `current-status.md` | low | Keep |
| `architecture-map.md` | **keep** | Snapshot architecture index | Internal snapshot set | low | Keep |
| `chart-rendering-summary.md` | **keep** | Rendering pipeline reference | Parity phase docs | low | Keep |
| `chart-premium-parity-status.md` | **keep** | Parity completion table | Parity phase | low | Keep |
| `changelog-premium-chart-phase.md` | **keep** | Phase changelog | Parity history | low | Keep |
| `cleanup-audit-before-final-snapshot.md` | **keep** | This audit | — | low | Keep (new) |

**Superseded / duplicate notes**

- No file in this folder is safe to delete; several overlap topically with archived `docs/archive/latest-project-snapshot/` but carry **Overview 5A–5C and 15-domain** detail not duplicated elsewhere.
- `final-release-readiness-summary.md` (mentioned in task brief) **does not exist yet** — recommend creating at snapshot time, not deleting anything in its place.

---

## 2. `docs/pdf-validation-screenshots/`

| File / path | Category | Reason | Referenced by | Risk | Recommended action |
|-------------|----------|--------|---------------|------|--------------------|
| `phase7-{retail,generic,geographic}-*.pdf` (18) | **keep** | Phase 7 PDF matrix baseline | `phase7-pdf-generate.test.ts`, `pdf-export-final-validation-runbook.md`, `pdf-validation-report.md` | **high** | Keep in git for snapshot baseline |
| `phase7-manifest.json` | **keep** | Harness manifest | Same as above | high | Keep |
| `phase7-analysis.json` | **keep** | Text/PNG analysis output | `docs/phase7-pdf-analyze.py` | medium | Keep |
| `p7-005-*-manual-export.pdf` (3) | **keep** | Manual export QA artifacts | `p7-005-manual-results.json`, runbook | medium | Keep |
| `p7-005-*-export-tab.png` (3) | **keep** | Manual export UI captures | `pdf-validation-report.md` | medium | Keep |
| `phase7-retail-*-page*.png` (11) | **keep** | Page renders from analyze script | `phase7-analysis.json` | medium | Keep |
| Regenerated PDF diffs after `npm run test` | **ignore** (workflow) | Binary drift when phase7 test runs | `frontend/lib/phase7-pdf-generate.test.ts` | medium | Do **not** delete; restore or commit intentionally at snapshot. Optional future: `.gitignore` for `*.pdf` here **not recommended** before snapshot (breaks baseline). |

**Not in default cleanup scope:** ~165 PNG files under other `docs/*-polish/` folders — manual QA screenshots, not pytest inputs. **Archive candidate post-snapshot**, not delete (high link/history value).

---

## 3. `test-fixtures/`

| File / path | Category | Reason | Referenced by | Risk | Recommended action |
|-------------|----------|--------|---------------|------|--------------------|
| `domain_upload_1k/*.csv` (15) | **keep** | 15-domain validation fixtures | `test_cross_domain_15_overview_validation.py`, `test_cross_domain_upload_1k.py`, `manifest.json` | **high** | Keep |
| `domain_upload_1k/generate_domain_1k_fixtures.py` | **keep** | Regenerator | User-protected | high | Keep |
| `domain_upload_1k/manifest.json` | **keep** | Fixture registry | Cross-domain tests | high | Keep |
| `marketing_campaigns_chart_test.csv` | **keep** | Marketing regression | `test_marketing_campaigns_mapping_dashboard.py` | high | Keep |
| `golden-datasets/*.csv` (3) | **keep** | Gold Overview/dashboard tests | Banking/HR/retail gold tests, intent golden tests | high | Keep |
| `golden-datasets/generate_golden_datasets.py` | **keep** | Generator | Scripts | medium | Keep |
| `golden-datasets/validate_golden_datasets.py` | **keep** | Validator CLI | Manual QA | medium | Keep |
| `golden-datasets/validation_report.md` | **keep** | Generated validation log | Human QA | low | Keep |
| `golden-datasets/validation_results.json` | **keep** | Machine validation output | Scripts | low | Keep |
| `domains/*.csv` (20+) | **keep** | Domain routing/KPI/AI summary tests | Many `backend/tests/*`, harvest scripts, frontend `overview-summary-domains.json` | high | Keep |
| `domains/generate_domain_fixtures.py` | **keep** | Generator | `DATA_DICTIONARY.md` | medium | Keep |
| `domains/manifest.json` | **keep** | Domain registry | Docs/scripts | medium | Keep |
| `large-dataset/retail_{10k,50k,100k}.csv` | **keep** | Scale/cold-start scripts only | `backend/scripts/*`, large-dataset validation docs | medium | Keep (not pytest; still QA harness) |
| `test-fixtures/domains/dashboard_showcase_dataset.csv` | **keep** | Duplicate of backend/frontend copies | Scripts, domain harvest | medium | Keep (consolidation = medium-risk refactor; defer) |

**Duplicate fixture copies (intentional, do not delete)**

| Copy | Also at | Purpose |
|------|---------|---------|
| `dashboard_showcase_dataset.csv` | `backend/tests/fixtures/`, `frontend/public/` | Backend pytest vs static/manual upload |
| `screenshot-fixture.csv` | `test-fixtures/domains/` | Browser screenshot QA |

---

## 4. `backend/tests/`

| File / path | Category | Reason | Referenced by | Risk | Recommended action |
|-------------|----------|--------|---------------|------|--------------------|
| All `test_*.py` (478 collected) | **keep** | Active regression | pytest discovery | high | Keep |
| `intent_engine/test_*.py` (~55 files) | **keep** | Routing/narrative guards | pytest | high | Keep |
| Wave/phase tests (`test_wave1_*`, `test_wave2_*`, `test_qa_audit_*`) | **keep** | Still encode fixed regressions | pytest | medium | Keep — not obsolete |
| `test_cross_domain_upload_1k.py` + `test_cross_domain_15_overview_validation.py` | **keep** | Complementary (9 vs 15 domain) | User-protected | high | Keep both |
| `test_auto_dashboard_opportunities.py` + `test_auto_dashboard_showcase_regression.py` | **keep** | Showcase diversity/scatter guards | Recent fix pass | high | Keep |
| `fixtures/*.csv`, `fixtures/*.json` | **keep** | Bound to tests/scripts | 40+ test/script refs | high | Keep |
| `intent_engine/run_validation_report.py` | **keep** | Manual CLI report (not pytest) | Docstring `Run: python tests/intent_engine/run_validation_report.py` | low | Keep; note as manual-only |
| Skipped / xfailed tests | **keep** | None found | grep | — | N/A |

**Duplicate / obsolete assessment:** No duplicate test modules found. No tests validate removed behavior in a way that blocks snapshot. `finance_test.csv` is only in KPI title audit list — still valid narrow fixture.

---

## 5. Frontend tests & generated files

| File / path | Category | Reason | Referenced by | Risk | Recommended action |
|-------------|----------|--------|---------------|------|--------------------|
| `lib/**/*.test.ts` (85 files, 743 tests) | **keep** | Default `npm run test` | `vitest.config.ts` | high | Keep |
| `lib/phase7-pdf-generate.test.ts` | **keep** | PDF matrix; writes to `docs/pdf-validation-screenshots/` | Included in default vitest glob | high | Keep |
| `vitest.phase7.config.ts` | **keep** | Isolated phase7 runner | Docs/runbook | low | Keep |
| `lib/__fixtures__/overview-summary-domains.json` | **keep** | Golden AI summary payloads | `overview-ai-summary.test.ts` | high | Keep (regenerate via harvest script when domains change) |
| `public/dashboard_showcase_dataset.csv` | **keep** | Manual browser validation | Docs, file-map | medium | Keep |

**Obsolete frontend tests:** None identified. No skipped tests.

---

## 6. Applied cleanup (Task D)

| Action | Paths | Risk |
|--------|-------|------|
| **Archived** | `docs/latest-project-snapshot/` → `docs/archive/latest-project-snapshot/` | **low** — superseded by `docs/current-snapshot/`; zero external doc links (only self-reference) |
| **Added** | `docs/archive/README.md` | low |
| **Restored** | Accidental PDF binary drift from local `npm run test` | low — reverted to HEAD before validation |

**Not applied (deferred)**

- Delete any CSV/PDF/PNG fixture or test file
- `.gitignore` for PDF validation outputs
- Consolidate triplicate `dashboard_showcase_dataset.csv`
- Archive ~165 historical polish PNG folders under `docs/chart-polish/`, etc.
- Update stale pass counts in status docs (do at final snapshot commit)

---

## 7. Intentionally kept (user-protected + regression)

- All 15 `domain_upload_1k` CSVs + generator + manifest  
- `marketing_campaigns_chart_test.csv`  
- All P1 / HR / banking / marketing / 15-domain regression tests  
- All `docs/current-snapshot/` protected docs listed in task brief  
- All Phase 7 PDF validation artifacts  
- `chart-visual-parity-open-items.md` (frozen parity record)

---

## 8. Validation after cleanup

Commands run June 28, 2026 after archive move:

```bash
git status
cd backend && python -m pytest tests/
cd frontend && npm run test
cd frontend && npm run build
```

| Check | Result |
|-------|--------|
| Backend | **478 passed, 0 failed** |
| Frontend vitest | **743 passed, 0 failed** (85 files) |
| Frontend build | **PASS** (Next.js 16.2.4) |

---

## 9. Safe to take final snapshot?

**Yes**, with two housekeeping notes:

1. **Doc refresh:** Update `current-status.md`, `validation-results.md`, `latest-working-snapshot.md`, and `open-items.md` to reflect 478/0 backend, 743 frontend, 15-domain complete, and resolved showcase/banking failures — either in the snapshot commit or immediately after.
2. **Optional:** Add `final-release-readiness-summary.md` pointing at this audit + `final-overview-15-domain-validation.md` + frozen parity doc.

No blocking cleanup debt remains for a code/test snapshot.
