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
        "sales_amount",
        "growth_rate",
        "customers",
        "orders",
    ),
    "marketing": (
        "revenue",
        "conversions",
        "conversion_rate",
        "spend",
        "satisfaction_score",
        "impressions",
        "clicks",
        "cost",
    ),
    "hr": (
        "salary",
        "performance_rating",
        "attendance",
        "headcount",
        "attrition_rate",
        "compensation",
        "bonus",
    ),
    "finance": ("expense", "budget", "profit", "cash", "margin", "spend"),
    "operations": (
        "downtime",
        "production_loss",
        "defect",
        "defect_rate",
        "units_produced",
        "volume",
        "throughput",
        "repair",
    ),
    "healthcare": (
        "claim_amount",
        "readmission_rate",
        "wait_time",
        "visit_count",
        "patient_volume",
    ),
    "saas": (
        "mrr",
        "churn_rate",
        "expansion_revenue",
        "active_users",
        "new_signups",
    ),
    "support": (
        "csat_score",
        "tickets_opened",
        "tickets_resolved",
        "resolution_hours",
        "escalations",
    ),
    "insurance": ("claim_amount", "loss_ratio", "premium", "paid_amount"),
    "real_estate": ("sale_price", "cap_rate", "rent", "noi"),
    "telecom": ("monthly_revenue", "churn_rate", "arpu", "data_usage_gb"),
    "hospitality": ("room_revenue", "occupancy_rate", "avg_daily_rate", "revpar"),
    "energy": ("energy_kwh", "utility_cost", "efficiency_score", "demand_kw"),
    "education": (
        "enrollment_count",
        "pass_rate",
        "attendance_rate",
        "graduation_rate",
    ),
    "supply_chain": (
        "freight_cost",
        "on_time_rate",
        "delivery_days",
        "shipment_count",
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
    "retail": ("product_category", "region", "city", "product", "customer_segment"),
    "marketing": ("channel", "campaign", "campaign_name", "region"),
    "hr": ("department", "location", "team", "job_level", "status"),
    "finance": ("department", "category", "cost_center"),
    "operations": ("plant", "region", "product_line", "severity", "site"),
    "healthcare": ("department", "segment", "region", "ward"),
    "saas": ("plan_type", "customer_segment", "region"),
    "support": ("ticket_category", "priority", "region", "channel"),
    "insurance": ("policy_type", "region", "claim_type"),
    "real_estate": ("property_type", "market_region", "listing_status"),
    "telecom": ("plan_tier", "market_region", "customer_segment"),
    "hospitality": ("hotel_brand", "market", "room_type"),
    "energy": ("facility_type", "grid_region", "site"),
    "education": ("grade_level", "school_region", "program"),
    "supply_chain": ("carrier", "destination_region", "origin_region", "route"),
}

VERTICAL_DOMAIN_NOUN: Dict[str, str] = {
    "banking": "portfolio",
    "retail": "retail business",
    "marketing": "marketing",
    "hr": "workforce",
    "finance": "financial",
    "operations": "operations",
    "healthcare": "patient care",
    "saas": "subscription",
    "support": "customer support",
    "insurance": "claims",
    "real_estate": "property",
    "telecom": "subscriber",
    "hospitality": "hospitality",
    "energy": "energy",
    "education": "student outcomes",
    "supply_chain": "logistics",
    "generic": "business",
}

_EXEC_DOMAIN_TO_VERTICAL: Dict[str, str] = {
    "banking": "banking",
    "hr": "hr",
    "healthcare": "healthcare",
    "marketing": "marketing",
    "operations": "operations",
    "saas": "saas",
    "customer_support": "support",
    "sales": "retail",
}

