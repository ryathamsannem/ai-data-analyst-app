"""Regression tests for KPI-specific subtitles."""

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
from services.kpi_subtitles import audit_subtitle, is_valid_subtitle_dimension  # noqa: E402

FIXTURES = (
    "hr.csv",
    "retail.csv",
    "sales.csv",
    "operations.csv",
    "dashboard_showcase_dataset.csv",
)


def _bind(name: str) -> tuple[list[dict], list[str]]:
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
    cards = main.build_auto_dashboard().get("cards") or []
    return cards, [str(c) for c in df.columns.tolist()]


class TestKpiSubtitles(unittest.TestCase):
    def tearDown(self) -> None:
        main.df = None
        main.dataset_profile = None
        main.column_mapping = {k: None for k in main.column_mapping}

    def test_aggregate_cards_have_subtitles(self) -> None:
        for name in FIXTURES:
            cards, _ = _bind(name)
            for card in cards:
                title = str(card.get("title", ""))
                if title.lower().startswith("records in"):
                    continue
                sub = str(card.get("subtitle") or "").strip()
                self.assertTrue(sub, msg=f"{name} {title} missing subtitle")

    def test_all_cards_have_subtitle_meta(self) -> None:
        for name in FIXTURES:
            cards, _ = _bind(name)
            for card in cards:
                title = str(card.get("title", ""))
                if title.lower().startswith("records in"):
                    continue
                meta = card.get("subtitle_meta") or {}
                self.assertTrue(
                    meta.get("source_dimension"),
                    msg=f"{name} {title} missing subtitle_meta.source_dimension",
                )

    def test_no_forbidden_subtitle_dimensions(self) -> None:
        for name in FIXTURES:
            cards, cols = _bind(name)
            for card in cards:
                meta = card.get("subtitle_meta") or {}
                dim = meta.get("source_dimension")
                if dim:
                    self.assertTrue(
                        is_valid_subtitle_dimension(str(dim)),
                        msg=f"{name} {card.get('title')} bad dim {dim}",
                    )
                issues = audit_subtitle(
                    str(card.get("subtitle") or ""),
                    str(dim or ""),
                    cols,
                )
                self.assertFalse(issues, msg=f"{name} {card.get('title')}: {issues}")

    def test_hr_average_salary_subtitle_uses_department(self) -> None:
        cards, _ = _bind("employee_test.csv")
        avg = next(
            (c for c in cards if "average" in str(c.get("title", "")).lower() and "salary" in str(c.get("title", "")).lower()),
            None,
        )
        self.assertIsNotNone(avg)
        sub = str(avg.get("subtitle", "")).lower()
        self.assertIn("department", sub)
        self.assertNotIn("experience", sub)
        self.assertNotIn("name", sub)

    def test_retail_top_product_category_subtitle(self) -> None:
        cards, _ = _bind("retail.csv")
        top = next(
            (c for c in cards if str(c.get("title", "")).startswith("Top Product Category by")),
            None,
        )
        self.assertIsNotNone(top)
        sub = str(top.get("subtitle", "")).lower()
        self.assertTrue(
            "contributes" in sub and "revenue" in sub,
            msg=f"unexpected subtitle: {sub}",
        )
        meta = top.get("subtitle_meta") or {}
        self.assertTrue(
            str(meta.get("source_dimension", "")).lower() in ("product", "product_category"),
            msg=f"dim={meta.get('source_dimension')}",
        )

    def test_sales_top_product_line_subtitle(self) -> None:
        cards, _ = _bind("sales.csv")
        top = next(
            (c for c in cards if str(c.get("title", "")).startswith("Top Product Line by")),
            None,
        )
        self.assertIsNotNone(top)
        sub = str(top.get("subtitle", "")).lower()
        self.assertIn("contributes", sub)
        meta = top.get("subtitle_meta") or {}
        self.assertEqual(str(meta.get("source_dimension", "")).lower(), "product_line")

    def test_retail_top_region_subtitle(self) -> None:
        cards, _ = _bind("retail.csv")
        top = next(
            (c for c in cards if str(c.get("title", "")).startswith("Top Region by")),
            None,
        )
        self.assertIsNotNone(top)
        sub = str(top.get("subtitle", "")).lower()
        self.assertTrue(
            "contributes" in sub and "revenue" in sub,
            msg=f"unexpected subtitle: {sub}",
        )
        meta = top.get("subtitle_meta") or {}
        self.assertEqual(str(meta.get("source_dimension", "")).lower(), "region")

    def test_operations_downtime_subtitle_uses_plant(self) -> None:
        cards, _ = _bind("operations.csv")
        dt = next(
            (c for c in cards if "downtime" in str(c.get("title", "")).lower() and "total" in str(c.get("title", "")).lower()),
            None,
        )
        self.assertIsNotNone(dt)
        sub = str(dt.get("subtitle", "")).lower()
        self.assertIn("plant", sub)
        meta = dt.get("subtitle_meta") or {}
        dim = str(meta.get("source_dimension", "")).lower()
        self.assertTrue("facility" in dim or "plant" in dim, msg=f"dim={dim}")

    def test_operations_defect_subtitle_grammar(self) -> None:
        cards, _ = _bind("operations.csv")
        defect = next(
            (c for c in cards if "defect" in str(c.get("title", "")).lower() and "average" in str(c.get("title", "")).lower()),
            None,
        )
        self.assertIsNotNone(defect)
        sub = str(defect.get("subtitle", "")).lower()
        self.assertIn("has the highest defect rate", sub)

    def test_showcase_total_revenue_subtitle(self) -> None:
        cards, _ = _bind("dashboard_showcase_dataset.csv")
        rev = next((c for c in cards if str(c.get("title")) == "Total Revenue"), None)
        self.assertIsNotNone(rev)
        sub = str(rev.get("subtitle", "")).lower()
        self.assertTrue("contributes" in sub)
        self.assertNotRegex(sub, r"20\d{2}")


if __name__ == "__main__":
    unittest.main()
