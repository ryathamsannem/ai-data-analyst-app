# Open Items (Prioritized)

**Snapshot:** June 28, 2026 (final release snapshot) · Branch `DEV` · commit `61d0145`.

Completed Overview 5A.x → 5C.x work: [`overview-pass-status.md`](./overview-pass-status.md).  
Frozen H-Bar/V-Bar parity: [`chart-visual-parity-open-items.md`](./chart-visual-parity-open-items.md).  
Final readiness: [`final-release-readiness-summary.md`](./final-release-readiness-summary.md).

---

## Closed (this snapshot)

| Item | Status |
|------|--------|
| H-Bar / V-Bar visual parity (5B.1 → 5C.5) | **Frozen** |
| Export regression pass | **Complete** |
| Overview defaults (4 gold fixtures) | **Complete** |
| P1 error/loading/empty UX audit | **Complete** |
| Upload / mapping edge cases | **Complete** |
| HR discovery cleanup (age-band demotion) | **Complete** |
| 9-domain 1k upload validation | **Complete** |
| 15-domain Overview validation | **Complete** — 14 High, 1 justified Medium, 0 default scatter |
| Healthcare / SaaS distinct secondary + labels | **Complete** |
| Marketing revenue confidence | **Complete** |
| Default Overview scatter demotion (business-rich) | **Complete** |
| Banking utilization suggested question | **Complete** (`61d0145`) |
| Showcase diversity/scatter backend failures | **Complete** (`61d0145`) |
| Full backend pytest green | **478 passed, 0 failed** |
| Full frontend vitest + build green | **743 passed, 0 failed; build PASS** |
| Cleanup audit + doc archive | **Complete** |

---

## P1 — Future production readiness (not blocking snapshot)

### Optional browser confirmation
- Live upload spot-check across 3–5 representative domains (retail, banking, HR, marketing, SaaS).
- Non-blocking; backend probes and pytest already cover payload correctness.

### AI Insights answer-quality validation
- Cross-domain narrative quality, tone, and follow-up continuity beyond deterministic backend probes.
- Manual or staged LLM QA using `test-fixtures/domains/` fixtures.

### Platform gaps (separate initiative)
- Authentication & tenant isolation
- Durable multi-tenant dataset storage (currently in-memory `df` per process)
- Usage metering / billing integration
- Optional E2E browser regression suite (Playwright export + upload flows)

---

## P2 — Nice to have

### Further visual polish (only if product requests)
- Histogram premium review (styled V-Bar; no dedicated occupancy pass).
- Cosmetic chart tuning **only after** explicit product approval — H-Bar/V-Bar parity is frozen.

### Performance
- Large dataset optimization (100k+ rows) — fixtures exist under `test-fixtures/large-dataset/`; scripts documented.

---

## Technical debt (accepted)

| Item | Notes |
|------|-------|
| Dual renderer pipelines | Overview inline vs shared `ChartRenderer` — managed via shared domain/visual helpers. |
| Orientation-natural H-Bar vs V-Bar | 85% utilization cap is the agreed mitigation; parity frozen. |
| Monolithic `page.tsx` | Incremental extraction only when scoped. |
| Banking 1k Medium confidence | Justified — utilization vs delinquency profit-role tie; not a blocker. |
| Generic exec/type labels | Insurance, real estate, telecom, hospitality, energy, education, supply chain use generic executive domain where no dedicated taxonomy exists. |
| Phase 7 PDF binary drift | `npm run test` may regenerate PDFs under `docs/pdf-validation-screenshots/`; restore before commit unless intentionally refreshed. |
