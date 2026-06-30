# Latest Working Snapshot

**Snapshot date:** June 29, 2026  
**Purpose:** Final release snapshot — suggested questions, follow-up chips, PDF-1/PDF-2, and mandatory AI Insight/PDF alignment complete  
**Branch:** `DEV`

---

## Git state

| Item | Value |
|------|-------|
| **Branch** | `DEV` |
| **HEAD** | `b66d5d1` — fix(frontend): clean pdf insight section labels |
| **Working tree** | **Clean** |
| **Recent commits (newest first)** | `b66d5d1` label cleanup · `cdb1f6d` shared aligned insight model · `042db37` live/PDF narrative alignment · `cf643d9` technical appendix · `5d27fc1` KPI dedupe · `fe6344f` preview formatting · `6e30b8f` domain/branding · `c764f5d` PDF-1 · `c460bcc` follow-up chips · `3ee3e48` suggested questions |

---

## Completed work (full arc)

| Area | Commit(s) | Summary |
|------|-----------|---------|
| **Suggested Questions** | `3ee3e48` | Backend quality across 15 domains — domain verticals, metric/dim filters, correlation gating, phrasing |
| **Follow-up chips** | `c460bcc` | Frontend FU-P1 — generic/duplicate/profit-centric chip suppression |
| **PDF-1** | `c764f5d` | Narrative/chart alignment, slim AI Insights preset, appendix data preview, embed sizing, metadata chip fix, follow-up export context, viz page-break cohesion |
| **PDF-2A** | `6e30b8f` | Domain labels (Overview parity), footer/branding polish |
| **PDF-2B** | `fe6344f` | Preview ID/date formatting; data quality wording (sample vs file-wide) |
| **PDF-2C-1** | `5d27fc1` | KPI dashboard dedupe / skip when sparse |
| **PDF-2C-2** | `cf643d9` | Technical appendix title, tone, page-break polish |
| **Mandatory alignment** | `042db37`, `cdb1f6d` | Shared live/PDF `insightPresentation` model; generic chart-contract guard; structured PDF sections; compact Chart view; PDF bypass fix |
| **PDF label cleanup** | `b66d5d1` | Strip redundant in-body section labels (Executive takeaway, Evidence, etc.) when PDF headings already present |

Detail: [`suggested-questions-15-domain-quality.md`](./suggested-questions-15-domain-quality.md) · [`pdf-quality-audit.md`](./pdf-quality-audit.md) · [`pdf-export-phase-changelog.md`](./pdf-export-phase-changelog.md)

---

## Final PDF / AI Insight status

- Live UI and PDF share **normalized aligned insight presentation model** (`alignInsightPresentationToChart` → `insightPresentation`).
- PDF AI Insight section includes **Executive takeaway**, **Evidence**, **Why this matters**, and **Supporting detail** where available and aligned.
- **Chart view** is compact (single rationale line).
- Root insight, follow-up insight, and Export-tab full PDFs use **correct export context**.
- Narrative/chart mismatch fixed for **Product Type**, **Room Type**, **Grid Region**, and related category charts.
- **Visualization** section cohesion fixed (chart + analysis context on same page where applicable).
- Sample data appendix, data quality wording, and technical appendix flow improved.
- **No known PDF-2 backlog remains.**

Live validation artifacts: `docs/pdf-validation-screenshots/pdf-mandatory-fix-*` · `docs/pdf-validation-screenshots/pdf1-*`

---

## Test & build status (recorded)

| Suite | Result |
|-------|--------|
| Backend Phase 1 (suggested questions) | **492 passed, 0 failed** |
| Frontend follow-up targeted tests | **37 passed** |
| PDF/export/alignment targeted suites | **PASS** (resolve context, narrative alignment, build input, export sections, viz layout, insight-section-text) |
| Latest `npm run build` | **PASS** |

Full-suite counts from June 28 final snapshot (478 backend / 743 frontend) remain valid baseline for non-PDF areas.

---

## Remaining deferred

| Item | Notes |
|------|-------|
| Final release-readiness validation | Optional browser spot-check; cross-domain AI narrative QA |
| Platform production | Auth, durable storage, metering, optional E2E suite |

**No PDF-2 items remain.**

---

## Explicit constraints (do not reopen without evidence)

1. **H-Bar / V-Bar parity** — frozen unless measured regression.
2. **Chart axis / domain / bar sizing** — frozen unless test or screenshot proves regression.
3. **Suggested questions / follow-up chips** — frozen unless new proven issue.
4. **PDF fixes** — do not reopen unless a generated PDF proves regression.
5. **Future changes** — audit-first, small scoped fixes, test-backed.

---

## Safe to proceed?

**Yes** for final release-readiness validation. Production code stable at `b66d5d1`. Snapshot docs refreshed; **not committed** until approved.
