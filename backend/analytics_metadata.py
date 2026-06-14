"""
Centralized, domain-agnostic labels for metrics, axes, KPI cards, tooltips, chart subtitles.
Uses aggregation keys + column identifiers only — not question wording or vertical-specific nouns.
"""

from __future__ import annotations

import math
import re
from typing import Optional


def _pretty_column_label(raw: Optional[str], max_len: int = 56) -> str:
    s = str(raw or "").replace("_", " ").strip()
    if len(s) > max_len:
        return s[: max_len - 1] + "…"
    return s


def _strip_id_metric_stem(column_name: Optional[str]) -> str:
    if not column_name:
        return ""
    c = str(column_name).strip().lower().replace(" ", "_")
    for suf in ("_ids", "_id", "_key", "_number", "_no", "_code"):
        if c.endswith(suf) and len(c) > len(suf) + 1:
            c = c[: -len(suf)]
            break
    return c.strip("_")


def _title_case_words(phrase: str) -> str:
    s = str(phrase).replace("_", " ").strip()
    if not s:
        return ""
    parts = [p for p in s.split() if p]
    out: list[str] = []
    for p in parts:
        if p.lower() in ("id", "no", "n/a"):
            continue
        out.append(p[:1].upper() + p[1:].lower() if len(p) > 1 else p.upper())
    return " ".join(out).strip()


def build_metric_label(
    agg_key: Optional[str],
    agg_label: Optional[str],
    value_col: Optional[str],
) -> str:
    """
    SME-facing metric phrase for charts, KPIs, tooltips, provenance (pandas-side).
    """
    ak = (str(agg_key or "")).strip().lower()
    al = (str(agg_label or "")).strip().lower()
    raw_pretty = _pretty_column_label(value_col) if value_col else "Value"

    if ak == "count" or al == "count":
        stem = _strip_id_metric_stem(value_col) or (str(value_col or "").strip().lower())
        ent = _title_case_words(stem)
        if not ent:
            return "Count"
        if ent.lower().endswith(" count"):
            return ent
        return f"{ent} count"

    if ak == "mean" or al in ("average", "mean", "avg") or "average" in al:
        if raw_pretty.lower() in ("average", "mean", "avg", "value"):
            return "Average"
        return f"Average {raw_pretty}"

    if ak == "sum" or al in ("total", "sum"):
        if raw_pretty.lower() in ("total", "sum", "value"):
            return "Total"
        return f"Total {raw_pretty}"

    if ak == "min" or al.startswith("min"):
        return f"Minimum {raw_pretty}" if raw_pretty else "Minimum"

    if ak == "max" or al.startswith("max"):
        return f"Maximum {raw_pretty}" if raw_pretty else "Maximum"

    if ak == "scatter" or al == "scatter":
        return raw_pretty or "Value"

    lab = str(agg_label or "").strip()
    if lab and value_col:
        return f"{lab} {raw_pretty}".strip()
    return raw_pretty or lab or "Value"


def build_axis_label(
    agg_key: Optional[str],
    agg_label: Optional[str],
    value_col: Optional[str],
) -> str:
    return build_metric_label(agg_key, agg_label, value_col)


def build_kpi_title(
    agg_key: Optional[str],
    agg_label: Optional[str],
    value_col: Optional[str],
) -> str:
    return build_metric_label(agg_key, agg_label, value_col)


def build_tooltip_label(
    agg_key: Optional[str],
    agg_label: Optional[str],
    value_col: Optional[str],
) -> str:
    return build_metric_label(agg_key, agg_label, value_col)


def build_insight_title(
    agg_key: Optional[str],
    metric_col: Optional[str],
    dim_col: Optional[str],
    chart_type: str = "bar",
) -> str:
    """Chart title with aggregation prefix, e.g. Total production loss by plant."""
    met = build_metric_label(agg_key, None, metric_col)
    dim = _pretty_column_label(dim_col) if dim_col else "category"
    ct = (chart_type or "bar").strip().lower()
    if ct in ("line", "area"):
        return f"{met} over time"
    if ct in ("pie", "donut"):
        return f"{met} by {dim.lower()}"
    if ct == "scatter":
        return f"{met} vs {dim.lower()}"
    if ct == "histogram":
        return f"Distribution — {met}"
    return f"{met} by {dim.lower()}"


def format_executive_number(value: float) -> str:
    """Human-facing numeric label — avoids scientific notation (e.g. 4.072e+04)."""
    if value is None or not math.isfinite(float(value)):
        return "—"
    v = float(value)
    av = abs(v)
    if av >= 1000:
        return f"{v:,.0f}"
    if av >= 1:
        text = f"{v:,.2f}".rstrip("0").rstrip(".")
        return text if text else "0"
    text = f"{v:.4f}".rstrip("0").rstrip(".")
    return text if text else "0"


def build_chart_subtitle(
    *,
    rows_analyzed: Optional[int] = None,
    chart_points: Optional[int] = None,
    extra_note: Optional[str] = None,
) -> str:
    parts: list[str] = []
    if rows_analyzed is not None and rows_analyzed >= 0:
        parts.append(f"{int(rows_analyzed):,} rows analyzed")
    if chart_points is not None and chart_points >= 0:
        parts.append(f"{int(chart_points):,} chart points")
    if extra_note and str(extra_note).strip():
        parts.append(str(extra_note).strip())
    return " · ".join(parts)
