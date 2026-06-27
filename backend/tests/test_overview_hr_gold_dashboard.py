"""Overview auto-dashboard correctness for hr_gold_5000.csv."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
GOLDEN_HR = REPO_ROOT / "test-fixtures" / "golden-datasets" / "hr_gold_5000.csv"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.executive_kpi_cards import infer_executive_domain  # noqa: E402


def _load_hr_gold() -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(GOLDEN_HR)
    for col in df.columns:
        if "date" in str(col).lower():
            df[col] = pd.to_datetime(df[col], errors="coerce")
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, _ = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val
    return df, profile


def _chart_titles(dash: dict) -> list[str]:
    return [str(c.get("title") or "") for c in dash.get("charts") or []]


class TestHrGoldOverviewCharts(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_demotes_monthly_age_trend_when_workforce_charts_exist(self) -> None:
        _load_hr_gold()
        dash = main.build_auto_dashboard()
        titles = _chart_titles(dash)
        joined = " | ".join(titles).lower()
        self.assertNotIn("monthly age trend", joined, msg=titles)

    def test_demotes_records_by_age_band_when_alternatives_exist(self) -> None:
        _load_hr_gold()
        dash = main.build_auto_dashboard()
        titles = _chart_titles(dash)
        joined = " | ".join(titles).lower()
        self.assertNotIn("records by age band", joined, msg=titles)

    def test_includes_salary_by_job_level_or_department(self) -> None:
        _load_hr_gold()
        dash = main.build_auto_dashboard()
        titles = [t.lower() for t in _chart_titles(dash)]
        self.assertTrue(
            any(
                "salary" in t and ("job level" in t or "department" in t)
                for t in titles
            ),
            msg=titles,
        )

    def test_includes_performance_rating_by_department(self) -> None:
        _load_hr_gold()
        dash = main.build_auto_dashboard()
        titles = [t.lower() for t in _chart_titles(dash)]
        self.assertTrue(
            any("performance rating" in t and "department" in t for t in titles),
            msg=titles,
        )

    def test_mapping_prefers_salary_and_department(self) -> None:
        df, _ = _load_hr_gold()
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "hr")
        self.assertEqual(main.column_mapping.get("sales"), "salary")
        self.assertEqual(main.column_mapping.get("product"), "department")


if __name__ == "__main__":
    unittest.main()
