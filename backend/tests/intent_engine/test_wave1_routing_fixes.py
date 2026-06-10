"""
Wave 1 targeted routing fixes — regression tests against domain fixtures.
"""

from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent
FIXTURES = REPO_ROOT / "test-fixtures" / "domains"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main as main_mod  # noqa: E402
from main import ConversationContextPayload  # noqa: E402


def _bind_csv(name: str) -> None:
    path = FIXTURES / name
    df = pd.read_csv(path)
    main_mod.df = df
    main_mod.dataset_profile = main_mod.build_profile(df)


def _viz(question: str):
    return main_mod.compute_visualization_for_question(question)


class Wave1RoutingFixesTest(unittest.TestCase):
  def test_sales_rank_departments_by_revenue(self) -> None:
      _bind_csv("sales.csv")
      _exact, viz, analysis = _viz("Rank departments by revenue")
      self.assertIn("department", str(analysis.get("categoryColumn") or "").lower())
      self.assertIn("revenue", str(analysis.get("metricColumn") or "").lower())
      self.assertTrue(viz and (viz.get("labels") or viz.get("chartData")))

  def test_sales_show_calculations_follow_up(self) -> None:
      _bind_csv("sales.csv")
      root_q = "Rank departments by revenue"
      _exact, viz, analysis = _viz(root_q)
      ctx = ConversationContextPayload(
          lastQuestion=root_q,
          rootQuestion=root_q,
          metricColumn=analysis.get("metricColumn"),
          categoryColumn=analysis.get("categoryColumn"),
          chartType=(viz or {}).get("chartType"),
          turnId=str(uuid.uuid4()),
      )
      plan = main_mod.resolve_follow_up_turn(
          "Show the calculations behind this answer.",
          ctx,
          continuation_intent=True,
      )
      self.assertEqual(plan.get("effective_question"), root_q)
      _fexact, fviz, fanalysis = main_mod.compute_visualization_for_question(
          str(plan.get("effective_question")),
          conversation_sidecar=plan.get("conversation_sidecar"),
      )
      self.assertIn("department", str(fanalysis.get("categoryColumn") or "").lower())
      self.assertTrue(fviz and (fviz.get("labels") or fviz.get("chartData")))

  def test_geography_city_value_compare(self) -> None:
      _bind_csv("geography.csv")
      _exact, viz, analysis = _viz("Compare Mumbai vs Bengaluru revenue")
      self.assertIn("city", str(analysis.get("categoryColumn") or "").lower())
      labels = [str(x) for x in (viz or {}).get("labels") or []]
      self.assertTrue(labels)
      joined = " ".join(labels).lower()
      self.assertIn("mumbai", joined)
      self.assertIn("bengaluru", joined)

  def test_geography_revenue_concentration_chart(self) -> None:
      _bind_csv("geography.csv")
      _exact, viz, analysis = _viz("Where is revenue overly concentrated?")
      self.assertIn("city", str(analysis.get("categoryColumn") or "").lower())
      self.assertTrue(viz and (viz.get("labels") or viz.get("chartData")))

  def test_banking_credit_utilization_metric(self) -> None:
      _bind_csv("banking_financial_services.csv")
      _exact, viz, analysis = _viz("Credit utilization risk concentration")
      self.assertIn(
          "utilization",
          str(analysis.get("metricColumn") or "").lower(),
      )
      self.assertTrue(viz and (viz.get("labels") or viz.get("chartData")))

  def test_marketing_spend_outlier_metric(self) -> None:
      _bind_csv("marketing.csv")
      _exact, viz, analysis = _viz("Outlier campaigns on spend")
      self.assertIn("spend", str(analysis.get("metricColumn") or "").lower())
      self.assertIn("campaign", str(analysis.get("categoryColumn") or "").lower())
      self.assertTrue(viz and (viz.get("labels") or viz.get("chartData")))


if __name__ == "__main__":
    unittest.main()
