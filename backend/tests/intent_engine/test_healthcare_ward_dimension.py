"""
Healthcare ward vs department dimension routing — explicit mention priority.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

HEALTHCARE_FIXTURE = REPO_ROOT / "test-fixtures" / "domains" / "healthcare.csv"


class TestHealthcareWardDimension(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import main as main_mod

        cls.main = main_mod

    def _load_healthcare(self) -> None:
        df = pd.read_csv(HEALTHCARE_FIXTURE)
        self.main.df = df
        self.main.dataset_profile = self.main.build_profile(df)

    def test_ward_question_uses_ward_column(self) -> None:
        self._load_healthcare()
        q = "Which ward has the highest patient volume?"
        _exact, viz, analysis = self.main.compute_visualization_for_question(q)
        cat = str(analysis.get("categoryColumn") or "").lower()
        self.assertEqual(cat, "ward", msg=f"expected ward dimension, got {cat!r}")
        plan = analysis.get("routingPlan") or {}
        self.assertEqual(str(plan.get("dimensionColumn") or "").lower(), "ward")
        self.assertIsNotNone(viz)

    def test_department_question_uses_department_column(self) -> None:
        self._load_healthcare()
        q = "Which department has the highest patient volume?"
        _exact, viz, analysis = self.main.compute_visualization_for_question(q)
        cat = str(analysis.get("categoryColumn") or "").lower()
        self.assertEqual(cat, "department", msg=f"expected department dimension, got {cat!r}")
        plan = analysis.get("routingPlan") or {}
        self.assertEqual(str(plan.get("dimensionColumn") or "").lower(), "department")
        self.assertIsNotNone(viz)


if __name__ == "__main__":
    unittest.main()
