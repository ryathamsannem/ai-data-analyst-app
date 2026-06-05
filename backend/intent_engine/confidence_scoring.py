"""
Dynamic insight confidence — routing vs sample components with calibrated bands.
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
    dimension_redirect_handled: bool = False
    requested_dimension_missing: bool = False
    unsupported_explained: bool = False


def normalize_confidence_chart_type(chart_type: Optional[str]) -> str:
    """Map API / legacy chart type strings to internal names used by scoring."""
    c = (chart_type or "").strip().lower().replace("-", "_")
    aliases = {
        "horizontalbar": "bar_horizontal",
        "horizontal_bar": "bar_horizontal",
        "verticalbar": "bar",
        "linechart": "line",
        "areachart": "area",
    }
    return aliases.get(c, c or "bar")


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
    intent_structured: bool = False,
    analysis_kind: Optional[str] = None,
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
        kind = (analysis_kind or "").strip().lower()
        if (
            intent_structured
            and kind in ("ranking", "aggregation", "compare", "outlier")
            and 2 <= cp <= 12
            and n > 0
            and n < 100
        ):
            return (
                -2.0,
                f"Compact cohort (~{rpg:.1f} rows per group across {cp} categories)",
            )
        return -15.0, f"Sparse groups (~{rpg:.1f} rows per group)"
    if cp > 45:
        return -7.0, f"High group count ({cp}) — category signal may fragment"
    if 3 <= cp <= 24 and rpg >= 12:
        return 14.0, f"Balanced breakdown ({cp} groups, ~{rpg:.0f} rows each)"
    if rpg >= 8:
        return 9.0, f"{cp} groups with ~{rpg:.0f} rows per group on average"
    return 3.0, f"{cp} chart group(s)"


def _ranking_alignment_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    kind = (inp.analysis_kind or "").strip().lower()
    if not inp.intent_structured or kind not in (
        "ranking",
        "aggregation",
        "compare",
        "outlier",
    ):
        return 0.0, []
    n = max(0, int(inp.row_count))
    cp = max(0, int(inp.chart_point_count))
    if n <= 0 or n >= 100 or cp < 2 or cp > 12:
        return 0.0, []
    ct = normalize_confidence_chart_type(inp.chart_type)
    if ct not in ("bar", "bar_horizontal", ""):
        return 0.0, []
    return (
        14.0,
        ["Ranking question with resolved metric and breakdown columns"],
    )


def _chart_suitability_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    pts = 0.0
    reasons: List[str] = []
    kind = (inp.analysis_kind or "").strip().lower()
    ct = normalize_confidence_chart_type(inp.chart_type)

    if (
        inp.dimension_redirect_handled
        and inp.trend_request_unsatisfied
        and kind in ("ranking", "aggregation", "compare")
    ):
        pts -= 6.0
        reasons.append(
            "Time bucket from the question is unavailable; ranking uses the next valid breakdown"
        )
    elif inp.trend_request_unsatisfied:
        pts -= 32.0
        reasons.append("Trend question but time-series chart is not supported")
    if inp.growth_request_unsatisfied:
        if inp.unsupported_explained:
            pts -= 14.0
            reasons.append(
                "Growth comparison is directional only — period/methodology unavailable"
            )
        else:
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

    if kind in ("relationship_scatter", "driver") and ct in ("scatter", ""):
        pts += 10.0
        reasons.append("Relationship analysis matches correlation intent")
    elif kind == "outlier" and ct in ("bar", "bar_horizontal", ""):
        pts += 10.0
        reasons.append("Category chart matches outlier intent")
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

    if rs < 2 or inp.correlation_qualitative_only:
        pts -= 22.0
        reasons.append("Correlation could not be computed numerically")
    elif rs <= MIN_PEARSON_SAMPLE:
        pts -= 3.0
        reasons.append(
            f"Based on {rs} paired rows; directional due to small sample"
        )
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


def _pick_primary_rationale(
    reasons: List[str], inp: InsightConfidenceInput
) -> str:
    if not reasons:
        return "Confidence derived from cohort and chart evidence."
    priority = (
        "Correlation computed on",
        "Correlation based on only",
        "Fewer than two joint pairs",
        "Correlation could not be computed",
        "Sparse groups",
        "Only one chart group",
        "Trend question but",
        "Growth question without",
        "Decline question without",
        "Multi-metric compare blocked",
        "Forecast invalid",
    )
    for needle in priority:
        for r in reasons:
            if needle.lower() in r.lower():
                return r
    if inp.relationship_scatter:
        for r in reasons:
            rl = r.lower()
            if "joint pair" in rl or "scatter sample" in rl:
                return r
    return reasons[0]


def _compose_evidence_summary_line(
    score: float,
    band: str,
    reasons: List[str],
    inp: InsightConfidenceInput,
) -> str:
    n = max(0, int(inp.row_count))
    cp = max(0, int(inp.chart_point_count))
    rs = int(inp.relationship_sample_size or 0)
    rounded = int(round(score))

    if inp.relationship_scatter and rs > 0:
        if rs <= MIN_PEARSON_SAMPLE and not inp.correlation_qualitative_only:
            return (
                f"Based on {rs} paired row(s); directional due to small sample "
                f"(score {rounded}/100, {band} band; {n:,} filtered row(s))."
            )
        if rs < MIN_PEARSON_SAMPLE:
            return (
                f"Score {rounded}/100 ({band}): correlation uses {rs} joint pair(s) "
                f"from {n:,} filtered row(s) — treat coefficients as directional, not definitive."
            )
        return (
            f"Score {rounded}/100 ({band}): scatter correlation on {rs} joint pair(s) "
            f"from {n:,} filtered row(s)."
        )

    if n > 0 and n < 100:
        return (
            f"Score {rounded}/100 ({band}): small cohort ({n:,} rows, {cp} chart group(s)) — "
            "use hedged language and mention sample size once."
        )

    if cp > 0 and n > 0:
        rpg = float(n) / float(cp)
        if rpg < 3:
            return (
                f"Score {rounded}/100 ({band}): sparse groups (~{rpg:.1f} rows per group, "
                f"{cp} groups, {n:,} rows total)."
            )

    return (
        f"Score {rounded}/100 ({band}) from {len(reasons)} evidence factor(s); "
        f"{n:,} row(s), {cp} chart group(s)."
    )


def _compose_insight_confidence_rationale(
    reasons: List[str], inp: InsightConfidenceInput
) -> str:
    primary = _pick_primary_rationale(reasons, inp)
    if len(reasons) <= 1:
        return primary
    secondary = [r for r in reasons if r != primary][:2]
    if secondary:
        return f"{primary} — {'; '.join(secondary)}."
    return f"{primary} ({len(reasons)} evidence factors)."


def _routing_analysis_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    """Credit when intent, chart type, and columns align even if the sample is thin."""
    pts = 0.0
    reasons: List[str] = []
    kind = (inp.analysis_kind or "").strip().lower()
    ct = normalize_confidence_chart_type(inp.chart_type)

    if inp.intent_structured:
        pts += 14.0
        reasons.append("Routing resolved metric, breakdown, and aggregation")

    if inp.relationship_scatter and kind in ("relationship_scatter", "driver"):
        if ct in ("scatter", ""):
            pts += 12.0
            reasons.append("Scatter pairs the requested relationship metrics")
    elif kind == "outlier" and ct in ("bar", "bar_horizontal", ""):
        pts += 10.0
        reasons.append("Outlier question routed to peer category comparison")
    elif kind in ("ranking", "compare", "aggregation") and ct in (
        "bar",
        "bar_horizontal",
        "histogram",
        "pie",
        "donut",
        "",
    ):
        pts += 8.0
        reasons.append("Ranking/compare intent matches categorical chart")

    if inp.unsupported_explained and inp.growth_request_unsatisfied:
        pts += 16.0
        reasons.append(
            "Unsupported growth guard explains missing period/baseline — routing is transparent"
        )

    return pts, reasons


def _sample_evidence_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    """Sample-size and statistical-support evidence (separate from routing)."""
    pts = 0.0
    reasons: List[str] = []
    n = max(0, int(inp.row_count))
    cp = max(0, int(inp.chart_point_count))

    if n > 0 and n < 100:
        pts -= 6.0
        reasons.append(f"Small filtered cohort ({n:,} row(s))")
    if cp > 0 and n > 0:
        rpg = float(n) / float(cp)
        if rpg < 3 and not inp.relationship_scatter:
            pts -= 5.0
            reasons.append(f"Sparse groups (~{rpg:.1f} rows per chart group)")

    if inp.relationship_scatter:
        rs = int(inp.relationship_sample_size or 0)
        if rs >= 2 and rs <= MIN_PEARSON_SAMPLE and not inp.correlation_qualitative_only:
            pts -= 4.0
            reasons.append(
                f"Based on {rs} paired rows; directional due to small sample"
            )

    return pts, reasons


def _calibrate_confidence_score(
    score: float,
    inp: InsightConfidenceInput,
    *,
    routing_pts: float,
    sample_pts: float,
) -> float:
    """Apply scenario floors so well-routed thin samples are not scored near zero."""
    kind = (inp.analysis_kind or "").strip().lower()
    rs = int(inp.relationship_sample_size or 0)
    n = max(0, int(inp.row_count))
    cp = max(0, int(inp.chart_point_count))

    if (
        inp.relationship_scatter
        and inp.intent_structured
        and rs >= 2
        and not inp.correlation_qualitative_only
    ):
        blended = 0.58 * routing_pts + 0.42 * max(35.0, 100.0 + sample_pts)
        if rs <= MIN_PEARSON_SAMPLE:
            return max(45.0, min(65.0, max(score, blended)))
        return max(score, min(72.0, blended))

    if (
        inp.dimension_redirect_handled
        and inp.requested_dimension_missing
        and cp >= 2
        and inp.intent_structured
    ):
        blended = 0.52 * routing_pts + 0.48 * max(42.0, 100.0 + sample_pts)
        return max(55.0, min(69.0, max(score, blended)))

    if (
        kind in ("outlier", "ranking", "compare")
        and inp.intent_structured
        and 2 <= cp <= 12
        and n > 0
        and n < 100
    ):
        blended = 0.55 * routing_pts + 0.45 * max(38.0, 100.0 + sample_pts)
        return max(45.0, min(60.0, max(score, blended)))

    if inp.growth_request_unsatisfied and inp.unsupported_explained:
        blended = 0.5 * routing_pts + 0.5 * max(28.0, 100.0 + sample_pts)
        return max(30.0, min(41.0, max(score, blended)))

    return score


def _dimension_redirect_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    if not inp.dimension_redirect_handled:
        return 0.0, []
    pts = 18.0
    reasons = [
        "Requested breakdown is unavailable in the dataset; closest valid ranking is shown with explanation"
    ]
    if inp.requested_dimension_missing:
        pts += 4.0
    return pts, reasons


def _inference_quality_points(inp: InsightConfidenceInput) -> Tuple[float, List[str]]:
    pts = 0.0
    reasons: List[str] = []
    if inp.dimension_redirect_handled:
        if inp.partial_visualization_warning:
            pts -= 4.0
            reasons.append(
                "Closest alternative breakdown shown (requested dimension unavailable)"
            )
        if inp.alignment_repaired:
            pts -= 3.0
            reasons.append("Chart adjusted to match available columns")
        return pts, reasons
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
        intent_structured=inp.intent_structured,
        analysis_kind=inp.analysis_kind,
    )
    score += g_pts
    if g_msg:
        reasons.append(g_msg)

    r_pts, r_reasons = _ranking_alignment_points(inp)
    score += r_pts
    reasons.extend(r_reasons)

    r_dr_pts, r_dr_reasons = _dimension_redirect_points(inp)
    score += r_dr_pts
    reasons.extend(r_dr_reasons)

    routing_pts, routing_reasons = _routing_analysis_points(inp)
    score += routing_pts
    reasons.extend(routing_reasons)

    sample_pts, sample_reasons = _sample_evidence_points(inp)
    score += sample_pts
    reasons.extend(sample_reasons)

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
    score = _calibrate_confidence_score(
        score,
        inp,
        routing_pts=routing_pts,
        sample_pts=sample_pts,
    )
    score = min(100.0, max(0.0, score))
    band = _band_from_score(score)
    rounded = int(round(score))
    routing_score = int(round(min(100.0, max(0.0, routing_pts))))
    sample_score = int(round(min(100.0, max(0.0, 55.0 + sample_pts))))

    return {
        "score": rounded,
        "band": band,
        "reasons": reasons,
        "routingConfidenceScore": routing_score,
        "sampleConfidenceScore": sample_score,
        "insightConfidenceScore": rounded,
        "insightConfidenceLevel": band,
        "insightConfidenceRationale": _compose_insight_confidence_rationale(
            reasons, inp
        ),
        "insightConfidenceReasons": reasons,
        "analysisRowCount": max(0, int(inp.row_count)),
        "chartSeriesPointCount": max(0, int(inp.chart_point_count)),
        "smallSampleCohort": inp.row_count > 0 and inp.row_count < 100,
        "cautiousNarrativeRequired": (
            band == "low"
            and not inp.dimension_redirect_handled
        )
        or inp.forecast_projection_low
        or (
            inp.trend_request_unsatisfied
            and not inp.dimension_redirect_handled
        )
        or inp.growth_request_unsatisfied
        or inp.decline_request_unsatisfied
        or inp.multi_metric_request_unsatisfied
        or (inp.mapping_confidence or "").lower() == "low"
        or (
            inp.relationship_scatter
            and int(inp.relationship_sample_size or 0) < MIN_PEARSON_SAMPLE
        ),
        "mappingConfidenceLevel": (inp.mapping_confidence or "").strip().lower() or None,
        "evidenceSummaryLine": _compose_evidence_summary_line(
            score, band, reasons, inp
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
    dimension_redirect_handled: bool = False,
    requested_dimension_missing: bool = False,
    unsupported_explained: bool = False,
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
            dimension_redirect_handled=dimension_redirect_handled,
            requested_dimension_missing=requested_dimension_missing,
            unsupported_explained=unsupported_explained,
        )
    )
