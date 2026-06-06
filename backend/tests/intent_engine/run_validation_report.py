"""
Phase 1 validation runner — inspect analysis.intent for golden questions.
Run: cd backend && python tests/intent_engine/run_validation_report.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

FIXTURE = BACKEND_ROOT / "tests" / "fixtures" / "retail_region_product.csv"

QUESTIONS = [
    "Compare revenue and profit by region",
    "Which region has best margin?",
    "Which product is growing fastest?",
    "Which category is declining?",
    "Show revenue trend by month",
    "Compare revenue vs ad spend",
]


def resolve_intent(question: str, main_mod, df, profile) -> dict:
    from intent_engine.resolve_analysis_intent import resolve_analysis_intent

    intent_debug = main_mod._describe_aggregate_intent(question, df, profile)
    spec = main_mod._resolve_question_metric_spec(question, df, profile)
    if spec and intent_debug:
        main_mod._apply_metric_spec_to_intent(intent_debug, spec)

    return resolve_analysis_intent(
        question=question,
        df=df,
        profile=profile,
        intent_debug=intent_debug,
        chart_type_internal="bar",
        chart_points=4,
    )


def check(question: str, intent: dict) -> tuple[bool, str, str]:
    """Returns (pass, expected_summary, reason)."""
    g = intent.get("primaryGoal")
    flags = intent.get("flags") or {}
    support = intent.get("support") or {}
    dim = (intent.get("dimension") or {}).get("columnKey")
    metric = intent.get("metric") or {}
    derived = intent.get("derivedMetricCandidate")
    routing = (intent.get("chart") or {}).get("routingBucket")
    reasons = support.get("reasonCodes") or []

    q = question.lower()

    if "compare revenue and profit by region" in q:
        expected = "compare + region + dualMetricCompare"
        ok = (
            g == "compare"
            and str(dim or "").lower() == "region"
            and flags.get("dualMetricCompare") is True
            and support.get("supported") is True
        )
        reason = "" if ok else f"got goal={g}, dim={dim}, dual={flags.get('dualMetricCompare')}"
        return ok, expected, reason

    if "best margin" in q and "region" in q:
        expected = "derived_metric + profit_margin + region"
        ok = (
            g == "derived_metric"
            and isinstance(derived, dict)
            and derived.get("id") == "profit_margin"
            and derived.get("computable") is True
            and str(dim or "").lower() == "region"
        )
        reason = "" if ok else f"got goal={g}, derived={derived}, dim={dim}"
        return ok, expected, reason

    if "product is growing fastest" in q:
        expected = "unsupported_analysis + growth unsupported"
        growth = support.get("growth") if isinstance(support.get("growth"), dict) else {}
        ok = (
            g == "unsupported_analysis"
            and flags.get("requestsGrowth") is True
            and support.get("supported") is False
            and growth.get("active") is True
        )
        reason = "" if ok else f"got goal={g}, supported={support.get('supported')}, growth={growth}"
        return ok, expected, reason

    if "category is declining" in q:
        expected = "decline + product fallback + revenue + insufficient_time_series"
        ok = (
            g == "decline"
            and str(dim or "").lower() == "product"
            and str(metric.get("columnKey") or "").lower() == "revenue"
            and support.get("supported") is False
            and "insufficient_time_series" in reasons
        )
        reason = "" if ok else f"got goal={g}, dim={dim}, metric={metric.get('columnKey')}, reasons={reasons}"
        return ok, expected, reason

    if "revenue trend by month" in q:
        expected = "trend + revenue + time dimension"
        ok = (
            g == "trend"
            and routing == "trend"
            and flags.get("requestsTrend") is True
            and str(metric.get("columnKey") or "").lower() == "revenue"
            and str(dim or "").lower() in ("order_date", "date")
        )
        reason = "" if ok else f"got goal={g}, routing={routing}, metric={metric.get('columnKey')}, dim={dim}"
        return ok, expected, reason

    if "revenue vs ad spend" in q:
        expected = "multi_metric_comparison + missing ad_spend + unsupported"
        req = intent.get("requestedMetrics") or flags.get("requestedMetrics") or []
        ok = (
            g == "multi_metric_comparison"
            and "revenue" in req
            and "ad_spend" in req
            and support.get("supported") is False
            and "missing_metric_operand" in reasons
            and "missing_ad_spend_column" in reasons
        )
        reason = "" if ok else f"got goal={g}, req={req}, reasons={reasons}, supported={support.get('supported')}"
        return ok, expected, reason

    return False, "unknown", "no rule"


def format_detected(intent: dict) -> str:
    support = intent.get("support") or {}
    metric = intent.get("metric") or {}
    dimension = intent.get("dimension") or {}
    derived = intent.get("derivedMetricCandidate")
    parts = [
        f"primaryGoal={intent.get('primaryGoal')}",
        f"routing={intent.get('chart', {}).get('routingBucket')}",
        f"metric={metric.get('displayLabel')}({metric.get('columnKey')})",
        f"dimension={dimension.get('displayLabel')}({dimension.get('columnKey')})",
        f"supported={support.get('supported')}",
        f"reasons={support.get('reasonCodes')}",
        f"derived={derived.get('id') if isinstance(derived, dict) else None}",
        f"requestedMetrics={intent.get('requestedMetrics')}",
        f"flags={intent.get('flags')}",
    ]
    return "; ".join(parts)


def main() -> None:
    import main as main_mod

    df = pd.read_csv(FIXTURE)
    main_mod.df = df
    main_mod.dataset_profile = main_mod.build_profile(df)
    profile = main_mod.dataset_profile

    print("=== Phase 1 analysis.intent validation ===\n")
    print(
        "Attach point: main._build_unified_analysis_payload -> "
        "intent_engine.attach.enrich_analysis_with_intent\n"
    )
    print(f"Fixture: {FIXTURE.name} columns={list(df.columns)}\n")

    results = []
    for q in QUESTIONS:
        intent = resolve_intent(q, main_mod, df, profile)
        passed, expected, reason = check(q, intent)
        results.append(
            {
                "question": q,
                "detected": format_detected(intent),
                "expected": expected,
                "pass": passed,
                "reason": reason or "matches expected",
            }
        )

    for r in results:
        print(f"Question: {r['question']}")
        print(f"Detected intent: {r['detected']}")
        print(f"Expected intent: {r['expected']}")
        print(f"Pass/Fail: {'Pass' if r['pass'] else 'Fail'}")
        print(f"Reason: {r['reason']}")
        print()

    fails = [r for r in results if not r["pass"]]
    print(f"Summary: {len(results) - len(fails)}/{len(results)} passed")
    if fails:
        print("Misclassifications:")
        for r in fails:
            print(f"  - {r['question']}: {r['reason']}")


if __name__ == "__main__":
    main()
