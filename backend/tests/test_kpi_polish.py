"""Final KPI polish regression tests across domain fixtures."""

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
from services.kpi_polish import (  # noqa: E402
    ROAS_SUSPICIOUS_THRESHOLD,
    average_kpi_title,
    is_valid_kpi_leader_value,
    roas_validation_meta,
    subtitle_looks_weak,
)

DOMAIN_FIXTURES = (
    "sales.csv",
    "retail.csv",
    "marketing.csv",
    "banking_financial_services.csv",
    "hr.csv",
    "operations.csv",
    "healthcare.csv",
    "geography.csv",
    "customer_support.csv",
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


class TestKpiPolish(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_top_kpi_titles_include_metric_basis(self) -> None:
        for name in ("sales.csv", "retail.csv", "geography.csv"):
            cards = _bind(name)
            top_cards = [c for c in cards if str(c.get("title", "")).lower().startswith("top ")]
            self.assertTrue(top_cards, msg=f"{name} expected top KPI cards")
            for card in top_cards:
                title = str(card.get("title", ""))
                self.assertIn(" by ", title.lower(), msg=f"{name} ambiguous top title: {title}")

    def test_no_weak_aggregate_subtitles(self) -> None:
        for name in DOMAIN_FIXTURES:
            cards = _bind(name)
            for card in cards:
                sub = str(card.get("subtitle") or "")
                if not sub:
                    continue
                self.assertFalse(
                    subtitle_looks_weak(sub),
                    msg=f"{name} {card.get('title')}: {sub}",
                )

    def test_no_date_like_leaders(self) -> None:
        for name in DOMAIN_FIXTURES:
            cards = _bind(name)
            for card in cards:
                val = str(card.get("value") or "").strip()
                if str(card.get("title", "")).lower().startswith("top "):
                    self.assertTrue(
                        is_valid_kpi_leader_value(val),
                        msg=f"{name} invalid leader {val!r} on {card.get('title')}",
                    )

    def test_sales_amount_average_label_uses_sales_wording(self) -> None:
        self.assertEqual(
            average_kpi_title("sales_amount", domain="retail"),
            "Average Sales per Record",
        )
        self.assertEqual(
            average_kpi_title("revenue", domain="retail"),
            "Average Revenue per Record",
        )

    def test_sales_average_label_normalized(self) -> None:
        cards = _bind("sales.csv")
        avg = next((c for c in cards if "average" in str(c.get("title", "")).lower()), None)
        self.assertIsNotNone(avg)
        title = str(avg.get("title", ""))
        self.assertIn(
            title,
            ("Average Revenue per Record", "Average Order Value"),
        )

    def test_roas_suspicious_flag(self) -> None:
        sub, meta = roas_validation_meta(ROAS_SUSPICIOUS_THRESHOLD + 1)
        self.assertIsNotNone(sub)
        self.assertTrue(meta.get("suspicious"))
        self.assertIn("high_roas", meta.get("validation_flags", []))
        sub_ok, meta_ok = roas_validation_meta(12.5)
        self.assertIsNone(sub_ok)
        self.assertFalse(meta_ok.get("suspicious"))

    def test_kpi_card_count_unchanged_per_domain(self) -> None:
        expected_counts = {
            "sales.csv": 5,
            "retail.csv": 5,
            "marketing.csv": 5,
            "banking_financial_services.csv": 6,
            "hr.csv": 5,
            "operations.csv": 5,
            "healthcare.csv": 6,
            "geography.csv": 5,
            "customer_support.csv": 6,
        }
        for name, count in expected_counts.items():
            cards = _bind(name)
            self.assertEqual(len(cards), count, msg=f"{name} card count changed")


if __name__ == "__main__":
    unittest.main()
