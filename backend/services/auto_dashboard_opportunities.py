"""
Auto Dashboard chart opportunity detection, scoring, and diversity-aware selection.

Discovers trend, comparison, ranking, correlation, composition, and geographic
visualizations from column inventory — without LLM routing.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import pandas as pd

from analytics_metadata import format_executive_number
from services.kpi_polish import is_valid_kpi_leader_value, is_valid_subtitle_dimension

_MAX_SCATTER_POINTS = 120

_FORBIDDEN_BREAKDOWN_DIM_TOKENS = (
    "employee_name",
    "full_name",
    "operator",
    "sales_rep",
    "salesperson",
    "sales person",
    "manager",
    "email",
    "uuid",
    "guid",
)

_COMPOSITION_BLOCK_METRIC_TOKENS = (
    "rate",
    "ratio",
    "score",
    "rating",
    "satisfaction",
    "utilization",
    "attainment",
    "margin",
    "latency",
    "duration",
    "resolution",
    "delivery",
    "ship_days",
    "lead_time",
    "stay",
    "growth_rate",
    "ctr",
    "nps",
)

_GEO_KEYWORDS = (
    "region",
    "zone",
    "state",
    "country",
    "city",
    "territory",
    "province",
    "county",
    "postal",
    "zipcode",
    "zip_code",
    "geo",
    "location",
    "metro",
    "district",
    "warehouse",
    "plant",
    "facility",
    "site",
    "market",
)

_HIGH_CARDINALITY_DIM_HINTS = (
    "city",
    "employee",
    "customer_id",
    "cust_id",
    "emp_id",
    "order_id",
    "invoice_id",
    "user_id",
    "account_id",
    "member_id",
    "patient_id",
)

_DIM_PRIORITY_HINTS: Tuple[Tuple[str, int], ...] = (
    ("region", 100),
    ("country", 95),
    ("department", 92),
    ("product", 90),
    ("customer_segment", 88),
    ("segment", 86),
    ("campaign", 84),
    ("channel", 82),
    ("category", 80),
    ("city", 45),
)

_PERCENT_NAME = re.compile(
    r"\b(rate|ratio|percent|pct|conversion|satisfaction|score|margin|share)\b",
    re.I,
)

_LAT_LON = frozenset({"latitude", "longitude", "lat", "lon", "lng"})

MAX_DONUT_CHARTS = 2

_OPPORTUNITY_PRIORITY = {
    "trend": 96,
    "ranking": 90,
    "composition": 86,
    "correlation": 84,
    "geographic": 80,
    "compare": 72,
    "distribution": 68,
}

# Coverage-first selection order (executive BI flow)
_COVERAGE_BUCKETS: Tuple[str, ...] = (
    "trend",
    "ranking",
    "composition",
    "distribution",
    "relationship",
    "geographic",
    "compare",
)

_BREAKDOWN_TYPES = frozenset({"bar", "horizontalbar", "pie", "donut", "histogram"})
_TEMPORAL_TYPES = frozenset({"line", "area"})
_COMPOSITION_TYPES = frozenset({"pie", "donut"})


@dataclass
class ColumnInventory:
    dates: List[str] = field(default_factory=list)
    numerics: List[str] = field(default_factory=list)
    categories: List[str] = field(default_factory=list)
    geographic: List[str] = field(default_factory=list)
    percentages: List[str] = field(default_factory=list)


@dataclass
class DashboardDeps:
    numeric_series: Callable[[str], pd.Series]
    time_series_grouped: Callable[..., Tuple[Optional[pd.Series], Dict[str, Any]]]
    series_payload: Callable[..., Optional[Dict[str, Any]]]
    pretty_label: Callable[[Any, int], str]
    chart_title_by_dimension: Callable[..., str]
    freq_human_label: Callable[[str], str]
    id_like_column: Callable[[Optional[str]], bool]
    priority_metrics: Callable[[str], Tuple[Optional[str], Optional[str], Optional[str]]]
    record_metric_key: str = "__records__"


@dataclass
class KpiChartContext:
    """Facts already shown on KPI cards — avoid redundant breakdown charts."""
    title: str
    value: str
    subtitle: str
    dimension_hint: Optional[str] = None
    metric_hint: Optional[str] = None


def _norm_col(col: str) -> str:
    return str(col).strip().lower().replace(" ", "_")


def _is_temporal_breakdown_dimension(dim: Optional[str]) -> bool:
    """Block month/date-like columns as categorical breakdown axes (use trend charts instead)."""
    if not dim:
        return False
    norm = _norm_col(str(dim))
    if norm in (
        "month",
        "report_month",
        "reporting_month",
        "period_month",
        "week",
        "quarter",
        "year",
        "day",
        "date",
        "timestamp",
    ):
        return True
    return any(
        tok in norm
        for tok in ("_month", "_date", "_week", "_quarter", "_year", "_day")
    )


def _is_geographic_name(col: str) -> bool:
    n = _norm_col(col)
    if n in _LAT_LON:
        return False
    return any(kw in n for kw in _GEO_KEYWORDS)


def _is_percentage_column(
    col: str, series: pd.Series, id_like_fn: Callable[[Optional[str]], bool]
) -> bool:
    if id_like_fn(col):
        return False
    if not _PERCENT_NAME.search(str(col)):
        return False
    nums = pd.to_numeric(series, errors="coerce").dropna()
    if nums.empty:
        return False
    lo, hi = float(nums.min()), float(nums.max())
    return (0 <= lo and hi <= 1.05) or (0 <= lo and hi <= 100.5)


def _numeric_series_from_frame(df: pd.DataFrame, column_name: str) -> pd.Series:
    return pd.to_numeric(
        df[column_name]
        .astype(str)
        .str.replace(",", "", regex=False)
        .str.replace("₹", "", regex=False)
        .str.replace("$", "", regex=False),
        errors="coerce",
    )


def _unique_count_for_column(
    df: pd.DataFrame,
    col: str,
    profile: Optional[Dict[str, Any]] = None,
    *,
    string_normalized: bool = False,
    memo: Optional[Dict[str, int]] = None,
) -> int:
    """Column cardinality; prefers profile unique_counts, optional per-pass memo."""
    memo_key = f"{col}:{'str' if string_normalized else 'raw'}"
    if memo is not None and memo_key in memo:
        return memo[memo_key]
    uc = (profile or {}).get("unique_counts") or {}
    if col in uc:
        nu = int(uc[col])
    elif string_normalized:
        nu = int(df[col].dropna().astype(str).nunique())
    else:
        nu = int(df[col].nunique(dropna=True))
    if memo is not None:
        memo[memo_key] = nu
    return nu


def _period_column_usable_for_trends(df: pd.DataFrame, col: str) -> bool:
    """True when a date-part-named column holds parseable period timestamps (e.g. 2022-01)."""
    try:
        dd = pd.to_datetime(df[col], errors="coerce")
    except Exception:
        return False
    n_rows = max(len(df), 1)
    valid = int(dd.notna().sum())
    if valid < max(8, int(0.1 * n_rows)):
        return False
    periods = dd.dropna().dt.to_period("M")
    return int(periods.nunique()) >= 2


def classify_columns(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    *,
    id_like_fn: Callable[[Optional[str]], bool],
    numeric_series_fn: Optional[Callable[[str], pd.Series]] = None,
) -> ColumnInventory:
    ct = profile.get("column_types", {}) or {}
    inv = ColumnInventory()
    n_rows = max(len(df), 1)
    ns = numeric_series_fn or (lambda c: _numeric_series_from_frame(df, c))

    try:
        from intent_engine.column_resolve import is_date_part_column
    except Exception:
        is_date_part_column = lambda _c: False  # type: ignore[misc, assignment]

    for col in df.columns:
        c = str(col)
        tp = ct.get(c)
        if tp == "date":
            inv.dates.append(c)
            continue
        if tp == "number" and not id_like_fn(c):
            if is_date_part_column(c):
                nu = _unique_count_for_column(
                    df, c, profile, string_normalized=True
                )
                if 2 <= nu <= 60:
                    inv.categories.append(c)
                continue
            n = _norm_col(c)
            if n in _LAT_LON:
                continue
            inv.numerics.append(c)
            if _is_percentage_column(c, ns(c), id_like_fn):
                inv.percentages.append(c)
            continue
        if tp in ("category", "text"):
            nu = _unique_count_for_column(
                df, c, profile, string_normalized=True
            )
            if nu < 2 or nu > 60:
                continue
            if _is_geographic_name(c):
                inv.geographic.append(c)
            else:
                inv.categories.append(c)

    for col in df.columns:
        c = str(col)
        if c in inv.dates:
            continue
        if is_date_part_column(c) and not _period_column_usable_for_trends(df, c):
            continue
        if (
            _norm_col(c) in ("month", "report_month", "reporting_month", "period_month")
            or "date" in _norm_col(c)
            or "timestamp" in _norm_col(c)
        ):
            dd = pd.to_datetime(df[c], errors="coerce")
            if dd.notna().sum() >= max(8, int(0.1 * n_rows)):
                inv.dates.append(c)

    inv.dates = _dedupe_preserve(inv.dates)
    if inv.dates:
        primary_dates = [
            d
            for d in inv.dates
            if not is_date_part_column(d) or _period_column_usable_for_trends(df, d)
        ]
        if primary_dates:
            inv.dates = primary_dates
    inv.numerics = _dedupe_preserve(inv.numerics)
    inv.categories = _dedupe_preserve(inv.categories)
    inv.geographic = _dedupe_preserve(inv.geographic)
    inv.percentages = _dedupe_preserve(inv.percentages)
    return inv


def _dedupe_preserve(items: List[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for x in items:
        k = x.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(x)
    return out


def target_chart_count(inv: ColumnInventory, row_count: int) -> int:
    richness = (
        len(inv.dates)
        + len(inv.numerics)
        + len(inv.categories)
        + len(inv.geographic)
        + len(inv.percentages)
    )
    if richness >= 14 or row_count >= 450:
        return 8
    if richness >= 9 or row_count >= 180:
        return 6
    if richness >= 5:
        return 4
    return 3


def extract_kpi_chart_context(cards: Optional[List[Dict[str, Any]]]) -> List[KpiChartContext]:
    out: List[KpiChartContext] = []
    if not cards:
        return out
    for raw in cards:
        if not raw:
            continue
        title = str(raw.get("title") or "").strip().lower()
        value = str(raw.get("value") or "").strip()
        subtitle = str(raw.get("subtitle") or "").strip().lower()
        dim_hint = None
        metric_hint = None
        for kw in (
            "region",
            "department",
            "product",
            "category",
            "segment",
            "campaign",
            "channel",
            "city",
            "country",
        ):
            if kw in title:
                dim_hint = kw
                break
        for kw in ("revenue", "profit", "cost", "sales", "quantity", "amount"):
            if kw in title or kw in subtitle:
                metric_hint = kw
                break
        out.append(
            KpiChartContext(
                title=title,
                value=value,
                subtitle=subtitle,
                dimension_hint=dim_hint,
                metric_hint=metric_hint,
            )
        )
    return out


def _metric_key(chart: Dict[str, Any], record_key: str) -> str:
    mc = chart.get("metricColumn")
    if mc and str(mc).strip().lower() != record_key:
        return str(mc).strip().lower()
    title = str(chart.get("title") or "").strip().lower()
    if "distribution" in title or "category distribution" in title:
        return record_key
    return title


def _dimension_key(chart: Dict[str, Any]) -> Optional[str]:
    dim = chart.get("dimensionColumn")
    if dim:
        return str(dim).strip().lower()
    inter = chart.get("interaction") or {}
    drill = inter.get("drillDimensions") or []
    if drill and isinstance(drill[0], dict):
        col = drill[0].get("column")
        if col:
            return str(col).strip().lower()
    return None


def _norm_chart_type(chart_type: Optional[str]) -> str:
    ct = (chart_type or "bar").strip().lower()
    return "horizontalbar" if ct == "horizontalbar" else ct


def _coverage_bucket(chart: Dict[str, Any]) -> str:
    opp = str(
        chart.get("_opportunityType") or chart.get("opportunityType") or "compare"
    ).lower()
    if opp == "correlation":
        return "relationship"
    return opp


def _dimension_cardinality(
    df: pd.DataFrame,
    dim_c: str,
    profile: Optional[Dict[str, Any]] = None,
    *,
    memo: Optional[Dict[str, int]] = None,
) -> int:
    try:
        return _unique_count_for_column(
            df, dim_c, profile, string_normalized=True, memo=memo
        )
    except Exception:
        return 0


def _dimension_priority(col: str, cardinality: int) -> int:
    n = _norm_col(col)
    score = 50
    for kw, pts in _DIM_PRIORITY_HINTS:
        if kw in n:
            score = max(score, pts)
    if any(h in n for h in _HIGH_CARDINALITY_DIM_HINTS) and cardinality > 8:
        score -= 45
    elif cardinality > 12:
        score -= 20
    elif 3 <= cardinality <= 8:
        score += 8
    return score


def _ordered_breakdown_dimensions(
    df: pd.DataFrame,
    inv: ColumnInventory,
    id_like_fn: Callable[[Optional[str]], bool],
    profile: Optional[Dict[str, Any]] = None,
    *,
    cardinality_memo: Optional[Dict[str, int]] = None,
) -> List[str]:
    pool = _dedupe_preserve(inv.geographic + inv.categories)
    pool = [
        c
        for c in pool
        if _breakdown_dimension_eligible(
            c, df, id_like_fn, profile, cardinality_memo=cardinality_memo
        )
    ]
    scored = [
        (
            col,
            _dimension_priority(
                col, _dimension_cardinality(df, col, profile, memo=cardinality_memo)
            ),
        )
        for col in pool
    ]
    scored.sort(key=lambda t: (-t[1], t[0].lower()))
    return [c for c, _ in scored]


def _composition_eligible_dim(
    df: pd.DataFrame,
    dim_c: str,
    id_like_fn: Callable[[Optional[str]], bool],
    profile: Optional[Dict[str, Any]] = None,
    *,
    cardinality_memo: Optional[Dict[str, int]] = None,
) -> bool:
    if id_like_fn(dim_c):
        return False
    nu = _dimension_cardinality(df, dim_c, profile, memo=cardinality_memo)
    if nu < 2 or nu > 8:
        return False
    n = _norm_col(dim_c)
    if any(h in n for h in _HIGH_CARDINALITY_DIM_HINTS) and nu > 6:
        return False
    return True


def _title_case_phrase(label: str) -> str:
    s = str(label or "").replace("_", " ").strip()
    if not s:
        return "Metric"
    return " ".join(w[:1].upper() + w[1:].lower() if len(w) > 1 else w.upper() for w in s.split())


_CANONICAL_TIME_TOKENS = frozenset(
    {"monthly", "weekly", "daily", "quarterly", "yearly", "hourly", "period", "minute"}
)
_CANONICAL_SUFFIX_TOKENS = frozenset({"trend"})
_CANONICAL_AGG_TOKENS = frozenset({"total", "average", "avg", "mean"})


def normalize_canonical_chart_title(title: str) -> str:
    """Strip duplicated semantic tokens (Monthly Monthly, Trend Trend, by X by X)."""
    s = " ".join(str(title or "").split())
    if not s:
        return ""
    words = s.split()
    out: List[str] = []
    seen_time = False
    seen_trend = False
    seen_agg: Set[str] = set()
    for w in words:
        wl = w.lower()
        if wl in _CANONICAL_TIME_TOKENS:
            if seen_time:
                continue
            seen_time = True
        elif wl in _CANONICAL_SUFFIX_TOKENS:
            if seen_trend:
                continue
            seen_trend = True
        elif wl in _CANONICAL_AGG_TOKENS:
            if wl in seen_agg:
                continue
            seen_agg.add(wl)
        elif out and out[-1].lower() == wl:
            continue
        out.append(w)
    joined = " ".join(out)
    by_match = re.match(r"^(.+?)\s+by\s+(.+)$", joined, re.I)
    if by_match:
        left = by_match.group(1).strip()
        right = by_match.group(2).strip()
        right_parts = [p.strip() for p in re.split(r"\s+by\s+", right, flags=re.I)]
        if len(right_parts) >= 2:
            base = right_parts[0]
            if all(p.lower() == base.lower() for p in right_parts):
                right = base
        if right.lower() == left.lower():
            joined = left
        else:
            joined = f"{left} by {right}"
    return _format_executive_chart_title(joined)


def _format_executive_chart_title(phrase: str) -> str:
    """Title case with lowercase particles (by, vs, and)."""
    words = phrase.split()
    if not words:
        return ""
    particles = frozenset({"by", "vs", "and", "or", "of", "per"})
    out: List[str] = []
    for w in words:
        wl = w.lower()
        if wl in particles:
            out.append(wl)
        elif len(w) > 1:
            out.append(w[:1].upper() + w[1:].lower())
        else:
            out.append(w.upper())
    return " ".join(out)


def _metric_semantic_strength(metric_key: str, title: str = "") -> int:
    blob = f"{metric_key} {title}".lower().replace("_", " ")
    if metric_key in ("__records__", "records"):
        return 5
    if re.search(
        r"\b(revenue|profit|sales|order[_ ]?value|loan[_ ]?balance|spend|gmv|deposit[_ ]?balance|"
        r"salary|compensation|bonus|pay|wage)\b",
        blob,
    ):
        return 100
    if re.search(
        r"\b(conversion[_ ]?rate|defect[_ ]?rate|satisfaction|utilization|delinquency|"
        r"attrition|csat|nps|roas|resolution[_ ]?rate|attainment|performance[_ ]?rating|"
        r"engagement[_ ]?score)\b",
        blob,
    ):
        return 80
    if re.search(
        r"\b(account[_ ]?age|age months|tenure months|vintage|monthly income|credit score|"
        r"transaction count|monthly age|age trend|age band|age_band)\b",
        blob,
    ):
        return 22
    if re.search(r"\b(^age$| by age\b|records by age)\b", blob):
        return 22
    if re.search(
        r"\b(orders|tickets|incidents|patients|employees|headcount|admissions|claims|"
        r"customers|hires|terminations|downtime)\b",
        blob,
    ):
        return 60
    if re.search(r"\b(quantity|units|qty)\b", blob):
        return 40
    return 30


_MFG_QUALITY_METRIC_RE = re.compile(
    r"\b(defect[_ ]?rate|defect[_ ]?count|downtime|scrap|yield|oee|quality|rework)\b",
    re.I,
)
_MFG_VOLUME_METRIC_RE = re.compile(
    r"\b(units[_ ]?produced|throughput|output)\b",
    re.I,
)


def _is_manufacturing_quality_metric(metric_key: str, title: str = "") -> bool:
    blob = f"{metric_key} {title}".lower().replace("_", " ")
    return bool(_MFG_QUALITY_METRIC_RE.search(blob))


def _is_manufacturing_volume_metric(metric_key: str, title: str = "") -> bool:
    blob = f"{metric_key} {title}".lower().replace("_", " ")
    return bool(_MFG_VOLUME_METRIC_RE.search(blob))


def _is_weak_manufacturing_volume_breakdown(
    chart: Dict[str, Any], record_key: str
) -> bool:
    ct = _norm_chart_type(chart.get("chartType"))
    if ct not in _BREAKDOWN_TYPES or ct in _TEMPORAL_TYPES:
        return False
    mk = _metric_key(chart, record_key)
    title = str(chart.get("title") or "")
    if not _is_manufacturing_volume_metric(mk, title):
        return False
    return bool(evaluate_chart_visual_quality(chart).get("weak_differentiation"))


def _is_manufacturing_low_insight_volume_chart(
    chart: Dict[str, Any], record_key: str
) -> bool:
    """Category/share production volume views — prefer quality/downtime breakdowns."""
    mk = _metric_key(chart, record_key)
    title = str(chart.get("title") or "")
    if not _is_manufacturing_volume_metric(mk, title):
        return False
    ct = _norm_chart_type(chart.get("chartType"))
    if ct in _TEMPORAL_TYPES:
        return False
    return ct in _BREAKDOWN_TYPES or ct in _COMPOSITION_TYPES


def _pool_has_manufacturing_quality_alternative(
    charts: List[Dict[str, Any]],
    record_key: str,
    *,
    exclude_title: Optional[str] = None,
) -> bool:
    for chart in charts:
        title = str(chart.get("title") or "")
        if exclude_title and title.lower() == exclude_title.lower():
            continue
        mk = _metric_key(chart, record_key)
        if not _is_manufacturing_quality_metric(mk, title):
            continue
        ct = _norm_chart_type(chart.get("chartType"))
        if ct in _TEMPORAL_TYPES:
            continue
        quality = evaluate_chart_visual_quality(chart)
        if not quality.get("weak_differentiation"):
            return True
        if float(quality.get("spread_ratio") or 0) >= 0.06:
            return True
    return False


def _manufacturing_duplicate_volume_trend(
    chart: Dict[str, Any],
    selected: List[Dict[str, Any]],
    record_key: str,
) -> bool:
    ct = _norm_chart_type(chart.get("chartType"))
    if ct not in _TEMPORAL_TYPES:
        return False
    mk = _metric_key(chart, record_key)
    title = str(chart.get("title") or "")
    if not _is_manufacturing_volume_metric(mk, title):
        return False
    for existing in selected:
        if _norm_chart_type(existing.get("chartType")) not in _TEMPORAL_TYPES:
            continue
        if _is_manufacturing_volume_metric(
            _metric_key(existing, record_key),
            str(existing.get("title") or ""),
        ):
            return True
    return False


def _is_manufacturing_operations_schema(columns: List[str]) -> bool:
    blob = " ".join(_norm_col(c) for c in columns)
    signals = (
        "units_produced",
        "production_date",
        "defect_rate",
        "defect_count",
        "downtime_minutes",
        "downtime",
        "product_family",
        "production_line",
        "plant",
        "scrap",
        "yield",
    )
    return sum(1 for s in signals if s in blob) >= 4


def _manufacturing_preferred_dims(breakdown_dims: List[str]) -> List[str]:
    hints = (
        "product_family",
        "production_line",
        "product_line",
        "plant",
        "facility",
        "shift",
        "machine",
    )
    preferred: List[str] = []
    for dim_c in breakdown_dims:
        nd = _norm_col(dim_c)
        if any(h in nd for h in hints):
            preferred.append(dim_c)
    for dim_c in breakdown_dims:
        if dim_c not in preferred:
            preferred.append(dim_c)
    return preferred


def _manufacturing_quality_metric_order(numerics: List[str]) -> List[str]:
    rank = {
        "defect_rate": 0,
        "defect_count": 1,
        "downtime_minutes": 2,
        "downtime": 3,
        "yield": 4,
        "quality": 5,
        "oee": 6,
        "scrap_cost": 7,
        "scrap": 8,
    }
    out = [
        m
        for m in numerics
        if _is_manufacturing_quality_metric(m, m)
        and not _is_manufacturing_volume_metric(m, m)
    ]
    out.sort(key=lambda m: rank.get(_norm_col(m), 99))
    return out


def _chart_story_family(chart_type: str, opp_type: str) -> str:
    ct = _norm_chart_type(chart_type)
    opp = str(opp_type or "").lower()
    if ct in _COMPOSITION_TYPES:
        return "composition"
    if ct in _TEMPORAL_TYPES:
        return "trend"
    if ct == "scatter":
        return "scatter"
    if opp == "distribution" or ct == "histogram":
        return "distribution"
    return "ranking"


def _chart_story_signature(
    chart: Dict[str, Any], record_key: str
) -> Optional[Tuple[str, str, Tuple[str, ...]]]:
    dim = _dimension_key(chart)
    if not dim:
        return None
    ct = _norm_chart_type(chart.get("chartType"))
    if ct in _TEMPORAL_TYPES or ct == "scatter":
        return None
    family = _chart_story_family(ct, str(chart.get("_opportunityType") or ""))
    labels = chart.get("labels") or []
    top3 = tuple(
        str(l).strip().lower() for l in labels[:3] if str(l).strip()
    )
    if len(top3) < 2:
        return None
    return (dim.lower(), family, top3)


def _is_generic_records_chart(chart: Dict[str, Any], record_key: str) -> bool:
    mk = _metric_key(chart, record_key)
    if mk == record_key or mk == "records":
        return True
    title = str(chart.get("title") or "").strip().lower()
    return title.startswith("records by ")


def _stronger_metric_exists_for_dimension(
    charts: List[Dict[str, Any]],
    dim_col: str,
    record_key: str,
    *,
    min_strength: int = 40,
) -> bool:
    dim_l = str(dim_col).strip().lower()
    for chart in charts:
        if _is_generic_records_chart(chart, record_key):
            continue
        dk = _dimension_key(chart)
        if not dk or dk.lower() != dim_l:
            continue
        strength = _metric_semantic_strength(
            _metric_key(chart, record_key),
            str(chart.get("title") or ""),
        )
        if strength >= min_strength:
            return True
    return False


def _prune_redundant_records_charts(
    charts: List[Dict[str, Any]], record_key: str
) -> List[Dict[str, Any]]:
    dims_with_strong: Set[str] = set()
    for chart in charts:
        if _is_generic_records_chart(chart, record_key):
            continue
        dk = _dimension_key(chart)
        if not dk:
            continue
        if _metric_semantic_strength(
            _metric_key(chart, record_key), str(chart.get("title") or "")
        ) >= 40:
            dims_with_strong.add(dk.lower())
    out: List[Dict[str, Any]] = []
    for chart in charts:
        if _is_generic_records_chart(chart, record_key):
            dk = _dimension_key(chart)
            if dk and dk.lower() in dims_with_strong:
                continue
        out.append(chart)
    return out


def _prune_duplicate_chart_stories(
    charts: List[Dict[str, Any]], record_key: str
) -> List[Dict[str, Any]]:
    kept: List[Dict[str, Any]] = []
    for chart in charts:
        if _chart_story_blocked_by_selected(kept, chart, record_key):
            continue
        survivors: List[Dict[str, Any]] = []
        for existing in kept:
            if _chart_story_blocked_by_selected([chart], existing, record_key):
                continue
            survivors.append(existing)
        survivors.append(chart)
        kept = survivors
    return kept


def _is_banking_risk_metric(metric_key: str, title: str = "") -> bool:
    blob = f"{metric_key} {title}".lower().replace("_", " ")
    return bool(
        re.search(
            r"\b(delinquency|utilization|credit score|credit_score)\b",
            blob,
        )
    )


def _is_banking_executive_risk_metric(metric_key: str, title: str = "") -> bool:
    """Delinquency/utilization — preferred Overview risk metrics (not credit score)."""
    blob = f"{metric_key} {title}".lower().replace("_", " ")
    return bool(re.search(r"\b(delinquency|utilization)\b", blob))


def _is_geographic_overview_dimension(dim_key: str, title: str = "") -> bool:
    blob = f"{dim_key} {title}".lower().replace("_", " ")
    return bool(
        re.search(r"\b(city|cities|region|state|country|province|geo)\b", blob)
    )


def _is_banking_business_dimension(dim_key: str) -> bool:
    blob = str(dim_key or "").lower().replace("_", " ")
    return bool(
        re.search(r"\b(customer segment|product type|segment|product)\b", blob)
    )


def _finance_geographic_risk_pair_blocked(
    kind: str,
    metric_key: str,
    dim_key: str,
    *,
    title: str = "",
    business_dims_available: bool,
) -> bool:
    if str(kind or "").lower() != "finance" or not business_dims_available:
        return False
    if not _is_banking_risk_metric(metric_key, title):
        return False
    return _is_geographic_overview_dimension(dim_key, title)


def _prune_geographic_risk_overview_charts(
    charts: List[Dict[str, Any]], record_key: str, *, kind: str
) -> List[Dict[str, Any]]:
    """Drop city/region risk charts when segment/product dimensions are in play."""
    if str(kind or "").lower() != "finance":
        return charts
    has_business_dims = any(
        _is_banking_business_dimension(_dimension_key(c) or "")
        or _is_banking_business_dimension(
            str(c.get("title") or "").split(" by ")[-1] if " by " in str(c.get("title") or "") else ""
        )
        for c in charts
    )
    if not has_business_dims:
        return charts
    out: List[Dict[str, Any]] = []
    for chart in charts:
        mk = _metric_key(chart, record_key)
        title = str(chart.get("title") or "")
        dk = _dimension_key(chart) or (
            title.split(" by ")[-1].strip().lower() if " by " in title else ""
        )
        if _finance_geographic_risk_pair_blocked(
            kind,
            mk,
            dk,
            title=title,
            business_dims_available=True,
        ):
            continue
        out.append(chart)
    return out


def _is_lifecycle_overview_metric(metric_key: str, title: str = "") -> bool:
    blob = f"{metric_key} {title}".lower().replace("_", " ")
    return bool(
        re.search(
            r"\b(account[_ ]?age|age months|tenure months|vintage|monthly age|age trend)\b",
            blob,
        )
        or re.search(r"\b(^age$| by age\b)\b", blob)
    )


def _is_hr_workforce_dimension(dim: Optional[str], title: str = "") -> bool:
    blob = f"{dim or ''} {title}".lower().replace("_", " ")
    return bool(
        re.search(
            r"\b(department|dept|job level|job family|job_level|job_family)\b",
            blob,
        )
    )


def _is_hr_core_performance_breakdown_chart(
    chart: Dict[str, Any], record_key: str
) -> bool:
    title = str(chart.get("title") or "").lower().replace("_", " ")
    if not re.search(r"\bperformance[_ ]?rating\b", title):
        return False
    dk = _dimension_key(chart)
    return _is_hr_workforce_dimension(dk, title)


def _is_hr_secondary_engagement_breakdown(chart: Dict[str, Any], record_key: str) -> bool:
    title = str(chart.get("title") or "").lower().replace("_", " ")
    mk = _metric_key(chart, record_key)
    blob = f"{title} {mk}".replace("_", " ")
    return "engagement" in blob and _dimension_key(chart) is not None


def _ensure_hr_workforce_core_charts(
    selected: List[Dict[str, Any]],
    candidates: List[Dict[str, Any]],
    record_key: str,
    *,
    kind: str,
) -> List[Dict[str, Any]]:
    """Keep salary + performance workforce breakdowns when HR alternatives exist."""
    if str(kind or "").lower() != "hr" or not selected:
        return selected

    def _title_blob(c: Dict[str, Any]) -> str:
        return str(c.get("title") or "").lower()

    has_salary_breakdown = any(
        "salary" in _title_blob(c)
        and _is_hr_workforce_dimension(_dimension_key(c), _title_blob(c))
        for c in selected
    )
    has_perf_breakdown = any(
        _is_hr_core_performance_breakdown_chart(c, record_key) for c in selected
    )

    pool = list(selected) + list(candidates)
    out = list(selected)

    def _best_match(
        predicate: Callable[[Dict[str, Any]], bool],
    ) -> Optional[Dict[str, Any]]:
        best: Optional[Dict[str, Any]] = None
        best_score = -1
        for chart in pool:
            if not predicate(chart):
                continue
            score = int(chart.get("_opportunityScore") or 0)
            if score > best_score:
                best_score = score
                best = chart
        return best

    def _swap_in(chart: Optional[Dict[str, Any]]) -> None:
        nonlocal out
        if not chart:
            return
        clean = {k: v for k, v in chart.items() if not str(k).startswith("_")}
        tit = normalize_canonical_chart_title(str(clean.get("title") or ""))
        if tit:
            clean["title"] = tit
        if any(str(c.get("title") or "").strip().lower() == tit.lower() for c in out):
            return
        drop_idx: Optional[int] = None
        for i, existing in enumerate(out):
            if _is_hr_secondary_engagement_breakdown(existing, record_key):
                drop_idx = i
                break
        if drop_idx is None:
            for i, existing in enumerate(out):
                if _is_hr_demographic_overview_chart(existing, record_key):
                    drop_idx = i
                    break
        if drop_idx is None and len(out) >= 2:
            drop_idx = len(out) - 1
        if drop_idx is not None:
            out[drop_idx] = clean

    if not has_salary_breakdown:
        _swap_in(
            _best_match(
                lambda c: "salary" in _title_blob(c)
                and _is_hr_workforce_dimension(_dimension_key(c), _title_blob(c))
            )
        )
    if not has_perf_breakdown:
        _swap_in(
            _best_match(lambda c: _is_hr_core_performance_breakdown_chart(c, record_key))
        )
    return out


def _is_hr_demographic_column(col: str) -> bool:
    n = _norm_col(col)
    if n in (
        "age",
        "age_band",
        "birth_year",
        "dob",
        "date_of_birth",
        "gender",
        "sex",
    ):
        return True
    return bool(
        re.search(
            r"\b(age band|birth year|date of birth|gender|sex)\b",
            n.replace("_", " "),
        )
    )


def _is_hr_weak_flag_metric(col: str) -> bool:
    n = _norm_col(col)
    return bool(re.search(r"(_flag|_indicator|_binary)$", n)) or n.endswith(" flag")


def _is_hr_weak_flag_overview_chart(
    chart: Dict[str, Any], record_key: str
) -> bool:
    mk = _metric_key(chart, record_key)
    return _is_hr_weak_flag_metric(mk)


def _is_hr_demographic_overview_chart(
    chart: Dict[str, Any], record_key: str
) -> bool:
    title = str(chart.get("title") or "").lower().replace("_", " ")
    mk = _metric_key(chart, record_key)
    dk = (_dimension_key(chart) or "").lower().replace("_", " ")
    if _is_hr_demographic_column(mk) or _is_hr_demographic_column(dk):
        return True
    if re.search(r"\b(monthly age|age trend|records by age|age band)\b", title):
        return True
    if _is_lifecycle_overview_metric(mk, title):
        return True
    return False


def _hr_preferred_metrics(
    numerics: List[str],
    primary: Optional[str],
    secondary: Optional[str],
) -> List[str]:
    ordered: List[str] = []
    for m in (primary, secondary):
        if (
            m
            and m in numerics
            and not _is_hr_demographic_column(m)
            and not _is_lifecycle_overview_metric(m)
            and m not in ordered
        ):
            ordered.append(m)
    for key in (
        "salary",
        "performance_rating",
        "bonus",
        "compensation",
        "engagement_score",
        "attrition",
    ):
        for c in numerics:
            if (
                key in _norm_col(c)
                and c not in ordered
                and not _is_hr_demographic_column(c)
            ):
                ordered.append(c)
                break
    for c in numerics:
        if c not in ordered and not _is_hr_demographic_column(c):
            if not _is_hr_weak_flag_metric(c):
                ordered.append(c)
    if len(ordered) < 2:
        for c in numerics:
            if c not in ordered and not _is_hr_demographic_column(c):
                ordered.append(c)
    return ordered


def _hr_has_strong_workforce_charts(
    charts: List[Dict[str, Any]], record_key: str
) -> bool:
    workforce_dims = frozenset(
        {"department", "job level", "job_level", "job family", "job_family", "dept"}
    )
    for chart in charts:
        if _is_hr_demographic_overview_chart(chart, record_key):
            continue
        strength = _metric_semantic_strength(
            _metric_key(chart, record_key), str(chart.get("title") or "")
        )
        if strength >= 80:
            return True
        dk = (_dimension_key(chart) or "").lower().replace("_", " ")
        if dk in workforce_dims and strength >= 40:
            return True
    return False


def _prune_hr_demographic_overview_charts(
    charts: List[Dict[str, Any]], record_key: str, kind: str
) -> List[Dict[str, Any]]:
    """Drop age / age-band default charts when stronger HR workforce charts exist."""
    if str(kind or "").lower() != "hr":
        return charts
    if not _hr_has_strong_workforce_charts(charts, record_key):
        return charts
    out = [
        c
        for c in charts
        if not _is_hr_demographic_overview_chart(c, record_key)
    ]
    if _hr_has_strong_workforce_charts(out, record_key):
        out = [c for c in out if not _is_hr_weak_flag_overview_chart(c, record_key)]
    return out


def _banking_preferred_metrics(
    numerics: List[str],
    primary: Optional[str],
    secondary: Optional[str],
) -> List[str]:
    ordered: List[str] = []
    for m in (primary, secondary):
        if (
            m
            and m in numerics
            and not _is_lifecycle_overview_metric(m)
            and m not in ordered
        ):
            ordered.append(m)
    for key in (
        "spend_amount",
        "loan_balance",
        "deposit_balance",
        "utilization_pct",
        "delinquency_flag",
    ):
        for c in numerics:
            if key in _norm_col(c) and c not in ordered and not _is_lifecycle_overview_metric(c):
                ordered.append(c)
                break
    for c in numerics:
        if c not in ordered and not _is_lifecycle_overview_metric(c):
            ordered.append(c)
    return ordered


def _preferred_breakdown_metric(
    numerics: List[str],
    dim_index: int,
    primary: Optional[str],
    secondary: Optional[str],
    kind: str = "generic",
) -> str:
    """Prefer primary/secondary commercial metrics over quantity/lifecycle for each dimension."""
    if str(kind or "").lower() == "finance":
        prefs = _banking_preferred_metrics(numerics, primary, secondary)
        if prefs:
            return prefs[dim_index % len(prefs)]
    if str(kind or "").lower() == "hr":
        prefs = _hr_preferred_metrics(numerics, primary, secondary)
        if prefs:
            return prefs[dim_index % len(prefs)]
    prefs = [m for m in (primary, secondary) if m and m in numerics]
    if prefs:
        return prefs[dim_index % len(prefs)]
    if numerics:
        return numerics[dim_index % len(numerics)]
    return ""


def _prune_inferior_metric_by_dimension(
    charts: List[Dict[str, Any]],
    record_key: str,
    *,
    primary: Optional[str],
    secondary: Optional[str],
    kind: str,
) -> List[Dict[str, Any]]:
    """Drop low-priority metrics (e.g. quantity) when a stronger metric covers the same dimension."""
    commercial_kinds = frozenset(
        {"sales", "retail", "ecommerce", "geography", "marketing", "finance", "operations"}
    )
    if str(kind or "").lower() not in commercial_kinds:
        return charts
    strong_floor = 60
    by_dim: Dict[str, int] = {}
    for chart in charts:
        dk = _dimension_key(chart)
        if not dk:
            continue
        strength = _metric_semantic_strength(
            _metric_key(chart, record_key),
            str(chart.get("title") or ""),
        )
        by_dim[dk.lower()] = max(by_dim.get(dk.lower(), 0), strength)
    out: List[Dict[str, Any]] = []
    for chart in charts:
        dk = _dimension_key(chart)
        if not dk:
            out.append(chart)
            continue
        strength = _metric_semantic_strength(
            _metric_key(chart, record_key),
            str(chart.get("title") or ""),
        )
        dim_best = by_dim.get(dk.lower(), strength)
        if strength < strong_floor and dim_best >= 80 and dim_best - strength >= 20:
            continue
        mk = _metric_key(chart, record_key)
        if (
            primary
            and mk != str(primary).strip().lower()
            and strength <= 45
            and dim_best >= 80
        ):
            continue
        if (
            secondary
            and mk != str(secondary).strip().lower()
            and strength <= 45
            and dim_best >= 80
            and _norm_col(mk).find("quantity") >= 0
        ):
            continue
        if (
            str(kind or "").lower() == "operations"
            and _is_manufacturing_volume_metric(mk, str(chart.get("title") or ""))
            and strength <= 45
            and dim_best >= 60
            and dim_best - strength >= 15
        ):
            continue
        out.append(chart)
    return out


def _prune_lifecycle_overview_charts(
    charts: List[Dict[str, Any]], record_key: str
) -> List[Dict[str, Any]]:
    """Drop account-age / tenure charts when stronger banking or commercial metrics exist."""
    has_strong = any(
        _metric_semantic_strength(
            _metric_key(chart, record_key), str(chart.get("title") or "")
        )
        >= 80
        for chart in charts
        if _norm_chart_type(chart.get("chartType")) != "scatter"
    )
    if not has_strong:
        return charts
    out: List[Dict[str, Any]] = []
    for chart in charts:
        mk = _metric_key(chart, record_key)
        title = str(chart.get("title") or "")
        if _is_lifecycle_overview_metric(mk, title):
            continue
        out.append(chart)
    return out


def _prune_scatter_when_business_rich(
    charts: List[Dict[str, Any]],
    *,
    min_non_scatter: int = 4,
    candidate_pool: Optional[List[Dict[str, Any]]] = None,
    kind: str = "generic",
    discovered_count: int = 0,
) -> List[Dict[str, Any]]:
    non_scatter = [
        c for c in charts if _norm_chart_type(c.get("chartType")) != "scatter"
    ]
    pool = candidate_pool if candidate_pool is not None else charts
    pool_non_scatter = sum(
        1 for c in pool if _norm_chart_type(c.get("chartType")) != "scatter"
    )
    if pool_non_scatter >= min_non_scatter:
        if str(kind).lower() in ("marketing", "finance", "operations"):
            return non_scatter
        showcase_rich = discovered_count >= 18
        relationship_scatter = [
            c
            for c in charts
            if _norm_chart_type(c.get("chartType")) == "scatter"
            and _coverage_bucket(c) == "relationship"
        ]
        if showcase_rich and relationship_scatter:
            return non_scatter + relationship_scatter[:1]
        return non_scatter
    if len(non_scatter) >= min_non_scatter:
        return non_scatter
    return charts


def _non_scatter_business_chart_count(
    *pools: Optional[List[Dict[str, Any]]],
) -> int:
    seen_titles: Set[str] = set()
    count = 0
    for pool in pools:
        if not pool:
            continue
        for chart in pool:
            if _norm_chart_type(chart.get("chartType")) == "scatter":
                continue
            title = str(chart.get("title") or "").strip().lower()
            if not title or title in seen_titles:
                continue
            seen_titles.add(title)
            count += 1
    return count


def _executive_trend_title(metric_col: str, time_bucket: str, pretty_label: Callable[..., str]) -> str:
    met = _title_case_phrase(pretty_label(metric_col))
    tb = str(time_bucket or "period").strip().capitalize()
    return normalize_canonical_chart_title(f"{tb} {met} Trend")


def _executive_metric_by_dim_title(
    metric_col: str,
    dim_col: str,
    agg: str,
    pretty_label: Callable[..., str],
) -> str:
    met = _title_case_phrase(pretty_label(metric_col))
    dim = _title_case_phrase(pretty_label(dim_col))
    agg_lc = str(agg).lower()
    try:
        from intent_engine.column_resolve import column_prefers_mean_aggregation

        if column_prefers_mean_aggregation(metric_col):
            agg_lc = "mean"
    except Exception:
        pass
    prefix = "Average " if agg_lc == "mean" else ""
    return normalize_canonical_chart_title(f"{prefix}{met} by {dim}")


def _executive_share_by_dim_title(
    metric_col: str,
    dim_col: str,
    pretty_label: Callable[..., str],
) -> str:
    met = _title_case_phrase(pretty_label(metric_col))
    dim = _title_case_phrase(pretty_label(dim_col))
    return normalize_canonical_chart_title(f"{dim} {met} Share")


def _breakdown_dimension_eligible(
    dim_c: str,
    df: pd.DataFrame,
    id_like_fn: Callable[[Optional[str]], bool],
    profile: Optional[Dict[str, Any]] = None,
    *,
    cardinality_memo: Optional[Dict[str, int]] = None,
) -> bool:
    if not is_valid_subtitle_dimension(dim_c):
        return False
    if id_like_fn(dim_c):
        return False
    n = _norm_col(dim_c)
    if any(tok in n for tok in _FORBIDDEN_BREAKDOWN_DIM_TOKENS):
        if not any(ok in n for ok in ("campaign", "issue", "ticket", "product", "category")):
            return False
    if _dimension_cardinality(df, dim_c, profile, memo=cardinality_memo) < 2:
        return False
    return True


def _metric_eligible_for_composition(num_c: str, inv: ColumnInventory) -> bool:
    if num_c in inv.percentages:
        return False
    try:
        from intent_engine.column_resolve import column_prefers_mean_aggregation

        if column_prefers_mean_aggregation(num_c):
            return False
    except Exception:
        pass
    n = _norm_col(num_c)
    if any(tok in n for tok in _COMPOSITION_BLOCK_METRIC_TOKENS):
        if not any(
            ok in n
            for ok in (
                "revenue",
                "sales",
                "profit",
                "spend",
                "cost",
                "headcount",
                "ticket",
                "conversion",
                "admission",
                "volume",
                "unit",
                "order",
                "customer",
                "loan",
            )
        ):
            return False
    return True


def _composition_shares_valid(group: pd.Series) -> bool:
    if group.empty:
        return False
    total = float(group.sum())
    if total <= 0:
        return False
    shares = group.astype(float) / total
    if float(shares.max()) > 1.05:
        return False
    if float(shares.sum()) > 1.05:
        return False
    return True


def _build_scatter_payload(
    df: pd.DataFrame,
    xc: str,
    yc: str,
    deps: DashboardDeps,
) -> Optional[Dict[str, Any]]:
    try:
        tmp = df[[xc, yc]].copy()
        tmp["_x"] = deps.numeric_series(xc)
        tmp["_y"] = deps.numeric_series(yc)
        tmp = tmp.dropna(subset=["_x", "_y"])
        tmp = tmp[tmp["_x"].map(lambda v: pd.notna(v) and float(v) == float(v))]
        tmp = tmp[tmp["_y"].map(lambda v: pd.notna(v) and float(v) == float(v))]
        if len(tmp) < 12:
            return None
        r = float(tmp["_x"].corr(tmp["_y"]))
        if not pd.notna(r) or abs(r) < 0.28:
            return None
        sample = tmp.head(_MAX_SCATTER_POINTS)
        scatter_x: List[float] = []
        scatter_y: List[float] = []
        for _, row in sample.iterrows():
            xv, yv = float(row["_x"]), float(row["_y"])
            if not (pd.notna(xv) and pd.notna(yv)):
                continue
            scatter_x.append(xv)
            scatter_y.append(yv)
        if len(scatter_x) < 12:
            return None
        if len(set(scatter_x)) < 2 or len(set(scatter_y)) < 2:
            return None
        scatter_x_display = [format_executive_number(x) for x in scatter_x]
        labels = [
            f"{scatter_x_display[i]} / {format_executive_number(scatter_y[i])}"
            for i in range(len(scatter_x))
        ]
        xl = _title_case_phrase(deps.pretty_label(xc))
        yl = _title_case_phrase(deps.pretty_label(yc))
        return {
            "title": normalize_canonical_chart_title(f"{xl} vs {yl}"),
            "chartType": "scatter",
            "labels": labels,
            "values": scatter_y,
            "valueDisplay": [format_executive_number(y) for y in scatter_y],
            "scatterX": scatter_x,
            "scatterXDisplay": scatter_x_display,
            "scatterXLabel": xl,
            "scatterYLabel": yl,
            "xColumn": xc,
            "yColumn": yc,
            "xMetricLabel": xl,
            "yMetricLabel": yl,
            "metricColumn": yc,
            "aggregation": "scatter",
        }
    except Exception:
        return None


def _chart_is_percent_metric(chart: Dict[str, Any]) -> bool:
    title = str(chart.get("title") or "").lower()
    metric = str(chart.get("metricColumn") or "").lower()
    blob = f"{title} {metric}"
    if _PERCENT_NAME.search(blob):
        return True
    values: List[float] = []
    for raw in chart.get("values") or []:
        try:
            fv = float(raw)
            if pd.notna(fv) and fv == fv:
                values.append(fv)
        except (TypeError, ValueError):
            continue
    if not values:
        return False
    lo, hi = min(values), max(values)
    return (0 <= lo and hi <= 1.05) or (0 <= lo and hi <= 100.5 and _PERCENT_NAME.search(blob) is not None)


def evaluate_chart_visual_quality(chart: Dict[str, Any]) -> Dict[str, Any]:
    """Detect low-variance breakdowns and percent metrics that need tight scaling."""
    values: List[float] = []
    for raw in chart.get("values") or []:
        try:
            fv = float(raw)
            if pd.notna(fv) and fv == fv:
                values.append(fv)
        except (TypeError, ValueError):
            continue

    n = len(values)
    if n < 2:
        return {
            "category_count": n,
            "spread_ratio": 0.0,
            "value_span": 0.0,
            "is_percent_metric": _chart_is_percent_metric(chart),
            "weak_differentiation": True,
            "prefer_tight_domain": True,
        }

    lo = min(values)
    hi = max(values)
    span = hi - lo
    is_pct = _chart_is_percent_metric(chart)
    disp_lo, disp_hi = lo, hi
    if is_pct and hi <= 1.05:
        disp_lo, disp_hi = lo * 100.0, hi * 100.0
        span = disp_hi - disp_lo

    spread_ratio = span / max(abs(disp_hi), 1e-9) if span > 0 else 0.0
    weak = False
    if span <= 0:
        weak = True
    elif is_pct and span <= 8.0 and spread_ratio < 0.85:
        weak = True
    elif n <= 5 and spread_ratio < 0.12:
        weak = True
    elif spread_ratio < 0.05:
        weak = True

    return {
        "category_count": n,
        "spread_ratio": round(spread_ratio, 4),
        "value_span": round(span, 6),
        "is_percent_metric": is_pct,
        "weak_differentiation": weak,
        "prefer_tight_domain": weak,
    }


def _chart_skip_due_to_weak_visual_quality(
    chart: Dict[str, Any],
    kpi_context: List[KpiChartContext],
    record_key: str,
) -> bool:
    ct = _norm_chart_type(chart.get("chartType"))
    if ct not in _BREAKDOWN_TYPES or ct in _TEMPORAL_TYPES:
        return False
    quality = evaluate_chart_visual_quality(chart)
    if not quality["weak_differentiation"]:
        return False
    if _chart_redundant_with_kpi(chart, kpi_context, record_key):
        return True
    if quality["category_count"] <= 4 and quality["spread_ratio"] < 0.02:
        return True
    return False


def validate_chart_renderable(chart: Dict[str, Any]) -> Tuple[bool, str]:
    title = str(chart.get("title") or "").strip()
    if not title:
        return False, "missing title"
    ct = _norm_chart_type(chart.get("chartType"))
    labels = chart.get("labels") or []
    values = chart.get("values") or []
    if not labels or not values:
        return False, "empty series"
    if len(labels) != len(values):
        return False, "label/value length mismatch"
    for v in values:
        try:
            fv = float(v)
            if not pd.notna(fv) or fv != fv:
                return False, "non-finite value"
        except (TypeError, ValueError):
            return False, "non-numeric value"
    if ct == "scatter":
        sx = chart.get("scatterX") or []
        if len(sx) != len(values):
            return False, "scatter x/y length mismatch"
        valid_x = sum(1 for x in sx if pd.notna(x) and float(x) == float(x))
        if valid_x < 2:
            return False, "insufficient scatter x values"
        x_vals = [float(x) for x in sx if pd.notna(x) and float(x) == float(x)]
        y_vals = [float(v) for v in values if pd.notna(v) and float(v) == float(v)]
        if len(set(x_vals)) < 2:
            return False, "scatter x constant"
        if len(set(y_vals)) < 2:
            return False, "scatter y constant"
        x_lab = str(
            chart.get("xMetricLabel") or chart.get("scatterXLabel") or ""
        ).strip()
        if x_lab.lower() in ("category", "x", ""):
            return False, "invalid scatter x axis label"
        if not str(chart.get("xColumn") or "").strip():
            return False, "missing scatter x column"
    if ct in _COMPOSITION_TYPES:
        total = sum(float(v) for v in values)
        if total <= 0:
            return False, "composition total <= 0"
        max_share = max(float(v) for v in values) / total
        if max_share > 1.05:
            return False, "composition share > 100%"
    dim = _dimension_key(chart)
    if dim and ct in _BREAKDOWN_TYPES and not is_valid_subtitle_dimension(dim):
        return False, f"forbidden dimension {dim}"
    if ct in _BREAKDOWN_TYPES and dim:
        top = str(labels[0]) if labels else ""
        if top and not is_valid_kpi_leader_value(top):
            return False, f"invalid leader value {top}"
    return True, "ok"


def _chart_redundant_with_kpi(
    chart: Dict[str, Any],
    kpi_context: List[KpiChartContext],
    record_key: str,
) -> bool:
    opp = str(chart.get("_opportunityType") or "").lower()
    if opp in ("trend", "correlation", "composition", "distribution"):
        return False
    ct = _norm_chart_type(chart.get("chartType"))
    if ct in _COMPOSITION_TYPES:
        return False

    dk = _dimension_key(chart)
    if not dk:
        return False
    mk = _metric_key(chart, record_key)
    labels = chart.get("labels") or []
    top_label = str(labels[0]).strip().lower() if labels else ""

    for kpi in kpi_context:
        if "top" not in kpi.title and "leading" not in kpi.title:
            continue
        if kpi.dimension_hint and kpi.dimension_hint not in dk and dk not in kpi.title:
            continue
        if kpi.metric_hint and kpi.metric_hint not in mk and kpi.metric_hint not in kpi.title:
            if mk not in kpi.title and mk not in kpi.subtitle:
                continue
        if opp in ("compare", "ranking", "geographic") and ct in (
            "bar",
            "horizontalbar",
        ):
            if kpi.value and top_label and kpi.value.lower()[:24] == top_label[:24]:
                chart_title = str(chart.get("title") or "").lower()
                if mk == record_key.strip().lower() or mk in ("records", "__records__"):
                    return True
                chart_strength = _metric_semantic_strength(mk, chart_title)
                kpi_blob = f"{kpi.title} {kpi.subtitle or ''}".lower()
                workforce_tokens = (
                    "salary",
                    "compensation",
                    "bonus",
                    "pay",
                    "wage",
                    "performance",
                    "rating",
                    "engagement",
                )
                if chart_strength >= 80 and any(
                    t in chart_title for t in workforce_tokens
                ):
                    kpi_title = kpi.title.lower()
                    if not any(t in kpi_title for t in workforce_tokens):
                        continue
                return True
            if kpi.dimension_hint and kpi.dimension_hint in dk:
                chart_title = str(chart.get("title") or "").lower()
                if _is_banking_executive_risk_metric(mk, chart_title):
                    return False
                kpi_blob = f"{kpi.title} {kpi.subtitle or ''}".lower()
                metric_tokens = (
                    "loan balance",
                    "loan",
                    "spend amount",
                    "spend",
                    "deposit balance",
                    "deposit",
                    "revenue",
                    "sales",
                    "profit",
                )
                if any(t in kpi_blob and t in chart_title for t in metric_tokens):
                    return True
    return False


def _score_candidate(
    chart: Dict[str, Any],
    *,
    kind: str,
    primary: Optional[str],
    secondary: Optional[str],
    types_used: Set[str],
    metric_dims_used: Set[Tuple[str, Optional[str]]],
    dimension_usage: Dict[str, int],
    coverage_filled: Set[str],
    donut_count: int,
    kpi_context: List[KpiChartContext],
    record_key: str,
) -> int:
    base = int(chart.get("_opportunityScore") or 50)
    mk = _metric_key(chart, record_key)
    dk = _dimension_key(chart)
    ct = _norm_chart_type(chart.get("chartType"))
    bucket = _coverage_bucket(chart)

    if primary and mk == str(primary).strip().lower():
        base += 14
    elif secondary and mk == str(secondary).strip().lower():
        base += 8

    if ct not in types_used:
        base += 12
    if (mk, dk) not in metric_dims_used:
        base += 8

    if bucket not in coverage_filled:
        base += 22

    if dk:
        usage = dimension_usage.get(dk, 0)
        base -= usage * 24
        if usage >= 2:
            return -1

    if ct in _COMPOSITION_TYPES and donut_count >= MAX_DONUT_CHARTS:
        return -1

    if _chart_redundant_with_kpi(chart, kpi_context, record_key):
        base -= 55

    quality = evaluate_chart_visual_quality(chart)
    if quality["weak_differentiation"]:
        base -= 22

    labels = chart.get("labels") or []
    n_pts = len(labels) if isinstance(labels, list) else 0
    if 3 <= n_pts <= 12:
        base += 6
    elif n_pts > 18:
        base -= 6

    if bucket == "relationship" and "scatter" not in types_used:
        base += 6

    strength = _metric_semantic_strength(mk, str(chart.get("title") or ""))
    if ct == "scatter" and strength < 90:
        base -= 18
    if ct == "scatter" and str(kind or "").lower() in ("finance", "marketing", "sales"):
        base -= 28
    if (
        str(kind or "").lower() == "finance"
        and _is_banking_risk_metric(mk, str(chart.get("title") or ""))
        and _is_geographic_overview_dimension(dk or "", str(chart.get("title") or ""))
    ):
        base -= 36
    if (
        str(kind or "").lower() == "finance"
        and _is_banking_executive_risk_metric(mk, str(chart.get("title") or ""))
        and _is_banking_business_dimension(dk or "")
    ):
        base += 14
    if str(kind or "").lower() == "hr":
        title_l = str(chart.get("title") or "").lower().replace("_", " ")
        if _is_hr_core_performance_breakdown_chart(chart, record_key):
            base += 34
        elif (
            re.search(r"\b(salary|compensation)\b", title_l)
            and _is_hr_workforce_dimension(dk, title_l)
            and bucket in ("ranking", "compare")
        ):
            base += 14
        if _is_hr_secondary_engagement_breakdown(chart, record_key):
            base -= 24
    if str(kind or "").lower() == "operations":
        title_l = str(chart.get("title") or "").lower().replace("_", " ")
        if _is_manufacturing_quality_metric(mk, title_l) and ct in _BREAKDOWN_TYPES:
            base += 22
        if _is_manufacturing_volume_metric(mk, title_l) and ct in _BREAKDOWN_TYPES:
            base -= 28
            if quality["weak_differentiation"]:
                base -= 20
        if _is_manufacturing_volume_metric(mk, title_l) and ct in _COMPOSITION_TYPES:
            base -= 38
        if ct == "scatter":
            base -= 32
    if strength <= 45 and primary and mk != str(primary).strip().lower():
        if secondary and mk != str(secondary).strip().lower():
            base -= 24

    if bucket == "trend" and ct == "area" and "line" in types_used:
        base += 6

    return base


def _metric_dim_duplicate(
    selected: List[Dict[str, Any]],
    candidate: Dict[str, Any],
    record_key: str,
    *,
    discovered_count: int = 0,
) -> bool:
    cm = _metric_key(candidate, record_key)
    cd = _dimension_key(candidate)
    if not cd:
        return False
    if _is_temporal_breakdown_dimension(cd):
        return True
    cct = _norm_chart_type(candidate.get("chartType"))
    if cct not in _BREAKDOWN_TYPES or cct in _TEMPORAL_TYPES:
        return False
    alt_dims = 0
    for existing in selected:
        if _metric_key(existing, record_key) != cm:
            continue
        ed = _dimension_key(existing)
        if not ed or ed == cd:
            continue
        if _is_temporal_breakdown_dimension(ed):
            continue
        ect = _norm_chart_type(existing.get("chartType"))
        if ect in _BREAKDOWN_TYPES and ect not in _TEMPORAL_TYPES:
            alt_dims += 1
    max_alt = 2 if discovered_count >= 18 else 1
    return alt_dims >= max_alt


_CROSS_BREAKDOWN_FAMILIES = frozenset({"composition", "ranking"})


def _cross_family_breakdown_duplicate(
    fam_c: str,
    fam_e: str,
    dim_c: Optional[str],
    dim_e: Optional[str],
    mk_c: str,
    title_c: str,
    mk_e: str,
    title_e: str,
) -> bool:
    """Share/donut/pie vs bar/hbar telling the same dim×metric story."""
    if not dim_c or not dim_e or dim_c.lower() != dim_e.lower():
        return False
    if fam_c not in _CROSS_BREAKDOWN_FAMILIES or fam_e not in _CROSS_BREAKDOWN_FAMILIES:
        return False
    if fam_c == fam_e:
        return False
    mk_c_norm = mk_c.strip().lower()
    mk_e_norm = mk_e.strip().lower()
    if mk_c_norm and mk_c_norm == mk_e_norm:
        return True
    s_a = _metric_semantic_strength(mk_c, title_c)
    s_b = _metric_semantic_strength(mk_e, title_e)
    return abs(s_a - s_b) <= 25


def chart_breakdown_metric_dimension_pair(
    chart: Dict[str, Any], record_key: str
) -> Tuple[str, Optional[str]]:
    """Normalized (metric, dimension) for breakdown diversity checks."""
    return (_metric_key(chart, record_key), _dimension_key(chart))


def has_composition_ranking_metric_dim_duplicate(
    charts: List[Dict[str, Any]], record_key: str
) -> bool:
    """True when a composition and ranking chart share the same dim×metric story."""
    seen: List[Dict[str, Any]] = []
    for chart in charts:
        mk = _metric_key(chart, record_key)
        dim = _dimension_key(chart)
        fam = _chart_story_family(
            str(chart.get("chartType") or ""),
            str(chart.get("_opportunityType") or chart.get("opportunityType") or ""),
        )
        if fam not in _CROSS_BREAKDOWN_FAMILIES or not dim:
            continue
        title = str(chart.get("title") or "")
        for existing in seen:
            mk_e = _metric_key(existing, record_key)
            dim_e = _dimension_key(existing)
            fam_e = _chart_story_family(
                str(existing.get("chartType") or ""),
                str(existing.get("_opportunityType") or existing.get("opportunityType") or ""),
            )
            if _cross_family_breakdown_duplicate(
                fam,
                fam_e,
                dim,
                dim_e,
                mk,
                title,
                mk_e,
                str(existing.get("title") or ""),
            ):
                return True
        seen.append(chart)
    return False


def _metrics_comparable_for_story_dedup(
    mk_a: str, title_a: str, mk_b: str, title_b: str
) -> bool:
    s_a = _metric_semantic_strength(mk_a, title_a)
    s_b = _metric_semantic_strength(mk_b, title_b)
    if s_a >= 80 and s_b >= 80:
        return False
    return abs(s_a - s_b) <= 25


def _chart_story_blocked_by_selected(
    selected: List[Dict[str, Any]],
    candidate: Dict[str, Any],
    record_key: str,
) -> bool:
    sig_c = _chart_story_signature(candidate, record_key)
    mk_c = _metric_key(candidate, record_key)
    title_c = str(candidate.get("title") or "")
    str_c = _metric_semantic_strength(mk_c, title_c)
    dim_c = _dimension_key(candidate)
    fam_c = _chart_story_family(
        str(candidate.get("chartType") or ""),
        str(candidate.get("_opportunityType") or ""),
    )
    for existing in selected:
        mk_e = _metric_key(existing, record_key)
        title_e = str(existing.get("title") or "")
        str_e = _metric_semantic_strength(mk_e, title_e)
        dim_e = _dimension_key(existing)
        if dim_c and dim_e and dim_c.lower() == dim_e.lower():
            fam_e = _chart_story_family(
                str(existing.get("chartType") or ""),
                str(existing.get("_opportunityType") or ""),
            )
            if _cross_family_breakdown_duplicate(
                fam_c,
                fam_e,
                dim_c,
                dim_e,
                mk_c,
                title_c,
                mk_e,
                title_e,
            ) and str_c <= str_e:
                return True
            if (
                fam_c == "ranking"
                and fam_e == "ranking"
                and _metrics_comparable_for_story_dedup(mk_c, title_c, mk_e, title_e)
                and str_c <= str_e
            ):
                return True
        sig_e = _chart_story_signature(existing, record_key)
        if sig_c and sig_e and sig_c == sig_e and str_c <= str_e:
            return True
    return False


def _pick_best_candidate(
    remaining: List[Dict[str, Any]],
    *,
    kind: str,
    selected: List[Dict[str, Any]],
    primary: Optional[str],
    secondary: Optional[str],
    types_used: Set[str],
    metric_dims_used: Set[Tuple[str, Optional[str]]],
    dimension_usage: Dict[str, int],
    coverage_filled: Set[str],
    donut_count: int,
    kpi_context: List[KpiChartContext],
    record_key: str,
    metric_usage: Dict[str, int],
    prefer_bucket: Optional[str] = None,
    discovered_count: int = 0,
) -> Tuple[int, int]:
    best_idx = -1
    best_score = -1
    for i, chart in enumerate(remaining):
        mk = _metric_key(chart, record_key)
        usage = metric_usage.get(mk, 0)
        dk = _dimension_key(chart)
        if usage >= 2:
            continue
        if _is_temporal_breakdown_dimension(dk) and _norm_chart_type(
            chart.get("chartType")
        ) in _BREAKDOWN_TYPES:
            continue
        if _metric_dim_duplicate(
            selected, chart, record_key, discovered_count=discovered_count
        ):
            continue
        if _chart_story_blocked_by_selected(selected, chart, record_key):
            continue
        if _chart_redundant_with_kpi(chart, kpi_context, record_key):
            continue
        if _chart_skip_due_to_weak_visual_quality(chart, kpi_context, record_key):
            continue
        if (
            str(kind).lower() == "operations"
            and _manufacturing_duplicate_volume_trend(chart, selected, record_key)
        ):
            continue
        if (
            str(kind).lower() == "operations"
            and _is_manufacturing_low_insight_volume_chart(chart, record_key)
            and _pool_has_manufacturing_quality_alternative(
                remaining + selected,
                record_key,
                exclude_title=str(chart.get("title") or ""),
            )
        ):
            continue
        bucket = _coverage_bucket(chart)
        if prefer_bucket and bucket != prefer_bucket:
            continue
        if _norm_chart_type(chart.get("chartType")) == "scatter":
            pool_size = len(remaining) + len(selected)
            if (
                prefer_bucket != "relationship"
                and _non_scatter_business_chart_count(remaining, selected) >= 4
            ):
                continue
            if prefer_bucket == "relationship" and discovered_count < 18:
                continue
        sc = _score_candidate(
            chart,
            kind=kind,
            primary=primary,
            secondary=secondary,
            types_used=types_used,
            metric_dims_used=metric_dims_used,
            dimension_usage=dimension_usage,
            coverage_filled=coverage_filled,
            donut_count=donut_count,
            kpi_context=kpi_context,
            record_key=record_key,
        )
        if sc > best_score:
            best_score = sc
            best_idx = i
    return best_idx, best_score


def _commit_pick(
    pick: Dict[str, Any],
    *,
    selected: List[Dict[str, Any]],
    metric_usage: Dict[str, int],
    types_used: Set[str],
    metric_dims_used: Set[Tuple[str, Optional[str]]],
    dimension_usage: Dict[str, int],
    coverage_filled: Set[str],
    record_key: str,
) -> None:
    mk = _metric_key(pick, record_key)
    dk = _dimension_key(pick)
    ct = _norm_chart_type(pick.get("chartType"))
    if ct != "scatter":
        metric_usage[mk] = metric_usage.get(mk, 0) + 1
    types_used.add(ct)
    metric_dims_used.add((mk, dk))
    if dk:
        dimension_usage[dk] = dimension_usage.get(dk, 0) + 1
    coverage_filled.add(_coverage_bucket(pick))
    clean = {k: v for k, v in pick.items() if not str(k).startswith("_")}
    opp = pick.get("_opportunityType") or pick.get("opportunityType")
    if opp:
        clean["opportunityType"] = opp
    tit = normalize_canonical_chart_title(str(clean.get("title") or ""))
    if tit:
        clean["title"] = tit
    selected.append(clean)


def select_diverse_charts(
    candidates: List[Dict[str, Any]],
    *,
    kind: str,
    max_charts: int,
    deps: DashboardDeps,
    kpi_context: Optional[List[KpiChartContext]] = None,
    discovered_count: int = 0,
) -> List[Dict[str, Any]]:
    if not candidates:
        return []

    kpi_ctx = kpi_context or []
    all_candidates = list(candidates)
    primary, secondary, _ = deps.priority_metrics(kind)
    remaining = list(candidates)
    selected: List[Dict[str, Any]] = []
    metric_usage: Dict[str, int] = {}
    types_used: Set[str] = set()
    metric_dims_used: Set[Tuple[str, Optional[str]]] = set()
    dimension_usage: Dict[str, int] = {}
    coverage_filled: Set[str] = set()

    def donut_count() -> int:
        return sum(
            1
            for c in selected
            if _norm_chart_type(c.get("chartType")) in _COMPOSITION_TYPES
        )

    # Phase 1 — coverage buckets (executive BI story)
    for bucket in _COVERAGE_BUCKETS:
        if len(selected) >= max_charts:
            break
        if bucket in coverage_filled:
            continue
        idx, score = _pick_best_candidate(
            remaining,
            kind=kind,
            selected=selected,
            primary=primary,
            secondary=secondary,
            types_used=types_used,
            metric_dims_used=metric_dims_used,
            dimension_usage=dimension_usage,
            coverage_filled=coverage_filled,
            donut_count=donut_count(),
            kpi_context=kpi_ctx,
            record_key=deps.record_metric_key,
            metric_usage=metric_usage,
            prefer_bucket=bucket,
            discovered_count=discovered_count,
        )
        if idx < 0 or score < 0:
            continue
        pick = remaining.pop(idx)
        _commit_pick(
            pick,
            selected=selected,
            metric_usage=metric_usage,
            types_used=types_used,
            metric_dims_used=metric_dims_used,
            dimension_usage=dimension_usage,
            coverage_filled=coverage_filled,
            record_key=deps.record_metric_key,
        )

    # Phase 2 — fill remaining slots by score
    while len(selected) < max_charts and remaining:
        idx, score = _pick_best_candidate(
            remaining,
            kind=kind,
            selected=selected,
            primary=primary,
            secondary=secondary,
            types_used=types_used,
            metric_dims_used=metric_dims_used,
            dimension_usage=dimension_usage,
            coverage_filled=coverage_filled,
            donut_count=donut_count(),
            kpi_context=kpi_ctx,
            record_key=deps.record_metric_key,
            metric_usage=metric_usage,
            discovered_count=discovered_count,
        )
        if idx < 0 or score < 0:
            break
        pick = remaining.pop(idx)
        _commit_pick(
            pick,
            selected=selected,
            metric_usage=metric_usage,
            types_used=types_used,
            metric_dims_used=metric_dims_used,
            dimension_usage=dimension_usage,
            coverage_filled=coverage_filled,
            record_key=deps.record_metric_key,
        )

    pruned = _prune_duplicate_chart_stories(selected, deps.record_metric_key)
    pruned = _prune_redundant_records_charts(pruned, deps.record_metric_key)
    pruned = _prune_inferior_metric_by_dimension(
        pruned,
        deps.record_metric_key,
        primary=primary,
        secondary=secondary,
        kind=kind,
    )
    pruned = _prune_lifecycle_overview_charts(pruned, deps.record_metric_key)
    pruned = _prune_hr_demographic_overview_charts(
        pruned, deps.record_metric_key, kind=kind
    )
    pruned = _prune_geographic_risk_overview_charts(
        pruned, deps.record_metric_key, kind=kind
    )
    pruned = _prune_scatter_when_business_rich(
        pruned,
        min_non_scatter=4,
        candidate_pool=all_candidates,
        kind=kind,
        discovered_count=discovered_count,
    )
    pruned = _ensure_hr_workforce_core_charts(
        pruned,
        all_candidates,
        deps.record_metric_key,
        kind=kind,
    )
    return pruned[:max_charts]


def audit_dashboard_charts(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    kind: str,
    deps: DashboardDeps,
    *,
    kpi_cards: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Audit report rows for selected dashboard charts."""
    charts = build_dashboard_charts_from_opportunities(
        df, profile, kind, deps, kpi_cards=kpi_cards
    )
    rows: List[Dict[str, Any]] = []
    for chart in charts:
        ok, reason = validate_chart_renderable(chart)
        rows.append(
            {
                "title": chart.get("title"),
                "chart_type": chart.get("chartType"),
                "metric_column": chart.get("metricColumn"),
                "dimension_column": chart.get("dimensionColumn"),
                "aggregation": chart.get("aggregation"),
                "renderable": ok,
                "reason": reason,
                "opportunity_type": chart.get("_opportunityType"),
            }
        )
    return rows


