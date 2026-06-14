"""Overview AI Summary — backend payload sanity per test-fixtures/domains."""

from __future__ import annotations

import json
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

REVENUE_DOMAINS = frozenset(
    {
        "sales",
        "retail",
        "dashboard_showcase_dataset",
        "screenshot-fixture",
        "marketing",
        "geography",
        "finance_fpa",
    }
)


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


def _bind_fixture(path: Path) -> None:
    df = _load(path)
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, _ = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val


class TestOverviewAiSummaryDomainPayloads(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None

    def test_all_domain_fixtures_exist(self) -> None:
        for name in DOMAIN_FILES:
            self.assertTrue((FIX_DIR / name).is_file(), f"missing {name}")

    def test_revenue_domains_not_classified_as_hr(self) -> None:
        for name in DOMAIN_FILES:
            stem = Path(name).stem
            if stem not in REVENUE_DOMAINS:
                continue
            _bind_fixture(FIX_DIR / name)
            self.assertNotEqual(main.infer_dataset_kind(), "hr", msg=stem)
            self.assertNotEqual(main.infer_auto_dashboard_kind(), "hr", msg=stem)

    def test_auto_dashboard_kpis_have_no_na_when_metrics_exist(self) -> None:
        for name in DOMAIN_FILES:
            _bind_fixture(FIX_DIR / name)
            dash = main.build_auto_dashboard()
            cards = dash.get("cards") or []
            self.assertGreater(len(cards), 0, msg=name)
            na = [
                c
                for c in cards
                if str(c.get("value", "")).strip().upper() == "N/A"
            ]
            self.assertEqual(len(na), 0, f"{name} has N/A KPIs: {na}")

    def test_harvest_fixture_json_is_current(self) -> None:
        from scripts.harvest_overview_summary_payloads import harvest

        live = {p["domain"] for p in harvest()}
        expected = {Path(n).stem for n in DOMAIN_FILES}
        self.assertEqual(live, expected)

    def test_harvested_json_serializes(self) -> None:
        out = REPO_ROOT / "frontend" / "lib" / "__fixtures__" / "overview-summary-domains.json"
        self.assertTrue(out.is_file(), "run harvest_overview_summary_payloads.py")
        data = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(len(data), len(DOMAIN_FILES))


if __name__ == "__main__":
    unittest.main()
