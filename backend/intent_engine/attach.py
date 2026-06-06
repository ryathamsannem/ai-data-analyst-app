"""Attach analysis.intent to unified analysis payload (additive only)."""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

import pandas as pd

from intent_engine.resolve_analysis_intent import resolve_analysis_intent


def enrich_analysis_with_intent(
    analysis: Dict[str, Any],
    *,
    question: str,
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
    intent_debug: Optional[Dict[str, Any]] = None,
    chart_type_internal: Optional[str] = None,
    chart_points: int = 0,
    time_series_analysis: Optional[Dict[str, Any]] = None,
    unsupported_growth_analysis: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Mutates analysis in place by adding ``intent`` when enabled.
    Never raises — failures are logged and omitted from payload.
    """
    if os.environ.get("INTENT_ENGINE_DISABLE", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        return analysis

    try:
        ct = chart_type_internal or analysis.get("chartTypeInternal") or "bar"
        ug = unsupported_growth_analysis
        if ug is None and analysis.get("unsupportedGrowthAnalysis"):
            ug = analysis.get("unsupportedGrowthAnalysis")

        intent = resolve_analysis_intent(
            question=question,
            df=df,
            profile=profile,
            intent_debug=intent_debug,
            chart_type_internal=str(ct),
            chart_points=int(chart_points or analysis.get("chartPointCount") or 0),
            time_series_analysis=time_series_analysis,
            unsupported_growth_analysis=ug if isinstance(ug, dict) else None,
        )
        analysis["intent"] = intent
        support = intent.get("support") or {}
        metric = intent.get("metric") or {}
        dimension = intent.get("dimension") or {}
        derived = intent.get("derivedMetricCandidate")
        reason_codes = support.get("reasonCodes") or []
        print(
            "[intent_engine][validate] "
            f"question={question!r} "
            f"primaryGoal={intent.get('primaryGoal')} "
            f"metric={metric.get('displayLabel')}({metric.get('columnKey')}) "
            f"dimension={dimension.get('displayLabel')}({dimension.get('columnKey')}) "
            f"support.supported={support.get('supported')} "
            f"support.reason={reason_codes} "
            f"derivedMetricCandidate={derived.get('id') if isinstance(derived, dict) else None}",
            flush=True,
        )
    except Exception as exc:
        print(
            "[intent_engine] enrich_analysis_with_intent failed:",
            type(exc).__name__,
            str(exc)[:500],
            flush=True,
        )
    return analysis