def _metric_agg_key(num_c: str, inv: ColumnInventory) -> str:
    """Prefer AVG for score/rating/rate columns; SUM for revenue-style measures."""
    if num_c in inv.percentages:
        return "mean"
    try:
        from intent_engine.column_resolve import column_prefers_mean_aggregation

        if column_prefers_mean_aggregation(num_c):
            return "mean"
    except Exception:
        pass
    return "sum"


def _pick_numeric(
    inv: ColumnInventory,
    exclude: Optional[Set[str]] = None,
    prefer: Optional[List[str]] = None,
) -> List[str]:
    ex = {x.lower() for x in (exclude or set())}
    ordered: List[str] = []
    for c in prefer or []:
        if c in inv.numerics and c.lower() not in ex:
            ordered.append(c)
    for c in inv.numerics:
        if c.lower() not in ex and c not in ordered:
            ordered.append(c)
    return ordered


def _agg_dim_metric_series(
    df: pd.DataFrame,
    dim_c: str,
    num_c: str,
    agg: str,
    numeric_series_fn: Callable[[str], pd.Series],
    *,
    aggregate_memo: Optional[Dict[Tuple[str, str, str], Optional[pd.Series]]] = None,
) -> Optional[pd.Series]:
    """
    Request-local memo for dimension×metric groupby aggregates.
    Returns a copy so callers can sort/head/filter without mutating the cache.
    """
    key = (str(dim_c), str(num_c), str(agg or "sum"))
    if aggregate_memo is not None and key in aggregate_memo:
        cached = aggregate_memo[key]
        return None if cached is None else cached.copy()
    try:
        dim = df[dim_c]
        vals = numeric_series_fn(num_c)
        mask = dim.notna() & vals.notna()
        if not bool(mask.any()):
            result: Optional[pd.Series] = None
        else:
            # Default groupby sort=True matches prior df.groupby(dim) behavior.
            gb = vals[mask].groupby(dim[mask])
            if agg == "mean":
                result = gb.mean()
            elif agg == "min":
                result = gb.min()
            elif agg == "max":
                result = gb.max()
            else:
                result = gb.sum()
            if result is not None and result.empty:
                result = None
    except Exception:
        result = None
    if aggregate_memo is not None:
        aggregate_memo[key] = None if result is None else result.copy()
    return None if result is None else result.copy()


