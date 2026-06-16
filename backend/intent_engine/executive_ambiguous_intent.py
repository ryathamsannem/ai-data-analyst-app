"""
Ambiguous executive questions — strategy, loss, opportunity, risk, standout.

Classifies broad management prompts before generic product/revenue ranking fallback.
Schema-driven only (no hardcoded entities).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

ExecutiveAmbiguousBucket = Optional[str]

_LOSS_RE = re.compile(
    r"\b("
    r"losing\s+money|lose\s+money|losses?|unprofitable|negative\s+profit|"
    r"loss[- ]making|where\s+.*\blose|bleeding\s+money|operating\s+at\s+a\s+loss|"
    r"low\s+margin|margin\s+risk|profitability\s+problem"
    r")\b",
    re.I,
)
_STANDOUT_RE = re.compile(
    r"\b("
    r"stands?\s+out|standout|unusual|surprising|outlier|anomal(?:y|ies)|"
    r"what\s+is\s+different|anything\s+odd|notable\s+pattern"
    r")\b",
    re.I,
)
_EXECUTIVE_RISK_RE = re.compile(
    r"\b("
    r"concern(?:s|ed)?|worri(?:ed|es|y)|worries|risks?|risky|exposure|"
    r"vulnerab(?:le|ility)?|strategic\s+threats?|warning|"
    r"biggest\s+(?:risks?|problems?|issues?)|what\s+.*\bwrong|red\s+flag|threat|"
    r"keep\s+(?:us|me|leadership|management|executives?|the\s+team)\s+up\s+at\s+night|"
    r"(?:what\s+)?keeps?\s+(?:us|leadership|management|executives?)\s+up\s+at\s+night|"
    r"up\s+at\s+night|"
    r"(?:leadership|executives?)\s+(?:concern|risk|worr|exposure|threat)|"
    r"executive\s+risks?"
    r")\b",
    re.I,
)
_IMPROVE_RE = re.compile(
    r"\b("
    r"improve|improvement|should\s+we\s+fix|upside|invest\s+next|"
    r"where\s+to\s+grow|growth\s+opportunit|underperforming\s+segment|"
    r"address\s+first|fix\s+first"
    r")\b",
    re.I,
)
_CONCENTRATION_RE = re.compile(
    r"\b("
    r"concentrat(?:ed|ion)?|overly\s+concentrat|dominat(?:e|ion)?|"
    r"revenue\s+share|share\s+by|dependency"
    r")\b",
    re.I,
)

_STRATEGY_RE = re.compile(
    r"\b("
    r"management\s+focus|leadership\s+focus|executive\s+priority|"
    r"should\s+(?:we|management|leadership)\s+focus|what\s+to\s+prioriti[sz]e|"
    r"prioriti[sz]e|focus\s+on\s+first|where\s+should\s+we\s+focus|"
    r"strategic\s+priority|top\s+priority|"
    r"strategic\s+recommendation|budget\s+allocation|allocate\s+budget|"
    r"what\s+should\s+(?:the\s+)?[\w\s]{2,32}\s+focus|"
    r"(?:sales|cro|ceo|cmo|cto|leader)\s+focus"
    r")\b",
    re.I,
)

# Skip ambiguous routing when the question is clearly another analysis type.
_OTHER_INTENT_RE = re.compile(
    r"\b("
    r"trend\s+over\s+time|correlat|versus|vs\.?|scatter|forecast|"
    r"compare\s+growth|growth\s+rate\s+across|explains?\s+.+\s+performance|"
    r"summarize\s+business|executive\s+summary|profit\s+margin\s+across"
    r")\b",
    re.I,
)


def _is_explicit_outlier_identification(question: str) -> bool:
    """Row/entity outlier drill-down — not broad executive 'what stands out'."""
    q = (question or "").strip()
    if re.search(r"\bidentify\s+outliers?\b", q, re.I):
        return True
    if re.search(
        r"\b(which|what)\s+.{0,48}\b(?:is\s+an?\s+)?outliers?\b",
        q,
        re.I,
    ):
        return True
    if re.search(r"\bwhere\s+are\b.*\boutliers?\b", q, re.I):
        return True
    return False


def _is_named_risk_metric_question(question: str) -> bool:
    """Explicit risk-score metric compare — not broad executive risk analysis."""
    return bool(
        re.search(
            r"\b(?:patient\s+)?risk\s+(?:score|index)\b|\bclinical\s+risk\s+score\b",
            question or "",
            re.I,
        )
    )


def classify_executive_ambiguous_bucket(question: str) -> ExecutiveAmbiguousBucket:
    q = (question or "").replace("\n", " ").strip()
    if len(q) < 8:
        return None
    if _is_named_risk_metric_question(q):
        return None
    if _OTHER_INTENT_RE.search(q):
        return None
    if re.search(r"\bidentify\s+(?:unusual|outliers?|anomal)", q, re.I):
        return None
    if _LOSS_RE.search(q):
        return "executive_loss_profitability"
    if _STANDOUT_RE.search(q) and not _is_explicit_outlier_identification(q):
        return "executive_outlier_standout"
    if _CONCENTRATION_RE.search(q):
        return "executive_risk"
    if _EXECUTIVE_RISK_RE.search(q) and not _IMPROVE_RE.search(q):
        return "executive_risk"
    if _IMPROVE_RE.search(q):
        return "executive_opportunity"
    if _STRATEGY_RE.search(q):
        return "executive_strategy"
    return None


def bucket_to_executive_lens(bucket: str) -> str:
    return {
        "executive_strategy": "strategy",
        "executive_loss_profitability": "loss",
        "executive_opportunity": "opportunity",
        "executive_risk": "risk",
        "executive_outlier_standout": "standout",
    }.get(bucket, "strategy")


def bucket_to_primary_goal(bucket: str) -> str:
    return {
        "executive_strategy": "executive_strategy",
        "executive_loss_profitability": "loss_profitability",
        "executive_opportunity": "executive_opportunity",
        "executive_risk": "executive_risk",
        "executive_outlier_standout": "executive_outlier_standout",
    }.get(bucket, "compare")


def chart_selection_bucket_override(question: str) -> Optional[str]:
    bucket = classify_executive_ambiguous_bucket(question)
    if bucket:
        # Standout uses category comparison + outlier cards (not row-level histogram).
        return "compare"
    return None


def question_requests_standout_analysis(question: str) -> bool:
    return classify_executive_ambiguous_bucket(question) == "executive_outlier_standout"


def question_requests_executive_risk(question: str) -> bool:
    return classify_executive_ambiguous_bucket(question) == "executive_risk"


def _numeric_cols(df: pd.DataFrame, profile: Dict[str, Any]) -> List[str]:
    ct = profile.get("column_types", {}) if profile else {}
    return [str(c) for c in df.columns if ct.get(c) == "number"]


def _categorical_cols(df: pd.DataFrame, profile: Dict[str, Any]) -> List[str]:
    ct = profile.get("column_types", {}) if profile else {}
    return [str(c) for c in df.columns if ct.get(c) not in ("number", "date")]


def _pick_profit_col(df: pd.DataFrame, profile: Dict[str, Any]) -> Optional[str]:
    for c in _numeric_cols(df, profile):
        if "profit" in str(c).lower():
            return str(c)
    return None


def _pick_revenue_col(df: pd.DataFrame, profile: Dict[str, Any]) -> Optional[str]:
    for hint in ("revenue", "sales"):
        for c in _numeric_cols(df, profile):
            if hint in str(c).lower().replace("_", " "):
                return str(c)
    numeric = _numeric_cols(df, profile)
    return str(numeric[0]) if numeric else None


def _find_numeric_by_hint(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *hints: str,
) -> Optional[str]:
    nums = _numeric_cols(df, profile)
    for hint in hints:
        h = str(hint).lower().replace("_", " ")
        for col in nums:
            cn = str(col).lower().replace("_", " ")
            if h == cn or h in cn.split():
                return str(col)
    return None


def _pick_executive_risk_metric_column(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    profit_col: Optional[str],
    revenue_col: Optional[str],
    fallback: Optional[str],
) -> Optional[str]:
    """Risk lens: prefer explicit / variance / profit signals over revenue leaderboard."""
    ql = (question or "").lower()

    if re.search(r"\b(overrun|over\s+budget|cost\s+overrun)\b", ql):
        hit = _find_numeric_by_hint(df, profile, "actual", "variance")
        if hit:
            return hit

    explicit = _explicit_metric_from_question(question, {}, df, profile)
    if explicit:
        return explicit

    if re.search(r"\b(fp&a|fpa|budget|variance)\b", ql):
        hit = _find_numeric_by_hint(df, profile, "variance")
        if hit:
            return hit

    if profit_col and re.search(
        r"\b(risks?|problems?|threats?|exposure|concerns?)\b", ql
    ):
        if not re.search(r"\b(revenue|sales)\b", ql):
            return profit_col

    return fallback or revenue_col


def pick_executive_breakdown_column(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    question: str = "",
    bucket: str = "",
) -> Optional[str]:
    """Prefer region/city/segment over product for broad executive questions."""
    try:
        from intent_engine.geographic_scope import resolve_geographic_group_column

        geo = resolve_geographic_group_column(question or "by region", df, profile)
        if geo and geo in df.columns:
            return str(geo)
    except Exception:
        pass

    ql = (question or "").lower()
    try:
        from intent_engine.column_resolve import resolve_dimension_phrase_to_column

        for token in ("campaigns", "campaign", "city", "cities", "zone", "region", "segment"):
            if re.search(rf"\b{re.escape(token)}\b", ql):
                hit = resolve_dimension_phrase_to_column(
                    token, _categorical_cols(df, profile), profile
                )
                if hit and hit in df.columns:
                    return str(hit)
    except Exception:
        pass

    cats = _categorical_cols(df, profile)
    scored: List[Tuple[int, str]] = []
    for c in cats:
        try:
            nu = int(df[c].nunique(dropna=True))
        except Exception:
            continue
        if nu < 2 or nu > 40:
            continue
        cn = str(c).lower().replace("_", " ")
        score = min(nu, 12)
        if any(t in cn for t in ("region", "zone", "city", "category", "segment", "channel")):
            score += 28
        if "product" in cn and bucket != "executive_opportunity":
            score -= 18
        if cn in ("product", "sku", "item"):
            score -= 12
        scored.append((score, str(c)))
    if not scored:
        return None
    scored.sort(key=lambda t: (-t[0], t[1]))
    return scored[0][1]


def build_loss_profitability_context(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    group_col: str,
    profit_col: str,
) -> Dict[str, Any]:
    sub = df[[group_col, profit_col]].copy()
    sub[profit_col] = pd.to_numeric(sub[profit_col], errors="coerce")
    sub = sub.dropna()
    g = sub.groupby(group_col, dropna=False)[profit_col].sum().reset_index()
    g = g.sort_values(profit_col, ascending=True)
    negative = g[g[profit_col] < 0]
    has_negative = len(negative) > 0
    lowest = g.iloc[0] if len(g) else None
    lines = [
        "Loss / profitability analysis (calculated from grouped profit totals):",
        f"- Breakdown dimension: {group_col}",
        f"- Profit metric: {profit_col}",
        f"- Groups analyzed: {len(g)}",
    ]
    if has_negative:
        lines.append(f"- Loss-making groups: {len(negative)} (profit < 0)")
        for _, row in negative.head(5).iterrows():
            lines.append(f"  - {row[group_col]}: {float(row[profit_col]):,.0f}")
    else:
        lines.append(
            "- No loss-making rows found in this filtered cohort "
            "(all grouped profit totals are >= 0)."
        )
        if lowest is not None:
            lines.append(
                f"- Lowest profit segment: {lowest[group_col]} "
                f"({float(lowest[profit_col]):,.0f}) — not a loss, but weakest profitability."
            )
    lines.append(
        "- Do not describe revenue ranking as loss analysis; cite profit totals above."
    )
    return {
        "hasNegativeProfit": has_negative,
        "negativeGroupCount": int(len(negative)),
        "lowestSegment": str(lowest[group_col]) if lowest is not None else None,
        "lowestProfit": float(lowest[profit_col]) if lowest is not None else None,
        "exactBlock": "\n".join(lines),
    }


def build_executive_risk_context(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    group_col: str,
    value_col: str,
    question: str = "",
) -> Dict[str, Any]:
    """Ground executive-risk answers with prioritized concentration / weakness signals."""
    try:
        from intent_engine.executive_lens import build_lens_specific_insights

        cards = build_lens_specific_insights(
            df,
            profile,
            question=question,
            lens="risk",
            metric_col=value_col,
            dimension_col=group_col,
        )
    except Exception:
        cards = []

    lines = [
        "Executive risk prioritization (calculated from grouped cohort totals):",
        f"- Breakdown dimension: {group_col}",
        f"- Primary metric: {value_col}",
    ]
    if cards:
        for card in cards[:5]:
            title = str(card.get("title") or "Risk signal").strip()
            narrative = str(
                card.get("narrativeLine") or card.get("hint") or ""
            ).strip()
            lines.append(f"- {title}: {narrative}")
    else:
        lines.append(
            "- Insufficient grouped signal in this cohort for concentration or weakness cards."
        )
    lines.extend(
        [
            "- Frame the answer as Primary concern → Secondary concern → Watch item.",
            "- Lead with top business risk, concentration/dependency exposure, and weakest performers.",
            "- Do not answer with only a revenue or product ranking.",
        ]
    )
    return {
        "prioritizedCardCount": len(cards),
        "prioritizedCards": cards[:5],
        "exactBlock": "\n".join(lines),
    }


def _explicit_metric_from_question(
    question: str,
    intent: Dict[str, Any],
    df: pd.DataFrame,
    profile: Dict[str, Any],
) -> Optional[str]:
    try:
        from intent_engine.resolve_explicit_metric import resolve_explicit_metric_column

        explicit = resolve_explicit_metric_column(question, df, profile)
        if explicit:
            return str(explicit)
    except Exception:
        pass
    if intent.get("explicit_metric") and intent.get("value_col"):
        return str(intent["value_col"])
    return None


def apply_executive_ambiguous_routing(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    intent: Dict[str, Any],
) -> bool:
    """
    Override aggregate intent (metric, dimension, lens) for ambiguous executive questions.
    Returns True when routing was applied.
    """
    try:
        from intent_engine.narrative_guardrails import detect_missing_requested_metrics

        if detect_missing_requested_metrics(question, df, profile):
            return False
    except Exception:
        pass
    bucket = classify_executive_ambiguous_bucket(question)
    if not bucket or df is None or df.empty:
        return False

    lens = bucket_to_executive_lens(bucket)
    gcol = pick_executive_breakdown_column(df, profile, question=question, bucket=bucket)
    if not gcol:
        try:
            from intent_engine.executive_lens import _pick_breakdown_col

            gcol = _pick_breakdown_col(df, profile, question=question)
        except Exception:
            gcol = None
    if not gcol:
        return False

    profit_col = _pick_profit_col(df, profile)
    revenue_col = _pick_revenue_col(df, profile)
    explicit_metric = _explicit_metric_from_question(question, intent, df, profile)

    intent["executive_ambiguous_bucket"] = bucket
    intent["executive_lens"] = lens
    intent["group_col"] = gcol

    try:
        from intent_engine.executive_metric_resolve import (
            resolve_executive_lens_metric_column,
        )

        resolved_metric = resolve_executive_lens_metric_column(
            question, df, profile, lens=lens
        )
    except Exception:
        resolved_metric = None

    if bucket == "executive_loss_profitability" and profit_col:
        intent["value_col"] = profit_col
        intent["agg_label"] = "Total"
        intent["agg_key"] = "sum"
        intent["metricColumnDisplay"] = "Profit"
        intent["lossProfitabilityContext"] = build_loss_profitability_context(
            df, profile, group_col=gcol, profit_col=profit_col
        )
    elif resolved_metric:
        metric_col = resolved_metric
        intent["value_col"] = metric_col
        if explicit_metric or intent.get("explicit_metric"):
            from intent_engine.column_resolve import column_prefers_mean_aggregation

            if column_prefers_mean_aggregation(str(metric_col)):
                intent["agg_label"] = "Average"
                intent["agg_key"] = "mean"
            else:
                intent["agg_label"] = "Total"
                intent["agg_key"] = "sum"
        else:
            intent["agg_label"] = "Total"
            intent["agg_key"] = "sum"
        if bucket == "executive_risk":
            intent["executiveRiskContext"] = build_executive_risk_context(
                df,
                profile,
                group_col=gcol,
                value_col=str(metric_col),
                question=question,
            )
        elif bucket == "executive_outlier_standout":
            intent["executive_standout_analysis"] = True
    elif bucket == "executive_opportunity":
        intent["value_col"] = revenue_col or intent.get("value_col")
        intent["agg_label"] = "Total"
        intent["agg_key"] = "sum"
    elif bucket == "executive_risk":
        metric_col = _pick_executive_risk_metric_column(
            question,
            df,
            profile,
            profit_col=profit_col,
            revenue_col=revenue_col,
            fallback=explicit_metric or intent.get("value_col"),
        )
        intent["value_col"] = metric_col
        intent["agg_label"] = "Total"
        intent["agg_key"] = "sum"
        if metric_col:
            intent["executiveRiskContext"] = build_executive_risk_context(
                df,
                profile,
                group_col=gcol,
                value_col=str(metric_col),
                question=question,
            )
    elif bucket == "executive_strategy":
        intent["value_col"] = (
            explicit_metric or revenue_col or intent.get("value_col")
        )
        intent["agg_label"] = "Total"
        intent["agg_key"] = "sum"
    elif bucket == "executive_outlier_standout":
        intent["value_col"] = explicit_metric or intent.get("value_col") or revenue_col
        intent["agg_label"] = "Total"
        intent["agg_key"] = "sum"
        intent["executive_standout_analysis"] = True
    else:
        intent["value_col"] = revenue_col or intent.get("value_col")

    vc = intent.get("value_col")
    if vc:
        from intent_engine.legacy import pretty_label_text

        intent["metricColumnDisplay"] = pretty_label_text(str(vc))

    intent.pop("secondary_group_col", None)
    return True


def executive_ambiguous_prompt_block(bucket: str) -> str:
    tone = (
        "Use hedged executive language. Do not treat this as a simple revenue leaderboard "
        "unless the calculated result is explicitly profit/loss ranked."
    )
    blocks = {
        "executive_strategy": (
            "Executive lens: MANAGEMENT PRIORITIES.\n"
            "- Synthesize concentration, weak performers, growth, margin, and risk/opportunity signals.\n"
            "- Do not answer with only a product or revenue ranking.\n"
            f"- {tone}"
        ),
        "executive_loss_profitability": (
            "Executive lens: LOSS / PROFITABILITY.\n"
            "- Use profit (or margin) totals from the calculated result — not revenue ranking as loss analysis.\n"
            "- If no loss-making groups exist, state that clearly before discussing low-profit segments.\n"
            f"- {tone}"
        ),
        "executive_opportunity": (
            "Executive lens: IMPROVEMENT / UPLIFT.\n"
            "- Highlight underperforming but addressable segments (gap, growth vs revenue, customers vs revenue).\n"
            "- Avoid a bare top-revenue product list.\n"
            f"- {tone}"
        ),
        "executive_risk": (
            "Executive lens: CONCERNS / RISK.\n"
            "- Identify top business risk, concentration/dependency exposure, and weakest performers.\n"
            "- Structure the narrative as Primary concern, Secondary concern, and Watch item.\n"
            "- Use calculated risk cards (concentration, growth risk, margin risk, weak performer) — "
            "not a generic revenue leaderboard.\n"
            f"- {tone}"
        ),
        "executive_outlier_standout": (
            "Executive lens: STANDOUT / OUTLIER.\n"
            "- Lead with unusual high/low segments, largest gaps, and concentration — not a generic leaderboard.\n"
            f"- {tone}"
        ),
    }
    return blocks.get(bucket, "")
