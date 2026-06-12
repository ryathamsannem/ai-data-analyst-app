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
            nu = int(df[c].dropna().astype(str).nunique())
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


def _dimension_cardinality(df: pd.DataFrame, dim_c: str) -> int:
    try:
        return int(df[dim_c].dropna().astype(str).nunique())
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
    df: pd.DataFrame, inv: ColumnInventory
) -> List[str]:
    pool = _dedupe_preserve(inv.geographic + inv.categories)
    scored = [
        (col, _dimension_priority(col, _dimension_cardinality(df, col)))
        for col in pool
    ]
    scored.sort(key=lambda t: (-t[1], t[0].lower()))
    return [c for c, _ in scored]


def _composition_eligible_dim(
    df: pd.DataFrame,
    dim_c: str,
    id_like_fn: Callable[[Optional[str]], bool],
) -> bool:
    if id_like_fn(dim_c):
        return False
    nu = _dimension_cardinality(df, dim_c)
    if nu < 2 or nu > 8:
        return False
    n = _norm_col(dim_c)
    if any(h in n for h in _HIGH_CARDINALITY_DIM_HINTS) and nu > 6:
        return False
    return True


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
        if _chart_redundant_with_kpi(chart, kpi_context, record_key):
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

    return selected[:max_charts]


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
) -> List[Dict[str, Any]]:
    """Generate scored chart candidates from column inventory."""
    inv = classify_columns(
        df, profile, id_like_fn=deps.id_like_column, numeric_series_fn=deps.numeric_series
    )
    primary, secondary, _ = deps.priority_metrics(kind)
    prefer_metrics = [m for m in (primary, secondary) if m]
    numerics = _pick_numeric(inv, prefer=prefer_metrics)
    if not numerics and not inv.categories and not inv.dates:
        return []

    out: List[Dict[str, Any]] = []
    used_pairs: Set[Tuple[str, str, str]] = set()
    breakdown_dims = _ordered_breakdown_dimensions(df, inv)

    def add(payload: Optional[Dict[str, Any]], opp_type: str, score: int) -> None:
        if not payload:
            return
        title = str(payload.get("title") or "").strip()
        if not title:
            return
        if any(str(c.get("title", "")).strip() == title for c in out):
            return
        payload = dict(payload)
        payload["_opportunityType"] = opp_type
        payload["_opportunityScore"] = score + _OPPORTUNITY_PRIORITY.get(opp_type, 50)
        out.append(payload)

    # A. Trend + area (performance over time)
    trend_metrics = numerics[:3]
    for ti, date_c in enumerate(inv.dates[:2]):
        for mi, num_c in enumerate(trend_metrics):
            try:
                g_series, tsm = deps.time_series_grouped(
                    df, str(date_c), str(num_c), agg_key="sum"
                )
                if g_series is None or len(g_series) < 2:
                    continue
                lbl = deps.pretty_label(num_c)
                tb = deps.freq_human_label(str(tsm.get("timeBucket") or "M"))
                chart_type = "line" if mi == 0 else "area"
                tit = f"{lbl} trend ({tb})"
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
            agg = "mean" if num_c in inv.percentages else "sum"
            sub = df[[dim_c, num_c]].copy()
            sub["_v"] = deps.numeric_series(num_c)
            sub = sub.dropna(subset=[dim_c, "_v"])
            nu = _dimension_cardinality(df, dim_c)
            if sub.empty or nu < 3 or nu > 20:
                continue
            g = sub.groupby(dim_c)["_v"].agg(agg).sort_values(ascending=False).head(10)
            nice_dim = deps.pretty_label(dim_c)
            nice_num = deps.pretty_label(num_c)
            tit = f"Top {nice_dim.lower()} by {nice_num.lower()}"
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
        if not _composition_eligible_dim(df, dim_c, deps.id_like_column):
            continue
        num_c = numerics[0 if di % 2 else min(1, len(numerics) - 1)]
        pair_key = ("composition", dim_c.lower(), num_c.lower())
        if pair_key in used_pairs:
            continue
        try:
            sub = df[[dim_c, num_c]].copy()
            sub["_v"] = deps.numeric_series(num_c)
            sub = sub.dropna(subset=[dim_c, "_v"])
            g = sub.groupby(dim_c)["_v"].sum().sort_values(ascending=False).head(8)
            if g.empty or len(g) < 2:
                continue
            nice_dim = deps.pretty_label(dim_c)
            nice_num = deps.pretty_label(num_c)
            api_typ = "donut" if len(g) >= 3 else "pie"
            tit = f"{nice_num} share by {nice_dim.lower()}"
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
            try:
                tmp = df[[xc, yc]].copy()
                tmp["_x"] = deps.numeric_series(xc)
                tmp["_y"] = deps.numeric_series(yc)
                tmp = tmp.dropna(subset=["_x", "_y"])
                if len(tmp) < 12:
                    continue
                r = float(tmp["_x"].corr(tmp["_y"]))
                if not pd.notna(r) or abs(r) < 0.28:
                    continue
                sample = tmp.head(180)
                labels = [f"{float(row['_x']):.4g}" for _, row in sample.iterrows()]
                values = [float(row["_y"]) for _, row in sample.iterrows()]
                xl = deps.pretty_label(xc)
                yl = deps.pretty_label(yc)
                tit = f"{xl} vs {yl} (correlation)"
                payload: Dict[str, Any] = {
                    "title": tit,
                    "chartType": "scatter",
                    "labels": labels,
                    "values": values,
                    "metricColumn": yc,
                }
                add(payload, "correlation", 78 + int(min(18, abs(r) * 20)))
                pairs_done += 1
            except Exception:
                pass

    # E. Supporting comparisons — rotate dimension × metric (max one per dim)
    for di, dim_c in enumerate(breakdown_dims[:6]):
        num_c = numerics[(di + 1) % max(1, len(numerics))]
        pair_key = ("compare", dim_c.lower(), num_c.lower())
        if pair_key in used_pairs:
            continue
        try:
            sub = df[[dim_c, num_c]].copy()
            sub["_v"] = deps.numeric_series(num_c)
            sub = sub.dropna(subset=[dim_c, "_v"])
            nu = _dimension_cardinality(df, dim_c)
            if sub.empty or nu < 2 or nu > 18:
                continue
            g = sub.groupby(dim_c)["_v"].sum()
            if g.empty:
                continue
            opp = "geographic" if dim_c in inv.geographic else "compare"
            chart_type = "horizontalBar" if len(g) > 6 else "bar"
            tit = deps.chart_title_by_dimension(num_c, dim_c, chart_type=chart_type)
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
        if not _composition_eligible_dim(df, dim_c, deps.id_like_column):
            continue
        try:
            vc = df[dim_c].dropna().astype(str).value_counts().head(8)
            if vc.empty or len(vc) < 2:
                continue
            lbl = deps.pretty_label(dim_c)
            tit = f"Category distribution · {lbl}"
            api_typ = "donut" if 3 <= len(vc) <= 8 else "pie"
            add(
                deps.series_payload(
                    tit,
                    vc.astype(float),
                    chart_type=api_typ,
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


def build_dashboard_charts_from_opportunities(
    df: pd.DataFrame,
    profile: Dict[str, Any],
    kind: str,
    deps: DashboardDeps,
    *,
    seed_candidates: Optional[List[Dict[str, Any]]] = None,
    kpi_cards: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    bound = _bind_deps_to_dataframe(df, deps)
    inv = classify_columns(df, profile, id_like_fn=bound.id_like_column)
    max_charts = target_chart_count(inv, len(df))
    kpi_context = extract_kpi_chart_context(kpi_cards)
    discovered = discover_chart_opportunities(df, profile, kind, bound)
    merged: List[Dict[str, Any]] = []
    seen_titles: Set[str] = set()
    for src in discovered + (seed_candidates or []):
        if not src:
            continue
        t = str(src.get("title") or "").strip()
        if not t or t.lower() in seen_titles:
            continue
        seen_titles.add(t.lower())
        merged.append(src)

    selected = select_diverse_charts(
        merged,
        kind=kind,
        max_charts=max_charts,
        deps=bound,
        kpi_context=kpi_context,
    )

    return selected