def discover_chart_opportunities(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    kind: str,
    deps: DashboardDeps,
    *,
    inv: Optional[ColumnInventory] = None,
) -> List[Dict[str, Any]]:
    """Generate scored chart candidates from column inventory."""
    cardinality_memo: Dict[str, int] = {}
    numeric_memo: Dict[str, pd.Series] = {}
    # Per-call caches: avoid re-parsing dates / re-grouping the same dim×metric.
    datetime_memo: Dict[str, pd.Series] = {}
    aggregate_memo: Dict[Tuple[str, str, str], Optional[pd.Series]] = {}
    time_series_memo: Dict[
        Tuple[str, str, str, Optional[str]],
        Tuple[Optional[pd.Series], Dict[str, Any]],
    ] = {}

    def memo_numeric(col: str) -> pd.Series:
        if col not in numeric_memo:
            numeric_memo[col] = deps.numeric_series(col)
        return numeric_memo[col]

    def memo_datetime(col: str) -> pd.Series:
        if col not in datetime_memo:
            datetime_memo[col] = pd.to_datetime(df[col], errors="coerce")
        return datetime_memo[col]

    def memo_time_series_grouped(
        df_in: pd.DataFrame,
        date_col: str,
        value_col: str,
        agg_key: str = "sum",
        force_freq: Optional[str] = None,
        **kwargs: Any,
    ) -> Tuple[Optional[pd.Series], Dict[str, Any]]:
        # Prefer request-local datetime + numeric Series so adaptive bucketing
        # does not re-parse the same columns on every trend candidate.
        ts_key = (str(date_col), str(value_col), str(agg_key or "sum"), force_freq)
        if df_in is df and not kwargs and ts_key in time_series_memo:
            cached_series, cached_meta = time_series_memo[ts_key]
            return (
                None if cached_series is None else cached_series.copy(),
                dict(cached_meta),
            )
        call_kwargs = dict(kwargs)
        if "datetime_values" not in call_kwargs and df_in is df:
            try:
                call_kwargs["datetime_values"] = memo_datetime(str(date_col))
            except Exception:
                pass
        if "numeric_values" not in call_kwargs and df_in is df:
            try:
                call_kwargs["numeric_values"] = memo_numeric(str(value_col))
            except Exception:
                pass
        series_out, meta_out = deps.time_series_grouped(
            df_in,
            date_col,
            value_col,
            agg_key=agg_key,
            force_freq=force_freq,
            **call_kwargs,
        )
        if df_in is df and not kwargs:
            time_series_memo[ts_key] = (
                None if series_out is None else series_out.copy(),
                dict(meta_out),
            )
        return series_out, meta_out

    discover_deps = DashboardDeps(
        numeric_series=memo_numeric,
        time_series_grouped=memo_time_series_grouped,
        series_payload=deps.series_payload,
        pretty_label=deps.pretty_label,
        chart_title_by_dimension=deps.chart_title_by_dimension,
        freq_human_label=deps.freq_human_label,
        id_like_column=deps.id_like_column,
        priority_metrics=deps.priority_metrics,
        record_metric_key=deps.record_metric_key,
    )

    if inv is None:
        inv = classify_columns(
            df,
            profile,
            id_like_fn=deps.id_like_column,
            numeric_series_fn=memo_numeric,
        )
    primary, secondary, _ = deps.priority_metrics(kind)
    prefer_metrics = [m for m in (primary, secondary) if m]
    numerics = _pick_numeric(inv, prefer=prefer_metrics)
    if not numerics and not inv.categories and not inv.dates:
        return []

    out: List[Dict[str, Any]] = []
    used_pairs: Set[Tuple[str, str, str]] = set()
    breakdown_dims = _ordered_breakdown_dimensions(
        df,
        inv,
        deps.id_like_column,
        profile,
        cardinality_memo=cardinality_memo,
    )
    business_breakdown_dims = [
        d for d in breakdown_dims if _is_banking_business_dimension(d)
    ]
    has_business_dims = len(business_breakdown_dims) >= 1
    is_finance = str(kind or "").lower() == "finance"
    is_hr = str(kind or "").lower() == "hr"

    def add(payload: Optional[Dict[str, Any]], opp_type: str, score: int) -> None:
        if not payload:
            return
        payload = dict(payload)
        tit_raw = str(payload.get("title") or "").strip()
        if tit_raw:
            payload["title"] = normalize_canonical_chart_title(tit_raw)
        ok, _ = validate_chart_renderable(payload)
        if not ok:
            return
        title = str(payload.get("title") or "").strip()
        if not title:
            return
        if any(str(c.get("title", "")).strip() == title for c in out):
            return
        payload["_opportunityType"] = opp_type
        payload["_opportunityScore"] = score + _OPPORTUNITY_PRIORITY.get(opp_type, 50)
        out.append(payload)

    # A. Trend + area (performance over time)
    trend_metrics = numerics[:3]
    if is_hr:
        hr_nums = _hr_preferred_metrics(numerics, primary, secondary)
        trend_metrics = hr_nums[:3] if hr_nums else trend_metrics
    for ti, date_c in enumerate(inv.dates[:2]):
        for mi, num_c in enumerate(trend_metrics):
            try:
                agg = _metric_agg_key(num_c, inv)
                g_series, tsm = memo_time_series_grouped(
                    df, str(date_c), str(num_c), agg_key=agg
                )
                if g_series is None or len(g_series) < 2:
                    continue
                tb = deps.freq_human_label(str(tsm.get("timeBucket") or "M"))
                chart_type = "line" if mi == 0 else "area"
                tit = _executive_trend_title(num_c, tb, deps.pretty_label)
                add(
                    deps.series_payload(
                        tit,
                        g_series,
                        chart_type=chart_type,
                        metric_column=num_c,
                    ),
                    "trend",
                    94 - mi * 4,
                )
            except Exception:
                pass

    # B. Rankings — one metric per dimension, spread dimensions
    for di, dim_c in enumerate(breakdown_dims[:6]):
        num_c = _preferred_breakdown_metric(numerics, di, primary, secondary, kind)
        if not num_c:
            continue
        if _finance_geographic_risk_pair_blocked(
            kind,
            num_c,
            dim_c,
            business_dims_available=has_business_dims,
        ):
            continue
        pair_key = ("ranking", dim_c.lower(), num_c.lower())
        if pair_key in used_pairs:
            continue
        try:
            agg = _metric_agg_key(num_c, inv)
            nu = _dimension_cardinality(df, dim_c, profile, memo=cardinality_memo)
            if nu < 3 or nu > 20:
                continue
            g = _agg_dim_metric_series(
                df,
                dim_c,
                num_c,
                agg,
                memo_numeric,
                aggregate_memo=aggregate_memo,
            )
            if g is None or g.empty:
                continue
            g = g.sort_values(ascending=False).head(10)
            g = g[g.index.map(lambda x: is_valid_kpi_leader_value(str(x)))]
            if g.empty:
                continue
            tit = _executive_metric_by_dim_title(num_c, dim_c, agg, deps.pretty_label)
            add(
                deps.series_payload(
                    tit,
                    g,
                    chart_type="horizontalBar",
                    max_points=10,
                    category_column=dim_c,
                    metric_column=num_c,
                ),
                "ranking",
                88 - di * 3,
            )
            used_pairs.add(pair_key)
        except Exception:
            pass

    # B3. Manufacturing / operations quality & downtime breakdowns (additive pairs).
    is_operations = str(kind or "").lower() == "operations"
    if is_operations and _is_manufacturing_operations_schema(df.columns.tolist()):
        quality_metrics = _manufacturing_quality_metric_order(numerics)[:3]
        mfg_dims = _manufacturing_preferred_dims(breakdown_dims)[:4]
        for di, dim_c in enumerate(mfg_dims):
            for ri, num_c in enumerate(quality_metrics):
                pair_key = ("ranking", dim_c.lower(), num_c.lower())
                if pair_key in used_pairs:
                    continue
                try:
                    agg = _metric_agg_key(num_c, inv)
                    nu = _dimension_cardinality(
                        df, dim_c, profile, memo=cardinality_memo
                    )
                    if nu < 2 or nu > 20:
                        continue
                    g = _agg_dim_metric_series(
                        df,
                        dim_c,
                        num_c,
                        agg,
                        memo_numeric,
                        aggregate_memo=aggregate_memo,
                    )
                    if g is None or g.empty:
                        continue
                    g = g.sort_values(ascending=False).head(10)
                    g = g[g.index.map(lambda x: is_valid_kpi_leader_value(str(x)))]
                    if g.empty:
                        continue
                    tit = _executive_metric_by_dim_title(
                        num_c, dim_c, agg, deps.pretty_label
                    )
                    add(
                        deps.series_payload(
                            tit,
                            g,
                            chart_type="horizontalBar",
                            max_points=10,
                            category_column=dim_c,
                            metric_column=num_c,
                        ),
                        "ranking",
                        87 - di * 2 - ri,
                    )
                    used_pairs.add(pair_key)
                except Exception:
                    pass

    # B2. Banking risk metrics on segment/product (avoid city for delinquency/utilization)
    if is_finance and has_business_dims:
        risk_metrics = [
            m
            for m in _banking_preferred_metrics(numerics, primary, secondary)
            if _is_banking_executive_risk_metric(m)
        ]
        for di, dim_c in enumerate(business_breakdown_dims[:3]):
            for ri, num_c in enumerate(risk_metrics[:3]):
                pair_key = ("ranking", dim_c.lower(), num_c.lower())
                if pair_key in used_pairs:
                    continue
                try:
                    agg = _metric_agg_key(num_c, inv)
                    nu = _dimension_cardinality(
                        df, dim_c, profile, memo=cardinality_memo
                    )
                    if nu < 2 or nu > 20:
                        continue
                    g = _agg_dim_metric_series(
                        df,
                        dim_c,
                        num_c,
                        agg,
                        memo_numeric,
                        aggregate_memo=aggregate_memo,
                    )
                    if g is None or g.empty:
                        continue
                    g = g.sort_values(ascending=False).head(10)
                    g = g[g.index.map(lambda x: is_valid_kpi_leader_value(str(x)))]
                    if g.empty:
                        continue
                    tit = _executive_metric_by_dim_title(
                        num_c, dim_c, agg, deps.pretty_label
                    )
                    add(
                        deps.series_payload(
                            tit,
                            g,
                            chart_type="horizontalBar",
                            max_points=10,
                            category_column=dim_c,
                            metric_column=num_c,
                        ),
                        "ranking",
                        90 - di * 2 - ri,
                    )
                    used_pairs.add(pair_key)
                except Exception:
                    pass

    # C. Composition donuts — low cardinality only, part-to-whole
    if numerics:
        for di, dim_c in enumerate(breakdown_dims[:8]):
            if not _composition_eligible_dim(
                df, dim_c, deps.id_like_column, profile, cardinality_memo=cardinality_memo
            ):
                continue
            num_c = numerics[0 if di % 2 else min(1, len(numerics) - 1)]
            if not _metric_eligible_for_composition(num_c, inv):
                continue
            pair_key = ("composition", dim_c.lower(), num_c.lower())
            if pair_key in used_pairs:
                continue
            try:
                g = _agg_dim_metric_series(
                    df,
                    dim_c,
                    num_c,
                    "sum",
                    memo_numeric,
                    aggregate_memo=aggregate_memo,
                )
                if g is None or g.empty:
                    continue
                g = g.sort_values(ascending=False).head(8)
                g = g[g.index.map(lambda x: is_valid_kpi_leader_value(str(x)))]
                if g.empty or len(g) < 2 or not _composition_shares_valid(g):
                    continue
                tit = _executive_share_by_dim_title(num_c, dim_c, deps.pretty_label)
                api_typ = "donut" if len(g) >= 3 else "pie"
                add(
                    deps.series_payload(
                        tit,
                        g,
                        chart_type=api_typ,
                        category_column=dim_c,
                        metric_column=num_c,
                    ),
                    "composition",
                    86 - di * 2,
                )
                used_pairs.add(pair_key)
            except Exception:
                pass

    # D. Correlation scatter
    corr_cols = numerics[:8]
    pairs_done = 0
    for i, xc in enumerate(corr_cols):
        if pairs_done >= 2:
            break
        for yc in corr_cols[i + 1 :]:
            if pairs_done >= 2 or xc == yc:
                continue
            payload = _build_scatter_payload(df, xc, yc, discover_deps)
            if payload:
                add(payload, "correlation", 78 + pairs_done)
                pairs_done += 1

    # E. Supporting comparisons — rotate dimension × metric (max one per dim)
    for di, dim_c in enumerate(breakdown_dims[:6]):
        num_c = _preferred_breakdown_metric(
            numerics, di + 1, primary, secondary, kind
        )
        if not num_c:
            continue
        if _finance_geographic_risk_pair_blocked(
            kind,
            num_c,
            dim_c,
            business_dims_available=has_business_dims,
        ):
            continue
        pair_key = ("compare", dim_c.lower(), num_c.lower())
        if pair_key in used_pairs:
            continue
        try:
            nu = _dimension_cardinality(df, dim_c, profile, memo=cardinality_memo)
            if nu < 2 or nu > 18:
                continue
            agg = _metric_agg_key(num_c, inv)
            g = _agg_dim_metric_series(
                df,
                dim_c,
                num_c,
                agg,
                memo_numeric,
                aggregate_memo=aggregate_memo,
            )
            if g is None or g.empty:
                continue
            g = g[g.index.map(lambda x: is_valid_kpi_leader_value(str(x)))]
            if g.empty:
                continue
            opp = "geographic" if dim_c in inv.geographic else "compare"
            chart_type = "horizontalBar" if len(g) > 6 else "bar"
            tit = _executive_metric_by_dim_title(num_c, dim_c, agg, deps.pretty_label)
            add(
                deps.series_payload(
                    tit,
                    g,
                    chart_type=chart_type,
                    category_column=dim_c,
                    metric_column=num_c,
                ),
                opp,
                74 - di * 4,
            )
            used_pairs.add(pair_key)
        except Exception:
            pass

    # F. Record distribution (low-cardinality categories only)
    for dim_c in inv.categories[:3]:
        if is_hr and _is_hr_demographic_column(dim_c):
            continue
        if not _composition_eligible_dim(
            df, dim_c, deps.id_like_column, profile, cardinality_memo=cardinality_memo
        ):
            continue
        if not _breakdown_dimension_eligible(
            dim_c, df, deps.id_like_column, profile, cardinality_memo=cardinality_memo
        ):
            continue
        if _stronger_metric_exists_for_dimension(out, dim_c, deps.record_metric_key):
            continue
        try:
            vc = df[dim_c].dropna().astype(str)
            vc = vc[vc.map(is_valid_kpi_leader_value)]
            counts = vc.value_counts().head(8)
            if counts.empty or len(counts) < 2:
                continue
            lbl = deps.pretty_label(dim_c)
            tit = normalize_canonical_chart_title(f"Records by {_title_case_phrase(lbl)}")
            add(
                deps.series_payload(
                    tit,
                    counts.astype(float),
                    chart_type="horizontalBar",
                    category_column=dim_c,
                    metric_column=deps.record_metric_key,
                ),
                "distribution",
                70,
            )
        except Exception:
            pass

    return out


