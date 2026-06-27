"""Overview auto-dashboard correctness for banking_gold_10000.csv."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
GOLDEN_BANKING = REPO_ROOT / "test-fixtures" / "golden-datasets" / "banking_gold_10000.csv"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.auto_dashboard_opportunities import classify_columns  # noqa: E402


def _load_banking_gold() -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(GOLDEN_BANKING)
    df["month"] = pd.to_datetime(df["month"], errors="coerce")
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, _ = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val
    return df, profile


class TestBankingGoldColumnInventory(unittest.TestCase):
    def test_month_treated_as_date_for_trend_discovery(self) -> None:
        df, profile = _load_banking_gold()
        inv = classify_columns(
            df,
            profile,
            id_like_fn=main._id_like_column_name,
            numeric_series_fn=main.numeric_series,
        )
        date_lower = {c.lower() for c in inv.dates}
        self.assertIn("month", date_lower)


class TestBankingGoldOverviewCharts(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_no_default_scatter_when_business_charts_exist(self) -> None:
        _load_banking_gold()
        dash = main.build_auto_dashboard()
        charts = dash.get("charts") or []
        titles = [str(c.get("title") or "") for c in charts]
        scatter = [
            c for c in charts if str(c.get("chartType", "")).lower() == "scatter"
        ]
        non_scatter = [
            c for c in charts if str(c.get("chartType", "")).lower() != "scatter"
        ]
        self.assertGreaterEqual(len(non_scatter), 4, msg=titles)
        self.assertEqual(len(scatter), 0, msg=f"Unexpected scatter charts: {titles}")

    def test_no_account_age_by_product_type_in_top_charts(self) -> None:
        _load_banking_gold()
        dash = main.build_auto_dashboard()
        titles = [str(c.get("title") or "") for c in dash.get("charts") or []]
        joined = " | ".join(titles).lower()
        self.assertNotIn("account age months by product type", joined, msg=titles)
        self.assertFalse(
            any("account age" in t.lower() and "product type" in t.lower() for t in titles),
            msg=titles,
        )

    def test_at_least_five_useful_banking_charts(self) -> None:
        _load_banking_gold()
        dash = main.build_auto_dashboard()
        charts = dash.get("charts") or []
        titles = [str(c.get("title") or "") for c in charts]
        self.assertGreaterEqual(len(charts), 5, msg=titles)
        joined = " | ".join(titles).lower()
        useful_tokens = (
            "spend",
            "loan balance",
            "deposit balance",
            "utilization",
            "delinquency",
            "product type",
            "customer segment",
            "trend",
            "share",
        )
        hits = sum(1 for tok in useful_tokens if tok in joined)
        self.assertGreaterEqual(hits, 4, msg=f"Expected banking-relevant charts, got: {titles}")

    def test_finance_priority_metrics_skip_lifecycle_secondary(self) -> None:
        _load_banking_gold()
        primary, secondary, _ = main._dash_priority_metric_columns("finance")
        self.assertEqual(str(primary).lower(), "spend_amount")
        self.assertIn(str(secondary).lower(), ("loan_balance", "deposit_balance", "utilization_pct"))

    def test_explicit_relationship_question_still_allows_scatter(self) -> None:
        _load_banking_gold()
        _viz, visualization, analysis = main.compute_visualization_for_question(
            "Show relationship between spend amount and loan balance."
        )
        intent = (analysis or {}).get("intent") or {}
        self.assertEqual(intent.get("primaryGoal"), "relationship")
        self.assertIsNotNone(visualization)
        self.assertEqual(str(visualization.get("chartType")).lower(), "scatter")
        self.assertIn("scatterX", visualization)

    def test_no_risk_metrics_by_city_when_business_dimensions_exist(self) -> None:
        _load_banking_gold()
        dash = main.build_auto_dashboard()
        titles = [str(c.get("title") or "") for c in dash.get("charts") or []]
        joined = " | ".join(titles).lower()
        for bad in (
            "delinquency flag by city",
            "average utilization pct by city",
            "credit score by city",
        ):
            self.assertNotIn(bad, joined, msg=titles)

    def test_includes_risk_metric_on_segment_or_product_type(self) -> None:
        _load_banking_gold()
        dash = main.build_auto_dashboard()
        titles = [str(c.get("title") or "").lower() for c in dash.get("charts") or []]
        risk_on_business = any(
            ("delinquency" in t or "utilization" in t or "credit score" in t)
            and ("customer segment" in t or "product type" in t)
            for t in titles
        )
        self.assertTrue(risk_on_business, msg=titles)

    def test_explicit_city_question_still_works(self) -> None:
        _load_banking_gold()
        _exact, visualization, analysis = main.compute_visualization_for_question(
            "What is average spend amount by city?"
        )
        self.assertIsNotNone(visualization)
        self.assertNotEqual(str(visualization.get("chartType")).lower(), "scatter")
        title = str(visualization.get("title") or "").lower()
        labels = visualization.get("labels") or []
        self.assertTrue(
            "city" in title or any("city" in str(l).lower() for l in labels[:3]),
            msg=f"expected city breakdown, got title={title!r}",
        )


if __name__ == "__main__":
    unittest.main()
