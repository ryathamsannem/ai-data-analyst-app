"""Overview Pass 5A.2 — banking_financial_services.csv regression."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
FIXTURE = REPO_ROOT / "test-fixtures" / "domains" / "banking_financial_services.csv"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.executive_kpi_cards import (  # noqa: E402
    executive_domain_to_kpi_domain,
    infer_executive_domain,
)


def _load_banking_financial_services() -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(FIXTURE)
    df["report_date"] = pd.to_datetime(df["report_date"], errors="coerce")
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, _ = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val
    return df, profile


class TestBankingFinancialServicesDomain(unittest.TestCase):
    def test_executive_domain_is_banking(self) -> None:
        df, _ = _load_banking_financial_services()
        exec_dom = infer_executive_domain(df.columns.tolist())
        self.assertEqual(exec_dom, "banking")
        self.assertEqual(executive_domain_to_kpi_domain(exec_dom), "banking")

    def test_auto_dashboard_type_label(self) -> None:
        _load_banking_financial_services()
        dash = main.build_auto_dashboard()
        self.assertEqual(dash.get("type_label"), "Banking / Financial Services")


class TestBankingFinancialServicesTimeGrain(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_monthly_snapshot_dates_use_monthly_bucket(self) -> None:
        df, _ = _load_banking_financial_services()
        self.assertTrue(main._detect_monthly_snapshot_cadence(df["report_date"]))
        _series, meta = main._adaptive_time_series_grouped(
            df, "report_date", "spend_amount", agg_key="sum"
        )
        self.assertEqual(meta.get("timeBucket"), "M")

    def test_overview_trend_titles_are_monthly_not_weekly(self) -> None:
        _load_banking_financial_services()
        dash = main.build_auto_dashboard()
        titles = [str(c.get("title") or "") for c in dash.get("charts") or []]
        trend_titles = [
            t for t in titles if "trend" in t.lower()
        ]
        self.assertTrue(trend_titles, msg=f"Expected trend charts, got: {titles}")
        joined = " | ".join(trend_titles).lower()
        self.assertNotIn("weekly", joined, msg=titles)
        self.assertIn("monthly", joined, msg=titles)


class TestBankingFinancialServicesOverviewCharts(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_no_default_scatter(self) -> None:
        _load_banking_financial_services()
        dash = main.build_auto_dashboard()
        charts = dash.get("charts") or []
        scatter = [
            c for c in charts if str(c.get("chartType", "")).lower() == "scatter"
        ]
        self.assertEqual(len(scatter), 0, msg=[c.get("title") for c in charts])

    def test_explicit_relationship_question_still_allows_scatter(self) -> None:
        _load_banking_financial_services()
        _viz, visualization, analysis = main.compute_visualization_for_question(
            "Show relationship between spend amount and loan balance."
        )
        intent = (analysis or {}).get("intent") or {}
        self.assertEqual(intent.get("primaryGoal"), "relationship")
        self.assertIsNotNone(visualization)
        self.assertEqual(str(visualization.get("chartType")).lower(), "scatter")


if __name__ == "__main__":
    unittest.main()
