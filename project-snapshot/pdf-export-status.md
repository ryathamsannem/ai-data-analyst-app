# PDF Export Status

**Generated:** June 4, 2026

---

## Architecture overview

```
Export tab checkboxes (page.tsx)
        ↓ exportOptions
buildExecutivePdfExportInput()  ← frontend/lib/build-executive-pdf-input.ts
        ↓ ExecutivePdfExportInput
buildPdfExecutiveContentPlan()  ← frontend/lib/pdf-executive-content.ts (lens sections)
        ↓
runExecutivePdfExport()         ← frontend/app/pdf-report.ts (jsPDF + Canvg/html2canvas)
        ↓
Download .pdf
```

**Modes:**

| Mode | `pdfMode` | Default behavior |
|------|-----------|------------------|
| Executive | `"executive"` | Story-first; advanced sections only if explicitly checked |
| Analyst | `"analyst"` | Technical appendix default on; fuller metadata tone |

Include resolution: `resolvePdfIncludes()` in `build-executive-pdf-input.ts` — executive mode passes through checkbox values for Data Preview, Data Quality, Conversation, Technical Appendix when `=== true`.

---

## Export options and include flags

Defined in `frontend/lib/build-executive-pdf-input.ts` (`ExecutivePdfExportOptions`) and mirrored in `ExecutivePdfExportInput.includes` in `pdf-report.ts`:

| UI checkbox | Flag | Default (executive) |
|-------------|------|---------------------|
| KPIs | `includeKPIs` | true |
| AI Insight | `includeAIInsight` | true |
| Chart | `includeChart` | true |
| Data Preview | `includeDataPreview` | false (opt-in) |
| Data Quality | `includeDataQuality` | true in UI state; rendered only if flag true |
| AI conversation thread | `includeConversationContext` | false (opt-in) |
| Technical appendix | `includeTechnicalAppendix` | false (opt-in) |
| Mode | `pdfMode` | `"executive"` |

**Data flow:** `page.tsx` → `buildExecutivePdfExportInput({ options, conversationAppendix, chartPrep, ... })` → `runExecutivePdfExport(input)`.

---

## Section-by-section status

### KPI section

| | |
|--|--|
| **Status** | Working |
| **Gate** | `input.includes.includeKPIs` |
| **Empty state** | Premium empty if no cards |

### AI Insight section

| | |
|--|--|
| **Status** | Working |
| **Gate** | `input.includes.includeAIInsight` |
| **Lens panel** | `useLensExecutivePanel` from `pdf-executive-content.ts` for risk/opportunity/strategy |
| **Pending** | Page utilization / narrative density polish |

### Chart section

| | |
|--|--|
| **Status** | Working |
| **Gate** | `includeChart` + chart prep / capture ref |
| **Note** | Capture depends on visible chart DOM at export time |

### Data Preview

| Issue | Status |
|-------|--------|
| Checkbox ignored in executive mode | **Fixed** — `includeDataPreview` checked without `analystPdf` gate |
| Section missing when selected | **Fixed** in code |
| Manual PDF verify | **Pending** |

Renderer: `drawDataPreviewSection()` in `pdf-report.ts` (~line 2625).

### Data Quality

| Issue | Status |
|-------|--------|
| Hidden when `pdfMode === executive` | **Fixed** — was `analystPdf && includeDataQuality` |
| Empty profile | Shows: *"Data quality: No quality profile available."* |
| Manual PDF verify | **Pending** |

Renderer: ~line 4185 in `pdf-report.ts`.

### AI Conversation Thread

| Issue | Status |
|-------|--------|
| Hidden in executive mode | **Fixed** — now `if (input.includes.includeConversationContext)` |
| Empty thread | Shows: *"Conversation thread: No prior conversation entries captured."* |
| Title | Section titled **"AI conversation thread"** |
| Data source | `conversationAppendix` built in `page.tsx` from `aiConversationState` / `conversationSnapshot` |
| Manual PDF verify | **Pending** |

Renderer: ~line 3727 in `pdf-report.ts`.

### Technical Appendix

| Issue | Status |
|-------|--------|
| Hidden in executive mode | **Fixed** |
| Empty metadata | Shows: *"Technical appendix: No technical metadata available."* |
| Always adds page | `doc.addPage()` when section included — may add sparse page if only empty state |
| Manual PDF verify | **Pending** |

Renderer: ~line 4297 in `pdf-report.ts`.

### Executive vs Analyst mode

| Behavior | Executive | Analyst |
|----------|-----------|---------|
| Advanced sections | Opt-in via checkboxes | Appendix default on |
| Appendix intro copy | Shorter audit reference | "Omit for executive-only distribution" note |
| Lens executive panel | Yes (risk/opportunity/strategy) | Same renderer |

**Important:** After June 2026 fix, **checkbox state drives rendering** in both modes — not silently dropped for executive.

---

## PDF content / lens layer

| File | Role |
|------|------|
| `frontend/lib/pdf-executive-content.ts` | Lens section selection, opportunity/risk action wording, dedup |
| `frontend/lib/pdf-executive-content.test.ts` | Regression for invest PDF scenario, upside rewrite |
| `frontend/lib/build-executive-pdf-input.ts` | KPI, insight sections, ranked signals, conversation appendix passthrough |

---

## Files involved (complete list)

| File | Role |
|------|------|
| `frontend/app/page.tsx` | Export UI, checkbox state, chart capture prep, conversation appendix |
| `frontend/lib/build-executive-pdf-input.ts` | Input assembly |
| `frontend/lib/build-executive-pdf-input.test.ts` | Tests |
| `frontend/app/pdf-report.ts` | PDF rendering |
| `frontend/lib/pdf-executive-content.ts` | Executive lens / hierarchy planning |
| `frontend/lib/pdf-enterprise-style.ts` | Typography, empty states |
| `frontend/lib/pdf-export-sections.test.ts` | Section gate regression |
| `frontend/lib/executive-insight-ranking.ts` | Viz fact cards → PDF |

---

## Known remaining PDF gaps

- Page utilization / multi-page balance not tuned
- Confidence display in PDF not finalized
- Chart-intel verbosity in PDF
- Full analyst vs executive visual parity not reviewed
- No automated PDF byte/layout snapshot tests (manual download only)
