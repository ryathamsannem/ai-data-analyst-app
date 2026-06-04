"""Lazy access to existing main.py intent helpers (avoids import cycles at load time)."""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd


def _main():
    import main as legacy_main

    return legacy_main


def describe_aggregate_intent(question: str, df: "pd.DataFrame", profile: dict) -> Any:
    return _main()._describe_aggregate_intent(question, df, profile)


def resolve_question_metric_spec(question: str, df: "pd.DataFrame", profile: dict) -> Any:
    return _main()._resolve_question_metric_spec(question, df, profile)


def apply_metric_spec_to_intent(intent: dict, spec: dict) -> dict:
    return _main()._apply_metric_spec_to_intent(intent, spec)


def detect_intent_tags(question: str) -> list:
    return _main()._detect_intent_tags(question)


def chart_selection_question_bucket(ql: str) -> str:
    return _main()._chart_selection_question_bucket(ql)


def question_requests_trend_intent(q: str) -> bool:
    return _main()._question_requests_trend_intent(q)


def question_requests_growth_intent(q: str) -> bool:
    return _main()._question_requests_growth_intent(q)


def question_requests_profit_margin(q: str) -> bool:
    return _main()._question_requests_profit_margin(q)


def question_requests_roi(q: str) -> bool:
    return _main()._question_requests_roi(q)


def question_requests_two_metric_compare(q: str) -> bool:
    return _main()._question_requests_two_metric_compare(q)


def question_asks_outlier_analysis(q: str) -> bool:
    return _main()._question_asks_outlier_analysis(q)


def assess_unsupported_growth_analysis(**kwargs: Any) -> Any:
    return _main()._assess_unsupported_growth_analysis(**kwargs)


def resolve_two_metric_compare_spec(question: str, df: "pd.DataFrame", profile: dict) -> Any:
    return _main()._resolve_two_metric_compare_spec(question, df, profile)


def metric_display_from_intent(intent: dict | None) -> str:
    return _main()._metric_display_from_intent(intent)


def pretty_label_text(col: Any) -> str:
    return _main()._pretty_label_text(col)


def find_profit_and_revenue_columns(columns: list, numeric_cols: list) -> tuple:
    return _main()._find_profit_and_revenue_columns(columns, numeric_cols)


def pick_date_column_for_trend(df: "pd.DataFrame", profile: dict) -> Any:
    return _main()._pick_date_column_for_trend(df, profile)


def forced_time_bucket_from_question(q: str) -> Any:
    return _main()._forced_time_bucket_from_question(q)


def distinct_date_period_count(df: "pd.DataFrame", date_col: str) -> int:
    return _main()._distinct_date_period_count(df, date_col)
