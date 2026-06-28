# Latest Working Snapshot

**Snapshot date:** June 28, 2026  
**Purpose:** **Final release snapshot** — full green validation after cleanup audit and backend failure fixes  
**Branch:** `DEV`

---

## Git state

| Item | Value |
|------|-------|
| **Branch** | `DEV` (up to date with `origin/DEV`) |
| **Latest commit** | `61d0145` — fix(backend): restore showcase diversity/scatter and banking utilization suggested question |
| **Staged (pending snapshot commit)** | Archive move: `docs/latest-project-snapshot/` → `docs/archive/latest-project-snapshot/`; `docs/archive/README.md` |
| **Untracked / to add** | Snapshot refresh docs + `cleanup-audit-before-final-snapshot.md` + `final-release-readiness-summary.md` |
| **Recent commits** | `61d0145` showcase/banking fixes · prior: 15-domain validation · healthcare/SaaS mapping · HR age demotion |

---

## Completed phases (frozen / closed)

| Phase | Status | Doc |
|-------|--------|-----|
| H-Bar / V-Bar visual parity (5B.1 → 5C.5) | **Frozen** | [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md) |
| Export regression pass (P1) | **Complete** | [`validation-results.md`](./validation-results.md) |
| Overview defaults (4 gold fixtures) | **Complete** | [`validation-results.md`](./validation-results.md) |
| P1 error/loading/empty UX audit | **Complete** | [`p1-error-loading-ux-audit.md`](./p1-error-loading-ux-audit.md) |
| Upload / mapping edge cases | **Complete** | [`p1-upload-mapping-edge-cases.md`](./p1-upload-mapping-edge-cases.md) |
| 9-domain 1k upload validation | **Complete** | [`cross-domain-upload-mapping-validation.md`](./cross-domain-upload-mapping-validation.md) |
| 15-domain Overview validation | **Complete** | [`final-overview-15-domain-validation.md`](./final-overview-15-domain-validation.md) |
| Healthcare / SaaS mapping follow-up | **Complete** | commit `e353dee` |
| Showcase / banking backend fixes | **Complete** | commit `61d0145` |
| Cleanup audit | **Complete** | [`cleanup-audit-before-final-snapshot.md`](./cleanup-audit-before-final-snapshot.md) |

**Do not change without explicit approval:** chart visuals, export architecture, H-Bar/V-Bar parity, AI Insights routing, 15-domain mapping confidence behavior (except justified banking Medium).

---

## Test & build status (June 28, 2026 — final snapshot)

### Full backend

```bash
cd backend && python -m pytest tests/
```

| Result |
|--------|
| **478 passed, 0 failed** |

### Targeted regression (recommended spot-check)

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

| Suite | Result |
|-------|--------|
| 15-domain + cross-domain + marketing + edge cases + gold + showcase + banking | **All pass** |

### Frontend

```bash
cd frontend && npm run test
cd frontend && npm run build
```

| Check | Result |
|-------|--------|
| Vitest | **743/743 passed** (85 files) |
| Build | **PASS** — Next.js 16.2.4; TypeScript clean |

---

## Fixtures verified

**Path:** `test-fixtures/domain_upload_1k/` — **15 CSVs** + `manifest.json` + `generate_domain_1k_fixtures.py`

All 15 domains present and validated. See [`final-overview-15-domain-validation.md`](./final-overview-15-domain-validation.md).

---

## Open items

See [`open-items.md`](./open-items.md). **No blocking open items** for this snapshot.

Future work is optional browser QA, AI Insights narrative quality, and platform production features.

---

## Safe to proceed?

**Yes.** Full backend and frontend green. Cleanup audit complete. Safe to commit and tag this snapshot.

**Warnings:**

1. Do **not** reopen H-Bar/V-Bar parity or export paths unless a regression is filed with evidence.
2. Restore Phase 7 PDFs if `npm run test` modified them unintentionally: `git checkout -- docs/pdf-validation-screenshots/*.pdf`
3. Explicit scatter/correlation questions and showcase relationship scatter remain supported; default Overview scatter stays blocked for business-rich dashboards.
