# Open Issues

**Snapshot date:** June 17, 2026

---

## Chart / Export Issues

| ID | Priority | Issue | Notes |
|----|----------|-------|-------|
| CE1 | High | Axis/domain parity not centralized | Overview PNG vs Charts/AI/PDF can still differ, especially H-Bar ticks/domain |
| CE2 | High | Overview inline renderer and `ChartRenderer` still diverge | Dual chart pipelines remain the main long-term visual parity risk |
| CE3 | Medium | `ChartPresentationProfile.axisPolicyId` is diagnostic only | It identifies mismatches but does not enforce axis/domain/tick parity |
| CE4 | Medium | PDF placement is profile-aware, but full PDF chart system still report-owned | PDF frame/page layout remains separate from chart profile ownership |
| CE5 | Medium | PDF chart artifact is image-based | Native report text/chips are available, but chart internals are rasterized |
| CE6 | Medium | No browser/E2E export regression suite | PNG/PDF reliability mostly validated by unit tests and manual checks |
| CE7 | Low | Legacy PDF capture fallback still present | Intentional for safety; can be removed only after longer artifact validation |

---

## Product / Platform Issues

| ID | Priority | Issue | Location |
|----|----------|-------|----------|
| P1 | Critical | Global in-memory dataset; last upload wins per process | `backend/main.py` |
| P2 | Critical | No real authentication | frontend/backend |
| P3 | Critical | Plan tier is client-spoofable via local storage/session headers | plan/usage paths |
| P4 | High | In-memory usage tracker not durable across restarts/workers | backend usage tracker |
| P5 | High | AI quota can be debited before full pipeline success | AI request flow |
| P6 | High | Missing API key can produce template answers while chart still renders | backend AI paths |
| P7 | High | `/preview` does not fully honor dashboard filters | preview API/UI |
| P8 | High | Large frontend/backend monoliths increase merge risk | `frontend/app/page.tsx`, `backend/main.py` |
| P9 | Medium | PDF generation is main-thread heavy and not cancellable | frontend PDF |
| P10 | Medium | Conversation appendix can grow large | PDF export |
| P11 | Medium | CSV formula injection not sanitized on preview API | backend preview/export |
| P12 | Medium | No HTTP integration test pack for upload/ask/CORS | backend tests |
| P13 | Medium | Broad `except Exception` in backend hot paths | backend |
| P14 | Low | Upload TTL/memory cleanup lifecycle is missing | backend |
| P15 | Low | Placeholder support email remains in PDF footer | branding/PDF |

---

## Recommended Next Priorities

1. **Phase 3B: AxisPresentationPlan**
   - Start with H-Bar axis/domain/tick parity.
   - Keep read-only diagnostics first, then apply narrowly to export surfaces.

2. **Browser-based export validation**
   - Add focused manual/E2E script coverage for Overview PNG, Charts PNG, and PDF chart artifact export.
   - Validate H-Bar, Bar, Line, Area, Donut, Scatter.

3. **Reduce `page.tsx` risk**
   - Extract only stable platform-facing helpers when needed.
   - Avoid broad tab/layout refactors.

4. **Backend data/session isolation**
   - Replace global process dataset state before production multi-user use.

5. **Auth and durable usage**
   - Server-owned plan tier and durable quota tracking.

---

## Do Not Touch Without Explicit Scope

- H-Bar renderer internals.
- Donut/Pie renderer internals.
- Chart kind selection.
- Overview-to-`ChartRenderer` migration.
- Histogram support.
- PDF page redesign.
- Broad `page.tsx` or `backend/main.py` refactors.
