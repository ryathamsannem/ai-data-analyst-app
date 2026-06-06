"""Derived metric candidate detection (Phase 1 — no series computation)."""

from __future__ import annotations

from typing import Any, Dict, Optional

import pandas as pd

from intent_engine import legacy

_DERIVED_ROI_KEY = "__derived_roi__"
_DERIVED_MARGIN_KEY = "__derived_profit_margin__"


def resolve_derived_metric_candidate(
    question: str,
    df: Optional[pd.DataFrame],
    profile: Optional[Dict[str, Any]],
    intent_debug: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Returns candidate metadata when the question implies a derived metric.
    Does not alter chart data.
    """
    if df is None or df.empty or profile is None:
        return None

    spec = legacy.resolve_question_metric_spec(question, df, profile)
    if spec:
        if spec.get("derived_profit_margin"):
            return {
                "id": "profit_margin",
                "computable": True,
                "operands": {
                    "profit": spec.get("profit_col"),
                    "revenue": spec.get("revenue_col"),
                },
                "formulaDescription": "SUM(profit) / SUM(revenue) × 100",
            }
        if spec.get("derived_roi"):
            return {
                "id": "roi",
                "computable": True,
                "operands": {
                    "revenue": spec.get("revenue_col"),
                    "spend": spec.get("spend_col"),
                },
                "formulaDescription": "(SUM(revenue) − SUM(spend)) / SUM(spend)",
            }
        if spec.get("value_col") and not spec.get("derived_roi"):
            vc = str(spec.get("value_col") or "")
            if vc and vc not in (_DERIVED_ROI_KEY, _DERIVED_MARGIN_KEY):
                if legacy.question_requests_roi(question):
                    return {
                        "id": "roi",
                        "computable": True,
                        "operands": {"column": vc},
                        "formulaDescription": "Existing ROI column",
                    }

    if intent_debug:
        if intent_debug.get("derived_profit_margin"):
            return {
                "id": "profit_margin",
                "computable": True,
                "operands": {
                    "profit": intent_debug.get("profit_col"),
                    "revenue": intent_debug.get("revenue_col"),
                },
                "formulaDescription": "SUM(profit) / SUM(revenue) × 100",
            }
        if intent_debug.get("derived_roi"):
            return {
                "id": "roi",
                "computable": True,
                "operands": {
                    "revenue": intent_debug.get("revenue_col"),
                    "spend": intent_debug.get("spend_col"),
                },
                "formulaDescription": "(SUM(revenue) − SUM(spend)) / SUM(spend)",
            }

    if legacy.question_requests_profit_margin(question):
        profit_c, rev_c = legacy.find_profit_and_revenue_columns(
            df.columns.tolist(),
            [c for c in df.columns if profile.get("column_types", {}).get(c) == "number"],
        )
        if profit_c and not rev_c:
            return {
                "id": "profit_margin",
                "computable": False,
                "operands": {"profit": profit_c},
                "formulaDescription": "SUM(profit) / SUM(revenue) × 100",
                "unavailableReason": "missing_revenue_column",
            }
        if profit_c and rev_c:
            return {
                "id": "profit_margin",
                "computable": True,
                "operands": {"profit": profit_c, "revenue": rev_c},
                "formulaDescription": "SUM(profit) / SUM(revenue) × 100",
            }

    if legacy.question_requests_roi(question):
        spec = legacy.resolve_question_metric_spec(question, df, profile)
        if spec and not spec.get("derived_roi") and spec.get("value_col"):
            return {
                "id": "roi",
                "computable": True,
                "operands": {"column": spec.get("value_col")},
                "formulaDescription": "ROI column",
            }

    return None
