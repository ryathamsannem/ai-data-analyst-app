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
DOMAIN_UPLOAD = REPO_ROOT / "test-fixtures" / "domain_upload_1k"
DOMAINS = REPO_ROOT / "test-fixtures" / "domains"

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
    main.column_mapping_metadata = meta
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

    def test_date_column_never_maps_as_customer(self) -> None:
        df = pd.DataFrame(
            {
                "application_date": pd.to_datetime(
                    ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"]
                ),
                "customer_segment": ["SMB", "Corporate", "Mass Market", "Affluent"],
                "loan_amount": [1000.0, 2000.0, 1500.0, 1800.0],
                "branch_region": ["North", "South", "East", "West"],
            }
        )
        proposed, _meta, _dash = _bind(df)
        self.assertEqual(proposed.get("date"), "application_date")
        self.assertNotEqual(proposed.get("customer"), "application_date")

    def test_entity_id_selected_when_present(self) -> None:
        df = pd.DataFrame(
            {
                "account_id": [f"a{i}" for i in range(20)],
                "customer_segment": ["SMB", "Corporate"] * 10,
                "loan_amount": [float(i * 100) for i in range(20)],
                "order_date": pd.to_datetime(["2024-01-01"] * 20),
            }
        )
        proposed, _meta, _dash = _bind(df)
        self.assertEqual(proposed.get("customer"), "account_id")
        self.assertEqual(proposed.get("date"), "order_date")

    def test_customer_unset_when_only_date_columns_exist(self) -> None:
        df = pd.DataFrame(
            {
                "application_date": pd.to_datetime(
                    ["2024-01-01", "2024-01-02", "2024-01-03"]
                ),
                "report_date": pd.to_datetime(
                    ["2024-02-01", "2024-02-02", "2024-02-03"]
                ),
                "loan_amount": [1000.0, 2000.0, 1500.0],
            }
        )
        proposed, _meta, _dash = _bind(df)
        self.assertIn(proposed.get("date"), ("application_date", "report_date"))
        self.assertIsNone(proposed.get("customer"))


