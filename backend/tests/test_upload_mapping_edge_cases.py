"""Upload and semantic mapping edge-case validation (P1 production readiness)."""

from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
GOLDEN = REPO_ROOT / "test-fixtures" / "golden-datasets"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.executive_kpi_cards import infer_executive_domain  # noqa: E402
from services.file_parsers import load_dataframe_from_upload  # noqa: E402


def _bind(df: pd.DataFrame) -> tuple[dict, dict, dict | None]:
    df = main.clean_dataframe(df)
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, meta = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val
    dash = main.build_auto_dashboard() if not df.empty else None
    return proposed, meta, dash


class TestUploadParseEdgeCases(unittest.TestCase):
    def test_header_only_csv_is_empty_after_clean(self) -> None:
        df, _ = load_dataframe_from_upload(b"region,sales_amount\n", "header.csv")
        cleaned = main.clean_dataframe(df)
        self.assertTrue(cleaned.empty)

    def test_duplicate_column_names_are_disambiguated(self) -> None:
        df = pd.read_csv(io.BytesIO(b"a,b,a\n1,2,3\n4,5,6"))
        self.assertIn("a.1", df.columns.tolist())
        proposed, _meta, dash = _bind(df)
        self.assertIsNotNone(dash)
        self.assertIn("a", proposed.get("sales") or proposed.get("profit") or "a")

    def test_all_null_columns_dropped(self) -> None:
        df = pd.DataFrame({"metric": [1, 2, 3], "empty": [None, None, None]})
        cleaned = main.clean_dataframe(df)
        self.assertNotIn("empty", cleaned.columns.tolist())
        proposed, _meta, dash = _bind(cleaned)
        self.assertEqual(proposed.get("sales"), "metric")
        self.assertGreaterEqual(len(dash.get("charts") or []), 0)


class TestSemanticMappingEdgeCases(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_no_date_column_maps_date_as_none(self) -> None:
        df = pd.DataFrame(
            {
                "region": ["North", "South"],
                "sales_amount": [10.0, 20.0],
                "product_category": ["A", "B"],
            }
        )
        proposed, meta, dash = _bind(df)
        self.assertIsNone(proposed.get("date"))
        self.assertEqual(proposed.get("sales"), "sales_amount")
        self.assertGreaterEqual(len(dash.get("charts") or []), 1)

    def test_all_categorical_does_not_crash_dashboard(self) -> None:
        df = pd.DataFrame(
            {
                "region": ["North", "South", "East"],
                "product": ["A", "B", "C"],
                "status": ["open", "closed", "open"],
            }
        )
        proposed, meta, dash = _bind(df)
        self.assertIsNone(proposed.get("sales"))
        self.assertIsInstance(dash.get("charts"), list)

    def test_all_numeric_picks_amount_like_metric(self) -> None:
        df = pd.DataFrame(
            {
                "col1": [1.0, 2.0, 3.0],
                "col2": [4.0, 5.0, 6.0],
                "amount": [10.0, 20.0, 30.0],
            }
        )
        proposed, _meta, dash = _bind(df)
        self.assertEqual(proposed.get("sales"), "amount")
        self.assertIsInstance(dash.get("charts"), list)

    def test_single_column_maps_without_crash(self) -> None:
        df = pd.DataFrame({"only_metric": [1.0, 2.0, 3.0]})
        proposed, _meta, dash = _bind(df)
        self.assertEqual(proposed.get("sales"), "only_metric")
        self.assertIsInstance(dash.get("charts"), list)

    def test_multiple_date_columns_picks_one(self) -> None:
        df = pd.DataFrame(
            {
                "report_date": pd.to_datetime(["2024-01-01", "2024-02-01"]),
                "created_at": pd.to_datetime(["2024-01-02", "2024-02-02"]),
                "sales_amount": [10.0, 20.0],
                "region": ["North", "South"],
            }
        )
        proposed, _meta, dash = _bind(df)
        self.assertIn(proposed.get("date"), ("report_date", "created_at"))
        self.assertGreaterEqual(len(dash.get("charts") or []), 1)

    def test_generic_column_names_degrade_to_generic_domain(self) -> None:
        df = pd.DataFrame(
            {
                "value": [1.0, 2.0],
                "type": ["a", "b"],
                "category": ["x", "y"],
                "status": ["ok", "ok"],
            }
        )
        proposed, meta, dash = _bind(df)
        self.assertEqual(meta.get("domain"), "generic")
        self.assertIsInstance(dash.get("charts"), list)

    def test_id_like_dimensions_not_in_chart_titles(self) -> None:
        import numpy as np

        n = 40
        df = pd.DataFrame(
            {
                "transaction_id": [f"t{i}" for i in range(n)],
                "customer_id": [f"c{i}" for i in range(n)],
                "sales_amount": np.random.default_rng(0).integers(10, 100, n),
                "region": ["North", "South", "East", "West"] * (n // 4),
            }
        )
        _proposed, _meta, dash = _bind(df)
        titles = " | ".join(str(c.get("title") or "") for c in dash.get("charts") or [])
        lowered = titles.lower()
        self.assertNotIn("transaction id", lowered)
        self.assertNotIn("customer id", lowered)


class TestDomainGoldFixturesEdgeCases(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_retail_gold_mapping_stable(self) -> None:
        df = pd.read_csv(GOLDEN / "retail_gold_10000.csv")
        df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")
        proposed, meta, dash = _bind(df)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "sales")
        self.assertIn(meta.get("domain"), ("sales", "ecommerce"))
        self.assertEqual(proposed.get("sales"), "sales_amount")
        self.assertEqual(proposed.get("date"), "order_date")
        self.assertGreaterEqual(len(dash.get("charts") or []), 3)

    def test_banking_gold_skips_lifecycle_and_scatter(self) -> None:
        df = pd.read_csv(GOLDEN / "banking_gold_10000.csv")
        df["month"] = pd.to_datetime(df["month"], errors="coerce")
        proposed, _meta, dash = _bind(df)
        self.assertNotEqual(proposed.get("sales"), "account_age_months")
        charts = dash.get("charts") or []
        scatter = [c for c in charts if str(c.get("chartType", "")).lower() == "scatter"]
        self.assertEqual(len(scatter), 0)
        joined = " | ".join(str(c.get("title") or "") for c in charts).lower()
        self.assertNotIn("account age months by product type", joined)

    def test_hr_gold_prefers_salary_and_department(self) -> None:
        df = pd.read_csv(GOLDEN / "hr_gold_5000.csv")
        for col in df.columns:
            if "date" in col.lower():
                df[col] = pd.to_datetime(df[col], errors="coerce")
        proposed, meta, dash = _bind(df)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "hr")
        self.assertEqual(proposed.get("sales"), "salary")
        self.assertEqual(proposed.get("product"), "department")
        titles = [str(c.get("title") or "").lower() for c in dash.get("charts") or []]
        self.assertTrue(
            any("salary" in t or "department" in t or "performance" in t for t in titles),
            msg=titles,
        )


if __name__ == "__main__":
    unittest.main()