_WEAK_SECONDARY_METRIC_TOKENS: Tuple[str, ...] = (
    "quantity",
    "discount",
    "discount_pct",
    "discount_percent",
    "active_users",
    "impressions",
    "clicks",
)


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
        for k in (
            "downtime",
            "defect",
            "plant",
            "incident",
            "production loss",
            "severity",
            "units produced",
        )
        if k in joined
    )
    if ops_hits >= 2:
        return "operations"

    hc_hits = sum(
        1 for k in ("patient", "claim amount", "readmission", "visit date", "ward") if k in joined
    )
    if hc_hits >= 2:
        return "healthcare"

    saas_hits = sum(
        1 for k in ("mrr", "subscription", "churn rate", "plan type", "saas") if k in joined
    )
    if saas_hits >= 2:
        return "saas"

    support_hits = sum(
        1 for k in ("ticket", "csat", "resolution hours", "escalation", "support") if k in joined
    )
    if support_hits >= 2:
        return "support"

    ins_hits = sum(
        1 for k in ("policy type", "loss ratio", "claim amount", "premium", "insurance") if k in joined
    )
    if ins_hits >= 2:
        return "insurance"

    re_hits = sum(
        1 for k in ("sale price", "cap rate", "property type", "listing", "real estate") if k in joined
    )
    if re_hits >= 2:
        return "real_estate"

    tel_hits = sum(
        1 for k in ("plan tier", "monthly revenue", "subscriber", "telecom", "data usage") if k in joined
    )
    if tel_hits >= 2:
        return "telecom"

    hosp_hits = sum(
        1 for k in ("room revenue", "occupancy", "hotel brand", "hospitality", "check in") if k in joined
    )
    if hosp_hits >= 2:
        return "hospitality"

    energy_hits = sum(
        1 for k in ("energy kwh", "utility cost", "efficiency score", "grid region") if k in joined
    )
    if energy_hits >= 2:
        return "energy"

    edu_hits = sum(
        1 for k in ("enrollment", "student", "pass rate", "grade level", "school region") if k in joined
    )
    if edu_hits >= 2:
        return "education"

    sc_hits = sum(
        1 for k in ("freight", "carrier", "shipment", "on time rate", "supply chain") if k in joined
    )
    if sc_hits >= 2:
        return "supply_chain"

    if ("product category" in joined or "product" in joined) and (
        "revenue" in joined or "profit" in joined or "sales amount" in joined
    ):
        return "retail"

    fin_hits = sum(
        1 for k in ("budget", "expense", "ledger", "gl", "invoice", "payable") if k in joined
    )
    if fin_hits >= 2:
        return "finance"

    return "generic"


def resolve_suggestion_vertical(
    columns: Sequence[str],
    *,
    dashboard_kind: str = "generic",
    executive_domain: Optional[str] = None,
) -> str:
    """Column heuristics first; then executive domain; then dashboard kind."""
    vertical = detect_suggestion_vertical(columns)
    if vertical != "generic":
        return vertical
    if executive_domain:
        mapped = _EXEC_DOMAIN_TO_VERTICAL.get(str(executive_domain).strip().lower())
        if mapped:
            return mapped
    kind = str(dashboard_kind or "").strip().lower()
    if kind in VERTICAL_DOMAIN_NOUN and kind != "generic":
        return kind
    if kind == "sales":
        return "retail"
    return vertical


def _is_flag_metric_name(col: str) -> bool:
    n = _norm_col(col).replace(" ", "_")
    if n.endswith("_flag") or n.endswith(" flag"):
        return True
    return any(
        tok in n
        for tok in (
            "fraud_flag",
            "attrition_flag",
            "churn_flag",
            "escalation_flag",
            "delinquency_flag",
        )
    )


def _is_binary_numeric_metric(
    df: Optional[pd.DataFrame], col: str, profile: Optional[Dict[str, Any]]
) -> bool:
    if df is None or col not in df.columns:
        return False
    ct = (profile or {}).get("column_types", {})
    if ct.get(col) not in ("number", "category", "text"):
        return False
    nums = pd.to_numeric(df[col], errors="coerce").dropna()
    if nums.empty:
        return False
    uniq = {int(v) if float(v).is_integer() else float(v) for v in nums.unique()[:6]}
    return uniq.issubset({0, 1, 0.0, 1.0}) and len(uniq) <= 2


def _is_unusable_suggest_metric(
    col: str,
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
) -> bool:
    if _is_flag_metric_name(col):
        return True
    if df is not None and _is_binary_numeric_metric(df, col, profile):
        return True
    return False


def _is_weak_secondary_metric(
    col: str, vertical: str, primary: Optional[str]
) -> bool:
    if primary and col == primary:
        return False
    n = _norm_col(col)
    if any(tok in n for tok in _WEAK_SECONDARY_METRIC_TOKENS):
        return vertical in (
            "retail",
            "marketing",
            "saas",
            "generic",
            "sales",
        )
    return False


def _is_temporal_breakdown_dimension(
    col: str, date_cols: Optional[Sequence[str]] = None
) -> bool:
    if date_cols and col in date_cols:
        return True
    n = _norm_col(col).replace(" ", "_")
    if n in (
        "month",
        "report_month",
        "billing_month",
        "period_month",
        "week",
        "quarter",
        "year",
        "day",
        "date",
        "timestamp",
        "period",
        "term_date",
        "billing_month",
    ):
        return True
    return any(
        tok in n for tok in ("_month", "_date", "_week", "_quarter", "_year", "_day")
    )


