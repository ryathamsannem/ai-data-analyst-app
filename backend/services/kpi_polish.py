"""KPI polish helpers — titles, subtitles, leader validation, ROAS checks."""

from __future__ import annotations

import re
from typing import Any, Callable, Dict, List, Optional, Tuple

import pandas as pd

ROAS_SUSPICIOUS_THRESHOLD = 100.0

_FORBIDDEN_DIM_TOKENS = (
    "date",
    "time",
    "timestamp",
    "period",
    "month",
    "year",
    "hire",
    "name",
    "employee_name",
    "full_name",
    "operator",
    "sales_rep",
    "rep",
    "manager",
    "email",
    "uuid",
    "guid",
)

_FORBIDDEN_DIM_SUFFIXES = ("_id", "_key", "_code", "_no", "_number")


def _col_tokens(col: str) -> List[str]:
    return [t for t in re.split(r"[_\s]+", str(col).lower()) if t]


def is_valid_subtitle_dimension(col: Optional[str]) -> bool:
    if not col:
        return False
    cl = str(col).lower().replace("-", "_")
    if any(cl.endswith(s) for s in _FORBIDDEN_DIM_SUFFIXES):
        return False
    tokens = _col_tokens(col)
    if not tokens:
        return False
    if tokens[0] in ("id", "ids", "uuid"):
        return False
    if any(t in _FORBIDDEN_DIM_TOKENS for t in tokens):
        if "name" in tokens and any(
            t in tokens for t in ("campaign", "product", "brand", "category", "company", "store", "vendor")
        ):
            pass
        else:
            return False
    return True

_DATE_VALUE_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}"
    r"|^\d{4}-\d{2}$"
    r"|^\d{2}/\d{2}/\d{4}$"
    r"|^\d{4}/\d{2}/\d{2}$"
)
_EMAIL_RE = re.compile(r"^[\w.+-]+@[\w.-]+\.\w+$", re.I)
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)

_WEAK_SUBTITLE_PREFIXES = (
    "top region:",
    "top product:",
    "top category:",
    "top city:",
    "top zone:",
    "highest-value product:",
    "leading region by average:",
)


def is_valid_kpi_leader_value(value: Any) -> bool:
    if value is None:
        return False
    s = str(value).strip()
    if not s or s.lower() in ("nan", "none", "nat", "null"):
        return False
    if _DATE_VALUE_RE.match(s):
        return False
    if re.search(r"\b20\d{2}-\d{2}-\d{2}\b", s):
        return False
    if _EMAIL_RE.match(s):
        return False
    if _UUID_RE.match(s):
        return False
    if re.fullmatch(r"[0-9a-f-]{32,36}", s, re.I):
        return False
    return True


