"""
Dataset-aware suggested questions with domain metric diversity and intent mix.

Target mix (6 questions): ~40% basic, ~40% executive, ~20% relationship.
No hardcoded dataset-specific questions — built from detected columns.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd

CATEGORY_TARGETS: Dict[str, float] = {
    "basic": 0.40,
    "executive": 0.40,
    "relationship": 0.20,
}

VERTICAL_METRIC_PRIORITY: Dict[str, Tuple[str, ...]] = {
    "banking": (
        "loan_balance",
        "deposit_balance",
        "utilization_pct",
        "utilization",
        "credit_utilization",
        "delinquency_rate",
        "npl_amount",
        "spend_amount",
        "interest_income",
    ),
    "retail": (
        "profit",
        "revenue",
        "growth_rate",
        "customers",
        "orders",
        "quantity",
    ),
    "marketing": (
        "revenue",
        "conversions",
        "spend",
        "satisfaction_score",
        "impressions",
        "clicks",
        "cost",
    ),
    "hr": ("salary", "attendance", "headcount", "attrition", "compensation"),
    "finance": ("expense", "budget", "profit", "cash", "margin", "spend"),
    "operations": (
        "downtime",
        "production_loss",
        "defect",
        "volume",
        "throughput",
        "repair",
    ),
}

VERTICAL_DIMENSION_PRIORITY: Dict[str, Tuple[str, ...]] = {
    "banking": (
        "branch",
        "customer_segment",
        "region",
        "product_type",
        "spend_category",
    ),
    "retail": ("product_category", "region", "city", "product"),
    "marketing": ("channel", "campaign", "region"),
    "hr": ("department", "location", "team"),
    "finance": ("department", "category", "cost_center"),
    "operations": ("plant", "region", "severity", "site"),
}

VERTICAL_DOMAIN_NOUN: Dict[str, str] = {
    "banking": "portfolio",
    "retail": "retail business",
    "marketing": "marketing",
    "hr": "workforce",
    "finance": "financial",
    "operations": "operations",
    "generic": "business",
}


@dataclass
class QuestionCandidate:
    text: str
    category: str
    intent: str
    metric: Optional[str] = None
    dimension: Optional[str] = None
    score: float = 5.0


def _norm_col(name: str) -> str:
    return re.sub(r"[_\s]+", " ", str(name).lower()).strip()


def _clean_question_sentence(s: str) -> str:
    s = re.sub(r"\s+", " ", s.strip())
    s = re.sub(r"\b(\w+)\s+\1\b", r"\1", s, flags=re.IGNORECASE)
    return s


def _q_label(col: Optional[str]) -> str:
    if not col:
        return "values"
    s = str(col).strip().replace("_", " ").strip()
    s = re.sub(r"\bpercent\b", "percentage", s, flags=re.I)
    s = re.sub(r"\bpct\b", "percentage", s, flags=re.I)
    s = re.sub(r"\s+id\s*$", "", s, flags=re.I).strip()
    return s.lower()


def _dim_scope_plural(col: str) -> str:
    lab = _q_label(col)
    raw = _norm_col(col)
    mapping = {
        "department": "departments",
        "region": "regions",
        "city": "cities",
        "segment": "segments",
        "category": "categories",
        "product": "products",
        "channel": "channels",
        "campaign": "campaigns",
        "customer": "customers",
        "branch": "branches",
    }
    for key, plural in mapping.items():
        if key in raw or key in lab:
            return plural
    w = lab.split()[-1] if lab else "group"
    if w.endswith("y") and len(w) > 2 and w[-2] not in "aeiou":
        return w[:-1] + "ies"
    if w.endswith("s"):
        return w
    return f"{w}s"


def _column_matches_token(col: str, token: str) -> bool:
    cn = _norm_col(col).replace(" ", "_")
    tk = _norm_col(token).replace(" ", "_")
    return tk in cn or cn in tk or tk.replace("_", "") in cn.replace(" ", "")


def detect_suggestion_vertical(columns: Sequence[str]) -> str:
    lows = [_norm_col(c) for c in columns]
    joined = " ".join(lows)

    banking_hits = sum(
        1
        for k in (
            "loan balance",
            "loan",
            "deposit balance",
            "deposit",
            "delinquency",
            "npl",
            "credit util",
            "branch",
        )
        if k in joined
    )
    if banking_hits >= 2:
        return "banking"

    mkt_hits = sum(
        1
        for k in ("campaign", "channel", "impression", "conversion", "click", "ad spend")
        if k in joined
    )
    if mkt_hits >= 2:
        return "marketing"

    hr_hits = sum(
        1 for k in ("employee", "salary", "department", "attrition", "headcount") if k in joined
    )
    if hr_hits >= 2:
        return "hr"

    ops_hits = sum(
        1
        for k in ("downtime", "defect", "plant", "incident", "production loss", "severity")
        if k in joined
    )
    if ops_hits >= 2:
        return "operations"

    if ("product category" in joined or "product" in joined) and (
        "revenue" in joined or "profit" in joined
    ):
        return "retail"

    fin_hits = sum(
        1 for k in ("budget", "expense", "ledger", "gl", "invoice", "payable") if k in joined
    )
    if fin_hits >= 2:
        return "finance"

    return "generic"


def _find_column_by_tokens(
    columns: Sequence[str],
    tokens: Sequence[str],
    pool: Optional[Sequence[str]] = None,
) -> Optional[str]:
    search = list(pool or columns)
    for token in tokens:
        for col in search:
            if _column_matches_token(col, token):
                return str(col)
    return None


def prioritize_columns(
    columns: Sequence[str],
    ranked: List[Tuple[str, int]],
    priority_tokens: Sequence[str],
) -> List[str]:
    ranked_names = [c for c, _ in ranked]
    pool = ranked_names if ranked_names else list(columns)
    out: List[str] = []
    seen: set[str] = set()
    for token in priority_tokens:
        hit = _find_column_by_tokens(pool, (token,), pool=pool)
        if hit and hit not in seen:
            seen.add(hit)
            out.append(hit)
    for col in pool:
        if col not in seen:
            seen.add(col)
            out.append(str(col))
    return out


def _diversity_penalty(
    cand: QuestionCandidate, selected: Sequence[QuestionCandidate]
) -> float:
    penalty = 0.0
    for s in selected:
        if cand.metric and s.metric and cand.metric == s.metric:
            penalty += 4.0
        if cand.dimension and s.dimension and cand.dimension == s.dimension:
            penalty += 2.0
        if cand.intent == s.intent:
            penalty += 2.5
        if cand.intent == "risk" and s.intent == "risk":
            penalty += 4.0
        if cand.intent == "opportunity" and s.intent == "opportunity":
            penalty += 3.0
        if cand.category == s.category and cand.intent == s.intent:
            penalty += 1.0
        if _normalize_question_key(cand.text) == _normalize_question_key(s.text):
            penalty += 10.0
    return penalty


def _normalize_question_key(q: str) -> str:
    qc = _clean_question_sentence(q).strip().lower()
    qc = re.sub(r"[^a-z0-9\s]+", " ", qc, flags=re.I)
    return re.sub(r"\s+", " ", qc).strip()


def _add_candidate(
    out: List[QuestionCandidate],
    *,
    text: str,
    category: str,
    intent: str,
    metric: Optional[str] = None,
    dimension: Optional[str] = None,
    score: float = 5.0,
) -> None:
    t = _clean_question_sentence(text)
    if not t:
        return
    key = _normalize_question_key(t)
    if any(_normalize_question_key(c.text) == key for c in out):
        return
    out.append(
        QuestionCandidate(
            text=t,
            category=category,
            intent=intent,
            metric=metric,
            dimension=dimension,
            score=score,
        )
    )


def _metric_can_trend(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    metric: str,
    date_col: str,
) -> bool:
    if df is None or df.empty or not metric or not date_col:
        return False
    if metric not in df.columns or date_col not in df.columns:
        return False
    ct = profile.get("column_types", {}) if profile else {}
    if ct.get(metric) != "number":
        return False
    try:
        from intent_engine.trend_date_resolve import group_column_is_time_series_eligible

        return group_column_is_time_series_eligible(df, date_col)
    except Exception:
        return False


def _pick_trend_metric(
    vertical: str,
    metrics: Sequence[str],
    columns: Sequence[str],
) -> Optional[str]:
    """Prefer rate/pct metrics for trends; banking favors utilization over spend."""
    if vertical == "banking":
        util = _find_column_by_tokens(
            list(columns), ("utilization_pct", "utilization"), pool=list(metrics)
        )
        if util:
            return util
    for m in metrics:
        ml = _norm_col(m)
        if any(t in ml for t in ("pct", "percent", "rate", "ratio", "score")):
            return m
    if len(metrics) >= 2:
        return metrics[1]
    return metrics[0] if metrics else None


def _generate_basic_candidates(
    metrics: Sequence[str],
    dims: Sequence[str],
    date_col: Optional[str],
    *,
    vertical: str = "generic",
    columns: Optional[Sequence[str]] = None,
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
) -> List[QuestionCandidate]:
    out: List[QuestionCandidate] = []
    if not metrics or not dims:
        return out

    m0, d0 = metrics[0], dims[0]
    _add_candidate(
        out,
        text=f"Which {_q_label(d0)} has the highest {_q_label(m0)}?",
        category="basic",
        intent="top_performer",
        metric=m0,
        dimension=d0,
        score=10.0,
    )

    if len(metrics) > 1 and len(dims) > 1:
        m1, d1 = metrics[1], dims[1]
        _add_candidate(
            out,
            text=f"Compare {_q_label(m1)} across {_dim_scope_plural(d1)}",
            category="basic",
            intent="compare",
            metric=m1,
            dimension=d1,
            score=9.0,
        )
    else:
        _add_candidate(
            out,
            text=f"Compare {_q_label(m0)} across {_dim_scope_plural(d0)}",
            category="basic",
            intent="compare",
            metric=m0,
            dimension=d0,
            score=8.5,
        )

    if date_col:
        trend_metric = _pick_trend_metric(
            vertical, metrics, columns or metrics
        )
        if trend_metric and (
            df is None
            or profile is None
            or _metric_can_trend(df, profile, trend_metric, date_col)
        ):
            _add_candidate(
                out,
                text=(
                    f"How does {_q_label(trend_metric)} trend over "
                    f"{_q_label(date_col)}?"
                ),
                category="basic",
                intent="trend",
                metric=trend_metric,
                dimension=date_col,
                score=8.0,
            )

    if len(dims) > 0 and len(metrics) > 2:
        _add_candidate(
            out,
            text=(
                f"What are the top 5 {_q_label(dims[0])} ranked by "
                f"{_q_label(metrics[2])}?"
            ),
            category="basic",
            intent="ranking",
            metric=metrics[2],
            dimension=dims[0],
            score=7.5,
        )

    return out


def _generate_executive_candidates(
    vertical: str,
    metrics: Sequence[str],
    dims: Sequence[str],
) -> List[QuestionCandidate]:
    out: List[QuestionCandidate] = []
    noun = VERTICAL_DOMAIN_NOUN.get(vertical, VERTICAL_DOMAIN_NOUN["generic"])

    _add_candidate(
        out,
        text=f"What are the biggest {noun} risks?",
        category="executive",
        intent="risk",
        score=10.0,
    )
    _add_candidate(
        out,
        text=f"What is the biggest {noun} opportunity?",
        category="executive",
        intent="opportunity",
        score=9.5,
    )

    if metrics and dims:
        _add_candidate(
            out,
            text=(
                f"Where is {_q_label(metrics[0])} overly concentrated across "
                f"{_dim_scope_plural(dims[0])}?"
            ),
            category="executive",
            intent="concentration",
            metric=metrics[0],
            dimension=dims[0],
            score=9.0,
        )

    if vertical == "banking":
        loan = _find_column_by_tokens(metrics, ("loan_balance", "loan"))
        branch = _find_column_by_tokens(dims, ("branch",))
        if loan and branch:
            _add_candidate(
                out,
                text=f"Which {_q_label(branch)} has the highest {_q_label(loan)}?",
                category="basic",
                intent="top_performer",
                metric=loan,
                dimension=branch,
                score=10.5,
            )
        delinq = _find_column_by_tokens(metrics, ("delinquency",))
        segment = _find_column_by_tokens(dims, ("segment", "customer_segment"))
        if delinq and segment:
            _add_candidate(
                out,
                text=(
                    f"Which {_q_label(segment)} has the highest "
                    f"{_q_label(delinq)}?"
                ),
                category="basic",
                intent="top_performer",
                metric=delinq,
                dimension=segment,
                score=10.0,
            )
        util = _find_column_by_tokens(metrics, ("credit_utilization", "utilization"))
        if util:
            _add_candidate(
                out,
                text=f"Where is {_q_label(util)} concentrated?",
                category="executive",
                intent="concentration",
                metric=util,
                dimension=dims[0] if dims else None,
                score=9.5,
            )
        growth = _find_column_by_tokens(metrics, ("growth",))
        region = _find_column_by_tokens(dims, ("region",))
        if region:
            _add_candidate(
                out,
                text=f"Which {_q_label(region)} represent the largest growth opportunity?",
                category="executive",
                intent="opportunity",
                metric=growth or metrics[0],
                dimension=region,
                score=8.5,
            )

    elif vertical == "retail":
        profit = _find_column_by_tokens(metrics, ("profit",))
        cat = _find_column_by_tokens(
            dims, ("product_category", "category", "product")
        )
        if profit and cat:
            _add_candidate(
                out,
                text=f"Which {_q_label(cat)} drives the most {_q_label(profit)}?",
                category="basic",
                intent="top_performer",
                metric=profit,
                dimension=cat,
                score=10.5,
            )
        region = _find_column_by_tokens(dims, ("region", "city"))
        if region:
            _add_candidate(
                out,
                text=f"Which {_q_label(region)} are underperforming?",
                category="executive",
                intent="underperformers",
                metric=metrics[0],
                dimension=region,
                score=8.5,
            )
    elif vertical == "marketing":
        _add_candidate(
            out,
            text="What marketing opportunities should leadership focus on?",
            category="executive",
            intent="opportunity",
            score=9.5,
        )
        camp = _find_column_by_tokens(dims, ("campaign", "channel"))
        rev = _find_column_by_tokens(metrics, ("revenue",))
        spend = _find_column_by_tokens(metrics, ("spend", "cost"))
        if camp and rev and spend:
            _add_candidate(
                out,
                text=f"Which {_q_label(camp)} generate the highest ROI?",
                category="executive",
                intent="opportunity",
                metric=rev,
                dimension=camp,
                score=9.0,
            )

    if metrics and dims and vertical not in ("retail", "banking"):
        _add_candidate(
            out,
            text=f"Which {_q_label(dims[0])} are underperforming on {_q_label(metrics[0])}?",
            category="executive",
            intent="underperformers",
            metric=metrics[0],
            dimension=dims[0],
            score=7.5,
        )

    return out


def _generate_relationship_candidates(
    metrics: Sequence[str],
    dims: Sequence[str],
) -> List[QuestionCandidate]:
    out: List[QuestionCandidate] = []
    if metrics and dims:
        _add_candidate(
            out,
            text=f"What drives {_q_label(metrics[0])} the most?",
            category="relationship",
            intent="driver",
            metric=metrics[0],
            dimension=dims[0],
            score=8.5,
        )
        _add_candidate(
            out,
            text=(
                f"What factors explain {_q_label(metrics[0])} across "
                f"{_dim_scope_plural(dims[0])}?"
            ),
            category="relationship",
            intent="factor",
            metric=metrics[0],
            dimension=dims[0],
            score=8.0,
        )
    if len(metrics) >= 2:
        _add_candidate(
            out,
            text=(
                f"How does {_q_label(metrics[0])} correlate with "
                f"{_q_label(metrics[1])}?"
            ),
            category="relationship",
            intent="correlation",
            metric=metrics[0],
            dimension=metrics[1],
            score=8.0,
        )
    return out


def select_diverse_candidates(
    candidates: List[QuestionCandidate],
    max_n: int = 6,
) -> List[str]:
    if not candidates:
        return []

    pool = sorted(candidates, key=lambda c: (-c.score, c.text))
    selected: List[QuestionCandidate] = []
    quotas = {
        cat: max(1, round(max_n * share))
        for cat, share in CATEGORY_TARGETS.items()
    }
  # 6 -> basic 2, executive 2, relationship 1; one slot flexible
    if max_n == 6:
        quotas = {"basic": 3, "executive": 2, "relationship": 1}

    for cat in ("executive", "basic", "relationship"):
        need = quotas.get(cat, 1)
        ranked = sorted(
            [c for c in pool if c.category == cat and c not in selected],
            key=lambda c: c.score - _diversity_penalty(c, selected),
            reverse=True,
        )
        for cand in ranked:
            if need <= 0:
                break
            if _diversity_penalty(cand, selected) >= 8:
                continue
            selected.append(cand)
            need -= 1

    while len(selected) < max_n:
        best: Optional[QuestionCandidate] = None
        best_eff = -999.0
        for cand in pool:
            if cand in selected:
                continue
            eff = cand.score - _diversity_penalty(cand, selected)
            if eff > best_eff:
                best_eff = eff
                best = cand
        if not best or best_eff < -2:
            break
        selected.append(best)

    return [_clean_question_sentence(c.text) for c in selected[:max_n]]


def compose_suggested_questions(
    *,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    ranked_dims: List[Tuple[str, int]],
    ranked_metrics: List[Tuple[str, int]],
    date_cols: List[str],
    columns: List[str],
    dashboard_kind: str = "generic",
    date_col: Optional[str] = None,
) -> List[str]:
    vertical = detect_suggestion_vertical(columns)
    if vertical == "generic" and dashboard_kind in VERTICAL_METRIC_PRIORITY:
        vertical = dashboard_kind

    metric_priority = VERTICAL_METRIC_PRIORITY.get(
        vertical, VERTICAL_METRIC_PRIORITY.get("generic", ())
    )
    dim_priority = VERTICAL_DIMENSION_PRIORITY.get(
        vertical, VERTICAL_DIMENSION_PRIORITY.get("generic", ())
    )

    metrics = prioritize_columns(columns, ranked_metrics, metric_priority)
    dims = prioritize_columns(columns, ranked_dims, dim_priority)
    if not metrics and ranked_metrics:
        metrics = [c for c, _ in ranked_metrics[:6]]
    if not dims and ranked_dims:
        dims = [c for c, _ in ranked_dims[:6]]

    date_for_trend = date_col or (date_cols[0] if date_cols else None)

    candidates: List[QuestionCandidate] = []
    candidates.extend(_generate_executive_candidates(vertical, metrics, dims))
    candidates.extend(
        _generate_basic_candidates(
            metrics,
            dims,
            date_for_trend,
            vertical=vertical,
            columns=columns,
            df=df,
            profile=profile,
        )
    )
    candidates.extend(_generate_relationship_candidates(metrics, dims))

    if vertical == "banking" and date_for_trend:
        util = _find_column_by_tokens(columns, ("utilization_pct", "utilization"))
        if util and _metric_can_trend(df, profile, util, date_for_trend):
            _add_candidate(
                candidates,
                text=f"Show {_q_label(util)} trend by {_q_label(date_for_trend)}",
                category="basic",
                intent="trend",
                metric=util,
                dimension=date_for_trend,
                score=9.8,
            )

    # Drop trend suggestions that cannot be charted on this dataset.
    candidates = [
        c
        for c in candidates
        if c.intent != "trend"
        or (
            c.metric
            and c.dimension
            and _metric_can_trend(df, profile, c.metric, c.dimension)
        )
    ]

    selected = select_diverse_candidates(candidates, max_n=6)
    if len(selected) >= 5:
        return selected

    # Minimal schema fallback using distinct metric/dimension pairs
    if metrics and dims:
        for i, m in enumerate(metrics[:3]):
            d = dims[i % len(dims)]
            _add_candidate(
                candidates,
                text=f"Which {_q_label(d)} leads on {_q_label(m)}?",
                category="basic",
                intent="top_performer",
                metric=m,
                dimension=d,
                score=5.0 - i,
            )
        selected = select_diverse_candidates(candidates, max_n=6)

    return selected
