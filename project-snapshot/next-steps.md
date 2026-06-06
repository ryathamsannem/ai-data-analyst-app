# Next Steps (Priority Order)

**Generated:** June 4, 2026  
**Branch:** `DEV`

---

## P0 — Verify recent fixes (before commit)

### 1. Follow-up chain / context (manual)

Run on `retail_analytics_regression.csv`:

1. Which city contributes most revenue?
2. Click: *Why is Mumbai highest?*
3. Click: *What evidence supports this conclusion?*
4. Click: *Which columns were used for this analysis?*
5. Click: *Show the calculations behind this answer.*

**Pass criteria:**

- Q2–Q5 show follow-up detected / inherited context in provenance
- Q4 lists actual columns (`city`, `revenue`) — no invented metrics
- Q5 references Mumbai / city / revenue context
- Chart lineage preserved until Reset conversation

### 2. PDF selected sections visibility (manual)

Export tab → select **all** checkboxes → download PDF (executive mode).

**Pass criteria:** Visible sections — KPI, AI Insight, Chart, Data Preview, Data Quality, AI Conversation Thread, Technical Appendix (empty-state OK if no data).

---

## P1 — Stabilize & commit

### 3. PDF smoke testing

- [ ] Empty vs populated conversation appendix
- [ ] Data Quality with/without profile null_counts
- [ ] Technical appendix with provenance vs empty
- [ ] Multi-page flow (long answer + chart + appendix)
- [ ] Insight export button vs Export tab parity

### 4. Git hygiene

- [ ] Review uncommitted diff (~25 files)
- [ ] Commit logical chunks (routing, follow-up, PDF, confidence)
- [ ] Update `docs/known-test-failures.md` test counts
- [ ] Push `DEV` when ready

### 5. TypeScript cleanup (optional for MVP)

Fix 11 `tsc` errors — start with `AlignedAnalysisContext` fields in `page.tsx` and `humanizeColumnName` import in `selected-visualization.ts`.

---

## P2 — MVP readiness checklist

| Item | Done? |
|------|-------|
| Upload + mapping + filters | Yes |
| AI Insights ask + chart | Yes |
| Charts tab | Yes |
| Export PDF core sections | Yes |
| Export PDF optional sections | Code done; QA pending |
| Follow-up conversation | Code done; QA pending |
| Confidence display trustworthy | Improved for ranking |
| Reset conversation | Yes |
| Error handling on empty filters | Yes |
| Documentation / snapshot | This folder |
| Production deploy / auth | Out of scope |

---

## P3 — Deferred enhancements

Per AGENTS.md and prior PDF reviews — **do not block MVP** unless product asks:

- PDF pagination / page utilization polish
- Chart-intel verbosity compression in PDF
- Confidence framework display in PDF
- Full intent registry migration (see `docs/intent-engine-migration-log.md`)
- Split `page.tsx` / `main.py` monoliths
- Multi-tenant / persistent sessions
- Automated E2E (Playwright) for Insights + Export
- PDF visual regression (pixel/layout diff)

---

## Suggested session order for new agent

1. Read [`current-status.md`](current-status.md) + [`ai-insights-routing-status.md`](ai-insights-routing-status.md)
2. Run backend + frontend tests (see [`test-status.md`](test-status.md))
3. Execute P0 manual scenarios
4. If green → commit with message covering follow-up + PDF + confidence
5. If PDF layout issues → narrow fixes in `pdf-report.ts` only (no chart logic changes per AGENTS.md)
