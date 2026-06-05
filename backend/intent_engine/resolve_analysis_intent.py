"""Top-level intent resolution facade (Phase 1)."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

import pandas as pd

from intent_engine import legacy
from intent_engine.decline_intent import build_decline_metric_dimension
from intent_engine.multi_metric_intent import build_multi_metric_comparison
from intent_engine.question_patterns import (
    question_requests_correlation_routing,
    question_requests_decline_intent,
    question_requests_driver_intent,
    question_requests_entity_decline,
    question_requests_multi_metric_comparison,
    question_requests_relationship_intent,
)
from intent_engine.resolve_derived_metric import resolve_derived_metric_candidate
from intent_engine.resolve_metric_dimension import resolve_metric_and_dimension
from intent_engine.validate_support import validate_analysis_support

logger = logging.getLogger("intent_engine")

INTENT_ENGINE_VERSION = 1


def _infer_primary_goal(
    question: str,
    ql: str,
    routing_bucket: str,
    intent_debug: Optional[Dict[str, Any]],
    unsupported_growth: Optional[Dict[str, Any]],
    dual_compare: bool,
) -> str:
    if unsupported_growth and unsupported_growth.get("active"):
        return "unsupported_analysis"
    if intent_debug and intent_debug.get("derived_profit_margin"):
        return "derived_metric"
    if intent_debug and intent_debug.get("derived_roi"):
        return "derived_metric"
    if legacy.question_requests_profit_margin(question) or legacy.question_requests_roi(
        question
    ):
        return "derived_metric"
    if dual_compare:
        return "compare"
    if legacy.question_requests_trend_intent(question) or routing_bucket == "trend":
        return "trend"
    if legacy.question_asks_outlier_analysis(question) and routing_bucket == "outlier":
        return "outlier"
    if routing_bucket == "relationship":
        return "relationship"
    if routing_bucket == "distribution":
        return "distribution"
    if routing_bucket == "ranking":
        return "rank"
    if routing_bucket == "kpi_summary":
        return "kpi"
    if "compare" in routing_bucket or legacy.question_requests_two_metric_compare(
        question
    ):
        return "compare"
    if legacy.question_requests_growth_intent(question):
        return "unsupported_analysis"
    return "compare"


def resolve_analysis_intent(
    *,
    question: str,
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
    intent_debug: Optional[Dict[str, Any]] = None,
    chart_type_internal: str = "bar",
    chart_points: int = 0,
    time_series_analysis: Optional[Dict[str, Any]] = None,
    unsupported_growth_analysis: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build AnalysisIntent JSON (parallel metadata; does not drive chart pipeline).
    """
    ql = (question or "").lower().strip()
    tags = legacy.detect_intent_tags(question)
    routing_bucket = legacy.chart_selection_question_bucket(ql)

    requests_decline = question_requests_entity_decline(question)
    requests_multi = question_requests_multi_metric_comparison(question)
    requests_relationship = question_requests_correlation_routing(question)

    if requests_decline and "decline" not in tags:
        tags = [*tags, "decline"]

    dual_compare = False
    if df is not None and not df.empty and profile is not None:
        dual_compare = legacy.resolve_two_metric_compare_spec(question, df, profile) is not None

    multi_payload: Optional[Dict[str, Any]] = None
    if (
        requests_multi
        and not requests_relationship
        and df is not None
        and not df.empty
        and profile is not None
    ):
        multi_payload = build_multi_metric_comparison(question, df, profile)

    md = resolve_metric_and_dimension(
        question,
        df if df is not None else pd.DataFrame(),
        profile or {},
        intent_debug,
    )

    if requests_decline and df is not None and not df.empty and profile is not None:
        decline_plane = build_decline_metric_dimension(question, df, profile)
        md["metric"] = decline_plane["metric"]
        md["dimension"] = decline_plane["dimension"]

    if multi_payload:
        md["metric"] = multi_payload["metric"]
        md["dimension"] = multi_payload["dimension"]

    intent_debug_eff = md.get("intentDebug") or intent_debug

    derived_candidate = None
    if df is not None and profile is not None:
        derived_candidate = resolve_derived_metric_candidate(
            question, df, profile, intent_debug_eff
        )

    exec_amb_bucket = None
    try:
        from intent_engine.executive_ambiguous_intent import (
            classify_executive_ambiguous_bucket,
            bucket_to_primary_goal,
        )

        exec_amb_bucket = classify_executive_ambiguous_bucket(question)
        if exec_amb_bucket and exec_amb_bucket not in tags:
            tags = [*tags, exec_amb_bucket]
    except Exception:
        exec_amb_bucket = None

    if requests_decline:
        primary_goal_seed = "decline"
    elif question_requests_driver_intent(question):
        primary_goal_seed = "driver"
    elif requests_relationship:
        primary_goal_seed = "relationship"
    elif multi_payload:
        primary_goal_seed = "multi_metric_comparison"
    elif exec_amb_bucket:
        primary_goal_seed = bucket_to_primary_goal(exec_amb_bucket)
    else:
        primary_goal_seed = _infer_primary_goal(
            question,
            ql,
            routing_bucket,
            intent_debug_eff,
            unsupported_growth_analysis,
            dual_compare,
        )

    missing_operands = (
        list(multi_payload.get("missingOperands") or []) if multi_payload else []
    )
    dimension_col = (md.get("dimension") or {}).get("columnKey")

    support = validate_analysis_support(
        question=question,
        df=df,
        profile=profile,
        primary_goal=primary_goal_seed,
        intent_debug=intent_debug_eff,
        chart_type_internal=chart_type_internal,
        chart_points=chart_points,
        time_series_analysis=time_series_analysis,
        unsupported_growth_analysis=unsupported_growth_analysis,
        dimension_column=str(dimension_col) if dimension_col else None,
        missing_metric_operands=missing_operands,
    )

    primary_goal = primary_goal_seed
    growth_support = (
        support.get("growth") if isinstance(support.get("growth"), dict) else {}
    )
    if growth_support.get("active") and primary_goal not in (
        "decline",
        "multi_metric_comparison",
        "relationship",
    ):
        primary_goal = "unsupported_analysis"
    elif (
        not support.get("supported")
        and legacy.question_requests_growth_intent(question)
        and primary_goal not in ("decline", "multi_metric_comparison", "relationship")
    ):
        primary_goal = "unsupported_analysis"

    intent_routing = routing_bucket
    if primary_goal == "multi_metric_comparison":
        intent_routing = "compare"
    elif primary_goal == "decline":
        intent_routing = "decline"
    elif primary_goal in ("relationship", "driver"):
        intent_routing = "relationship"

    flags: Dict[str, Any] = {
        "dualMetricCompare": dual_compare and primary_goal == "compare",
        "multiMetricComparison": primary_goal == "multi_metric_comparison",
        "requestsTrend": legacy.question_requests_trend_intent(question),
        "requestsGrowth": legacy.question_requests_growth_intent(question),
        "requestsDecline": question_requests_decline_intent(question),
        "requestsProfitMargin": legacy.question_requests_profit_margin(question),
        "requestsRoi": legacy.question_requests_roi(question),
        "requestsRelationship": requests_relationship,
        "requestsDriver": question_requests_driver_intent(question),
    }
    if multi_payload:
        flags["requestedMetrics"] = multi_payload.get("requestedMetrics")

    intent: Dict[str, Any] = {
        "version": INTENT_ENGINE_VERSION,
        "question": question,
        "normalizedQuestion": ql,
        "primaryGoal": primary_goal,
        "metric": md["metric"],
        "dimension": md["dimension"],
        "chart": {
            "routingBucket": intent_routing,
            "legacyRoutingBucket": routing_bucket,
            "recommendedInternalType": chart_type_internal or "bar",
        },
        "support": support,
        "derivedMetricCandidate": derived_candidate,
        "tags": tags,
        "flags": flags,
    }

    if multi_payload:
        intent["requestedMetrics"] = multi_payload.get("requestedMetrics")
        intent["requestedMetricColumns"] = multi_payload.get("requestedMetricColumns")

    _log_intent_debug(intent)
    return intent


