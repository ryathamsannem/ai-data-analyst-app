"""KPI title ↔ metric-type alignment audit tests."""

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
from analytics_metadata import build_metric_label  # noqa: E402
from services.kpi_title_validation import (  # noqa: E402
    currency_aggregate_title,
    is_entity_dimension_column,
    resolve_currency_metric_column,
    title_implies_entity_without_count,
    validate_kpi_card,
    validate_kpi_cards,
)

AUDIT_FIXTURES = (
    "sales_test.csv",
    "finance_test.csv",
    "manufacturing_test.csv",
    "dashboard_showcase_dataset.csv",
    "retail.csv",
    "operations.csv",
)

FORBIDDEN_ENTITY_CURRENCY_TITLES = (
    "total salesperson",
    "total sales rep",
    "total customer",
    "total employee",
    "total patient",
    "total ticket",
    "total account",
)


def _bind(name: str) -> list[dict]:
    path = FIX_DIR / name
    df = pd.read_csv(path)
    for col in df.columns:
        if "date" in str(col).lower():
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce")
            except Exception:
                pass
            break
    profile = main.build_profile(df)
    main.df = df
    main.dataset_profile = profile
    main.column_mapping = {k: None for k in main.column_mapping}
    proposed, _ = main.compute_semantic_column_mapping(df, profile)
    for key, val in proposed.items():
        main.column_mapping[key] = val
    return main.build_auto_dashboard().get("cards") or []


class TestKpiTitleValidation(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_entity_column_detection(self) -> None:
        self.assertTrue(is_entity_dimension_column("sales_rep"))
        self.assertTrue(is_entity_dimension_column("salesperson"))
        self.assertFalse(is_entity_dimension_column("revenue"))
        self.assertFalse(is_entity_dimension_column("customer_segment"))

    def test_resolve_currency_column_skips_sales_rep(self) -> None:
        cols = ["sales_rep", "revenue", "region"]
        self.assertEqual(resolve_currency_metric_column(cols, "sales_rep"), "revenue")

    def test_build_metric_label_sales_rep_is_not_executive_title(self) -> None:
        bad = build_metric_label("sum", "total", "sales_rep")
        self.assertTrue(title_implies_entity_without_count(bad))
        good = currency_aggregate_title("revenue", "sum")
        self.assertEqual(good, "Total Revenue")

    def test_validate_rejects_entity_title_currency_value(self) -> None:
        issues = validate_kpi_card(
            {"title": "Total Salesperson", "value": "1,081,000", "subtitle": "Top region: North"},
            metric_col="revenue",
            aggregation="sum",
        )
        codes = {i.code for i in issues}
        self.assertIn("entity_title_currency_value", codes)

    def test_audit_fixtures_no_title_metric_mismatch(self) -> None:
        for name in AUDIT_FIXTURES:
            cards = _bind(name)
            _, audits = validate_kpi_cards(cards)
            for audit in audits:
                title_l = audit.title.lower()
                if title_l.startswith("records in") or title_l.startswith("attributes"):
                    continue
                for forbidden in FORBIDDEN_ENTITY_CURRENCY_TITLES:
                    self.assertNotIn(
                        forbidden,
                        title_l,
                        msg=f"{name}: forbidden title {audit.title}",
                    )
                hard = [
                    i
                    for i in audit.issues
                    if "entity title" in i
                    or "currency title" in i
                    or "missing subtitle" in i
                ]
                self.assertFalse(hard, msg=f"{name} {audit.title}: {hard}")

    def test_sales_priority_order(self) -> None:
        cards = _bind("sales_test.csv")
        titles = [str(c.get("title")) for c in cards[:5]]
        self.assertEqual(titles[0], "Total Revenue")
        self.assertEqual(titles[1], "Total Profit")
        self.assertIn(titles[2], ("Average Revenue per Record", "Average Order Value", "Average Sales"))
        self.assertTrue(titles[3].startswith("Top "))
        self.assertTrue(titles[4].startswith("Top "))

    def test_every_card_has_kpi_meta(self) -> None:
        for name in AUDIT_FIXTURES:
            cards = _bind(name)
            for card in cards:
                title = str(card.get("title", ""))
                if title.lower().startswith("records in"):
                    continue
                meta = card.get("kpi_meta") or {}
                self.assertTrue(
                    meta.get("metric_type"),
                    msg=f"{name} {title} missing kpi_meta.metric_type",
                )

    def test_manufacturing_defect_subtitle_grammar(self) -> None:
        cards = _bind("manufacturing_test.csv")
        defect = next(
            (
                c
                for c in cards
                if "defect" in str(c.get("title", "")).lower()
                and "average" in str(c.get("title", "")).lower()
            ),
            None,
        )
        self.assertIsNotNone(defect)
        sub = str(defect.get("subtitle", "")).lower()
        self.assertNotIn(" at region", sub)
        self.assertNotIn(" at production line", sub)
        self.assertTrue(
            "has the highest defect rate" in sub or "highest defect rate by" in sub,
            msg=f"subtitle: {sub}",
        )


if __name__ == "__main__":
    unittest.main()
