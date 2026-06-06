"""Inspect visualization payloads for regression queries."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import main as m  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

FIXTURE = BACKEND / "tests" / "fixtures" / "retail_analytics_regression.csv"

QUESTIONS = [
    "Compare growth rate across regions",
    "What explains Mumbai's performance?",
    "What are the biggest risks?",
]


def main() -> None:
    df = pd.read_csv(FIXTURE)
    m.df = df
    m.dataset_profile = m.build_profile(df)

    client = TestClient(m.app)
    for q in QUESTIONS:
        resp = client.post("/ask", json={"question": q})
        body = resp.json()
        viz = body.get("visualization")
        analysis = body.get("analysis")
        print("===", q)
        print("viz_null", viz is None)
        if viz:
            print(
                "chartType",
                viz.get("chartType"),
                "title",
                viz.get("title"),
            )
            print(
                "labels_n",
                len(viz.get("labels") or []),
                "values_n",
                len(viz.get("values") or []),
            )
        if isinstance(viz, dict):
            print("viz_keys", sorted(list(viz.keys())))
            print(
                "labels_is_array",
                isinstance(viz.get("labels"), list),
                "labels_type",
                type(viz.get("labels")).__name__,
            )
            print(
                "values_is_array",
                isinstance(viz.get("values"), list),
                "values_type",
                type(viz.get("values")).__name__,
            )
            cd = viz.get("chartData")
            if cd is None:
                print("chartData", None)
            elif isinstance(cd, list):
                print("chartData_len", len(cd))
            else:
                print("chartData_type", type(cd).__name__)
            cc = viz.get("values")
            if isinstance(cc, list):
                print("values_sample", cc[:3])
        print(
            "metric",
            analysis.get("metricColumn"),
            "cat",
            analysis.get("categoryColumn"),
            "agg",
            analysis.get("aggregationKey"),
            "rows",
            analysis.get("analysisRowCount"),
        )
        print(
            "entity",
            analysis.get("entityFilterColumn"),
            analysis.get("entityFilterValue"),
            "explainMode",
            analysis.get("entityExplainMode"),
            "chartTitle",
            analysis.get("chartTitle"),
        )
        pts = analysis.get("chartSeriesPointCount") or analysis.get("chartPointCount")
        print("chartPoints", pts)
        ug = analysis.get("unsupportedGrowthAnalysis") or {}
        print(
            "growthUnsat",
            analysis.get("growthRequestUnsatisfied"),
            "unsupportedGrowth",
            ug.get("active"),
        )
        ranked = analysis.get("rankedExecutiveInsights") or []
        print("lens", analysis.get("executiveLens"), "ranked_n", len(ranked))
        for r in ranked[:6]:
            print(
                " card",
                r.get("kind"),
                "|",
                r.get("title"),
                "|",
                r.get("value"),
            )
        print()


if __name__ == "__main__":
    main()
