"""KPI title ↔ metric-type alignment and validation."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

# Entity dimensions — count / distinct count only in KPI titles.
ENTITY_NOUNS = (
    "salesperson",
    "sales person",
    "sales rep",
    "sales_rep",
    "employee",
    "staff",
    "customer",
    "patient",
    "ticket",
    "account",
    "operator",
    "rep",
)

ENTITY_COUNT_TITLE_MARKERS = (
    "count",
    "headcount",
    "distinct",
    "unique",
    "employees",
    "records in view",
    "attributes tracked",
    "breakdown-style",
)

# Currency / monetary metrics.
CURRENCY_TOKENS = (
    "revenue",
    "sales",
    "profit",
    "margin",
    "spend",
    "budget",
    "order value",
    "order_value",
    "loan balance",
    "loan_balance",
    "cost",
    "amount",
    "balance",
    "personnel cost",
    "personnel_cost",
    "downtime",
    "units produced",
    "units_produced",
)

CURRENCY_TITLE_PREFIXES = (
    "total revenue",
    "total sales",
    "total profit",
    "total spend",
    "total budget",
    "total order value",
    "total loan balance",
    "average revenue",
    "average sales",
    "average order value",
    "average spend",
    "average budget",
    "total downtime",
    "total units",
)

# Column resolution priority (substring on normalized header).
CURRENCY_COLUMN_PRIORITY: Tuple[Tuple[str, int], ...] = (
    ("order_value", 100),
    ("order value", 100),
    ("total_revenue", 98),
    ("gross_sales", 96),
    ("net_revenue", 96),
    ("revenue", 95),
    ("sales_amount", 92),
    ("spend_amount", 90),
    ("loan_balance", 88),
    ("profit", 86),
    ("budget", 84),
    ("spend", 82),
    ("sales", 80),
    ("amount", 70),
    ("cost", 60),
    ("value", 50),
)


def _norm_col(col: str) -> str:
    return str(col).lower().replace("_", " ").strip()


def is_entity_dimension_column(col: Optional[str]) -> bool:
    if not col:
        return False
    n = _norm_col(col)
    if re.search(r"\b(sales\s*rep|salesrep|salesperson|sales\s*person)\b", n):
        return True
    if re.search(r"\b(employee|staff|operator)\b", n):
        if not any(x in n for x in ("cost", "count", "headcount", "department")):
            return True
    if re.search(r"\bcustomers?\b", n):
        if "segment" not in n and "count" not in n:
            return True
    if re.search(r"\b(patient|ticket)\b", n):
        if "volume" not in n and "count" not in n:
            return True
    if re.search(r"\baccount\b", n):
        if not any(x in n for x in ("segment", "type", "balance", "revenue")):
            return True
    return False


def is_currency_metric_column(col: Optional[str]) -> bool:
    if not col or is_entity_dimension_column(col):
        return False
    n = _norm_col(col)
    return any(tok in n for tok in CURRENCY_TOKENS)


def resolve_currency_metric_column(
    columns: List[str],
    mapped: Optional[str] = None,
) -> Optional[str]:
    """Pick the best monetary column; never entity dimensions."""
    if mapped and mapped in columns and is_currency_metric_column(mapped):
        return mapped
    best: Optional[str] = None
    best_score = -1
    for col in columns:
        if not is_currency_metric_column(col):
            continue
        n = _norm_col(col).replace(" ", "_")
        score = 0
        for kw, w in CURRENCY_COLUMN_PRIORITY:
            if kw.replace(" ", "_") in n or kw in _norm_col(col):
                score = max(score, w)
        if score > best_score:
            best_score = score
            best = col
    return best


def currency_aggregate_title(col: Optional[str], agg: str = "sum") -> str:
    """Executive title for a currency metric column."""
    if not col:
        return "Total Revenue" if agg == "sum" else "Average Order Value"
    n = _norm_col(col)
    if agg in ("mean", "average", "avg"):
        if "order value" in n or "order_value" in str(col).lower():
            return "Average Order Value"
        if "revenue" in n:
            return "Average Revenue"
        if "spend" in n:
            return "Average Spend"
        if "budget" in n:
            return "Average Budget"
        if "profit" in n or "margin" in n:
            return "Average Profit"
        if "loan balance" in n or "loan_balance" in str(col).lower():
            return "Average Loan Balance"
        if "sales" in n and not is_entity_dimension_column(col):
            return "Average Sales"
        return "Average Order Value"
    if "revenue" in n:
        return "Total Revenue"
    if "order value" in n or "order_value" in str(col).lower():
        return "Total Order Value"
    if "profit" in n or "margin" in n:
        return "Total Profit"
    if "spend" in n:
        return "Total Spend"
    if "budget" in n:
        return "Total Budget"
    if "loan balance" in n or "loan_balance" in str(col).lower():
        return "Total Loan Balance"
    if "downtime" in n:
        return "Total Downtime Hours" if "hour" in n else "Total Downtime"
    if "sales" in n and not is_entity_dimension_column(col):
        return "Total Sales"
    return "Total Revenue"


def entity_count_title(col: Optional[str]) -> str:
    n = _norm_col(col or "")
    if "employee" in n or "staff" in n:
        return "Total Employees"
    if "headcount" in n:
        return "Total Headcount"
    if "customer" in n:
        return "Customer Count"
    if "patient" in n:
        return "Patient Count"
    if "ticket" in n:
        return "Ticket Count"
    if "sales" in n and ("rep" in n or "person" in n):
        return "Salesperson Count"
    if "account" in n:
        return "Account Count"
    return "Distinct Count"


ENTITY_COUNT_EXCEPTIONS = frozenset(
    {
        "total employees",
        "total headcount",
        "total patient volume",
        "total admissions",
        "total readmissions",
        "customer count",
        "department count",
        "salesperson count",
        "account count",
        "ticket count",
        "patient count",
    }
)


def title_implies_entity_without_count(title: str) -> bool:
    tl = title.strip().lower()
    if tl in ENTITY_COUNT_EXCEPTIONS:
        return False
    if any(m in tl for m in ENTITY_COUNT_TITLE_MARKERS):
        return False
    if tl.startswith("top "):
        return False
    if tl.startswith("average ") and any(
        x in tl for x in ("rate", "attrition", "defect", "utilization", "delinquency")
    ):
        return False
    for noun in ENTITY_NOUNS:
        if noun in tl and ("total" in tl or tl.startswith(noun)):
            return True
    return False


def title_implies_currency_aggregate(title: str) -> bool:
    tl = title.strip().lower()
    if tl.startswith("top "):
        return False
    if any(tl.startswith(p) for p in CURRENCY_TITLE_PREFIXES):
        return True
    if tl.startswith("total ") and not title_implies_entity_without_count(title):
        for tok in CURRENCY_TOKENS:
            if tok in tl:
                return True
    if tl.startswith("average ") and any(
        x in tl
        for x in (
            "revenue",
            "sales",
            "profit",
            "spend",
            "budget",
            "order value",
            "loan balance",
            "cost",
        )
    ):
        return True
    return False


def _parse_numeric_value(raw: str) -> Optional[float]:
    s = str(raw or "").strip().replace(",", "").replace("$", "").replace("₹", "")
    if not s or s in ("—", "N/A", "-"):
        return None
    if s.endswith("%"):
        try:
            return float(s[:-1])
        except ValueError:
            return None
    try:
        return float(s)
    except ValueError:
        return None


def value_looks_like_currency(value: str) -> bool:
    n = _parse_numeric_value(value)
    if n is None:
        return False
    if str(value).strip().endswith("%"):
        return False
    return abs(n) >= 1000


def value_looks_like_count(value: str) -> bool:
    n = _parse_numeric_value(value)
    if n is None:
        return False
    if str(value).strip().endswith("%"):
        return False
    if abs(n) >= 10000 and "," in str(value):
        return False
    return float(n).is_integer() or abs(n) < 10000


def infer_metric_type(
    title: str,
    metric_col: Optional[str],
    aggregation: Optional[str],
) -> str:
    tl = title.lower()
    if tl.startswith("top "):
        return "dimension_leader"
    if title_implies_entity_without_count(title) or (
        metric_col and is_entity_dimension_column(metric_col) and "count" in tl
    ):
        return "entity_count"
    if metric_col and is_entity_dimension_column(metric_col):
        return "entity"
    if "rate" in tl or (metric_col and "rate" in _norm_col(metric_col)):
        return "rate"
    if title_implies_currency_aggregate(title) or (
        metric_col and is_currency_metric_column(metric_col)
    ):
        return "currency"
    if aggregation in ("count", "nunique"):
        return "entity_count"
    return "other"


@dataclass
class KpiValidationIssue:
    code: str
    message: str


@dataclass
class KpiCardAudit:
    title: str
    value: str
    metric_source: Optional[str] = None
    aggregation: Optional[str] = None
    metric_type: Optional[str] = None
    subtitle: Optional[str] = None
    source_dimension: Optional[str] = None
    issues: List[str] = field(default_factory=list)


def validate_kpi_card(
    card: Dict[str, Any],
    *,
    metric_col: Optional[str] = None,
    aggregation: Optional[str] = None,
) -> List[KpiValidationIssue]:
    issues: List[KpiValidationIssue] = []
    title = str(card.get("title") or "").strip()
    value = str(card.get("value") or "").strip()
    meta = card.get("kpi_meta") or card.get("subtitle_meta") or {}
    metric_col = metric_col or meta.get("metric_source") or meta.get("source_metric")
    aggregation = aggregation or meta.get("aggregation")
    metric_type = infer_metric_type(title, metric_col, aggregation)

    if not title:
        issues.append(KpiValidationIssue("empty_title", "missing title"))
        return issues

    if title_implies_entity_without_count(title):
        if value_looks_like_currency(value):
            issues.append(
                KpiValidationIssue(
                    "entity_title_currency_value",
                    f"entity title '{title}' with currency-like value '{value}'",
                )
            )
        if metric_col and is_currency_metric_column(metric_col):
            issues.append(
                KpiValidationIssue(
                    "entity_title_currency_metric",
                    f"entity title '{title}' uses currency metric column '{metric_col}'",
                )
            )

    if title_implies_currency_aggregate(title):
        if metric_col and is_entity_dimension_column(metric_col):
            issues.append(
                KpiValidationIssue(
                    "currency_title_entity_metric",
                    f"currency title '{title}' uses entity column '{metric_col}'",
                )
            )
        if title_implies_entity_without_count(title):
            issues.append(
                KpiValidationIssue(
                    "currency_title_entity_wording",
                    f"currency value under entity wording in '{title}'",
                )
            )

    if metric_type == "currency" and value_looks_like_count(value) and not str(value).endswith("%"):
        if title_implies_currency_aggregate(title) and _parse_numeric_value(value) is not None:
            if _parse_numeric_value(value) is not None and _parse_numeric_value(value) < 500:
                pass  # small totals ok
            elif "total" in title.lower() and _parse_numeric_value(value) is not None:
                if _parse_numeric_value(value) < 100:
                    issues.append(
                        KpiValidationIssue(
                            "currency_title_count_value",
                            f"currency title '{title}' with count-like value '{value}'",
                        )
                    )

    subtitle = str(card.get("subtitle") or "").strip()
    if subtitle.lower().startswith("records in") or title.lower().startswith("records in"):
        return issues
    if not subtitle and not title.lower().startswith("attributes"):
        issues.append(KpiValidationIssue("missing_subtitle", f"card '{title}' has no subtitle"))

    return issues


def align_kpi_card_title(
    card: Dict[str, Any],
    *,
    metric_col: Optional[str],
    aggregation: str = "sum",
) -> Dict[str, Any]:
    """Fix titles that use entity wording for currency metrics."""
    out = dict(card)
    title = str(out.get("title") or "").strip()
    if not metric_col:
        return out
    if title_implies_entity_without_count(title) and is_currency_metric_column(metric_col):
        if aggregation in ("mean", "average", "avg"):
            out["title"] = currency_aggregate_title(metric_col, "mean")
        else:
            out["title"] = currency_aggregate_title(metric_col, "sum")
        meta = dict(out.get("kpi_meta") or {})
        meta["metric_source"] = metric_col
        meta["aggregation"] = aggregation
        meta["metric_type"] = "currency"
        meta["title_aligned"] = True
        out["kpi_meta"] = meta
    return out


def enrich_kpi_card_meta(
    card: Dict[str, Any],
    *,
    metric_col: Optional[str] = None,
    aggregation: Optional[str] = None,
) -> Dict[str, Any]:
    out = dict(card)
    meta = dict(out.get("kpi_meta") or {})
    sub_meta = out.get("subtitle_meta") or {}
    mc = metric_col or meta.get("metric_source") or sub_meta.get("source_metric")
    agg = aggregation or meta.get("aggregation") or _infer_agg_from_title(str(out.get("title") or ""))
    meta.setdefault("metric_source", mc)
    meta.setdefault("aggregation", agg)
    meta.setdefault("metric_type", infer_metric_type(str(out.get("title") or ""), mc, agg))
    if sub_meta.get("source_dimension"):
        meta.setdefault("source_dimension", sub_meta.get("source_dimension"))
    out["kpi_meta"] = meta
    return out


def _infer_agg_from_title(title: str) -> str:
    tl = title.lower()
    if tl.startswith("average ") or "avg " in tl:
        return "mean"
    if "count" in tl or "headcount" in tl:
        return "count"
    if tl.startswith("top "):
        return "max"
    return "sum"


def validate_kpi_cards(cards: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[KpiCardAudit]]:
    audits: List[KpiCardAudit] = []
    enriched: List[Dict[str, Any]] = []
    for card in cards:
        c = enrich_kpi_card_meta(card)
        meta = c.get("kpi_meta") or {}
        sub_meta = c.get("subtitle_meta") or {}
        issues = validate_kpi_card(
            c,
            metric_col=meta.get("metric_source"),
            aggregation=meta.get("aggregation"),
        )
        audit = KpiCardAudit(
            title=str(c.get("title") or ""),
            value=str(c.get("value") or ""),
            metric_source=meta.get("metric_source"),
            aggregation=meta.get("aggregation"),
            metric_type=meta.get("metric_type"),
            subtitle=str(c.get("subtitle") or "") or None,
            source_dimension=sub_meta.get("source_dimension"),
            issues=[i.message for i in issues],
        )
        audits.append(audit)
        enriched.append(c)
    return enriched, audits


def audit_row_to_dict(row: KpiCardAudit) -> Dict[str, Any]:
    return {
        "title": row.title,
        "value": row.value,
        "metric_source": row.metric_source,
        "aggregation": row.aggregation,
        "metric_type": row.metric_type,
        "subtitle": row.subtitle,
        "source_dimension": row.source_dimension,
        "issues": row.issues,
    }
