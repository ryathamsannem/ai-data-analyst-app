"""Overview Pass 5A.3 — cross-domain mapping / domain-detection QA.

Validates that semantic column mapping and executive-domain detection resolve
the right dataset type label, primary/secondary metric, date column and main
dimension for each gold fixture, and that no conflicting cross-domain labels
leak in (e.g. banking should never read as Sales / commercial, HR/Retail should
never read as Banking).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
GOLDEN = REPO_ROOT / "test-fixtures" / "golden-datasets"
DOMAINS = REPO_ROOT / "test-fixtures" / "domains"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from services.executive_kpi_cards import (  # noqa: E402
    executive_domain_to_kpi_domain,
    infer_executive_domain,
)

RETAIL = GOLDEN / "retail_gold_10000.csv"
BANKING_GOLD = GOLDEN / "banking_gold_10000.csv"
BANKING_FS = DOMAINS / "banking_financial_services.csv"
HR = GOLDEN / "hr_gold_5000.csv"


def _load(path: Path) -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(path)
    for col in df.columns:
        low = col.lower()
        if low.endswith("_date") or low in ("date", "month", "order_date"):
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce")
            except Exception:
                pass
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, _ = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val
    return df, profile


class CrossDomainMappingQA(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    # --- Retail ---------------------------------------------------------
    def test_retail_mapping_and_label(self) -> None:
        df, _ = _load(RETAIL)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "retail")
        dash = main.build_auto_dashboard()
        self.assertEqual(dash.get("type_label"), "Retail / Ecommerce")
        m = main.column_mapping
        self.assertEqual(m["sales"], "sales_amount")
        self.assertEqual(m["profit"], "profit")
        self.assertEqual(m["date"], "order_date")
        self.assertEqual(m["product"], "product_category")
        self.assertEqual(m["region"], "region")
        # No banking labels anywhere in chart titles.
        titles = " | ".join(str(c.get("title") or "") for c in dash.get("charts") or [])
        self.assertNotRegex(titles.lower(), r"loan|deposit|delinquency|utilization")

    # --- Banking (gold) -------------------------------------------------
    def test_banking_gold_mapping_and_label(self) -> None:
        df, _ = _load(BANKING_GOLD)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "banking")
        dash = main.build_auto_dashboard()
        self.assertEqual(dash.get("type_label"), "Banking / Financial Services")
        m = main.column_mapping
        # Primary metric prefers spend_amount/loan_balance — never lifecycle age.
        self.assertIn(m["sales"], ("spend_amount", "loan_balance", "deposit_balance"))
        self.assertNotEqual(m["sales"], "account_age_months")
        # Secondary metric is a banking metric, not generic lifecycle age.
        self.assertNotEqual(m["profit"], "account_age_months")
        self.assertIn(
            m["profit"],
            (
                "utilization_pct",
                "credit_utilization",
                "delinquency_rate",
                "delinquency_flag",
                "deposit_balance",
                "loan_balance",
                "spend_amount",
            ),
        )
        self.assertIn(m["date"], ("month", "report_date"))

    # --- Banking (financial services snapshot) --------------------------
    def test_banking_fs_mapping_and_label(self) -> None:
        df, _ = _load(BANKING_FS)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "banking")
        dash = main.build_auto_dashboard()
        self.assertEqual(dash.get("type_label"), "Banking / Financial Services")
        m = main.column_mapping
        self.assertIn(m["sales"], ("spend_amount", "loan_balance"))
        self.assertNotEqual(m["profit"], "account_age_months")
        self.assertEqual(m["date"], "report_date")
        self.assertEqual(m["customer"], "customer_segment")
        # Never a sales/commercial label after upload.
        self.assertNotIn("sales", str(dash.get("type_label")).lower())

    # --- HR -------------------------------------------------------------
    def test_hr_mapping_and_label(self) -> None:
        df, _ = _load(HR)
        self.assertEqual(infer_executive_domain(df.columns.tolist()), "hr")
        self.assertEqual(
            executive_domain_to_kpi_domain(infer_executive_domain(df.columns.tolist())),
            "hr",
        )
        dash = main.build_auto_dashboard()
        self.assertEqual(dash.get("type_label"), "HR / Employee")
        m = main.column_mapping
        # Primary metric prefers salary/comp — not training hours or age.
        self.assertEqual(m["sales"], "salary")
        # Main dimension is workforce structure, not a demographic age band.
        self.assertEqual(m["product"], "department")
        self.assertNotEqual(m["product"], "age_band")
        # Date prefers an entry/period date, not an age band.
        self.assertEqual(m["date"], "hire_date")
        # No banking / sales labels.
        label = str(dash.get("type_label")).lower()
        self.assertNotIn("banking", label)
        self.assertNotIn("sales", label)


if __name__ == "__main__":
    unittest.main()
