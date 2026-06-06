"""
Routing consistency validation — defensive checks against RoutingPlan vs rendered artifacts.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set

from intent_engine.routing_plan import (
    RoutingPlan,
    build_routing_plan_from_analysis,
    merge_visualization_into_plan,
)

logger = logging.getLogger("intent_engine.routing")

_BAR_FAMILY = frozenset({"bar", "horizontalbar", "horizontalBar"})


def _norm_col(name: Optional[str]) -> str:
    return str(name or "").strip().lower().replace("_", " ")


def _chart_type_norm(ct: Optional[str]) -> str:
    t = str(ct or "bar").strip()
    if t.lower() == "horizontalbar":
        return "horizontalBar"
    return t


def _selection_matches_chart_type(reason: str, chart_type: str) -> bool:
    r = reason.lower()
    ct = _chart_type_norm(chart_type).lower()
    if ct in ("horizontalbar",):
        return "horizontal" in r
    if ct == "bar":
        if "horizontal" in r and "vertical" not in r:
            return False
        return "vertical" in r or "bar chart" in r or "side-by-side" in r
    if ct == "line":
        return "line" in r
    if ct == "scatter":
        return "scatter" in r
    if ct == "histogram":
        return "histogram" in r or "bin" in r
    return True


def validate_routing_consistency(
    plan: RoutingPlan,
    analysis: Dict[str, Any],
    visualization: Optional[Dict[str, Any]],
) -> List[str]:
    """Return human-readable warnings when plan and rendered artifacts diverge."""
    warnings: List[str] = []

    if not visualization:
        return warnings

    labels = visualization.get("labels") or []
    has_points = isinstance(labels, list) and len(labels) > 0

    prov = visualization.get("provenance") if isinstance(visualization.get("provenance"), dict) else {}
    viz_metric = _norm_col(prov.get("numericColumn") or analysis.get("metricColumn"))
    plan_metric = _norm_col(plan.metricColumn)
    if has_points and plan_metric and viz_metric and plan_metric != viz_metric:
        if not (plan_metric in viz_metric or viz_metric in plan_metric):
            warnings.append(
                f"Metric mismatch: RoutingPlan.metricColumn={plan.metricColumn!r} "
                f"vs visualization provenance numericColumn={prov.get('numericColumn')!r}."
            )

    viz_dim = _norm_col(prov.get("categoryColumn") or analysis.get("categoryColumn"))
    plan_dim = _norm_col(plan.dimensionColumn)
    if has_points and plan_dim and viz_dim and plan_dim != viz_dim:
        if not (plan_dim in viz_dim or viz_dim in plan_dim):
            warnings.append(
                f"Dimension mismatch: RoutingPlan.dimensionColumn={plan.dimensionColumn!r} "
                f"vs visualization provenance categoryColumn={prov.get('categoryColumn')!r}."
            )

    rendered_type = _chart_type_norm(visualization.get("chartType"))
    plan_type = _chart_type_norm(plan.chartType)
    if rendered_type and plan_type and rendered_type.lower() != plan_type.lower():
        warnings.append(
            f"Chart type mismatch: RoutingPlan.chartType={plan.chartType!r} "
            f"vs visualization.chartType={visualization.get('chartType')!r}."
        )

    reason = (plan.chartSelectionReason or "").strip()
    if reason and rendered_type and rendered_type in _BAR_FAMILY | {"bar", "line", "scatter", "histogram"}:
        if not _selection_matches_chart_type(reason, rendered_type):
            warnings.append(
                f"Chart selection copy may not match rendered chart type "
                f"({rendered_type}): {reason[:120]!r}."
            )

    if plan.intent == "profitability" and has_points and plan_metric:
        if "profit" not in plan_metric and "margin" not in plan_metric:
            warnings.append(
                "Profitability intent but RoutingPlan metric is not profit/margin — "
                "risk of misleading revenue ranking."
            )

    ranked = visualization.get("rankedExecutiveInsights") or analysis.get("rankedExecutiveInsights")
    if isinstance(ranked, list) and plan_metric:
        allowed_metrics: Set[str] = {plan_metric}
        if plan.metricDisplay:
            allowed_metrics.add(_norm_col(plan.metricDisplay))
        for card in ranked[:6]:
            if not isinstance(card, dict):
                continue
            narrative = str(card.get("narrativeLine") or card.get("hint") or "").lower()
            if plan.intent == "profitability" and "revenue ranking" in narrative:
                warnings.append("Executive card narrative may describe revenue ranking as loss analysis.")

    return warnings


def _allowed_metrics_from_plan(plan: RoutingPlan, analysis: Dict[str, Any]) -> Set[str]:
    allowed: Set[str] = set()
    for raw in (plan.metricColumn, plan.metricDisplay, analysis.get("metricColumn"), analysis.get("metricColumnDisplay")):
        n = _norm_col(raw)
        if n:
            allowed.add(n)
    return allowed


def validate_kpi_cards_against_plan(
    plan: RoutingPlan,
    analysis: Dict[str, Any],
) -> List[str]:
    warnings: List[str] = []
    allowed = _allowed_metrics_from_plan(plan, analysis)
    if not allowed:
        return warnings
    for kpi in analysis.get("focusKpis") or []:
        if not isinstance(kpi, dict):
            continue
        blob = f"{kpi.get('title', '')} {kpi.get('subtitle', '')}".lower()
        if "revenue" in blob and plan.intent == "profitability" and "profit" not in allowed:
            warnings.append("KPI card mentions revenue under profitability routing.")
    return warnings


def attach_routing_backbone(
    *,
    question: str,
    analysis: Dict[str, Any],
    visualization: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Build RoutingPlan, validate consistency, attach to analysis payload.
    Mutates analysis in place and returns it.
    """
    plan = build_routing_plan_from_analysis(analysis, question=question)
    if visualization:
        plan = merge_visualization_into_plan(plan, visualization)

    warnings = validate_routing_consistency(plan, analysis, visualization)
    warnings.extend(validate_kpi_cards_against_plan(plan, analysis))

    analysis["routingPlan"] = plan.to_dict()
    if warnings:
        analysis["routingConsistencyWarnings"] = warnings
        for w in warnings:
            logger.warning("[routing_consistency] %s — question=%r", w, question[:120])
        severe = any(
            k in w.lower()
            for w in warnings
            for k in ("metric mismatch", "dimension mismatch", "profitability intent")
        )
        if severe:
            prev = str(analysis.get("partialVisualizationWarning") or "").strip()
            safe = (
                "Routing consistency check detected a metric/dimension mismatch. "
                "Treat chart and cards as directional only; verify field mapping."
            )
            analysis["partialVisualizationWarning"] = (
                f"{prev} {safe}".strip() if prev else safe
            )

    return analysis
