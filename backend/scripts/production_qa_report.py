#!/usr/bin/env python3
"""Generate markdown execution report from any wave QA JSON."""
from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

DIMS = [
    "intent_detection",
    "chart_selection",
    "data_grounding",
    "executive_summary_quality",
    "recommendation_quality",
    "confidence_explanation",
    "follow_up_continuity",
    "hallucination_resistance",
]

REPO = Path(__file__).resolve().parents[2]


def generate_report(in_json: Path, out_md: Path, title: str) -> None:
    payload = json.loads(in_json.read_text(encoding="utf-8"))
    results = payload["results"]
    by_domain: dict[str, list] = defaultdict(list)
    for r in results:
        by_domain[r["domain"]].append(r)

    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"**Executed:** {payload.get('executed_at', 'unknown')}")
    lines.append(f"**Wave:** {payload.get('wave', '?')}")
    lines.append(f"**Mode:** `{payload.get('mode', 'unknown')}`")
    lines.append(f"**Duration:** {payload.get('duration_sec', '?')}s")
    lines.append("")
    lines.append("## Domain scorecard")
    lines.append("")
    lines.append(
        "| Domain | Evals | Avg | Pass ≥7 | Intent | Chart | Ground | Exec | Rec | Conf | F/U | Halluc | Verdict |"
    )
    lines.append(
        "|--------|------:|----:|--------:|-------:|------:|-------:|-----:|----:|----:|----:|-------:|---------|"
    )

    for domain in sorted(by_domain.keys()):
        rs = by_domain[domain]
        avgs = [r["avg"] for r in rs]
        dom_avg = round(statistics.mean(avgs), 2)
        pass_n = sum(1 for a in avgs if a >= 7)
        pass_pct = pass_n / len(avgs) * 100
        dim_scores = {d: round(statistics.mean([r["scores"][d] for r in rs]), 2) for d in DIMS}
        crit_hall = any(r["scores"].get("hallucination_resistance", 10) <= 3 for r in rs)
        if crit_hall or dom_avg < 5:
            verdict = "**Fail**"
        elif pass_pct >= 90 and dom_avg >= 7.5:
            verdict = "Pass"
        elif dom_avg >= 6.5:
            verdict = "Conditional"
        else:
            verdict = "Fail"
        lines.append(
            f"| {domain} | {len(rs)} | **{dom_avg}** | {pass_n}/{len(rs)} ({pass_pct:.0f}%) | "
            + " | ".join(str(dim_scores[d]) for d in DIMS)
            + f" | {verdict} |"
        )

    lines.append("")
    lines.append("## Failing questions")
    lines.append("")
    fails = [r for r in results if r["avg"] < 7 or r.get("severity") in ("critical", "high")]
    fails.sort(key=lambda x: x["avg"])
    if not fails:
        lines.append("_None._")
    else:
        for r in fails[:25]:
            lines.append(f"### `{r['qid']}` — {r['domain']} (avg **{r['avg']}**)")
            lines.append("")
            lines.append(f"- {r['question']}")
            if r.get("notes"):
                lines.append(f"- Notes: {'; '.join(r['notes'][:3])}")
            lines.append("")

    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_md}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="in_path", required=True, help="Input JSON path")
    parser.add_argument("--out", dest="out_path", required=True, help="Output markdown path")
    parser.add_argument("--title", default="AI Insights Production QA Report")
    args = parser.parse_args()
    generate_report(Path(args.in_path), Path(args.out_path), args.title)


if __name__ == "__main__":
    main()
