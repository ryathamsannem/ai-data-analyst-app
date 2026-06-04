"""
Dynamic insight confidence — component model (no fixed score floors).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from intent_engine.correlation_analysis import MIN_PEARSON_SAMPLE, pearson_sample_adequate

# Band boundaries applied to the summed component score (not fixed output scores).
_BAND_HIGH = 70.0
_BAND_MEDIUM = 42.0


@dataclass
class InsightConfidenceInput:
    """Evidence inputs for confidence — all optional beyond row/chart counts."""

    row_count: int = 0
    chart_point_count: int = 0
    mapping_confidence: Optional[str] = None
    analysis_kind: Optional[str] = None
    chart_type: Optional[str] = None
    intent_structured: bool = False
    dual_metric_compare: bool = False
    dual_metric_complete: bool = True
    trend_request_unsatisfied: bool = False
    growth_request_unsatisfied: bool = False
    decline_request_unsatisfied: bool = False
    multi_metric_request_unsatisfied: bool = False
    relationship_scatter: bool = False
    relationship_sample_size: Optional[int] = None
    correlation_qualitative_only: bool = False
    forecast_projection_low: bool = False
    forecast_can_forecast: Optional[bool] = None
    alignment_repaired: bool = False
    partial_visualization_warning: bool = False


def _band_from_score(score: float) -> str:
    if score >= _BAND_HIGH:
        return "high"
    if score >= _BAND_MEDIUM:
        return "medium"
    return "low"


def _mapping_points(map_conf: Optional[str]) -> Tuple[float, Optional[str]]:
    m = (map_conf or "").strip().lower()
    if m == "high":
        return 14.0, "Column mapping is high confidence"
    if m == "medium":
        return 8.0, "Column mapping is medium confidence"
    if m == "low":
        return -6.0, "Column mapping is low confidence"
    return 0.0, None


def _row_count_points(n: int) -> Tuple[float, Optional[str]]:
    if n <= 0:
        return 0.0, "No filtered rows in cohort"
    pts = min(30.0, 6.5 * math.log10(max(1.0, float(n))))
    return pts, f"Cohort size: {n:,} row(s)"


def _group_points(
    cp: int,
    n: int,
    *,
    relationship_scatter: bool = False,
    relationship_sample_size: int = 0,
) -> Tuple[float, Optional[str]]:
    if relationship_scatter:
        rs = int(relationship_sample_size or cp or 0)
        if rs < 2:
            return -12.0, "Fewer than two joint pairs for correlation"
        if rs < MIN_PEARSON_SAMPLE:
            return 4.0, f"Row-level scatter sample ({rs} joint pairs)"
        return 10.0, f"Row-level scatter sample ({rs} joint pairs)"
    if cp <= 0:
        return -12.0, "Chart has no comparison groups"
    if cp == 1:
        return -9.0, "Only one chart group — limited comparative context"
    rpg = float(n) / float(cp) if cp else 0.0
    if rpg < 3:
        return -15.0, f"Sparse groups (~{rpg:.1f} rows per group)"
    if cp > 45:
        return -7.0, f"High group count ({cp}) — category signal may fragment"
    if 3 <= cp <= 24 and rpg >= 12:
        return 14.0, f"Balanced breakdown ({cp} groups, ~{rpg:.0f} rows each)"
    if rpg >= 8:
        return 9.0, f"{cp} groups with ~{rpg:.0f} rows per group on average"
    return 3.0, f"{cp} chart group(s)"


def _chart_suitability_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    pts = 0.0
    reasons: List[str] = []
    kind = (inp.analysis_kind or "").strip().lower()
    ct = (inp.chart_type or "").strip().lower()

    if inp.trend_request_unsatisfied:
        pts -= 32.0
        reasons.append("Trend question but time-series chart is not supported")
    if inp.growth_request_unsatisfied:
        pts -= 32.0
        reasons.append("Growth question without multi-period evidence")
    if inp.decline_request_unsatisfied:
        pts -= 32.0
        reasons.append("Decline question without multi-period evidence")
    if inp.multi_metric_request_unsatisfied:
        pts -= 34.0
        reasons.append("Multi-metric compare blocked by missing columns")

    if inp.dual_metric_compare and inp.dual_metric_complete and inp.chart_point_count >= 2:
        pts += 10.0
        reasons.append("Grouped dual-metric chart matches compare intent")
    elif inp.dual_metric_compare and not inp.dual_metric_complete:
        pts -= 14.0
        reasons.append("Dual-metric compare is incomplete in the chart")

    if kind == "relationship_scatter" and ct in ("scatter", ""):
        pts += 10.0
        reasons.append("Relationship analysis matches correlation intent")
    elif kind == "trend" and ct in ("line", "area") and not inp.trend_request_unsatisfied:
        pts += 10.0
        reasons.append("Time-series chart matches trend intent")
    elif kind in ("aggregation", "ranking", "compare", "distribution") and ct in (
        "bar",
        "bar_horizontal",
        "histogram",
        "pie",
        "donut",
    ):
        pts += 6.0
        reasons.append("Categorical chart fits aggregation/ranking intent")
    elif kind == "aggregation" and ct == "scatter":
        pts -= 8.0
        reasons.append("Scatter chart may not match simple aggregation intent")

    if inp.chart_point_count < 2 and inp.row_count >= 10:
        pts -= 10.0
        reasons.append("Fewer than two chart points for a breakdown answer")

    return pts, reasons


def _metric_quality_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    pts = 0.0
    reasons: List[str] = []
    m_pts, m_reason = _mapping_points(inp.mapping_confidence)
    pts += m_pts
    if m_reason:
        reasons.append(m_reason)

    if inp.intent_structured:
        pts += 11.0
        reasons.append("Metric, breakdown, and aggregation resolved structurally")
    elif inp.row_count >= 20:
        pts -= 8.0
        reasons.append("Metric or breakdown not fully structured")

    return pts, reasons


def _statistical_support_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    pts = 0.0
    reasons: List[str] = []
    if not inp.relationship_scatter:
        return pts, reasons

    if inp.intent_structured and not inp.correlation_qualitative_only:
        pts += 8.0
        reasons.append("Pearson/Spearman coefficients computed for the requested pair")

    rs = int(inp.relationship_sample_size or 0)
    n = max(0, int(inp.row_count))

    if inp.correlation_qualitative_only or rs < 2:
        pts -= 22.0
        reasons.append("Correlation could not be computed numerically")
    elif rs < MIN_PEARSON_SAMPLE:
        pts -= 12.0
        reasons.append(f"Correlation based on only {rs} joint pair(s)")
    elif rs < 30:
        pts += 4.0
        reasons.append(f"Moderate scatter sample ({rs} joint pairs)")
    else:
        pts += 12.0
        reasons.append(f"Strong scatter sample ({rs} joint pairs)")

    if pearson_sample_adequate(rs) and n >= max(rs * 3, 50):
        pts += 6.0
        reasons.append("Joint sample adequate for Pearson/Spearman read")

    return pts, reasons


def _forecast_validity_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    pts = 0.0
    reasons: List[str] = []
    if inp.forecast_projection_low:
        pts -= 24.0
        reasons.append("Forecast invalid — scenario/projection only")
    elif inp.forecast_can_forecast is True:
        pts += 6.0
        reasons.append("Multi-period time series supports forecasting")
    return pts, reasons


def _inference_quality_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    pts = 0.0
    reasons: List[str] = []
    if inp.alignment_repaired:
        pts -= 10.0
        reasons.append("Chart/text alignment was repaired")
    if inp.partial_visualization_warning:
        pts -= 12.0
        reasons.append("Partial visualization warning applies")
    return pts, reasons


def calculate_insight_confidence(
    inp: InsightConfidenceInput,
) -> Dict[str, Any]:
    """
    Sum evidence components into a 0–100 score and band.

    Returns: score, band, reasons (list), plus legacy API field names.
    """
    reasons: List[str] = []
    score = 0.0

    r_pts, r_msg = _row_count_points(inp.row_count)
    score += r_pts
    if r_msg:
        reasons.append(r_msg)

    g_pts, g_msg = _group_points(
        inp.chart_point_count,
        inp.row_count,
        relationship_scatter=inp.relationship_scatter,
        relationship_sample_size=int(inp.relationship_sample_size or 0),
    )
    score += g_pts
    if g_msg:
        reasons.append(g_msg)

    for block in (
        _metric_quality_points,
        _chart_suitability_points,
        _statistical_support_points,
        _forecast_validity_points,
        _inference_quality_points,
    ):
        b_pts, b_reasons = block(inp)
        score += b_pts
        reasons.extend(b_reasons)

    score = min(100.0, max(0.0, score))
    band = _band_from_score(score)
    primary = reasons[0] if reasons else "Confidence derived from cohort and chart evidence."

    return {
        "score": int(round(score)),
        "band": band,
        "reasons": reasons,
        "insightConfidenceScore": int(round(score)),
        "insightConfidenceLevel": band,
        "insightConfidenceRationale": primary if len(reasons) <= 1 else f"{primary} ({len(reasons)} factors).",
        "insightConfidenceReasons": reasons,
        "analysisRowCount": max(0, int(inp.row_count)),
        "chartSeriesPointCount": max(0, int(inp.chart_point_count)),
        "smallSampleCohort": inp.row_count > 0 and inp.row_count < 100,
        "cautiousNarrativeRequired": band == "low"
        or inp.forecast_projection_low
        or inp.growth_request_unsatisfied
        or inp.trend_request_unsatisfied
        or inp.decline_request_unsatisfied
        or inp.multi_metric_request_unsatisfied
        or (inp.mapping_confidence or "").lower() == "low"
        or (inp.relationship_scatter and int(inp.relationship_sample_size or 0) < MIN_PEARSON_SAMPLE),
        "mappingConfidenceLevel": (inp.mapping_confidence or "").strip().lower() or None,
        "evidenceSummaryLine": (
            f"Score {int(round(score))}/100 ({band}) from {len(reasons)} evidence factor(s); "
            f"{inp.row_count:,} row(s), {inp.chart_point_count} chart point(s)."
        ),
    }


# CamelCase alias for API / product docs
calculateInsightConfidence = calculate_insight_confidence


def compute_insight_confidence_meta(
    n_rows: int,
    chart_pts: int,
    mapping_confidence: Optional[str] = None,
    *,
    dual_metric_compare: bool = False,
    dual_metric_complete: bool = True,
    trend_request_unsatisfied: bool = False,
    growth_request_unsatisfied: bool = False,
    decline_request_unsatisfied: bool = False,
    multi_metric_request_unsatisfied: bool = False,
    relationship_scatter: bool = False,
    relationship_sample_size: Optional[int] = None,
    correlation_qualitative_only: bool = False,
    forecast_projection_low: bool = False,
    forecast_can_forecast: Optional[bool] = None,
    analysis_kind: Optional[str] = None,
    chart_type: Optional[str] = None,
    intent_structured: bool = False,
    alignment_repaired: bool = False,
    partial_visualization_warning: bool = False,
) -> Dict[str, Any]:
    """Backward-compatible wrapper around calculate_insight_confidence."""
    return calculate_insight_confidence(
        InsightConfidenceInput(
            row_count=max(0, int(n_rows)),
            chart_point_count=max(0, int(chart_pts)),
            mapping_confidence=mapping_confidence,
            analysis_kind=analysis_kind,
            chart_type=chart_type,
            intent_structured=intent_structured,
            dual_metric_compare=dual_metric_compare,
            dual_metric_complete=dual_metric_complete,
            trend_request_unsatisfied=trend_request_unsatisfied,
            growth_request_unsatisfied=growth_request_unsatisfied,
            decline_request_unsatisfied=decline_request_unsatisfied,
            multi_metric_request_unsatisfied=multi_metric_request_unsatisfied,
            relationship_scatter=relationship_scatter,
            relationship_sample_size=relationship_sample_size,
            correlation_qualitative_only=correlation_qualitative_only,
            forecast_projection_low=forecast_projection_low,
            forecast_can_forecast=forecast_can_forecast,
            alignment_repaired=alignment_repaired,
            partial_visualization_warning=partial_visualization_warning,
        )
    )