def _is_id_like_dimension(col: str) -> bool:
    n = _norm_col(col)
    if n in ("id", "uuid", "guid"):
        return True
    return n.endswith(" id") or n.endswith("_id") or " employee id" in f" {n} "


def _filter_suggest_metrics(
    metrics: Sequence[str],
    *,
    df: Optional[pd.DataFrame],
    profile: Optional[Dict[str, Any]],
    vertical: str,
    primary: Optional[str],
) -> List[str]:
    out: List[str] = []
    for m in metrics:
        if _is_unusable_suggest_metric(m, df, profile):
            continue
        if _is_weak_secondary_metric(m, vertical, primary):
            continue
        out.append(str(m))
    if primary and primary not in out and not _is_unusable_suggest_metric(
        primary, df, profile
    ):
        out.insert(0, primary)
    return out or [str(metrics[0])] if metrics else []


def _filter_breakdown_dims(
    dims: Sequence[str],
    date_cols: Optional[Sequence[str]] = None,
) -> List[str]:
    out: List[str] = []
    for d in dims:
        if _is_temporal_breakdown_dimension(d, date_cols):
            continue
        if _is_id_like_dimension(d):
            continue
        out.append(str(d))
    return out


def _reorder_primary_first(metrics: List[str], primary: Optional[str]) -> List[str]:
    if not primary or primary not in metrics:
        return metrics
    return [primary] + [m for m in metrics if m != primary]


def _correlation_pair_allowed(
    m0: str,
    m1: str,
    df: Optional[pd.DataFrame],
    profile: Optional[Dict[str, Any]],
) -> bool:
    if not m0 or not m1 or m0 == m1:
        return False
    if _is_unusable_suggest_metric(m0, df, profile):
        return False
    if _is_unusable_suggest_metric(m1, df, profile):
        return False
    n0, n1 = _norm_col(m0), _norm_col(m1)
    if "flag" in n0 or "flag" in n1:
        return False
    rate_tokens = ("rate", "ratio", "pct", "percent", "score", "margin")
    has_rate = any(t in n0 for t in rate_tokens) or any(t in n1 for t in rate_tokens)
    amount_tokens = (
        "revenue",
        "profit",
        "cost",
        "amount",
        "balance",
        "salary",
        "price",
        "mrr",
        "freight",
    )
    has_amount = any(t in n0 for t in amount_tokens) or any(t in n1 for t in amount_tokens)
    return has_rate or has_amount


def _format_top_performer_question(
    vertical: str, metric: str, dimension: str
) -> str:
    ml, dl = _q_label(metric), _q_label(dimension)
    if vertical == "support" and "csat" in ml and "priority" in dl:
        return "Which ticket priority is creating the biggest CSAT risk?"
    if vertical == "support" and "csat" in ml:
        return "Where should we focus to improve CSAT scores?"
    if vertical == "support" and "resolution" in ml:
        return f"Which {_q_label(dimension)} drives the longest resolution times?"
    if vertical == "hr" and "attrition" in ml and "rate" in ml:
        return f"Which {dl} has the highest {ml}?"
    if vertical == "insurance" and "loss" in ml:
        return f"Which {dl} shows the highest {ml}?"
    return f"Which {dl} has the highest {ml}?"


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
    """Prefer primary metric; banking may use utilization rate when present."""
    if not metrics:
        return None
    primary = metrics[0]
    if vertical == "banking":
        util = _find_column_by_tokens(
            list(columns), ("utilization_pct", "utilization"), pool=list(metrics)
        )
        if util:
            return util
    for m in metrics[:3]:
        ml = _norm_col(m)
        if any(t in ml for t in ("pct", "percent", "rate", "ratio")) and not _is_flag_metric_name(
            m
        ):
            return m
    return primary


