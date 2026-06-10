# PDF Export — Final Validation Runbook

**Purpose:** Production sign-off for PDF export before deploy  
**Baseline:** Phase 7 passed 2026-06-06 — see [`pdf-validation-report.md`](pdf-validation-report.md)  
**Rule:** Re-run when chart rendering, PDF layout, or export session code changes

---

## When to run

| Trigger | Action |
|---------|--------|
| No PDF/chart changes since Phase 7 | **Sign-off by reference** — cite existing report |
| Changes to `pdf-report.ts`, `chart-png-*`, export layout | **Full automated matrix** |
| Changes to Export tab UI | **Automated + manual P7-005** |
| Pre-production deploy | **Automated matrix minimum** |

---

## 1. Automated PDF matrix (required)

Generates 18 PDFs (3 datasets × 6 section combos) and validates section markers.

```bash
cd frontend
npm install
npx vitest run --config vitest.phase7.config.ts
```

**Expected:**

- 18/18 PDFs generated under `docs/pdf-validation-screenshots/`
- All section marker tests pass
- `docs/pdf-validation-screenshots/phase7-manifest.json` updated

**Datasets:**

| Key | Schema |
|-----|--------|
| `retail` | Revenue, profit, city, product |
| `generic` | Department, region, revenue, cost |
| `geographic` | City, state, zone, revenue |

**Section combos:** `kpi_only`, `kpi_insight`, `kpi_insight_chart`, `all_sections`, `conversation_only`, `appendix_only`

---

## 2. Manual browser Export QA (recommended for deploy)

Repeat P7-005 for at least one dataset if Export tab changed.

| Step | Action | Pass |
|------|--------|------|
| 1 | Upload CSV via Overview | File accepted |
| 2 | AI Insights — base question | Answer + chart |
| 3 | 4 follow-ups (Why → evidence → columns → calculations) | Chain preserved |
| 4 | Export tab — select all sections | Checkboxes work |
| 5 | Download Report PDF | File downloads |
| 6 | Open PDF | Cover, executive summary, KPI, insight, chart, preview, quality, thread, appendix |
| 7 | Footer | Page N of M + branding |

**Base question template:** “Which [dimension] has the highest [metric]?”  
**Follow-ups:** Why is {entity} highest? → What evidence supports this? → Which columns were used? → Show calculations.

---

## 3. Validation checks (PDF content)

Use PyMuPDF text extract or visual inspection:

| Check | Pass criteria |
|-------|---------------|
| Page count | ≥1; `all_sections` typically 5–7 pages |
| Executive summary | Present on all combos |
| KPI dashboard | Present when `includeKPIs` |
| AI insight | Narrative text, not raw JSON |
| Chart | Vector bars or captured PNG fallback |
| Data preview | Column headers + row values |
| Conversation thread | Questions in order |
| Technical appendix | Metadata + provenance |
| No raw API dumps | No `{` JSON blobs in body |

---

## 4. Sign-off record

Update `docs/pdf-validation-report.md` with:

- Date of re-run
- Git commit or release tag
- Automated pass count (e.g. 18/18)
- Manual pass count (e.g. 3/3)
- Any non-blocking polish items

**Production gate:** Automated matrix **PASS** + no V1 blockers. Manual QA required only if Export tab or session wiring changed.

---

## 5. Quick reference

| Item | Path |
|------|------|
| Test harness | `frontend/lib/phase7-pdf-generate.test.ts` |
| Vitest config | `frontend/vitest.phase7.config.ts` |
| PDF builder | `frontend/app/pdf-report.ts` |
| Export session | `frontend/lib/chart-png-export-session.ts` |
| Screenshots / PDFs | `docs/pdf-validation-screenshots/` |
| Prior report | `docs/pdf-validation-report.md` |