def is_valid_kpi_dimension_column(
    col: Optional[str],
    df: pd.DataFrame,
    *,
    max_unique_ratio: float = 0.92,
) -> bool:
    if not col or col not in df.columns:
        return False
    if not is_valid_subtitle_dimension(col):
        return False
    series = df[col]
    if pd.api.types.is_datetime64_any_dtype(series):
        return False
    sample = series.dropna().head(24)
    if not sample.empty:
        date_like = sum(1 for v in sample.astype(str) if _DATE_VALUE_RE.match(str(v).strip()))
        if date_like >= max(3, len(sample) // 2):
            return False
    n = max(int(series.notna().sum()), 1)
    nu = int(series.nunique(dropna=True))
    cl = str(col).lower()
    if nu / n >= max_unique_ratio:
        if any(tok in cl for tok in ("id", "uuid", "guid", "key", "code", "email")):
            return False
        if cl.endswith("_no") or cl.endswith("_number"):
            return False
    return True


def metric_basis_label(
    metric_col: Optional[str],
    *,
    agg: str = "sum",
    metric_phrase: Optional[str] = None,
    pretty_label: Optional[Callable[[str], str]] = None,
) -> str:
    if metric_phrase:
        phrase = metric_phrase.strip()
        if phrase.lower() in ("revenue", "profit", "spend", "headcount", "cost"):
            return phrase.title()
        return phrase[0].upper() + phrase[1:] if phrase else "Revenue"
    if not metric_col:
        return "Revenue"
    mc = str(metric_col).lower().replace("_", " ")
    if mc in ("revenue minus cost", "revenue_minus_cost"):
        return "Profit"
    if "profit" in mc or "margin" in mc:
        return "Profit"
    if "revenue" in mc:
        return "Revenue"
    if "order value" in mc or mc == "order value":
        return "Order Value"
    if "spend" in mc:
        return "Spend"
    if "loan balance" in mc:
        return "Loan Balance"
    if "headcount" in mc:
        return "Headcount"
    if "downtime" in mc:
        return "Downtime Hours" if "hour" in mc else "Downtime"
    if "defect" in mc:
        return "Defect Rate"
    if "ticket" in mc:
        return "Ticket Volume"
    if "conversion" in mc:
        return "Conversions"
    if pretty_label:
        lbl = pretty_label(str(metric_col))
        if lbl:
            return lbl
    return "Revenue"


def top_kpi_title(
    dim_col: str,
    metric_col: Optional[str],
    *,
    dim_label: str,
    agg: str = "sum",
    metric_phrase: Optional[str] = None,
    pretty_label: Optional[Callable[[str], str]] = None,
    explicit_title: Optional[str] = None,
) -> str:
    basis = metric_basis_label(
        metric_col, agg=agg, metric_phrase=metric_phrase, pretty_label=pretty_label
    )
    if explicit_title:
        title = explicit_title.strip()
        if " by " in title.lower():
            return title
        return f"{title} by {basis}"
    if agg in ("mean", "average", "avg"):
        return f"Top {dim_label} by Average {basis}"
    return f"Top {dim_label} by {basis}"


def average_kpi_title(
    metric_col: Optional[str],
    *,
    domain: str = "generic",
    agg: str = "mean",
) -> str:
    if not metric_col:
        return "Average Order Value" if domain in ("sales", "retail", "ecommerce") else "Average Revenue"
    n = str(metric_col).lower().replace("_", " ")
    if agg in ("mean", "average", "avg"):
        if any(k in n for k in ("salary", "compensation", "ctc", "pay", "wage")) and "personnel" not in n:
            return "Average Salary"
        if "bonus" in n:
            return "Average Bonus"
        if "personnel cost" in n or "personnel_cost" in str(metric_col).lower():
            return "Average Personnel Cost"
        if "defect" in n and "rate" in n:
            return "Average Defect Rate"
        if "spend amount" in n or n == "spend_amount":
            return "Average Spend Amount"
        if "spend" in n or "ad_spend" in n:
            return "Average Spend"
        if "order value" in n or "order_value" in str(metric_col).lower():
            return "Average Order Value"
        if "revenue" in n:
            if domain in ("sales", "retail", "ecommerce", "geography"):
                return "Average Revenue per Record"
            if domain == "marketing":
                return "Average Revenue"
            return "Average Revenue"
        if "sales" in n and domain in ("sales", "retail", "ecommerce"):
            return "Average Revenue per Record"
        if domain == "marketing" and "revenue" in n:
            return "Average Revenue"
    return "Average Revenue per Record" if domain in ("sales", "retail", "ecommerce") else "Average Revenue"


def contribution_subtitle(
    leader: str,
    part: float,
    whole: float,
    metric_phrase: str,
    *,
    agg: str = "sum",
) -> str:
    leader = leader.strip()[:52]
    met = metric_phrase.strip().lower()
    pct = 100.0 * part / whole if whole > 0 else None
    if agg in ("mean", "average", "avg"):
        return f"{leader} leads on average {met}"
    if pct is not None and pct >= 1:
        if "profit" in met:
            return f"{leader} generates the highest profit contribution ({pct:.0f}% of total)"
        return f"{leader} contributes {pct:.0f}% of total {met}"
    return f"{leader} leads on {met}"


def roas_validation_meta(roas: float) -> Tuple[Optional[str], Dict[str, Any]]:
    meta: Dict[str, Any] = {
        "metric_source": "revenue_over_spend",
        "aggregation": "ratio",
        "metric_type": "ratio",
    }
    if roas > ROAS_SUSPICIOUS_THRESHOLD:
        meta["suspicious"] = True
        meta["validation_flags"] = ["high_roas"]
        return "High value detected — verify revenue mapping", meta
    return None, meta


def subtitle_looks_weak(subtitle: str) -> bool:
    s = subtitle.strip().lower()
    if not s:
        return True
    return any(s.startswith(p) for p in _WEAK_SUBTITLE_PREFIXES)


def pick_valid_leader_from_groups(
    groups: pd.Series,
) -> Optional[Tuple[str, float]]:
    for idx, val in groups.items():
        leader = str(idx)[:52]
        if is_valid_kpi_leader_value(leader):
            try:
                return leader, float(val)
            except (TypeError, ValueError):
                continue
    return None
