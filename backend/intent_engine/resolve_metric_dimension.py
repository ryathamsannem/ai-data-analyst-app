"""Resolve metric + dimension from question and cohort (facade)."""

from __future__ import annotations

from typing import Any, Dict, Optional

import pandas as pd

from intent_engine import legacy


def resolve_metric_and_dimension(
    question: str,
    df: pd.DataFrame,
    profile: Dict[str, Any],
    intent_debug: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Returns metric/dimension plane. Reuses pipeline intent_debug when provided,
    otherwise builds via legacy _describe_aggregate_intent.
    """
    intent = intent_debug
    if intent is None and df is not None and not df.empty:
        intent = legacy.describe_aggregate_intent(question, df, profile)
        spec = legacy.resolve_question_metric_spec(question, df, profile)
        if spec and intent:
            legacy.apply_metric_spec_to_intent(intent, spec)

    if not intent:
        return {
            "metric": {
                "kind": "column",
                "columnKey": None,
                "displayLabel": "—",
                "aggregation": {"key": None, "label": None},
            },
            "dimension": {
                "columnKey": None,
                "displayLabel": "—",
                "secondaryColumnKey": None,
            },
            "intentDebug": None,
        }

    value_col = intent.get("value_col")
    group_col = intent.get("group_col")
    derived_margin = bool(intent.get("derived_profit_margin"))
    derived_roi = bool(intent.get("derived_roi"))

    if derived_margin:
        metric_kind = "derived"
        derived_id = "profit_margin"
        operands = {
            "profit": intent.get("profit_col"),
            "revenue": intent.get("revenue_col"),
        }
        formula = "SUM(profit) / SUM(revenue) × 100"
    elif derived_roi:
        metric_kind = "derived"
        derived_id = "roi"
        operands = {
            "revenue": intent.get("revenue_col"),
            "spend": intent.get("spend_col"),
        }
        formula = "(SUM(revenue) − SUM(spend)) / SUM(spend)"
    elif str(intent.get("agg_key") or "") == "count":
        metric_kind = "count"
        derived_id = None
        operands = {}
        formula = ""
    else:
        metric_kind = "column"
        derived_id = None
        operands = {}
        formula = ""

    display = legacy.metric_display_from_intent(intent)
    if display == "—" and value_col:
        display = legacy.pretty_label_text(str(value_col))

    metric: Dict[str, Any] = {
        "kind": metric_kind,
        "columnKey": str(value_col) if value_col is not None else None,
        "displayLabel": display,
        "aggregation": {
            "key": intent.get("agg_key"),
            "label": intent.get("agg_label"),
        },
    }
    if derived_id:
        metric["derived"] = {
            "id": derived_id,
            "operands": {k: v for k, v in operands.items() if v},
            "formulaDescription": formula,
        }

    dimension = {
        "columnKey": str(group_col) if group_col is not None else None,
        "displayLabel": legacy.pretty_label_text(group_col) if group_col else "—",
        "secondaryColumnKey": intent.get("secondary_group_col"),
    }

    return {
        "metric": metric,
        "dimension": dimension,
        "intentDebug": intent,
    }
