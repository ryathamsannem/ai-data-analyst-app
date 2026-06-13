"""Regression tests for domain-aware executive KPI cards."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
FIX_DIR = REPO_ROOT / "test-fixtures" / "domains"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.executive_kpi_cards import infer_executive_domain  # noqa: E402

DOMAIN_FILES = [
    "banking_financial_services.csv",
    "customer_support.csv",
    "dashboard_showcase_dataset.csv",
    "employee_test.csv",
    "finance_fpa.csv",
    "geography.csv",
    "healthcare.csv",
    "hr.csv",
    "marketing.csv",
    "monthly_sales.csv",
    "operations.csv",
    "operations_incidents_chart_test.csv",
    "retail.csv",
    "retail_orders_chart_test.csv",
    "sales.csv",
    "screenshot-fixture.csv",
]

EXPECTED_EXEC_DOMAIN = {
    "banking_financial_services.csv": "banking",
    "customer_support.csv": "customer_support",
    "dashboard_showcase_dataset.csv": "sales",
    "employee_test.csv": "hr",
    "finance_fpa.csv": "finance_fpa",
    "geography.csv": "geography",
    "healthcare.csv": "healthcare",
    "hr.csv": "hr",
    "marketing.csv": "marketing",
    "monthly_sales.csv": "sales",
    "operations.csv": "operations",
    "operations_incidents_chart_test.csv": "operations",
    "retail.csv": "sales",
    "retail_orders_chart_test.csv": "sales",
    "sales.csv": "sales",
    "screenshot-fixture.csv": "sales",
}

HR_CARD_TITLES = frozenset(
    {"Total Employees", "Total Headcount", "Department Count", "Average salary", "Average bonus"}
)
SALES_CARD_PATTERNS = (
    "Total Revenue",
    "Average Revenue",
    "Average Revenue per Record",
    "Total Sales",
    "Total Order Value",
    "Total Profit",
)
FORBIDDEN_HR_ON_REVENUE = frozenset({"Total Employees", "Department Count", "Total Headcount"})


def _load(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    for col in df.columns:
        if "date" in str(col).lower():
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce")
            except Exception:
                pass
            break
    return df


def _bind(path: Path) -> None:
    df = _load(path)
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, _ = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val


class TestExecutiveDomainInference(unittest.TestCase):
    def test_fixture_domain_expectations(self) -> None:
        for name in DOMAIN_FILES:
            path = FIX_DIR / name
            self.assertTrue(path.is_file(), f"missing {name}")
            df = _load(path)
            inferred = infer_executive_domain(df.columns.tolist())
            expected = EXPECTED_EXEC_DOMAIN[name]
            self.assertEqual(inferred, expected, msg=f"{name} domain mismatch")


class TestExecutiveKpiCardsPerFixture(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def _cards_for(self, name: str) -> list[dict]:
        _bind(FIX_DIR / name)
        return main.build_auto_dashboard().get("cards") or []

    def test_no_na_kpi_values(self) -> None:
        for name in DOMAIN_FILES:
            cards = self._cards_for(name)
            self.assertGreaterEqual(len(cards), 3, msg=name)
            for card in cards:
                val = str(card.get("value", "")).strip()
                self.assertNotEqual(val, "N/A", msg=f"{name} {card.get('title')}")

    def test_showcase_uses_sales_kpis_not_hr(self) -> None:
        cards = self._cards_for("dashboard_showcase_dataset.csv")
        titles = {str(c.get("title")) for c in cards}
        self.assertIn("Total Revenue", titles)
        self.assertTrue(
            "Average Revenue per Record" in titles or "Average Revenue" in titles,
            msg=f"titles={titles}",
        )
        self.assertIn("Total Profit", titles)
        self.assertFalse(titles & FORBIDDEN_HR_ON_REVENUE)

    def test_hr_fixtures_use_workforce_kpis(self) -> None:
        for name in ("hr.csv", "employee_test.csv"):
            cards = self._cards_for(name)
            titles = {str(c.get("title")) for c in cards}
            self.assertTrue(titles & HR_CARD_TITLES, msg=f"{name} titles={titles}")
            self.assertNotIn("Total Revenue", titles)

    def test_revenue_fixtures_use_commercial_kpis(self) -> None:
        for name in ("sales.csv", "retail.csv", "retail_orders_chart_test.csv", "screenshot-fixture.csv"):
            cards = self._cards_for(name)
            titles = " ".join(str(c.get("title")) for c in cards)
            self.assertTrue(
                any(p.lower() in titles.lower() for p in SALES_CARD_PATTERNS),
                msg=f"{name} titles={titles}",
            )
            self.assertFalse({str(c.get("title")) for c in cards} & FORBIDDEN_HR_ON_REVENUE)

    def test_subtitles_are_executive_friendly(self) -> None:
        cards = self._cards_for("retail.csv")
        top_region = next(
            c for c in cards if str(c.get("title", "")).startswith("Top Region by")
        )
        sub = str(top_region.get("subtitle") or "")
        self.assertIn("contributes", sub.lower())
        self.assertIn("revenue", sub.lower())
        self.assertNotIn("category leading", sub.lower())

    def test_banking_kpis(self) -> None:
        cards = self._cards_for("banking_financial_services.csv")
        titles = {str(c.get("title")) for c in cards}
        self.assertIn("Total Loan Balance", titles)
        self.assertIn("Total Spend Amount", titles)

    def test_operations_kpis(self) -> None:
        cards = self._cards_for("operations.csv")
        titles = " ".join(str(c.get("title")) for c in cards).lower()
        self.assertIn("downtime", titles)
        self.assertIn("units produced", titles)

    def test_customer_support_kpis(self) -> None:
        cards = self._cards_for("customer_support.csv")
        titles = {str(c.get("title")) for c in cards}
        self.assertIn("Total Tickets Opened", titles)
        self.assertIn("Average Resolution Time", titles)

    def test_manual_mapping_respected_for_showcase(self) -> None:
        from main import ColumnMappingRequest, update_column_mapping

        _bind(FIX_DIR / "dashboard_showcase_dataset.csv")
        req = ColumnMappingRequest(
            product_column="product",
            sales_column="revenue",
            region_column="region",
            customer_column=None,
            profit_column="profit",
            date_column="date",
        )
        update_column_mapping(req)
        cards = main.build_auto_dashboard().get("cards") or []
        titles = {str(c.get("title")) for c in cards}
        self.assertIn("Total Revenue", titles)
        self.assertIn("Total Profit", titles)


if __name__ == "__main__":
    unittest.main()
