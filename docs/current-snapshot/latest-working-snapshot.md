# Latest Working Snapshot

**Snapshot date:** June 29, 2026  
**Purpose:** Post–Phase PDF-1 lightweight snapshot — suggested questions, follow-up chips, and PDF export quality committed  
**Branch:** `DEV`

---

## Git state

| Item | Value |
|------|-------|
| **Branch** | `DEV` |
| **HEAD** | `c764f5d` — fix(frontend): improve pdf insight export quality |
| **Working tree** | **Clean** |
| **Recent commits** | `c764f5d` PDF-1 export quality · `c460bcc` follow-up chip quality · `3ee3e48` suggested questions (15-domain) |

---

## Completed work (this arc)

| Area | Commit | Summary |
|------|--------|---------|
| **Suggested Questions** | `3ee3e48` | Backend quality across 15 domains — domain verticals, metric/dim filters, correlation gating, phrasing |
| **Follow-up chips** | `c460bcc` | Frontend FU-P1 fixes — generic/duplicate/profit-centric chip suppression |
| **PDF export (PDF-1)** | `c764f5d` | Narrative/chart alignment, slim AI Insights preset, appendix data preview, embed sizing, metadata chip fix, follow-up export context, viz page-break cohesion |

Detail: [`suggested-questions-15-domain-quality.md`](./suggested-questions-15-domain-quality.md) · [`pdf-quality-audit.md`](./pdf-quality-audit.md)

---

## Test & build status (recorded at PDF-1 commit)

| Suite | Result |
|-------|--------|
| Backend Phase 1 (suggested questions) | **492 passed, 0 failed** |
| Frontend follow-up targeted tests | **37 passed** |
| PDF/export targeted tests | **PASS** (resolve context, narrative alignment, build input, export sections, viz layout) |
| `npm run build` | **PASS** |

Full-suite counts from prior final snapshot (478 backend / 743 frontend) remain valid baseline; PDF-1 did not change backend.

---

## PDF-1 resolved

- Narrative/chart alignment (`pdf-narrative-alignment.ts`)
- Slim AI Insights preset (`reportPreset: "insight"`)
- Data preview after Visualization — **Appendix: Sample data**
- PDF-only chart embed sizing constants (live-validated)
- **Category: Category** metadata chip fix
- Follow-up answer export button + PDF context (`exportInsightResultId`, saved-result history)
- Visualization analysis-context orphan / page-break fix

Validation artifacts: `docs/pdf-validation-screenshots/pdf1-*` · scripts `docs/pdf1-*-export.py`

---

## Remaining deferred (PDF-2+)

| ID | Item |
|----|------|
| PDF-P2-01 | Sparse KPI dashboard page |
| PDF-P2-02 | Technical appendix prominence in executive mode |
| PDF-P2-03 | Full-file data quality vs preview slice |
| PDF-P2-04 | Branding/footer placeholder copy |
| PDF-P2-06 | Preview table date-like ID formatting |
| PDF-P2-07 | Domain label polish (e.g. real estate showing “General business”) |

Optional: per-row export on Recent Insights list.

**PDF-2 stance:** audit-first, small scoped fixes only.

---

## Explicit constraints (do not reopen without evidence)

1. **H-Bar / V-Bar parity** — frozen unless measured regression.
2. **Chart axis / domain / bar sizing** — frozen unless test or screenshot proves regression.
3. **Suggested questions / follow-up chips** — frozen unless new proven issue.
4. **Overview defaults / mapping confidence** — unchanged by PDF-1.

---

## Safe to proceed?

**Yes** for PDF-2 planning audit. Production code stable at `c764f5d`. Snapshot docs below refreshed; **not committed** until approved.