def _bind_deps_to_dataframe(df: pd.DataFrame, deps: DashboardDeps) -> DashboardDeps:
    return DashboardDeps(
        numeric_series=lambda col: _numeric_series_from_frame(df, col),
        time_series_grouped=deps.time_series_grouped,
        series_payload=deps.series_payload,
        pretty_label=deps.pretty_label,
        chart_title_by_dimension=deps.chart_title_by_dimension,
        freq_human_label=deps.freq_human_label,
        id_like_column=deps.id_like_column,
        priority_metrics=deps.priority_metrics,
        record_metric_key=deps.record_metric_key,
    )


def compute_dashboard_coverage_telemetry(
    *,
    selected: List[Dict[str, Any]],
    discovered: List[Dict[str, Any]],
    merged_count: int,
    max_charts: int,
    inv: ColumnInventory,
) -> Dict[str, Any]:
    """Dev-facing summary of which story buckets were filled vs skipped."""
    buckets_filled: List[str] = []
    buckets_seen: Set[str] = set()
    for chart in selected:
        bucket = _coverage_bucket(chart)
        if bucket not in buckets_seen:
            buckets_seen.add(bucket)
            buckets_filled.append(bucket)
    buckets_missing = [b for b in _COVERAGE_BUCKETS if b not in buckets_seen]
    discovery_buckets = sorted(
        {_coverage_bucket(c) for c in discovered if c}
    )
    chart_types = [
        _norm_chart_type(c.get("chartType")) for c in selected if c
    ]
    return {
        "maxCharts": max_charts,
        "selectedCount": len(selected),
        "discoveredCount": len(discovered),
        "mergedCandidateCount": merged_count,
        "bucketsFilled": buckets_filled,
        "bucketsMissing": buckets_missing,
        "bucketsInDiscovery": discovery_buckets,
        "chartTypesSelected": chart_types,
        "inventoryRichness": {
            "dates": len(inv.dates),
            "numerics": len(inv.numerics),
            "categories": len(inv.categories),
            "geographic": len(inv.geographic),
        },
    }


