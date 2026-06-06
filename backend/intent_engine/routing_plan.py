"""
RoutingPlan — single source of truth for AI Insights routing decisions (Phase A backbone).

Collects final decisions from existing pipeline output; does not replace routing logic.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class RoutingPlan:
    intent: str
    executiveLens: Optional[str] = None
    metricColumn: Optional[str] = None
    metricDisplay: Optional[str] = None
    dimensionColumn: Optional[str] = None
    dimensionDisplay: Optional[str] = None
    aggregation: Optional[str] = None
    aggregationKey: Optional[str] = None
    chartType: Optional[str] = None
    chartTypeInternal: Optional[str] = None
    chartSelectionReason: Optional[str] = None
    confidence: Optional[float] = None
    capabilityNotes: List[str] = field(default_factory=list)
    unsupportedReason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        return {k: v for k, v in d.items() if v is not None and v != []}


def normalize_routing_intent(
    *,
    primary_goal: Optional[str],
    executive_lens: Optional[str],
    executive_bucket: Optional[str],
    detected_intent_tags: Optional[List[str]] = None,
) -> Tuple[str, Optional[str]]:
    """Map legacy primaryGoal / lens fields to canonical intent + executiveLens."""
    pg = (primary_goal or "").strip().lower()
    lens = (executive_lens or "").strip().lower() or None
    bucket = (executive_bucket or "").strip().lower()

    bucket_map: Dict[str, Tuple[str, Optional[str]]] = {
        "executive_strategy": ("executive", "strategy"),
        "executive_risk": ("executive", "risk"),
        "executive_opportunity": ("executive", "opportunity"),
        "executive_outlier_standout": ("outlier", "standout"),
        "loss_profitability": ("profitability", None),
    }
    if pg in bucket_map:
        return bucket_map[pg]
    if bucket:
        if bucket.startswith("executive_"):
            sub = bucket.replace("executive_", "", 1)
            lens_map = {
                "strategy": "strategy",
                "risk": "risk",
                "opportunity": "opportunity",
                "loss_profitability": None,
                "outlier_standout": "standout",
            }
            if sub == "loss_profitability":
                return ("profitability", None)
            if sub == "outlier_standout":
                return ("outlier", "standout")
            return ("executive", lens_map.get(sub, lens))
    if pg in ("driver", "relationship"):
        return ("relationship", None)
    if lens == "summary":
        return ("summary", None)
    if lens == "driver":
        return ("relationship", None)
    if lens == "explain":
        return ("executive", lens)
    if lens in ("strategy", "risk", "opportunity", "loss", "standout"):
        if lens == "loss":
            return ("profitability", None)
        return ("executive", lens)

    goal_map: Dict[str, Tuple[str, Optional[str]]] = {
        "compare": ("compare", None),
        "trend": ("trend", None),
        "relationship": ("relationship", None),
        "driver": ("relationship", None),
        "rank": ("ranking", None),
        "ranking": ("ranking", None),
        "outlier": ("outlier", lens or "standout"),
        "distribution": ("ranking", None),
        "kpi": ("fallback", None),
        "summary": ("summary", None),
        "derived_metric": ("compare", None),
        "multi_metric_comparison": ("compare", None),
        "decline": ("trend", None),
        "unsupported_analysis": ("fallback", None),
    }
    if pg in goal_map:
        intent, default_lens = goal_map[pg]
        return intent, lens or default_lens

    tags = [str(t).lower() for t in (detected_intent_tags or [])]
    if "trend" in tags:
        return ("trend", lens)
    if "compare" in tags:
        return ("compare", lens)

    return ("fallback", lens)


def _first_nonempty(*values: Optional[str]) -> Optional[str]:
    for v in values:
        if v and str(v).strip():
            return str(v).strip()
    return None


def _norm_token(value: Optional[str]) -> str:
    return str(value or "").strip().lower().replace("_", " ")


def _singularize_token(token: str) -> str:
    t = _norm_token(token)
    if t.endswith("ies") and len(t) > 4:
        return t[:-3] + "y"
    if t.endswith("s") and not t.endswith("ss") and len(t) > 3:
        return t[:-1]
    return t


def _tokens_align(missing: str, resolved: str) -> bool:
    a = _singularize_token(missing)
    b = _singularize_token(resolved)
    if not a or not b:
        return False
    return a == b or a in b or b in a


def _missing_dimension_requires_fallback(
    analysis: Dict[str, Any],
    *,
    resolved_dimension: Optional[str],
) -> bool:
    """True when a missing requested dimension cannot be answered by the resolved axis."""
    if not analysis.get("requestedDimensionMissing"):
        return False
    resolved = _norm_token(resolved_dimension)
    if not resolved:
        return True

    warn = str(analysis.get("partialVisualizationWarning") or "")
    match = re.search(r"no '([^']+)' column", warn, re.I)
    if match:
        missing = match.group(1)
        if _tokens_align(missing, resolved):
            return False

    intent_obj = analysis.get("intent")
    if isinstance(intent_obj, dict):
        dim_obj = intent_obj.get("dimension") or {}
        requested = _first_nonempty(
            dim_obj.get("requestedPhrase"),
            dim_obj.get("requestedLabel"),
            intent_obj.get("questionFocusPhrase"),
        )
        if requested and _tokens_align(requested, resolved):
            return False

    return True


def _collect_capability_notes(analysis: Dict[str, Any]) -> List[str]:
    notes: List[str] = []
    lpc = analysis.get("lossProfitabilityContext")
    if isinstance(lpc, dict):
        block = str(lpc.get("exactBlock") or "").strip()
        if block:
            for line in block.splitlines()[:4]:
                ls = line.strip().lstrip("- ").strip()
                if ls:
                    notes.append(ls)
    intent_obj = analysis.get("intent")
    if isinstance(intent_obj, dict):
        support = intent_obj.get("support") or {}
        for code in support.get("reasonCodes") or []:
            cs = str(code).strip()
            if cs and cs not in notes:
                notes.append(cs)
    if analysis.get("profitMarginUnavailable"):
        notes.append("Profit margin requested but not computable from schema.")
    if analysis.get("requestedDimensionMissing"):
        notes.append("Requested breakdown dimension not found in dataset.")
    return notes[:8]


def _resolve_unsupported_reason(analysis: Dict[str, Any]) -> Optional[str]:
    for key in (
        "partialVisualizationWarning",
        "unsupportedGrowthAnalysis",
        "unsupportedTrendAnalysis",
        "unsupportedDeclineAnalysis",
        "unsupportedMultiMetricAnalysis",
    ):
        raw = analysis.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
        if isinstance(raw, dict) and raw.get("active"):
            for sub in ("leadSentence", "reasonCode", "message", "reliabilityMessage"):
                msg = str(raw.get(sub) or "").strip()
                if msg:
                    return msg
    intent_obj = analysis.get("intent")
    if isinstance(intent_obj, dict):
        support = intent_obj.get("support") or {}
        if support.get("supported") is False:
            codes = support.get("reasonCodes") or []
            if codes:
                return str(codes[0])
    return None


def build_routing_plan_from_analysis(
    analysis: Dict[str, Any],
    *,
    question: str = "",
) -> RoutingPlan:
    """Assemble RoutingPlan from unified analysis payload (post-pipeline)."""
    intent_obj = analysis.get("intent") if isinstance(analysis.get("intent"), dict) else {}
    primary_goal = intent_obj.get("primaryGoal") if intent_obj else None
    if not primary_goal:
        chart_rec = analysis.get("chartRecommendation")
        if isinstance(chart_rec, dict):
            primary_goal = chart_rec.get("detectedIntent")

    exec_lens = _first_nonempty(
        analysis.get("executiveLens"),
        (analysis.get("intent") or {}).get("executiveLens") if isinstance(analysis.get("intent"), dict) else None,
    )
    exec_bucket = analysis.get("executiveAmbiguousBucket")

    intent, lens = normalize_routing_intent(
        primary_goal=str(primary_goal) if primary_goal else None,
        executive_lens=exec_lens,
        executive_bucket=str(exec_bucket) if exec_bucket else None,
        detected_intent_tags=analysis.get("detectedIntent")
        if isinstance(analysis.get("detectedIntent"), list)
        else None,
    )

    metric = analysis.get("metricColumn")
    metric_disp = analysis.get("metricColumnDisplay")
    dim = analysis.get("categoryColumn")
    dim_disp = analysis.get("categoryColumnDisplay")

    if intent_obj:
        m_obj = intent_obj.get("metric") or {}
        d_obj = intent_obj.get("dimension") or {}
        metric = _first_nonempty(metric, m_obj.get("columnKey"))
        metric_disp = _first_nonempty(metric_disp, m_obj.get("displayLabel"))
        dim = _first_nonempty(dim, d_obj.get("columnKey"))
        dim_disp = _first_nonempty(dim_disp, d_obj.get("displayLabel"))

    chart_rec = analysis.get("chartRecommendation")
    selection_reason = None
    if isinstance(chart_rec, dict):
        selection_reason = str(chart_rec.get("selectionExplanation") or "").strip() or None

    score_raw = analysis.get("insightConfidenceScore")
    confidence: Optional[float] = None
    try:
        if score_raw is not None:
            confidence = round(float(score_raw) / 100.0, 3)
    except (TypeError, ValueError):
        confidence = None

    unsupported = _resolve_unsupported_reason(analysis)
    hard_dim_fallback = _missing_dimension_requires_fallback(
        analysis,
        resolved_dimension=str(dim) if dim else None,
    )
    if hard_dim_fallback:
        intent = "fallback"
        if not unsupported:
            unsupported = "Requested breakdown dimension not found in dataset."
    elif unsupported and intent == "fallback":
        pass
    elif unsupported and not analysis.get("chartPointCount"):
        intent = "fallback"

    return RoutingPlan(
        intent=intent,
        executiveLens=lens,
        metricColumn=str(metric) if metric else None,
        metricDisplay=str(metric_disp) if metric_disp else None,
        dimensionColumn=str(dim) if dim else None,
        dimensionDisplay=str(dim_disp) if dim_disp else None,
        aggregation=analysis.get("aggregation"),
        aggregationKey=analysis.get("aggregationKey"),
        chartType=analysis.get("chartType"),
        chartTypeInternal=analysis.get("chartTypeInternal"),
        chartSelectionReason=selection_reason,
        confidence=confidence,
        capabilityNotes=_collect_capability_notes(analysis),
        unsupportedReason=unsupported,
    )


def merge_visualization_into_plan(
    plan: RoutingPlan,
    visualization: Dict[str, Any],
) -> RoutingPlan:
    """Prefer rendered visualization fields when present."""
    prov = visualization.get("provenance") if isinstance(visualization.get("provenance"), dict) else {}
    chart_rec = visualization.get("chartRecommendation")
    if isinstance(chart_rec, dict):
        sel = str(chart_rec.get("selectionExplanation") or "").strip()
        if sel:
            plan.chartSelectionReason = sel

    api_type = _first_nonempty(
        visualization.get("chartType"),
        prov.get("chartTypeApi"),
    )
    if api_type:
        plan.chartType = api_type

    internal = prov.get("chartTypeInternal") if isinstance(prov, dict) else None
    if internal:
        plan.chartTypeInternal = str(internal)

    if isinstance(prov, dict):
        plan.metricColumn = _first_nonempty(prov.get("numericColumn"), plan.metricColumn)
        plan.dimensionColumn = _first_nonempty(prov.get("categoryColumn"), plan.dimensionColumn)
        plan.metricDisplay = _first_nonempty(prov.get("numericColumnDisplay"), plan.metricDisplay)
        plan.dimensionDisplay = _first_nonempty(
            prov.get("categoryColumnDisplay"), plan.dimensionDisplay
        )
        sel_prov = str(prov.get("chartSelectionReason") or "").strip()
        if sel_prov:
            plan.chartSelectionReason = sel_prov

    return plan