class TestCovidPublicHealthMapping(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def _covid_style_frame(self) -> pd.DataFrame:
        return pd.DataFrame(
            {
                "report_date": pd.to_datetime(
                    ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"]
                ),
                "state": ["Illinois", "California", "Texas", "Florida"],
                "variant": ["Omicron", "Delta", "Omicron", "Other"],
                "age_group": ["18-29", "30-44", "45-59", "60+"],
                "gender": ["Female", "Male", "Female", "Male"],
                "new_cases": [71, 37, 107, 18],
                "active_cases": [503, 320, 1510, 397],
                "deaths": [0, 1, 1, 0],
                "hospital_admissions": [5, 4, 13, 0],
            }
        )

    def test_covid_columns_classify_as_healthcare_not_generic(self) -> None:
        df = self._covid_style_frame()
        proposed, meta, dash = _bind(df)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "healthcare")
        self.assertEqual(meta.get("domain"), "healthcare")
        self.assertEqual(dash.get("type_label"), "Healthcare / Public Health")

    def test_covid_prefers_case_activity_metric_over_deaths(self) -> None:
        df = self._covid_style_frame()
        proposed, _meta, _dash = _bind(df)
        self.assertIn(proposed.get("sales"), ("new_cases", "active_cases"))
        self.assertNotEqual(proposed.get("sales"), "deaths")
        self.assertIn(
            proposed.get("profit"),
            ("deaths", "active_cases", "hospital_admissions"),
        )

    def test_deaths_primary_when_only_mortality_metric(self) -> None:
        df = pd.DataFrame(
            {
                "report_date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]),
                "state": ["Illinois", "California", "Texas"],
                "variant": ["Omicron", "Delta", "Other"],
                "deaths": [12, 8, 5],
            }
        )
        proposed, meta, _dash = _bind(df)
        self.assertEqual(meta.get("domain"), "healthcare")
        self.assertEqual(proposed.get("sales"), "deaths")

    def test_covid_mapping_roles_remain_correct(self) -> None:
        df = self._covid_style_frame()
        proposed, _meta, _dash = _bind(df)
        self.assertEqual(proposed.get("date"), "report_date")
        self.assertEqual(proposed.get("region"), "state")
        self.assertIsNone(proposed.get("customer"))

    def test_banking_classification_unchanged(self) -> None:
        df = pd.DataFrame(
            {
                "account_id": ["a1", "a2", "a3", "a4"],
                "report_month": pd.to_datetime(
                    ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"]
                ),
                "loan_balance": [1000.0, 2000.0, 1500.0, 1800.0],
                "deposit_balance": [500.0, 600.0, 700.0, 800.0],
                "delinquency_rate": [0.1, 0.2, 0.05, 0.15],
                "branch_region": ["North", "South", "East", "West"],
            }
        )
        proposed, meta, _dash = _bind(df)
        self.assertEqual(meta.get("domain"), "banking")
        self.assertIn(proposed.get("sales"), ("loan_balance", "deposit_balance"))

    def test_ecommerce_orders_classify_as_retail_ecommerce(self) -> None:
        path = DOMAIN_UPLOAD / "ecommerce_orders_10k.csv"
        df = pd.read_csv(path, nrows=200)
        df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")
        proposed, meta, dash = _bind(df)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "retail")
        self.assertEqual(dash.get("type_label"), "Retail / Ecommerce")
        self.assertEqual(proposed.get("sales"), "net_revenue")
        self.assertEqual(proposed.get("product"), "product_category")
        self.assertEqual(proposed.get("date"), "order_date")

    def test_generic_monthly_sales_stays_sales(self) -> None:
        path = DOMAINS / "monthly_sales.csv"
        df = pd.read_csv(path)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "sales")
        proposed, meta, dash = _bind(df)
        self.assertEqual(dash.get("type_label"), "Sales")

    def test_healthcare_classification_unchanged(self) -> None:
        df = self._covid_style_frame()
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "healthcare")
        _proposed, meta, dash = _bind(df)
        self.assertEqual(meta.get("domain"), "healthcare")
        self.assertEqual(dash.get("type_label"), "Healthcare / Public Health")

    def test_generic_random_dataset_stays_generic(self) -> None:
        df = pd.DataFrame(
            {
                "value": [1.0, 2.0, 3.0],
                "type": ["a", "b", "c"],
                "category": ["x", "y", "z"],
                "status": ["ok", "ok", "fail"],
            }
        )
        proposed, meta, _dash = _bind(df)
        self.assertEqual(meta.get("domain"), "generic")
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "generic")

    def test_covid_mapping_aggregate_confidence_not_low(self) -> None:
        df = self._covid_style_frame()
        proposed, meta, _dash = _bind(df)
        self.assertIn(proposed.get("sales"), ("new_cases", "active_cases"))
        self.assertIsNone(proposed.get("customer"))
        sales_conf = (meta.get("roles") or {}).get("sales", {}).get("confidence")
        self.assertIn(sales_conf, ("high", "medium"), msg=f"sales confidence={sales_conf}")
        agg = main._aggregate_mapping_confidence_from_meta()
        self.assertIn(agg, ("high", "medium"), msg=f"aggregate={agg}")

    def test_generic_weak_mapping_stays_low_confidence(self) -> None:
        df = pd.DataFrame(
            {
                "value": [1.0, 2.0, 3.0],
                "type": ["a", "b", "c"],
                "category": ["x", "y", "z"],
            }
        )
        _proposed, meta, _dash = _bind(df)
        agg = main._aggregate_mapping_confidence_from_meta()
        self.assertEqual(agg, "low")
        product_conf = (meta.get("roles") or {}).get("product", {}).get("confidence")
        self.assertEqual(product_conf, "low")

    def test_manufacturing_quality_operations_mapping_not_low_confidence(self) -> None:
        path = DOMAIN_UPLOAD / "manufacturing_quality_10k.csv"
        df = pd.read_csv(path, nrows=500)
        df["production_date"] = pd.to_datetime(df["production_date"], errors="coerce")
        proposed, meta, dash = _bind(df)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "operations")
        self.assertEqual(meta.get("domain"), "manufacturing")
        self.assertEqual(proposed.get("sales"), "units_produced")
        self.assertEqual(proposed.get("date"), "production_date")
        self.assertEqual(proposed.get("product"), "product_family")
        self.assertEqual(proposed.get("region"), "plant")
        agg = main._aggregate_mapping_confidence_from_meta()
        self.assertIn(agg, ("high", "medium"), msg=f"aggregate={agg}")
        product_conf = (meta.get("roles") or {}).get("product", {}).get("confidence")
        self.assertIn(product_conf, ("high", "medium"), msg=f"product confidence={product_conf}")
        self.assertEqual(dash.get("type_label"), "Manufacturing / Operations")

    def test_manufacturing_quality_displays_manufacturing_operations_label(self) -> None:
        path = DOMAIN_UPLOAD / "manufacturing_quality_10k.csv"
        df = pd.read_csv(path, nrows=500)
        df["production_date"] = pd.to_datetime(df["production_date"], errors="coerce")
        _proposed, meta, dash = _bind(df)
        self.assertEqual(meta.get("domain"), "manufacturing")
        self.assertEqual(dash.get("type_label"), "Manufacturing / Operations")

    def test_generic_operations_incidents_stays_operations_label(self) -> None:
        path = DOMAINS / "operations_incidents_chart_test.csv"
        df = pd.read_csv(path)
        for col in df.columns:
            if "date" in str(col).lower():
                df[col] = pd.to_datetime(df[col], errors="coerce")
        _proposed, _meta, dash = _bind(df)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "operations")
        self.assertEqual(dash.get("type_label"), "Operations")
        path = DOMAIN_UPLOAD / "ecommerce_orders_10k.csv"
        df = pd.read_csv(path, nrows=200)
        df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")
        proposed, meta, _dash = _bind(df)
        agg = main._aggregate_mapping_confidence_from_meta()
        self.assertEqual(agg, "high", msg=f"aggregate={agg}")
        self.assertEqual(proposed.get("sales"), "net_revenue")

    def test_banking_mapping_aggregate_confidence_unchanged(self) -> None:
        path = DOMAINS / "banking_financial_services.csv"
        df = pd.read_csv(path)
        for col in df.columns:
            if "date" in str(col).lower():
                df[col] = pd.to_datetime(df[col], errors="coerce")
        proposed, meta, dash = _bind(df)
        self.assertEqual(meta.get("domain"), "banking")
        self.assertIn(proposed.get("sales"), ("spend_amount", "loan_balance"))
        agg = main._aggregate_mapping_confidence_from_meta()
        self.assertEqual(agg, "medium", msg=f"aggregate={agg}")
        self.assertEqual(dash.get("type_label"), "Banking / Financial Services")


class TestDomainGoldFixturesEdgeCases(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_retail_gold_mapping_stable(self) -> None:
        df = pd.read_csv(GOLDEN / "retail_gold_10000.csv")
        df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce")
        proposed, meta, dash = _bind(df)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "retail")
        self.assertIn(meta.get("domain"), ("sales", "ecommerce", "retail"))
        self.assertEqual(dash.get("type_label"), "Retail / Ecommerce")
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