def _generate_basic_candidates(
    metrics: Sequence[str],
    dims: Sequence[str],
    date_col: Optional[str],
    *,
    vertical: str = "generic",
    columns: Optional[Sequence[str]] = None,
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
    date_cols: Optional[Sequence[str]] = None,
) -> List[QuestionCandidate]:
    out: List[QuestionCandidate] = []
    if not metrics or not dims:
        return out

    m0, d0 = metrics[0], dims[0]
    _add_candidate(
        out,
        text=_format_top_performer_question(vertical, m0, d0),
        category="basic",
        intent="top_performer",
        metric=m0,
        dimension=d0,
        score=10.0,
    )

    compare_dim = d0
    for d in dims[1:]:
        if d != d0:
            compare_dim = d
            break
    _add_candidate(
        out,
        text=f"Compare {_q_label(m0)} across {_dim_scope_plural(compare_dim)}",
        category="basic",
        intent="compare",
        metric=m0,
        dimension=compare_dim,
        score=9.0,
    )

    if date_col:
        trend_metric = _pick_trend_metric(vertical, metrics, columns or metrics)
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

    rank_metric = metrics[1] if len(metrics) > 1 else None
    if rank_metric and not _is_weak_secondary_metric(rank_metric, vertical, m0):
        if not _is_unusable_suggest_metric(rank_metric, df, profile):
            _add_candidate(
                out,
                text=(
                    f"What are the top 5 {_q_label(d0)} ranked by "
                    f"{_q_label(rank_metric)}?"
                ),
                category="basic",
                intent="ranking",
                metric=rank_metric,
                dimension=d0,
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
    elif vertical == "support":
        _add_candidate(
            out,
            text="Where should we focus to improve CSAT and resolution performance?",
            category="executive",
            intent="opportunity",
            score=9.5,
        )
        cat = _find_column_by_tokens(dims, ("ticket_category", "category"))
        res = _find_column_by_tokens(metrics, ("resolution_hours", "resolution"))
        if cat and res:
            _add_candidate(
                out,
                text=f"Which {_q_label(cat)} creates the biggest resolution bottleneck?",
                category="executive",
                intent="underperformers",
                metric=res,
                dimension=cat,
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
    *,
    df: Optional[pd.DataFrame] = None,
    profile: Optional[Dict[str, Any]] = None,
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
        m0, m1 = metrics[0], metrics[1]
        if _correlation_pair_allowed(m0, m1, df, profile):
            _add_candidate(
                out,
                text=(
                    f"How does {_q_label(m0)} correlate with "
                    f"{_q_label(m1)}?"
                ),
                category="relationship",
                intent="correlation",
                metric=m0,
                dimension=m1,
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
    has_correlation = any(c.intent == "correlation" for c in pool)
    if max_n == 6:
        rel_slots = 1 if has_correlation else 1
        quotas = {"basic": 3, "executive": 2, "relationship": rel_slots}
    else:
        quotas = {
            cat: max(1, round(max_n * share))
            for cat, share in CATEGORY_TARGETS.items()
        }

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
            if cand.intent == "correlation" and not has_correlation:
                continue
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
            if cand.intent == "correlation" and not has_correlation:
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
    mapped_primary: Optional[str] = None,
    executive_domain: Optional[str] = None,
) -> List[str]:
    vertical = resolve_suggestion_vertical(
        columns,
        dashboard_kind=dashboard_kind,
        executive_domain=executive_domain,
    )

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

    primary = mapped_primary if mapped_primary in columns else (metrics[0] if metrics else None)
    metrics = _reorder_primary_first(metrics, primary)
    metrics = _filter_suggest_metrics(
        metrics,
        df=df,
        profile=profile,
        vertical=vertical,
        primary=primary,
    )
    dims = _filter_breakdown_dims(dims, date_cols)
    if not dims and ranked_dims:
        dims = _filter_breakdown_dims([c for c, _ in ranked_dims], date_cols)
    if not dims:
        return []

    date_for_trend = date_col or (date_cols[0] if date_cols else None)
    if not date_for_trend:
        temporal = _find_column_by_tokens(
            columns, ("month", "report_month", "billing_month", "period", "term_date")
        )
        if temporal:
            try:
                from intent_engine.trend_date_resolve import group_column_is_time_series_eligible

                if group_column_is_time_series_eligible(df, temporal):
                    date_for_trend = temporal
            except Exception:
                pass

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
            date_cols=date_cols,
        )
    )
    candidates.extend(
        _generate_relationship_candidates(metrics, dims, df=df, profile=profile)
    )

    if vertical == "banking":
        trend_date = date_for_trend or _find_column_by_tokens(
            columns, ("month", "report_month", "period")
        )
        util = _find_column_by_tokens(columns, ("utilization_pct", "utilization"))
        if util and trend_date and _metric_can_trend(df, profile, util, trend_date):
            _add_candidate(
                candidates,
                text=f"Show {_q_label(util)} trend by {_q_label(trend_date)}",
                category="basic",
                intent="trend",
                metric=util,
                dimension=trend_date,
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
