"""Unit tests for routing consistency validation."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from intent_engine.routing_consistency import validate_routing_consistency
from intent_engine.routing_plan import RoutingPlan


class TestRoutingConsistency(unittest.TestCase):
    def test_detects_metric_mismatch(self) -> None:
        plan = RoutingPlan(
            intent="compare",
            metricColumn="customers",
            dimensionColumn="city",
            chartType="bar",
            chartSelectionReason="Vertical bar chart compares customers side-by-side across city.",
        )
        analysis = {"metricColumn": "customers", "categoryColumn": "city"}
        viz = {
            "chartType": "bar",
            "labels": ["A", "B"],
            "provenance": {
                "numericColumn": "revenue",
                "categoryColumn": "city",
            },
        }
        warnings = validate_routing_consistency(plan, analysis, viz)
        self.assertTrue(any("Metric mismatch" in w for w in warnings))

    def test_selection_copy_matches_vertical_bar(self) -> None:
        plan = RoutingPlan(
            intent="compare",
            metricColumn="revenue",
            chartType="bar",
            chartSelectionReason="Vertical bar chart compares revenue side-by-side across city.",
        )
        warnings = validate_routing_consistency(
            plan,
            {"metricColumn": "revenue"},
            {"chartType": "bar", "labels": ["X"], "provenance": {"numericColumn": "revenue"}},
        )
        self.assertFalse(any("selection copy" in w.lower() for w in warnings))


if __name__ == "__main__":
    unittest.main()
