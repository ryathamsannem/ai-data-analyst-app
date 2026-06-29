# Open Items (Prioritized)

**Snapshot:** June 29, 2026 (post–PDF-1) · Branch `DEV` · HEAD `c764f5d`.

Frozen parity: [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).  
PDF-1 record: [`pdf-quality-audit.md`](./pdf-quality-audit.md).  
Latest git state: [`latest-working-snapshot.md`](./latest-working-snapshot.md).

---

## Closed (recent commits)

| Item | Status | Commit |
|------|--------|--------|
| Suggested Questions — 15-domain backend quality | **Complete** | `3ee3e48` |
| Follow-up chip quality (FU-P1) | **Complete** | `c460bcc` |
| PDF-1 export quality | **Complete** | `c764f5d` |
| H-Bar / V-Bar visual parity (5B.1 → 5C.5) | **Frozen** | prior |
| 15-domain Overview validation | **Complete** | prior |
| Export regression (PNG + Phase 7 matrix) | **Complete** | prior |
| Final release snapshot (478/743 green) | **Complete** | prior |

### PDF-1 resolved (in `c764f5d`)

- Narrative/chart alignment
- Slim AI Insights preset
- Data preview appendix after Visualization
- PDF chart embed sizing (live-validated)
- Category metadata chip fix
- Follow-up answer export button/context
- Visualization page-break / orphan fix

---

## P1 — PDF-2 (audit-first, small scope)

**Do not start broad PDF redesign.** Each item needs audit evidence before implementation.

| ID | Item | Notes |
|----|------|-------|
| PDF-P2-01 | Sparse KPI dashboard page | Merge/redesign optional |
| PDF-P2-02 | Technical appendix prominence | Executive-mode layout |
| PDF-P2-03 | Data quality vs preview slice | Full-file duplicate scan |
| PDF-P2-04 | Branding/footer placeholder copy | `support@example.com`, etc. |
| PDF-P2-06 | Preview table date-like IDs | `formatPdfTableCellValue` / ISO heuristics |
| PDF-P2-07 | Domain label polish | e.g. real estate → “General business” |

Optional: Recent Insights per-row export control.

---

## P1 — Future production readiness (unchanged)

- Optional browser spot-check (3–5 domains)
- AI Insights answer-quality validation (cross-domain narratives)
- Platform: auth, durable storage, metering, optional E2E suite

---

## P2 — Nice to have

- Histogram premium review (no dedicated pass)
- Large dataset optimization (100k+ fixtures)
- Cosmetic chart tuning **only** with explicit product approval

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
4. **PDF-2** — audit-first, small incremental fixes only.
