# Open Items (Prioritized)

**Snapshot:** July 8, 2026 (post-performance-fix stable snapshot) · Branch `DEV` · HEAD `a9e1e85`.

Frozen parity: [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).  
PDF record: [`pdf-quality-audit.md`](./pdf-quality-audit.md).  
Latest git state: [`latest-working-snapshot.md`](./latest-working-snapshot.md).

---

## Closed (recent commits)

| Item | Status | Commit |
|------|--------|--------|
| Suggested Questions — 15-domain backend quality | **Complete** | `3ee3e48` |
| Follow-up chip quality (FU-P1) | **Complete** | `c460bcc` |
| PDF-1 export quality | **Complete** | `c764f5d` |
| PDF-2A domain labels and branding | **Complete** | `6e30b8f` |
| PDF-2B preview formatting and data quality labels | **Complete** | `fe6344f` |
| PDF-2C-1 KPI dashboard dedupe | **Complete** | `5d27fc1` |
| PDF-2C-2 technical appendix polish | **Complete** | `cf643d9` |
| Mandatory live/PDF aligned insight model | **Complete** | `042db37`, `cdb1f6d` |
| PDF structured-section label cleanup | **Complete** | `b66d5d1` |
| H-Bar / V-Bar visual parity (5B.1 → 5C.5) | **Frozen** | prior |
| 15-domain Overview validation | **Complete** | prior |
| Export regression (PNG + Phase 7 matrix) | **Complete** | prior |
| Final release snapshot (478/743 green) | **Complete** | prior |
| Backend auto-dashboard discovery performance | **Complete** | uncommitted performance fix |
| Frontend Overview tick-generation freeze | **Complete** | uncommitted performance fix |

### Large dataset performance resolved (July 2026)

- **Backend:** Request-local memoization/reuse in auto-dashboard discovery reduced repeated DataFrame scans without output drift.
- **Frontend:** Bounded Overview trend axis tick generation prevents huge tick arrays for large-magnitude, low-variance line/area charts.
- **Outcome:** 10k, 50k, and 100k uploads respond quickly; auto-dashboard charts appear immediately after upload response.
- **Validation:** Backend discovery tests, frontend axis/domain tests, related chart label/domain tests, `npm run build`, and manual 10k/50k/100k uploads all passed.

### PDF quality resolved (PDF-1 → PDF-2 + alignment)

- Narrative/chart alignment (generic chart-contract guard)
- Shared live/PDF `insightPresentation` model
- Structured PDF sections + compact Chart view
- Slim AI Insights preset; data preview appendix after Visualization
- PDF chart embed sizing; metadata chip fix
- Follow-up answer export button/context
- Visualization page-break / cohesion fix
- Domain labels; branding/footer polish
- Preview ID/date formatting; data quality wording
- KPI dashboard dedupe; technical appendix polish
- Redundant PDF section label cleanup

---

## P1 — Final release readiness only

| Item | Notes |
|------|-------|
| Optional browser spot-check | 3–5 domains upload + AI Insights + PDF export |
| Cross-domain AI Insights narrative QA | Beyond deterministic probes; only if new evidence |

**No PDF-2 backlog.** Do not reopen PDF work unless a generated PDF proves regression.

---

## P1 — Future production readiness (unchanged)

- Platform: auth, durable storage, metering, optional E2E suite

---

## P2 — Nice to have

- Histogram premium review (no dedicated pass)
- 100k+ sustained/concurrency profiling (optional; current single-session upload/dashboard performance is restored)
- Donut/scatter auto-dashboard selection review (product-selection topic only; not part of the performance fix)
- Smart variance view for tight 1.2B–1.3B monthly revenue ranges (optional product decision; current flatness is mathematically expected)
- Cosmetic chart tuning **only** with explicit product approval
- Optional: per-row export on Recent Insights list

---

## Technical debt (accepted)

| Item | Notes |
|------|-------|
| Dual renderer pipelines | Managed via shared domain/visual helpers |
| H-Bar 85% utilization cap | Parity frozen — do not reopen without regression proof |
| Monolithic `page.tsx` | Incremental extraction only when scoped |
| Banking 1k Medium confidence | Justified; not a blocker |
| Generic exec/type labels | Several domains use generic executive domain taxonomy |

---

## Explicit constraints

1. **Do not reopen H-Bar/V-Bar parity** unless measured regression appears.
2. **Do not reopen chart axis/domain/bar sizing** unless test or screenshot proves regression.
3. **Do not change suggested questions or follow-up chips** unless a new issue is proven.
4. **Do not reopen PDF fixes** unless a generated PDF proves regression.
5. **Future changes** — audit-first, small incremental fixes, test-backed.
6. **Do not reintroduce lazy/staged dashboard rendering** for the resolved upload/dashboard delay.
7. **Do not change chart selection for performance** without golden-output validation.
8. **Donut/scatter auto-dashboard selection** is a separate product-selection topic, not a performance regression.