def build_dashboard_charts_bundle(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    kind: str,
    deps: DashboardDeps,
    *,
    seed_candidates: Optional[List[Dict[str, Any]]] = None,
    kpi_cards: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    bound = _bind_deps_to_dataframe(df, deps)
    inv = classify_columns(df, profile, id_like_fn=bound.id_like_column)
    max_charts = target_chart_count(inv, len(df))
    kpi_context = extract_kpi_chart_context(kpi_cards)
    discovered = discover_chart_opportunities(df, profile, kind, bound, inv=inv)
    merged: List[Dict[str, Any]] = []
    seen_titles: Set[str] = set()
    for src in discovered + (seed_candidates or []):
        if not src:
            continue
        chart = dict(src)
        t = normalize_canonical_chart_title(str(chart.get("title") or "").strip())
        if not t or t.lower() in seen_titles:
            continue
        chart["title"] = t
        seen_titles.add(t.lower())
        merged.append(chart)

    selected = select_diverse_charts(
        merged,
        kind=kind,
        max_charts=max_charts,
        deps=bound,
        kpi_context=kpi_context,
        discovered_count=len(discovered),
    )

    telemetry = compute_dashboard_coverage_telemetry(
        selected=selected,
        discovered=discovered,
        merged_count=len(merged),
        max_charts=max_charts,
        inv=inv,
    )
    return selected, telemetry


def build_dashboard_charts_from_opportunities(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    kind: str,
    deps: DashboardDeps,
    *,
    seed_candidates: Optional[List[Dict[str, Any]]] = None,
    kpi_cards: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    charts, _ = build_dashboard_charts_bundle(
        df,
        profile,
        kind,
        deps,
        seed_candidates=seed_candidates,
        kpi_cards=kpi_cards,
    )
    return charts
