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

    for col in df.columns:
        c = str(col)
        tp = ct.get(c)
        if tp == "date":
            inv.dates.append(c)
            continue
        if tp == "number" and not id_like_fn(c):
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
        if "date" in _norm_col(c) or "timestamp" in _norm_col(c):
            dd = pd.to_datetime(df[c], errors="coerce")
            if dd.notna().sum() >= max(8, int(0.1 * n_rows)):
                inv.dates.append(c)

    inv.dates = _dedupe_preserve(inv.dates)
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
    opp = str(chart.get("_opportunityType") or "compare").lower()
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
        r"\b(revenue|profit|sales|order[_ ]?value|loan[_ ]?balance|spend|gmv)\b", blob
    ):
        return 100
    if re.search(
        r"\b(conversion[_ ]?rate|defect[_ ]?rate|satisfaction|utilization|delinquency|"
        r"attrition|csat|nps|roas|resolution[_ ]?rate|attainment)\b",
        blob,
    ):
        return 80
    if re.search(
        r"\b(orders|tickets|incidents|patients|employees|headcount|admissions|claims|"
        r"customers|hires|terminations|downtime)\b",
        blob,
    ):
        return 60
    if re.search(r"\b(quantity|units|qty)\b", blob):
        return 40
    return 30


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
    return normalize_canonical_chart_title(f"{met} by {dim}")


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
                return True
            if kpi.dimension_hint and kpi.dimension_hint in dk:
                return True
    return False


def _score_candidate(
    chart: Dict[str, Any],
    *,
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
        base += 18

    if bucket == "trend" and ct == "area" and "line" in types_used:
        base += 6

    return base


def _metric_dim_duplicate(
    selected: List[Dict[str, Any]],
    candidate: Dict[str, Any],
    record_key: str,
) -> bool:
    cm = _metric_key(candidate, record_key)
    cd = _dimension_key(candidate)
    if not cd:
        return False
    cct = _norm_chart_type(candidate.get("chartType"))
    if cct not in _BREAKDOWN_TYPES or cct in _TEMPORAL_TYPES:
        return False
    for existing in selected:
        if _metric_key(existing, record_key) != cm:
            continue
        ed = _dimension_key(existing)
        if not ed or ed == cd:
            continue
        ect = _norm_chart_type(existing.get("chartType"))
        if ect in _BREAKDOWN_TYPES and ect not in _TEMPORAL_TYPES:
            return True
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
) -> Tuple[int, int]:
    best_idx = -1
    best_score = -1
    for i, chart in enumerate(remaining):
        mk = _metric_key(chart, record_key)
        if metric_usage.get(mk, 0) >= 2:
            continue
        if _metric_dim_duplicate(selected, chart, record_key):
            continue
        if _chart_story_blocked_by_selected(selected, chart, record_key):
            continue
        if _chart_redundant_with_kpi(chart, kpi_context, record_key):
            continue
        if _chart_skip_due_to_weak_visual_quality(chart, kpi_context, record_key):
            continue
        bucket = _coverage_bucket(chart)
        if prefer_bucket and bucket != prefer_bucket:
            continue
        sc = _score_candidate(
            chart,
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
    metric_usage[mk] = metric_usage.get(mk, 0) + 1
    types_used.add(ct)
    metric_dims_used.add((mk, dk))
    if dk:
        dimension_usage[dk] = dimension_usage.get(dk, 0) + 1
    coverage_filled.add(_coverage_bucket(pick))
    clean = {k: v for k, v in pick.items() if not str(k).startswith("_")}
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
) -> List[Dict[str, Any]]:
    if not candidates:
        return []

    kpi_ctx = kpi_context or []
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

    def memo_numeric(col: str) -> pd.Series:
        if col not in numeric_memo:
            numeric_memo[col] = deps.numeric_series(col)
        return numeric_memo[col]

    discover_deps = DashboardDeps(
        numeric_series=memo_numeric,
        time_series_grouped=deps.time_series_grouped,
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
    for ti, date_c in enumerate(inv.dates[:2]):
        for mi, num_c in enumerate(trend_metrics):
            try:
                agg = _metric_agg_key(num_c, inv)
                g_series, tsm = deps.time_series_grouped(
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
        num_c = numerics[di % max(1, len(numerics))]
        pair_key = ("ranking", dim_c.lower(), num_c.lower())
        if pair_key in used_pairs:
            continue
        try:
            agg = _metric_agg_key(num_c, inv)
            sub = df[[dim_c, num_c]].copy()
            sub["_v"] = discover_deps.numeric_series(num_c)
            sub = sub.dropna(subset=[dim_c, "_v"])
            nu = _dimension_cardinality(df, dim_c, profile, memo=cardinality_memo)
            if sub.empty or nu < 3 or nu > 20:
                continue
            g = sub.groupby(dim_c)["_v"].agg(agg).sort_values(ascending=False).head(10)
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

    # C. Composition donuts — low cardinality only, part-to-whole
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
            sub = df[[dim_c, num_c]].copy()
            sub["_v"] = discover_deps.numeric_series(num_c)
            sub = sub.dropna(subset=[dim_c, "_v"])
            g = sub.groupby(dim_c)["_v"].sum().sort_values(ascending=False).head(8)
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
        num_c = numerics[(di + 1) % max(1, len(numerics))]
        pair_key = ("compare", dim_c.lower(), num_c.lower())
        if pair_key in used_pairs:
            continue
        try:
            sub = df[[dim_c, num_c]].copy()
            sub["_v"] = discover_deps.numeric_series(num_c)
            sub = sub.dropna(subset=[dim_c, "_v"])
            nu = _dimension_cardinality(df, dim_c, profile, memo=cardinality_memo)
            if sub.empty or nu < 2 or nu > 18:
                continue
            agg = _metric_agg_key(num_c, inv)
            g = sub.groupby(dim_c)["_v"].agg(agg)
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
