# P1 — Upload and Mapping Edge Case Validation

**Date:** June 27, 2026 · **Branch:** `DEV`  
**Tests:** `backend/tests/test_upload_mapping_edge_cases.py` (13 cases) + gold/regression suites (50/50 targeted pass)

---

## Summary

| Severity | Found | Fixed | Deferred |
|----------|-------|-------|----------|
| P0 | 0 | 0 | 0 |
| P1 | 2 | 2 | 0 |
| P2 | 6 | 0 | 6 |

**Verdict:** Edge-case datasets degrade gracefully after two backend fixes. Gold fixture behavior unchanged.

---

## Edge-case validation table

### 1. Empty / invalid structure

| Scenario | Current behavior | Expected | Severity | Status | Layer |
|----------|------------------|----------|----------|--------|-------|
| Zero-byte file | Client rejects before upload (`empty_file`) | Reject with clear message | — | **OK** (P1 UX pass) | Frontend `upload-auto-flow.ts` |
| Header-only CSV | Parse → 0 rows → `clean_dataframe` empty → HTTP 400 “Uploaded file has no data.” | Reject | — | **OK** | Backend parse + `/upload` |
| Malformed CSV | Generic “Unable to read CSV file.” | Reject or warn | P2 | **Deferred** | Backend `file_parsers.py` |
| Duplicate column names | Pandas disambiguates (`a`, `b`, `a.1`); mapping + dashboard succeed | Load without crash | — | **OK** | Backend parse |
| All-null columns | Dropped in `clean_dataframe`; mapping uses remaining cols | Drop silently | — | **OK** | Backend `clean_dataframe` |

### 2. Missing role types

| Scenario | Current behavior | Expected | Severity | Status | Layer |
|----------|------------------|----------|----------|--------|-------|
| No date column | `date` mapping **null** (was wrongly picking first text col) | null / Not detected | P1 | **Fixed** | Backend semantic mapping |
| No numeric metrics (all categorical) | Mapping null sales; dashboard returns empty/minimal charts **without crash** | No crash | P1 | **Fixed** | Dashboard discovery |
| No categorical dimensions | Numeric-only: picks `amount`-like sales; sparse charts | Best-effort charts | — | **OK** | Semantic mapping |
| Single usable column | Maps as primary metric; dashboard builds | No crash | — | **OK** | Semantic mapping + discovery |
| All categorical | Same as no numeric — no IndexError | No crash | P1 | **Fixed** | `auto_dashboard_opportunities.py` |
| All numeric | Prefers `amount` / name-scored metric | Reasonable metric | — | **OK** | Semantic mapping |

### 3. Ambiguous schemas

| Scenario | Current behavior | Expected | Severity | Status | Layer |
|----------|------------------|----------|----------|--------|-------|
| Multiple date columns | Picks highest-scored date name (`report_date` vs `created_at`) | One date role | — | **OK** | Semantic mapping |
| Multiple amount-like columns | Scoring picks strongest sales keyword | Best commercial metric | — | **OK** | Semantic mapping |
| Mixed domain signals | `infer_executive_domain` resolves primary domain; mapping uses column scores | Generic or best domain | P2 | **Deferred** — no hard gate | Backend domain inference |
| Generic names (`value`, `type`, `category`) | Domain `generic`; low-confidence mapping | Generic fallback | — | **OK** | Semantic mapping |

### 4. High-cardinality / poor dimensions

| Scenario | Current behavior | Expected | Severity | Status | Layer |
|----------|------------------|----------|----------|--------|-------|
| ID-like columns (`transaction_id`, `customer_id`) | `_id_like_column_name` excludes from chart titles | Not promoted as breakdown | — | **OK** | Dashboard discovery |
| High unique string columns | Cardinality caps + id_like filters | Avoid useless charts | P2 | **Deferred** — tune thresholds | Discovery scoring |
| Mostly unique dimensions | Record-distribution / cap logic limits donut abuse | Limited charts | — | **OK** | Discovery + `_apply_high_cardinality_cap` |

### 5. Domain-specific (gold fixtures)

| Fixture | Check | Result |
|---------|-------|--------|
| **Retail gold** | `sales_amount`, `order_date`, `product_category`; ≥3 charts; no banking leak | **PASS** |
| **Banking gold** | No scatter default; no account age × product type; spend/utilization/delinquency | **PASS** |
| **Banking FS** | (via existing suite) Banking label, monthly trends, no scatter | **PASS** |
| **HR gold** | `salary` + `department`; salary/dept/performance charts prioritized; age charts may appear | **PASS** (age charts P2) |

---

## P1 fixes applied

### 1. All-categorical dashboard crash

**Symptom:** `IndexError` in composition discovery when `numerics` list empty.  
**Fix:** Guard composition donut loop with `if numerics:` in `auto_dashboard_opportunities.py`.  
**Layer:** Backend dashboard discovery.

### 2. Spurious date column on text-only schemas

**Symptom:** `product_category` mapped as `date` when no date column exists (dtype text score > 0).  
**Fix:** `_pick_date_column_from_candidates()` — require date dtype, date-like column name, or parseable time series.  
**Layer:** Backend semantic mapping (`main.py`).

---

## P2 deferred

| Item | Layer |
|------|-------|
| Malformed CSV structural diagnostics | Backend parse |
| Mixed-domain hard confidence gate | Semantic mapping + frontend Data setup |
| High-cardinality dimension tuning | Discovery scoring |
| HR age-band chart demotion | HR discovery pass (documented in Overview defaults) |
| Upload error banner on Insights tab | Frontend (P1 UX audit backlog) |
| Re-upload confirmation | Frontend |

---

## Test coverage added

`backend/tests/test_upload_mapping_edge_cases.py`:

- Upload parse: header-only, duplicate cols, all-null cols
- Mapping: no date, all categorical, all numeric, single column, multi-date, generic names, id-like dims
- Gold: retail, banking, HR regression guards

**Targeted run:** 50/50 pass (edge + cross-domain + gold dashboards + KPI domains)  
**Full backend:** 434 passed, **6 pre-existing failures** (unchanged showcase/marketing tests)

---

## Frontend

No changes this pass. Zero-byte rejection already shipped in P1 UX audit (`upload-auto-flow.ts`).

---

## Recommendation

**Upload/mapping edge-case validation can be closed** for P1. Remaining items are P2 discovery polish or pre-existing backend debt.
