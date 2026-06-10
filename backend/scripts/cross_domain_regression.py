#!/usr/bin/env python3
"""
Cross-domain regression — Waves 1+2+3 routing gate.

Runs all 10 domain fixtures through routing-only QA and emits a pass/fail scorecard.

Gates (production sign-off):
  - Domain avg >= 7.5
  - Zero hallucination failures (hallucination_resistance <= 3)
  - Zero critical severity
  - Negative tests: limitation routing or hallucination_resistance >= 8

Usage:
  cd backend
  python scripts/cross_domain_regression.py
  python scripts/cross_domain_regression.py --report-only  # skip run, use existing JSON
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

REPO = Path(__file__).resolve().parents[2]
OUT_JSON = REPO / "docs" / "ai-insights-production-qa-results.json"
OUT_MD = REPO / "docs" / "ai-insights-cross-domain-regression-report.md"

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

DOMAIN_ORDER = [
    "Retail",
    "Marketing",
    "Sales",
    "Geography",
    "Banking & Financial Services",
    "Finance & FP&A",
    "Operations",
    "Customer Support",
    "HR",
    "Healthcare",
]

WAVE_FOR_DOMAIN = {
    "Retail": 1,
    "Marketing": 1,
    "Sales": 1,
    "Geography": 1,
    "Banking & Financial Services": 1,
    "Finance & FP&A": 2,
    "Operations": 2,
    "Customer Support": 2,
    "HR": 3,
    "Healthcare": 3,
}

GATE_DOMAIN_AVG = 7.5
GATE_PASS_PCT = 90.0
GATE_NEGATIVE_HALLUC = 8.0


def _hallucination_fail(r: Dict[str, Any]) -> bool:
    return r["scores"].get("hallucination_resistance", 10) <= 3


def _domain_stats(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    avgs = [r["avg"] for r in results]
    dom_avg = statistics.mean(avgs) if avgs else 0.0
    pass_n = sum(1 for a in avgs if a >= 7.0)
    pass_pct = (pass_n / len(avgs) * 100) if avgs else 0.0
    dim_scores = {
        d: round(statistics.mean([r["scores"][d] for r in results]), 2) for d in DIMS
    }
    hall_fails = sum(1 for r in results if _hallucination_fail(r))
    crit = sum(1 for r in results if r.get("severity") == "critical")
    negatives = [r for r in results if r.get("pattern") == "negative"]
    neg_ok = all(
        r["scores"].get("hallucination_resistance", 0) >= GATE_NEGATIVE_HALLUC
        or r["scores"].get("intent_detection", 0) >= 8
        for r in negatives
    ) if negatives else True

    gates = {
        "domain_avg": dom_avg >= GATE_DOMAIN_AVG,
        "pass_pct": pass_pct >= GATE_PASS_PCT,
        "hallucination_zero": hall_fails == 0,
        "no_critical": crit == 0,
        "negative_tests": neg_ok,
    }
    passed = all(gates.values())

    return {
        "count": len(results),
        "domain_avg": round(dom_avg, 2),
        "pass_n": pass_n,
        "pass_pct": round(pass_pct, 1),
        "dim_scores": dim_scores,
        "hallucination_fails": hall_fails,
        "critical": crit,
        "negative_count": len(negatives),
        "gates": gates,
        "passed": passed,
    }


def evaluate_payload(payload: Dict[str, Any]) -> Tuple[bool, Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    by_domain: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in payload["results"]:
        by_domain[r["domain"]].append(r)

    domain_stats: Dict[str, Dict[str, Any]] = {}
    all_fails: List[Dict[str, Any]] = []

    for domain in DOMAIN_ORDER:
        rs = by_domain.get(domain, [])
        if not rs:
            continue
        stats = _domain_stats(rs)
        domain_stats[domain] = stats
        for r in rs:
            if r["avg"] < 7 or r.get("severity") in ("critical", "high") or _hallucination_fail(r):
                all_fails.append(r)

    overall_pass = all(s["passed"] for s in domain_stats.values()) and len(domain_stats) == 10
    return overall_pass, domain_stats, all_fails


def write_report(payload: Dict[str, Any], overall_pass: bool, domain_stats: Dict[str, Dict[str, Any]], all_fails: List[Dict[str, Any]]) -> None:
    lines: List[str] = []
    lines.append("# AI Insights — Cross-Domain Regression Report")
    lines.append("")
    lines.append(f"**Executed:** {payload.get('executed_at', 'unknown')}")
    lines.append(f"**Mode:** `{payload.get('mode', 'unknown')}`")
    lines.append(f"**Duration:** {payload.get('duration_sec', '?')}s")
    lines.append(f"**Domains:** {len(domain_stats)}/10")
    lines.append("")
    verdict = "**PASS**" if overall_pass else "**FAIL**"
    lines.append(f"## Overall verdict: {verdict}")
    lines.append("")
    lines.append(
        "Gates: domain avg ≥7.5 · ≥90% questions ≥7.0 · zero hallucination fails · "
        "zero critical · negative tests limitation-first"
    )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Domain scorecard (Waves 1–3)")
    lines.append("")
    lines.append(
        "| Wave | Domain | Evals | Avg | Pass ≥7 | Halluc fails | Critical | Gates | Verdict |"
    )
    lines.append(
        "|-----:|--------|------:|----:|--------:|-------------:|---------:|-------|---------|"
    )

    for domain in DOMAIN_ORDER:
        stats = domain_stats.get(domain)
        if not stats:
            lines.append(f"| {WAVE_FOR_DOMAIN.get(domain, '?')} | {domain} | — | — | — | — | — | — | **Missing** |")
            continue
        g = stats["gates"]
        gate_str = " ".join(
            ("✓" if v else "✗") + k[:4]
            for k, v in [
                ("avg", g["domain_avg"]),
                ("pct", g["pass_pct"]),
                ("hall", g["hallucination_zero"]),
                ("crit", g["no_critical"]),
                ("neg", g["negative_tests"]),
            ]
        )
        verdict_d = "Pass" if stats["passed"] else "**Fail**"
        lines.append(
            f"| {WAVE_FOR_DOMAIN[domain]} | {domain} | {stats['count']} | **{stats['domain_avg']}** | "
            f"{stats['pass_n']}/{stats['count']} ({stats['pass_pct']}%) | "
            f"{stats['hallucination_fails']} | {stats['critical']} | {gate_str} | {verdict_d} |"
        )

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Wave rollup")
    lines.append("")
    for wave in (1, 2, 3):
        wave_domains = [d for d, w in WAVE_FOR_DOMAIN.items() if w == wave]
        wave_stats = [domain_stats[d] for d in wave_domains if d in domain_stats]
        if not wave_stats:
            continue
        wave_avg = round(statistics.mean([s["domain_avg"] for s in wave_stats]), 2)
        wave_pass = all(s["passed"] for s in wave_stats)
        lines.append(f"- **Wave {wave}:** avg **{wave_avg}** — {'PASS' if wave_pass else 'FAIL'}")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Top failures")
    lines.append("")
    all_fails.sort(key=lambda x: (x["avg"], x.get("severity") != "critical"))
    if not all_fails:
        lines.append("_No failing questions._")
    else:
        for r in all_fails[:20]:
            lines.append(
                f"- `{r['qid']}` **{r['domain']}** — avg {r['avg']}, "
                f"halluc {r['scores'].get('hallucination_resistance')}, {r.get('severity')}: "
                f"{r['question'][:80]}"
            )

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Reproduction")
    lines.append("")
    lines.append("```bash")
    lines.append("cd backend")
    lines.append("python scripts/cross_domain_regression.py")
    lines.append("# or routing-only without report regeneration:")
    lines.append("python scripts/wave_qa_runner.py --wave all --routing-only")
    lines.append("python scripts/cross_domain_regression.py --report-only")
    lines.append("```")
    lines.append("")
    lines.append("**Live narrative (staging):** run `wave1_live_narrative_qa.py` per wave on Render/Linux.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(f"*Generated from `{OUT_JSON.relative_to(REPO).as_posix()}`*")

    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_MD}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Cross-domain regression gate")
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Generate report from existing JSON without re-running QA",
    )
    args = parser.parse_args()

    if not args.report_only:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from wave_qa_runner import run_qa

        payload = run_qa([1, 2, 3], routing_only=True, out_path=OUT_JSON)
    else:
        if not OUT_JSON.exists():
            raise SystemExit(f"Missing {OUT_JSON}; run without --report-only first")
        payload = json.loads(OUT_JSON.read_text(encoding="utf-8"))

    overall_pass, domain_stats, all_fails = evaluate_payload(payload)
    write_report(payload, overall_pass, domain_stats, all_fails)

    if overall_pass:
        print("CROSS-DOMAIN REGRESSION: PASS")
        sys.exit(0)
    print("CROSS-DOMAIN REGRESSION: FAIL")
    sys.exit(1)


if __name__ == "__main__":
    main()