def _log_intent_debug(intent: Dict[str, Any]) -> None:
    metric = intent.get("metric") or {}
    dimension = intent.get("dimension") or {}
    support = intent.get("support") or {}
    derived = intent.get("derivedMetricCandidate")
    derived_summary = "none"
    if derived:
        derived_summary = (
            f"{derived.get('id')}"
            f"(computable={derived.get('computable')})"
        )
    line = (
        "[intent_engine] "
        f"detected_intent={intent.get('primaryGoal')} "
        f"routing_bucket={intent.get('chart', {}).get('routingBucket')} "
        f"detected_metric={metric.get('displayLabel')} "
        f"metric_column={metric.get('columnKey')} "
        f"detected_dimension={dimension.get('displayLabel')} "
        f"dimension_column={dimension.get('columnKey')} "
        f"support_status={'supported' if support.get('supported') else 'unsupported'} "
        f"support_reasons={support.get('reasonCodes')} "
        f"derived_metric_candidate={derived_summary}"
    )
    print(line, flush=True)
    logger.debug("%s", line)
    if logger.isEnabledFor(logging.DEBUG):
        try:
            print(
                "[intent_engine] intent_payload=",
                json.dumps(intent, default=str)[:2000],
                flush=True,
            )
        except Exception:
            pass
