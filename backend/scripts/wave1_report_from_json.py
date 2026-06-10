#!/usr/bin/env python3
"""Generate Wave 1 markdown report from ai-insights-wave1-results.json."""
from __future__ import annotations

import json
import statistics
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
IN_JSON = REPO / "docs" / "ai-insights-wave1-results.json"
OUT_MD = REPO / "docs" / "ai-insights-wave1-execution-report.md"

DIMS = [
    "intent_detection",
    "chart_selection",
    "data_grounding",
    "executive_summary_quality",
    "recommendation_quality",
    "confidence_explanation",
    "follow_up_continuity",
    "hallucination_resistance",
]


def main() -> None:
    payload = json.loads(IN_JSON.read_text(encoding="utf-8"))
    results = payload["results"]
    by_domain: dict[str, list] = defaultdict(list)
    for r in results:
        by_domain[r["domain"]].append(r)

    lines: list[str] = []
    lines.append("# AI Insights Production QA — Wave 1 Execution Report")
    lines.append("")
    lines.append("**Status:** Evaluation only — no fixes implemented.")
    lines.append("")
    lines.append(f"**Executed:** {payload.get('executed_at', 'unknown')}")
    lines.append(f"**Mode:** `{payload.get('mode', 'unknown')}`")
    lines.append(f"**Duration:** {payload.get('duration_sec', '?')}s")
    lines.append("")
    lines.append("> " + str(payload.get("note", "")))
    lines.append("")
    lines.append("**Fixtures:** `test-fixtures/domains/`")
    lines.append("**Matrix:** [`docs/ai-insights-production-qa-matrix.md`](ai-insights-production-qa-matrix.md)")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 1. Wave 1 domain scorecard")
    lines.append("")
    lines.append("| Domain | Evaluations | Domain avg | Pass ≥7.0 | Intent | Chart | Ground | Exec | Rec | Conf | Follow-up | Halluc | Verdict |")
    lines.append("|--------|------------:|-----------:|----------:|-------:|------:|-------:|-----:|----:|----:|----------:|-------:|---------|")

    domain_verdicts = {}
    all_fails = []

    for domain in ["Retail", "Marketing", "Sales", "Geography", "Banking & Financial Services"]:
        rs = by_domain.get(domain, [])
        if not rs:
            continue
        avgs = [r["avg"] for r in rs]
        dom_avg = round(statistics.mean(avgs), 2)
        pass_n = sum(1 for a in avgs if a >= 7)
        pass_pct = pass_n / len(avgs) * 100
        dim_scores = {d: round(statistics.mean([r["scores"][d] for r in rs]), 2) for d in DIMS}
        hall = dim_scores["hallucination_resistance"]
        crit_hall = any(r["scores"].get("hallucination_resistance", 10) <= 3 for r in rs)
        if crit_hall or dom_avg < 5:
            verdict = "**Fail**"
        elif pass_pct >= 90 and dom_avg >= 7:
            verdict = "Pass"
        elif dom_avg >= 6.5:
            verdict = "Conditional"
        else:
            verdict = "Fail"
        domain_verdicts[domain] = verdict
        lines.append(
            f"| {domain} | {len(rs)} | **{dom_avg}** | {pass_n}/{len(rs)} ({pass_pct:.0f}%) | "
            + " | ".join(str(dim_scores[d]) for d in DIMS)
            + f" | {verdict} |"
        )
        for r in rs:
            if r["avg"] < 7 or r["severity"] in ("critical", "high", "medium"):
                all_fails.append(r)

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 2. Top failing questions")
    lines.append("")
    all_fails.sort(key=lambda x: (x["avg"], x["severity"] != "critical"))
    for r in all_fails[:25]:
        lines.append(f"### {r['domain']} — `{r['qid']}` (avg **{r['avg']}**, {r['severity']})")
        lines.append("")
        lines.append(f"- **Question:** {r['question']}")
        lines.append(f"- **Pattern:** {r['pattern']}")
        rt = r.get("routing") or {}
        lines.append(
            f"- **Routing:** intent=`{rt.get('intent')}` metric=`{rt.get('metricColumn')}` "
            f"dim=`{rt.get('categoryColumn')}` chart=`{rt.get('chartType')}` conf=`{rt.get('confidence')}`"
        )
        if r.get("notes"):
            lines.append(f"- **Notes:** {'; '.join(r['notes'][:4])}")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## 3. Reproduction steps")
    lines.append("")
    lines.append("1. Start backend from `backend/` with Python env and dependencies installed.")
    lines.append("2. Upload fixture: `test-fixtures/domains/<domain>.csv` via Overview upload (or bind in test harness).")
    lines.append("3. Open **AI Insights** tab; ask the question verbatim from the matrix.")
    lines.append("4. Inspect Intent Engine debug / network `analysis` + `visualization` payloads.")
    lines.append("5. For follow-ups, send chain questions in order without **Reset conversation**.")
    lines.append("")
    lines.append("**Automated replay (routing layer, no code changes):**")
    lines.append("```bash")
    lines.append("cd backend")
    lines.append("python scripts/wave1_qa_execution.py --routing-only")
    lines.append("python scripts/wave1_report_from_json.py")
    lines.append("```")
    lines.append("")
    lines.append("**Full narrative replay (requires Claude API):**")
    lines.append("```bash")
    lines.append("cd backend")
    lines.append("python scripts/wave1_qa_execution.py")
    lines.append("```")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 4. Actual vs expected behavior (pattern-level)")
    lines.append("")

    patterns = defaultdict(list)
    for r in results:
        patterns[(r["domain"], r["pattern"])].append(r["avg"])
    lines.append("| Domain | Pattern | Avg score | Common actual behavior | Expected |")
    lines.append("|--------|---------|----------:|------------------------|----------|")
    pattern_notes = {
        ("Retail", "negative"): ("May still route compare on proxy metric", "unsupported/limitation-first"),
        ("Sales", "ranking"): ("Dimension drift to sales_rep on dept ranking", "department dimension"),
        ("Marketing", "compare"): ("campaign_name vs channel resolution varies", "channel/category per question"),
        ("Geography", "relationship"): ("Scatter OK", "scatter on revenue × customers"),
        ("Banking & Financial Services", "compare"): ("Donut for spend composition", "bar compare acceptable"),
    }
    seen = set()
    for (dom, pat), avgs in sorted(patterns.items(), key=lambda x: statistics.mean(x[1])):
        if (dom, pat) in seen:
            continue
        seen.add((dom, pat))
        note = pattern_notes.get((dom, pat), ("See failing questions", "Per QA matrix"))
        lines.append(
            f"| {dom} | {pat} | {round(statistics.mean(avgs),2)} | {note[0]} | {note[1]} |"
        )

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 5. Severity classification")
    lines.append("")
    lines.append("| Severity | Count | Description |")
    lines.append("|----------|------:|-------------|")
    sev_counts = defaultdict(int)
    for r in results:
        sev_counts[r.get("severity", "none")] += 1
    for s in ["critical", "high", "medium", "low", "none"]:
        sev_counts.setdefault(s, 0)
    lines.append(f"| Critical | {sev_counts['critical']} | Hallucination fail or avg <5 |")
    lines.append(f"| High | {sev_counts['high']} | Domain-blocking routing/grounding |")
    lines.append(f"| Medium | {sev_counts['medium']} | Partial pass 5–7 |")
    lines.append(f"| Low | {sev_counts['low']} | ≥7 with minor notes |")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 6. Root cause hypothesis (no fixes applied)")
    lines.append("")
    lines.append("1. **Dimension binding on new fixtures** — Sales/marketing/banking questions with department/territory/campaign vocabulary sometimes resolve to `sales_rep`, `product_line`, or `customer_segment` instead of the column named in the question.")
    lines.append("2. **Executive / risk phrasing** — Opportunity/risk questions often route to `compare` or `executive` with bar charts (acceptable fallback) but narrative/recommendation scores depend on LLM prose not exercised in routing-only mode.")
    lines.append("3. **Negative / unsupported tests** — Missing metrics (conversion rate, NPS, win rate, salesperson, quarter/NIM) may still produce charts instead of clean limitation-first responses.")
    lines.append("4. **Follow-up scope** — Meta follow-ups (`Why`, `columns used`) preserve root via `resolve_follow_up_turn`; action/risk combo questions may re-route to a new executive compare.")
    lines.append("5. **Composition charts** — Banking spend breakdown routes to `donut` (distribution intent); matrix expects bar family — acceptable for composition but scored lower on chart dimension.")
    lines.append("6. **LLM narrative gap** — Full `/ask` run blocked in this environment (Anthropic SSL); executive summary and recommendation dimensions need staging re-run with live API.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 7. Recommended fix order (when fixes are approved)")
    lines.append("")
    lines.append("1. **P0 — Dimension resolver** for new domain columns (`territory`, `campaign_name`, `branch`, `spend_amount`, `product_line`) on ranking/compare questions.")
    lines.append("2. **P0 — Unsupported metric guard** for negative tests (conversion, NPS, win rate, salesperson, quarter/NIM).")
    lines.append("3. **P1 — Follow-up executive combos** — Keep deposit/loan root scope when follow-up asks risk + action in one utterance.")
    lines.append("4. **P1 — Banking QA matrix rows** in `test_domain_quality_matrix.py` using `banking_financial_services.csv`.")
    lines.append("5. **P2 — Chart family policy** — Document donut/pie acceptance for composition vs strict bar expectation.")
    lines.append("6. **P2 — Staging narrative QA** — Re-score Wave 1 with live Claude after routing fixes.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 8. Production readiness verdict — Wave 1")
    lines.append("")

    fail_domains = [d for d, v in domain_verdicts.items() if "Fail" in v]
    cond = [d for d, v in domain_verdicts.items() if v == "Conditional"]
    if fail_domains:
        overall = "**Not ready for Wave 1 production sign-off.**"
        detail = f"Failing domains: {', '.join(fail_domains)}."
    elif cond:
        overall = "**Conditional readiness** — routing layer acceptable on anchor domains; complete staging narrative QA before sign-off."
        detail = f"Conditional domains: {', '.join(cond)}."
    else:
        overall = "**Ready for Wave 1** subject to staging narrative confirmation."
        detail = "All domains met routing scorecard thresholds."

    lines.append(overall)
    lines.append("")
    lines.append(detail)
    lines.append("")
    lines.append("| Gate | Status |")
    lines.append("|------|--------|")
    lines.append("| Retail routing on new fixture | See scorecard |")
    lines.append("| Geography + trend (dated fixture) | See scorecard |")
    lines.append("| Banking dedicated fixture exercised | Yes |")
    lines.append("| Zero hallucination fails | See severity table |")
    lines.append("| Live LLM narrative QA | **Pending** (API unavailable in local run) |")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("*Generated from `docs/ai-insights-wave1-results.json` — evaluation only, no product changes.*")

    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_MD}")


if __name__ == "__main__":
    main()
