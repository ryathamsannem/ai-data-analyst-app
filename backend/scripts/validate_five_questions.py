"""Print validation payloads for five polish scenarios."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import main as m  # noqa: E402

FIXTURE = BACKEND / "tests" / "fixtures" / "retail_analytics_regression.csv"

QUESTIONS = [
    "Show revenue trend over time",
    "What are the biggest opportunities?",
    "Summarize business performance",
    "What factors are correlated with profit?",
    "Is revenue correlated with customers?",
]


def main() -> None:
    df = pd.read_csv(FIXTURE)
    m.df = df
    m.dataset_profile = m.build_profile(df)

    for q in QUESTIONS:
        _, viz, analysis = m.compute_visualization_for_question(q)
        print("=" * 72)
        print(q)
        print(
            json.dumps(
                {
                    "chartType": (viz or {}).get("chartType"),
                    "title": (viz or {}).get("title"),
                    "labels_n": len((viz or {}).get("labels") or []),
                    "executiveLens": analysis.get("executiveLens"),
                    "metric": analysis.get("metricColumn"),
                    "category": analysis.get("categoryColumn"),
                    "relationship": (viz or {}).get("relationshipInsights"),
                },
                indent=2,
                default=str,
            )[:2000]
        )
        ranked = analysis.get("rankedExecutiveInsights") or []
        for r in ranked[:4]:
            if isinstance(r, dict):
                print(
                    " card:",
                    r.get("kind"),
                    "|",
                    r.get("title"),
                    "|",
                    (str(r.get("narrativeLine") or r.get("hint") or ""))[:80],
                )
        print()


if __name__ == "__main__":
    main()
